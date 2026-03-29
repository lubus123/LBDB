import { Component, Show, createSignal, createMemo, createEffect, onCleanup } from 'solid-js';
import type { GameState, Color, CheckerMove, GameResult } from '../../shared/types';
import { W_BAR, B_BAR } from '../../shared/constants';
import { checkersAt, cloneBoard, applyMove as applyBoardMove } from '../../engine/board';
import { newGame, doRoll, doMove, doDouble, doAcceptDouble, doDropDouble, undoMove, confirmTurn, getGameResult } from '../../engine/game';
import { legalDestinations, movableCheckers, hasAnyMoves } from '../../engine/moves';
import { canDouble } from '../../engine/cube';
import { pipCount } from '../../engine/pip';
import { chooseBestTurn, evaluatePosition, type PositionEvaluator } from '../../engine/ai';
import { computeTurnLuckFull } from '../../engine/luck';
import { loadModel, isModelLoaded, evaluatePositionNN } from '../../engine/nn';
import { formatTurn, formatDice } from '../../shared/notation';
import Board, { BOARD_VIEWBOX, colToPoint, pointX, pointToCol, checkerY } from '../board/Board';
import Dice from '../board/Dice';
import Jail from '../board/Jail';
import MoveAnimation, { triggerAnimation, triggerBunnyHop, clearAnimations, HOP_DURATION, ANIM_DURATION, getHiddenDests } from '../board/MoveAnimation';
import OpponentArrows from '../board/OpponentArrows';
import LuckMeter, { type LuckEntry } from '../board/LuckMeter';
import CountdownClock from '../board/CountdownClock';
import ChatPanel, { type ChatMessage } from '../board/ChatPanel';
import { playDiceRoll, playCapture, playJailEscape, playVictory, playDefeat, playTimeout } from '../audio/sounds';
import * as socket from '../net/socket';
import type { ServerMessage } from '../../server/protocol';

interface TurnRecord {
  ply: number;
  player: Color;
  dice: [number, number];
  moves: CheckerMove[];
}

export type GameMode = 'local' | 'ai' | 'online';
export type AiDifficulty = 'strong' | 'expert';
// AI difficulty now managed internally in GameView's Options panel

const AI_ROLL_DELAY = 600;
const AI_MOVE_DELAY = 650;
const DICE_ANIM_DURATION = 550;
const BOARD_W = 780;
const MARGIN = 16;

interface DevPreset { board: number[]; whiteOff: number; blackOff: number; }

const WS_URL = import.meta.env.VITE_WS_URL ||
  (window.location.hostname === 'localhost'
    ? `ws://${window.location.hostname}:${window.location.port || '3001'}`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);

const GameView: Component<{ onExit: () => void; mode: GameMode; devPreset?: DevPreset; onlineGameId?: string }> = (props) => {
  const initState = props.devPreset
    ? {
        board: [...props.devPreset.board],
        turn: 'w' as Color, dice: null, movesLeft: [] as number[],
        cube: { value: 1, owner: 'center' as const, offered: false },
        whiteOff: props.devPreset.whiteOff, blackOff: props.devPreset.blackOff,
        phase: 'waiting' as const, gameId: 'dev', ply: 0, turnMoves: [] as CheckerMove[],
      }
    : newGame();
  const [state, setState] = createSignal<GameState>(initState);
  const [selectedPoint, setSelectedPoint] = createSignal<number | null>(null);
  const [flipped, setFlipped] = createSignal(false);
  const [direction, setDirection] = createSignal<'left' | 'right'>(
    (typeof localStorage !== 'undefined' && localStorage.getItem('bg-direction') as 'left' | 'right') || 'right'
  );
  const [bunnyHop, setBunnyHop] = createSignal(true);
  const [aiDifficulty, setAiDifficulty] = createSignal<AiDifficulty>('expert');
  const [history, setHistory] = createSignal<TurnRecord[]>([]);
  const [aiThinking, setAiThinking] = createSignal(false);
  const [isRolling, setIsRolling] = createSignal(false);
  const [pendingState, setPendingState] = createSignal<GameState | null>(null);
  const [diceOrder, setDiceOrder] = createSignal<[number, number]>([0, 1]);
  const [luckHistory, setLuckHistory] = createSignal<LuckEntry[]>([]);
  const [dragGhost, setDragGhost] = createSignal<{ x: number; y: number; color: Color } | null>(null);
  const [arrowMoves, setArrowMoves] = createSignal<CheckerMove[]>([]);
  const [arrowVisible, setArrowVisible] = createSignal(false);
  const [arrowFading, setArrowFading] = createSignal(false);
  const [arrowsEnabled, setArrowsEnabled] = createSignal(false);
  const [historyIndex, setHistoryIndex] = createSignal<number | null>(null);
  const [timePerMove, setTimePerMove] = createSignal<number | null>(
    typeof localStorage !== 'undefined' ? (() => {
      const v = localStorage.getItem('bg-time');
      return v === 'none' ? null : Number(v) || 30;
    })() : 30
  );
  const [timeRemaining, setTimeRemaining] = createSignal<number | null>(null);
  const [timeLocked, setTimeLocked] = createSignal(false);
  const [myColor, setMyColor] = createSignal<Color>('w');
  const [nnReady, setNnReady] = createSignal(false);

  // Load NN model for expert difficulty
  if (props.mode === 'ai' && aiDifficulty() === 'expert') {
    if (isModelLoaded()) {
      setNnReady(true);
    } else {
      loadModel('/model.json').then(() => setNnReady(true)).catch(() => {
        console.warn('Failed to load NN model, falling back to heuristic AI');
      });
    }
  }

  /** Get the position evaluator based on difficulty setting and model availability. */
  const getEvaluator = (): PositionEvaluator | undefined => {
    if (aiDifficulty() === 'expert' && nnReady()) return evaluatePositionNN;
    // 'strong' or model not loaded: use heuristic (undefined = default)
    return undefined;
  };
  const [onlineGameId, setOnlineGameId] = createSignal<string | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = createSignal(false);
  const [opponentDisconnected, setOpponentDisconnected] = createSignal(false);
  const [rematchOffered, setRematchOffered] = createSignal(false);
  const [wsConnected, setWsConnected] = createSignal(false);
  const [chatMessages, setChatMessages] = createSignal<ChatMessage[]>([]);
  const chatTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [opponentName, setOpponentName] = createSignal<string>('Opponent');
  let initialBoard = [...initState.board];
  let initialWhiteOff = initState.whiteOff;
  let initialBlackOff = initState.blackOff;

  // Persist settings
  createEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bg-direction', direction());
      localStorage.setItem('bg-time', timePerMove() === null ? 'none' : String(timePerMove()));
    }
  });

  let aiTimeouts: number[] = [];

  onCleanup(() => {
    aiTimeouts.forEach(t => clearTimeout(t));
  });

  function clearAiTimeouts() {
    aiTimeouts.forEach(t => clearTimeout(t));
    aiTimeouts = [];
  }

  const currentState = () => state();
  const isAiMode = () => props.mode === 'ai';
  const isAiTurn = () => isAiMode() && currentState().turn === 'b';
  const isOnline = () => props.mode === 'online';
  const isMyTurn = () => {
    if (isOnline()) return currentState().turn === myColor();
    if (isAiMode()) return currentState().turn === 'w';
    return true; // local mode, always your turn
  };

  // ─── WebSocket setup for online mode ───
  if (isOnline()) {
    socket.connect(WS_URL);
    const unsubStatus = socket.onStatus(setWsConnected);
    const unsubMessage = socket.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'game_created':
          setOnlineGameId(msg.gameId);
          setWaitingForOpponent(true);
          break;
        case 'game_start':
        case 'rematch_start':
          setMyColor(msg.color);
          setState(msg.state);
          if ('opponent' in msg && msg.opponent) setOpponentName(msg.opponent);
          const opp = ('opponent' in msg && msg.opponent) ? msg.opponent : 'your opponent';
          setChatMessages([
            { from: 'duckGammon', text: `Game started! You are ${msg.color === 'w' ? 'white' : 'black'} vs ${opp}. Good luck!`, time: chatTime() },
          ]);
          initialBoard = [...msg.state.board];
          initialWhiteOff = msg.state.whiteOff;
          initialBlackOff = msg.state.blackOff;
          setWaitingForOpponent(false);
          setRematchOffered(false);
          setHistory([]);
          setHistoryIndex(null);
          setLuckHistory([]);
          break;
        case 'state': {
          const prev = currentState();

          // Record completed turn when turn changes or game ends
          if (prev.dice && prev.phase === 'moving' && (msg.state.turn !== prev.turn || msg.state.phase === 'gameOver')) {
            setHistory(h => [...h, {
              ply: prev.ply,
              player: prev.turn,
              dice: prev.dice!,
              moves: prev.turnMoves,
            }]);
          }

          // Compute luck when dice first appear (phase transitions to 'moving')
          if (msg.state.phase === 'moving' && msg.state.dice && prev.phase !== 'moving') {
            const analysis = computeTurnLuckFull(msg.state, getEvaluator());
            const dice = msg.state.dice;
            const actualDice: [number, number] = dice[0] <= dice[1] ? [dice[0], dice[1]] : [dice[1], dice[0]];
            setLuckHistory(h => [...h, {
              ply: msg.state.ply, player: msg.state.turn, luck: analysis.luck,
              rolls: analysis.rolls, actualDice, rank: analysis.rank,
            }]);
          }
          setState(msg.state);
          break;
        }
        case 'timeout':
          playTimeout();
          setState(msg.state);
          break;
        case 'game_over':
          if (msg.result.winner === myColor()) playVictory();
          else playDefeat();
          break;
        case 'resigned': {
          const s = currentState();
          setState({ ...s, phase: 'gameOver' });
          if (msg.winner === myColor()) playVictory();
          else playDefeat();
          break;
        }
        case 'opponent_disconnected':
          setOpponentDisconnected(true);
          break;
        case 'opponent_reconnected':
          setOpponentDisconnected(false);
          break;
        case 'rematch_offered':
          setRematchOffered(true);
          break;
        case 'chat':
          setChatMessages(prev => [...prev, { from: msg.from, text: msg.text, time: chatTime() }]);
          break;
        case 'error':
          console.warn('[duckGammon]', msg.message);
          break;
      }
    });

    // Create or join game
    if (props.onlineGameId) {
      // Joining via invite link
      const joinWait = setInterval(() => {
        if (wsConnected()) {
          socket.send({ type: 'join', gameId: props.onlineGameId! });
          clearInterval(joinWait);
        }
      }, 100);
    } else {
      // Creating a new game
      const createWait = setInterval(() => {
        if (wsConnected()) {
          socket.send({ type: 'create', timeLimit: timePerMove() });
          clearInterval(createWait);
        }
      }, 100);
    }

    onCleanup(() => {
      unsubStatus();
      unsubMessage();
      socket.disconnect();
    });
  }

  const isReviewing = () => historyIndex() !== null;

  const moveablePoints = createMemo(() => {
    if (isReviewing()) return [];
    if (waitingForOpponent()) return [];
    const s = currentState();
    if (s.phase !== 'moving') return [];
    if (isAiTurn()) return [];
    if (isOnline() && !isMyTurn()) return [];
    if (isRolling()) return [];
    return movableCheckers(s.board, s.movesLeft, s.turn);
  });

  const legalDests = createMemo(() => {
    const s = currentState();
    const sel = selectedPoint();
    if (s.phase !== 'moving' || sel === null) return [];
    if (isAiTurn()) return [];
    return legalDestinations(s.board, sel, s.movesLeft, s.turn);
  });

  const whitePips = createMemo(() => pipCount(currentState().board, 'w'));
  const blackPips = createMemo(() => pipCount(currentState().board, 'b'));
  const gameResult = createMemo(() => getGameResult(currentState()));

  // When reviewing history, reconstruct the board state at that point
  const reviewState = createMemo(() => {
    const idx = historyIndex();
    if (idx === null) return null;
    const h = history();
    const board = cloneBoard(initialBoard);
    let wOff = initialWhiteOff;
    let bOff = initialBlackOff;
    if (idx === -1) return { board, whiteOff: wOff, blackOff: bOff }; // starting position
    for (let i = 0; i <= idx && i < h.length; i++) {
      const turn = h[i];
      for (const move of turn.moves) {
        applyBoardMove(board, move, turn.player);
        if ((turn.player === 'w' && move.to <= 0) || (turn.player === 'b' && move.to >= 25)) {
          if (turn.player === 'w') wOff++; else bOff++;
        }
      }
    }
    return { board, whiteOff: wOff, blackOff: bOff };
  });

  // The state to display on the board — either the review state or the live state
  const displayBoard = () => reviewState()?.board ?? currentState().board;
  const displayWhiteOff = () => reviewState()?.whiteOff ?? currentState().whiteOff;
  const displayBlackOff = () => reviewState()?.blackOff ?? currentState().blackOff;

  const whiteBarCount = createMemo(() => checkersAt(displayBoard(), W_BAR, 'w'));
  const blackBarCount = createMemo(() => checkersAt(displayBoard(), B_BAR, 'b'));
  const canMoveFromBar = createMemo(() => {
    const s = currentState();
    if (s.phase !== 'moving' || isAiTurn()) return false;
    const bar = s.turn === 'w' ? W_BAR : B_BAR;
    return moveablePoints().includes(bar);
  });
  const isBarSelected = createMemo(() => {
    const sel = selectedPoint();
    const s = currentState();
    if (s.turn === 'w') return sel === W_BAR;
    return sel === B_BAR;
  });

  function getCheckerPixel(point: number, board: number[]): { x: number; y: number } | null {
    if (point <= 0 || point >= 25) return null;
    const { col, top } = pointToCol(point, flipped(), direction());
    const count = Math.abs(board[point]);
    if (count === 0) return null;
    return { x: pointX(col), y: checkerY(count - 1, top) };
  }

  function getDestPixel(point: number, board: number[]): { x: number; y: number } | null {
    if (point <= 0 || point >= 25) return null;
    const { col, top } = pointToCol(point, flipped(), direction());
    const currentCount = Math.abs(board[point]);
    return { x: pointX(col), y: checkerY(currentCount, top) };
  }

  /** Compute hop waypoints for bunny hop animation */
  function computeHopWaypoints(
    from: number, to: number, color: Color, board: number[]
  ): { x: number; y: number }[] | null {
    const dir = color === 'w' ? -1 : 1;
    const waypoints: { x: number; y: number }[] = [];

    // Start position
    if (from === W_BAR || from === B_BAR) {
      // Bar — use bar center X, row Y
      const barX = MARGIN + 6 + 6 * 52 + 20;
      const firstPt = from === W_BAR ? 25 : 0;
      const enterPt = firstPt + dir;
      if (enterPt >= 1 && enterPt <= 24) {
        const { top } = pointToCol(enterPt, flipped(), direction());
        waypoints.push({ x: barX, y: checkerY(0, top) });
      } else {
        return null;
      }
    } else {
      const pos = getCheckerPixel(from, board);
      if (!pos) return null;
      waypoints.push(pos);
    }

    // Intermediate points
    const start = from === W_BAR ? 25 : from === B_BAR ? 0 : from;
    for (let p = start + dir; p !== to; p += dir) {
      if (p < 1 || p > 24) continue;
      const { col, top } = pointToCol(p, flipped(), direction());
      waypoints.push({ x: pointX(col), y: checkerY(0, top) });
    }

    // End position
    if (to === 0 || to === 25) {
      // Bearing off — use board edge
      const whiteRight = direction() === 'right';
      const bearX = (color === 'w' ? whiteRight : !whiteRight)
        ? BOARD_W - MARGIN : MARGIN;
      const lastPt = waypoints[waypoints.length - 1];
      waypoints.push({ x: bearX, y: lastPt?.y ?? 320 });
    } else {
      const dest = getDestPixel(to, board);
      if (!dest) return null;
      waypoints.push(dest);
    }

    return waypoints.length >= 2 ? waypoints : null;
  }

  function animateMove(from: number, to: number, color: Color, board: number[]): number {
    if (bunnyHop()) {
      const wp = computeHopWaypoints(from, to, color, board);
      if (wp && wp.length >= 2) {
        return triggerBunnyHop(wp, color, to);
      }
    }
    // Fallback to slide
    const fromPos = getCheckerPixel(from, board);
    const toPos = getDestPixel(to, board);
    if (fromPos && toPos) {
      triggerAnimation(fromPos.x, fromPos.y, toPos.x, toPos.y, color, to);
    }
    return ANIM_DURATION;
  }

  let arrowTimeout: number | undefined;

  function showOpponentArrows(moves: CheckerMove[]) {
    if (!arrowsEnabled()) return;
    setArrowMoves(moves);
    setArrowVisible(true);
    setArrowFading(false);
    clearTimeout(arrowTimeout);
    arrowTimeout = window.setTimeout(() => {
      setArrowFading(true);
      arrowTimeout = window.setTimeout(() => {
        setArrowVisible(false);
        setArrowFading(false);
        setArrowMoves([]);
      }, 500);
    }, 3000);
  }

  function rollWithAnimation(computeNextState: () => GameState, afterRoll?: (s: GameState) => void) {
    const next = computeNextState();
    if (!next.dice) {
      setState(next);
      afterRoll?.(next);
      return;
    }
    setPendingState(next);
    setIsRolling(true);
    playDiceRoll();

    const t = window.setTimeout(() => {
      setIsRolling(false);
      setState(next);
      setPendingState(null);
      setDiceOrder([0, 1]);

      if (next.dice && next.phase === 'moving') {
        const analysis = computeTurnLuckFull(next, getEvaluator());
        const dice = next.dice;
        const actualDice: [number, number] = dice[0] <= dice[1] ? [dice[0], dice[1]] : [dice[1], dice[0]];
        setLuckHistory(h => [...h, {
          ply: next.ply, player: next.turn, luck: analysis.luck,
          rolls: analysis.rolls, actualDice, rank: analysis.rank,
        }]);
      }

      afterRoll?.(next);
    }, DICE_ANIM_DURATION);
    aiTimeouts.push(t);
  }

  // AI auto-play
  createEffect(() => {
    const s = currentState();
    if (!isAiMode()) return;
    if (s.phase === 'gameOver') return;
    if (s.turn !== 'b') return;

    if (s.phase === 'cubeOffered') {
      const t = window.setTimeout(() => {
        setState(prev => {
          if (prev.phase !== 'cubeOffered') return prev;
          return doAcceptDouble(prev);
        });
      }, AI_ROLL_DELAY);
      aiTimeouts.push(t);
      return;
    }

    if (s.phase === 'waiting') {
      setAiThinking(true);
      const t = window.setTimeout(() => {
        rollWithAnimation(
          () => {
            const prev = currentState();
            if (prev.phase !== 'waiting' || prev.turn !== 'b') return prev;
            return doRoll(prev);
          },
          (rolled) => {
            if (rolled.phase !== 'moving' || rolled.turn !== 'b') {
              setAiThinking(false);
              return;
            }
            doAiMoves(rolled);
          }
        );
      }, AI_ROLL_DELAY);
      aiTimeouts.push(t);
      return;
    }

    if (s.phase === 'moving' && s.dice) {
      setAiThinking(true);
      doAiMoves(s);
    }
  });

  function doAiMoves(s: GameState) {
    const aiResult = chooseBestTurn(s, getEvaluator());

    if (aiResult.moves.length === 0) {
      const t = window.setTimeout(() => {
        setState(prev => {
          if (prev.phase !== 'moving' || prev.turn !== 'b') return prev;
          recordTurn(prev, prev);
          return confirmTurn(prev);
        });
        setAiThinking(false);
      }, AI_MOVE_DELAY);
      aiTimeouts.push(t);
      return;
    }

    let currentDelay = AI_MOVE_DELAY;
    const savedDice = s.dice!;

    for (let i = 0; i < aiResult.moves.length; i++) {
      const move = aiResult.moves[i];
      const isLast = i === aiResult.moves.length - 1;

      const t = window.setTimeout(() => {
        setState(prev => {
          if (prev.turn !== 'b' || prev.phase !== 'moving') return prev;

          animateMove(move.from, move.to, 'b', prev.board);

          if (move.hit) playCapture();
          if (move.from === B_BAR) playJailEscape();

          const next = doMove(prev, move);

          if (isLast || next.phase === 'waiting' || next.phase === 'gameOver') {
            setHistory(h => [...h, {
              ply: prev.ply,
              player: 'b',
              dice: savedDice,
              moves: aiResult.moves,
            }]);
            showOpponentArrows(aiResult.moves);
            setAiThinking(false);
          }
          return next;
        });
      }, currentDelay);
      aiTimeouts.push(t);

      // Dynamic delay: wait for hop animation to finish
      const hopTime = bunnyHop() ? move.die * HOP_DURATION + 150 : ANIM_DURATION + 100;
      currentDelay += Math.max(hopTime, 400);
    }
  }

  function handleRoll() {
    setHistoryIndex(null);
    const s = currentState();
    if (s.phase !== 'waiting') return;
    if (isAiTurn()) return;
    if (isOnline() && !isMyTurn()) return;
    if (isOnline()) {
      socket.send({ type: 'roll' });
      return;
    }
    rollWithAnimation(() => doRoll(s));
  }

  function handleDouble() {
    const s = currentState();
    if (s.phase !== 'waiting') return;
    if (isAiTurn()) return;
    if (isOnline()) { socket.send({ type: 'double' }); return; }
    setState(doDouble(s));
  }

  function handleAcceptDouble() {
    if (isOnline()) { socket.send({ type: 'accept_double' }); return; }
    setState(doAcceptDouble(currentState()));
  }

  function handleDropDouble() {
    if (isOnline()) { socket.send({ type: 'drop_double' }); return; }
    setState(doDropDouble(currentState()));
  }

  function handleSwapDice() {
    const s = currentState();
    if (s.phase !== 'moving' || isAiTurn() || isRolling()) return;
    if (!s.dice || s.dice[0] === s.dice[1]) return;
    if (s.movesLeft.length !== 2) return;
    setDiceOrder(prev => [prev[1], prev[0]]);
  }

  function executeMove(from: number, to: number) {
    setHistoryIndex(null);
    const s = currentState();
    if (s.phase !== 'moving' || isAiTurn()) return;
    if (isOnline() && !isMyTurn()) return;

    const ord = diceOrder();
    const orderedDice = s.dice ? [s.dice[ord[0]], s.dice[ord[1]]] : [];
    const uniqueOrdered: number[] = [];
    const seen = new Set<number>();
    for (const d of orderedDice) {
      if (!seen.has(d) && s.movesLeft.includes(d)) {
        uniqueOrdered.push(d);
        seen.add(d);
      }
    }
    for (const d of s.movesLeft) {
      if (!seen.has(d)) {
        uniqueOrdered.push(d);
        seen.add(d);
      }
    }

    let usedDie = 0;
    for (const die of uniqueOrdered) {
      let dest: number;
      if (from === W_BAR && s.turn === 'w') {
        dest = 25 - die;
      } else if (from === B_BAR && s.turn === 'b') {
        dest = die;
      } else {
        dest = s.turn === 'w' ? from - die : from + die;
      }
      if (s.turn === 'w' && dest <= 0 && to === 0) { usedDie = die; break; }
      if (s.turn === 'b' && dest >= 25 && to === 25) { usedDie = die; break; }
      if (dest === to) { usedDie = die; break; }
    }

    if (usedDie === 0) return;

    const isHit = s.turn === 'w'
      ? s.board[to] < 0 && s.board[to] >= -1
      : s.board[to] > 0 && s.board[to] <= 1;

    const move: CheckerMove = {
      from,
      to,
      die: usedDie,
      hit: isHit && to > 0 && to < 25,
    };

    animateMove(from, to, s.turn, s.board);
    if (move.hit) playCapture();
    if (from === W_BAR || from === B_BAR) playJailEscape();

    if (isOnline()) {
      // Send to server — server will broadcast authoritative state
      socket.send({ type: 'move', move });
      // Optimistic local update for responsiveness
      const newState = doMove(s, move);
      setState(newState);
      setSelectedPoint(null);
      return;
    }

    const newState = doMove(s, move);
    setState(newState);
    setSelectedPoint(null);

    if (newState.phase === 'waiting' || newState.phase === 'gameOver') {
      recordTurn(s, newState, move);
    }
  }

  function handlePointClick(point: number) {
    const s = currentState();
    if (s.phase !== 'moving') return;
    if (isAiTurn()) return;

    const sel = selectedPoint();

    if (sel !== null && legalDests().includes(point)) {
      executeMove(sel, point);
      return;
    }

    if (moveablePoints().includes(point)) {
      setSelectedPoint(sel === point ? null : point);
      return;
    }

    setSelectedPoint(null);
  }

  function handleBearOffClick() {
    const s = currentState();
    const sel = selectedPoint();
    if (sel === null || s.phase !== 'moving') return;
    if (isAiTurn()) return;
    const bearOffPoint = s.turn === 'w' ? 0 : 25;
    handlePointClick(bearOffPoint);
  }

  function handleBarClick() {
    const s = currentState();
    if (s.phase !== 'moving' || isAiTurn()) return;
    const bar = s.turn === 'w' ? W_BAR : B_BAR;
    if (moveablePoints().includes(bar)) {
      setSelectedPoint(selectedPoint() === bar ? null : bar);
    }
  }

  function clientCoordsToPoint(clientX: number, clientY: number): number | null {
    const svg = document.querySelector('.board-svg') as SVGSVGElement | null;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * BOARD_VIEWBOX.w;
    const svgY = ((clientY - rect.top) / rect.height) * BOARD_VIEWBOX.h;

    if (svgX < 0 || svgX > BOARD_VIEWBOX.w || svgY < 0 || svgY > BOARD_VIEWBOX.h) return null;

    const s = currentState();
    const whiteRight = direction() === 'right';
    if (s.turn === 'w') {
      if (whiteRight && svgX >= BOARD_VIEWBOX.w - 30) return 0;
      if (!whiteRight && svgX <= 30) return 0;
    }
    if (s.turn === 'b') {
      if (whiteRight && svgX <= 30) return 25;
      if (!whiteRight && svgX >= BOARD_VIEWBOX.w - 30) return 25;
    }

    const isTop = svgY < BOARD_VIEWBOX.h / 2;

    let bestCol = -1;
    let bestDist = Infinity;
    for (let col = 0; col < 12; col++) {
      const px = pointX(col);
      const dist = Math.abs(svgX - px);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
      }
    }

    if (bestCol < 0 || bestDist > 40) return null;

    return colToPoint(bestCol, isTop, flipped(), direction());
  }

  function handleDragStart(point: number) {
    const s = currentState();
    setSelectedPoint(point);
    setDragGhost({ x: 0, y: 0, color: s.turn });
  }

  function handleDragMove(clientX: number, clientY: number) {
    setDragGhost(prev => prev ? { ...prev, x: clientX, y: clientY } : null);
  }

  function handleDragEnd(clientX: number, clientY: number) {
    const sel = selectedPoint();
    setDragGhost(null);
    if (sel === null) return;

    const point = clientCoordsToPoint(clientX, clientY);
    if (point !== null) {
      const s = currentState();
      const dests = legalDestinations(s.board, sel, s.movesLeft, s.turn);
      if (dests.includes(point)) {
        executeMove(sel, point);
        return;
      }
    }
  }

  function handleJailDragEnd(clientX: number, clientY: number) {
    const point = clientCoordsToPoint(clientX, clientY);
    if (point === null) return;

    const s = currentState();
    const bar = s.turn === 'w' ? W_BAR : B_BAR;
    const dests = legalDestinations(s.board, bar, s.movesLeft, s.turn);
    if (dests.includes(point)) {
      executeMove(bar, point);
    }
  }

  function handleUndo() {
    if (isAiTurn()) return;
    if (isOnline()) {
      socket.send({ type: 'undo' });
      return;
    }
    clearAnimations();
    setState(undoMove(currentState()));
    setSelectedPoint(null);
  }

  function handleConfirm() {
    const s = currentState();
    if (s.phase !== 'moving' || isAiTurn()) return;
    if (isOnline()) {
      socket.send({ type: 'confirm' });
      return;
    }
    if (!hasAnyMoves(s.board, s.movesLeft, s.turn)) {
      const newState = confirmTurn(s);
      recordTurn(s, newState);
      setState(newState);
      setSelectedPoint(null);
    }
  }

  function recordTurn(before: GameState, _after: GameState, extraMove?: CheckerMove) {
    if (before.dice) {
      const moves = extraMove ? [...before.turnMoves, extraMove] : before.turnMoves;
      setHistory(prev => [...prev, {
        ply: before.ply,
        player: before.turn,
        dice: before.dice!,
        moves,
      }]);
    }
  }

  function handleNewGame() {
    clearAiTimeouts();
    clearAnimations();
    clearTimeout(arrowTimeout);
    setAiThinking(false);
    setIsRolling(false);
    setPendingState(null);
    setArrowVisible(false);
    setArrowMoves([]);
    const fresh = newGame();
    initialBoard = [...fresh.board];
    initialWhiteOff = 0;
    initialBlackOff = 0;
    setState(fresh);
    setSelectedPoint(null);
    setHistory([]);
    setHistoryIndex(null);
    setTimeLocked(false);
    setDiceOrder([0, 1]);
    setLuckHistory([]);
  }

  function handleResign() {
    if (!isOnline()) return;
    if (currentState().phase === 'gameOver') return;
    socket.send({ type: 'resign' });
  }

  function handleRematch() {
    if (!isOnline()) return;
    socket.send({ type: 'rematch' });
  }

  function handleExit() {
    clearAiTimeouts();
    if (isOnline()) socket.disconnect();
    props.onExit();
  }

  const canConfirmTurn = createMemo(() => {
    const s = currentState();
    if (isAiTurn()) return false;
    return s.phase === 'moving' && !hasAnyMoves(s.board, s.movesLeft, s.turn);
  });

  const canUndo = createMemo(() => {
    const s = currentState();
    if (isAiTurn()) return false;
    return s.phase === 'moving' && s.turnMoves.length > 0;
  });

  const turnLabel = () => {
    if (waitingForOpponent()) return 'Waiting for opponent...';
    const idx = historyIndex();
    if (idx === -1) return 'Starting position';
    if (idx !== null) return `Move ${idx + 1} of ${history().length}`;
    const s = currentState();
    if (s.phase === 'gameOver') return '';
    if (isRolling()) return 'Rolling...';
    if (isOnline()) {
      if (opponentDisconnected()) return `${opponentName()} disconnected...`;
      const name = opponentName() !== 'Opponent' ? opponentName() : "Opponent";
      return isMyTurn() ? `Your turn (vs ${name})` : `${name}'s turn`;
    }
    if (isAiMode()) {
      if (s.turn === 'w') return "Your turn";
      return "AI thinking...";
    }
    return s.turn === 'w' ? "White's turn" : "Black's turn";
  };

  const displayDice = () => {
    const p = pendingState();
    if (isRolling() && p?.dice) return p.dice;
    return currentState().dice;
  };

  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'f': setFlipped(f => !f); break;
      case 'z': handleUndo(); break;
      case 's': handleSwapDice(); break;
      case 'a': setArrowsEnabled(e => !e); break;
      case 'b': setBunnyHop(b => !b); break;
      case 'r': setDirection(d => d === 'right' ? 'left' : 'right'); break;
      case 'ArrowLeft':
        e.preventDefault();
        clearAnimations();
        setHistoryIndex(prev => {
          const h = history();
          if (h.length === 0) return null;
          if (prev === null) return h.length - 1;
          return Math.max(-1, prev - 1); // -1 = starting position
        });
        break;
      case 'ArrowRight':
        e.preventDefault();
        clearAnimations();
        setHistoryIndex(prev => {
          if (prev === null) return null;
          const h = history();
          return prev >= h.length - 1 ? null : prev + 1;
        });
        break;
      case 'Enter':
        if (currentState().phase === 'waiting' && !isAiTurn()) handleRoll();
        else if (canConfirmTurn()) handleConfirm();
        break;
      case 'd': handleDouble(); break;
      case 'Escape': setSelectedPoint(null); break;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  }

  // Game over sound
  createEffect(() => {
    const result = gameResult();
    if (!result) return;
    if (isAiMode()) {
      if (result.winner === 'w') playVictory();
      else playDefeat();
    } else {
      playVictory();
    }
  });

  // Move timer — countdown for the entire turn (not per individual move)
  // Doubles get +50% time bonus
  createEffect(() => {
    const s = currentState();
    const limit = timePerMove();
    if (s.phase === 'moving' && !isAiTurn() && !isReviewing() && limit !== null) {
      // Lock time setting once a timed game has started
      if (!timeLocked()) setTimeLocked(true);
      // Doubles bonus: +50% time
      const isDoubles = s.dice && s.dice[0] === s.dice[1];
      const turnTime = isDoubles ? Math.floor(limit * 1.5) : limit;
      setTimeRemaining(turnTime);
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 0) return 0;
          return prev - 1;
        });
      }, 1000);
      onCleanup(() => clearInterval(interval));
    } else {
      setTimeRemaining(null);
    }
  });

  // Timeout — play random legal moves for remaining dice, then confirm
  createEffect(() => {
    if (timeRemaining() === 0 && currentState().phase === 'moving' && !isAiTurn()) {
      playTimeout();
      let s = currentState();

      // Play random moves for each remaining die
      while (s.phase === 'moving' && s.movesLeft.length > 0) {
        const moveable = movableCheckers(s.board, s.movesLeft, s.turn);
        if (moveable.length === 0) break;
        const from = moveable[Math.floor(Math.random() * moveable.length)];
        const dests = legalDestinations(s.board, from, s.movesLeft, s.turn);
        if (dests.length === 0) break;
        const to = dests[Math.floor(Math.random() * dests.length)];
        // Find which die this uses
        const uniqueDice = [...new Set(s.movesLeft)];
        let usedDie = 0;
        for (const die of uniqueDice) {
          let dest: number;
          if (from === 0 && s.turn === 'w') dest = 25 - die;
          else if (from === 25 && s.turn === 'b') dest = die;
          else dest = s.turn === 'w' ? from - die : from + die;
          if ((s.turn === 'w' && dest <= 0 && to === 0) || (s.turn === 'b' && dest >= 25 && to === 25) || dest === to) {
            usedDie = die; break;
          }
        }
        if (usedDie === 0) break;
        const isHit = s.turn === 'w' ? s.board[to] < 0 && s.board[to] >= -1 : s.board[to] > 0 && s.board[to] <= 1;
        s = doMove(s, { from, to, die: usedDie, hit: isHit && to > 0 && to < 25 });
      }

      if (s.phase === 'moving') {
        recordTurn(s, s);
        s = confirmTurn(s);
      } else if (s.phase === 'waiting' || s.phase === 'gameOver') {
        recordTurn(currentState(), s);
      }
      setState(s);
      setSelectedPoint(null);
    }
  });

  // Scroll highlighted move into view
  createEffect(() => {
    const idx = historyIndex();
    if (idx === null) return;
    const el = document.querySelector(`.move-entry[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  });

  return (
    <div class="board-container">
      {/* Chat panel — left side, online mode only */}
      <Show when={isOnline() && !waitingForOpponent()}>
        <ChatPanel
          messages={chatMessages()}
          onSend={(text) => socket.send({ type: 'chat', text })}
        />
      </Show>

      <div class="board-and-jail">
        <div class="board-wrapper">
          <Board
            board={displayBoard()}
            turn={currentState().turn}
            whiteOff={displayWhiteOff()}
            blackOff={displayBlackOff()}
            selectedPoint={selectedPoint()}
            moveablePoints={moveablePoints()}
            legalDests={legalDests()}
            onPointClick={handlePointClick}
            onBearOffClick={handleBearOffClick}
            flipped={flipped()}
            direction={direction()}
            hiddenDests={getHiddenDests()}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
          />
          <svg
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              "pointer-events": 'none',
            }}
            viewBox="0 0 780 640"
          >
            <MoveAnimation />
            <OpponentArrows
              moves={arrowMoves()}
              visible={arrowVisible()}
              fading={arrowFading()}
              flipped={flipped()}
              direction={direction()}
            />
            <Dice
              dice={displayDice()}
              movesLeft={currentState().movesLeft}
              rolling={isRolling()}
              diceOrder={diceOrder()}
              onSwap={handleSwapDice}
            />
          </svg>
        </div>

        <Show when={dragGhost()}>
          {(ghost) => (
            <div
              class="drag-ghost"
              style={{
                left: `${ghost().x}px`,
                top: `${ghost().y}px`,
              }}
            >
              <div class={`jail-checker ${ghost().color === 'w' ? 'white' : 'black'}`} />
            </div>
          )}
        </Show>

        <Jail
          whiteCount={whiteBarCount()}
          blackCount={blackBarCount()}
          turn={currentState().turn}
          canMoveFromBar={canMoveFromBar()}
          isSelected={isBarSelected()}
          onBarClick={handleBarClick}
          onDragEnd={handleJailDragEnd}
        />
      </div>

      <div class="side-panel">
        {/* Opponent box */}
        <div class="panel-section opponent-box">
          <div class={`player-row ${currentState().turn === 'b' ? 'active-turn' : ''}`}>
            <div class="color-dot black" />
            <span class="player-name">{isAiMode() ? 'AI' : isOnline() ? (myColor() === 'b' ? 'You' : opponentName()) : 'Black'}</span>
            <span class="pip-inline">{blackPips()} pips</span>
          </div>
          <div class="vs-divider">vs</div>
          <div class={`player-row ${currentState().turn === 'w' ? 'active-turn' : ''}`}>
            <div class="color-dot white" />
            <span class="player-name">{isAiMode() ? 'You' : isOnline() ? (myColor() === 'w' ? 'You' : opponentName()) : 'White'}</span>
            <span class="pip-inline">{whitePips()} pips</span>
          </div>
        </div>

        {/* Turn indicator */}
        <div class="panel-section turn-indicator">
          <div class="turn-label">{turnLabel()}</div>
          <Show when={aiThinking()}>
            <div class="ai-thinking-dots">
              <span class="dot" />
              <span class="dot" />
              <span class="dot" />
            </div>
          </Show>
          <Show when={timeRemaining() !== null}>
            <CountdownClock remaining={timeRemaining()!} total={timePerMove()!} />
          </Show>
          <Show when={isOnline() && opponentDisconnected()}>
            <div style={{ "font-size": "11px", color: "#f0ad4e", "margin-top": "4px" }}>
              {opponentName()} disconnected — waiting...
            </div>
          </Show>
        </div>

        <div class="panel-section">
          <div class="panel-title">Cube</div>
          <div class="cube-display">
            <span class="cube-value">{currentState().cube.value}</span>
            <span style={{ color: 'var(--text-secondary)', "font-size": '12px' }}>
              {currentState().cube.owner === 'center' ? 'Center' :
                currentState().cube.owner === 'w' ? (isAiMode() ? 'You' : 'White') :
                (isAiMode() ? 'AI' : 'Black')}
            </span>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-title">Luck</div>
          <LuckMeter history={luckHistory()} isAiMode={isAiMode()} />
        </div>

        <div class="panel-section">
          <div class="panel-title">Actions</div>
          <div class="controls">
            <Show when={waitingForOpponent() && !props.onlineGameId}>
              <div style={{ "font-size": "12px", "text-align": "center" }}>
                <p style={{ margin: "0 0 8px", color: "var(--text-secondary)" }}>Share this link to invite:</p>
                <input
                  type="text"
                  readonly
                  value={`${window.location.origin}?game=${onlineGameId()}`}
                  style={{
                    width: "100%", background: "var(--bg-tertiary)", color: "var(--text-primary)",
                    border: "1px solid rgba(255,255,255,0.1)", "border-radius": "4px",
                    padding: "6px 8px", "font-size": "11px", "font-family": "var(--font-mono)",
                  }}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button class="btn btn-small" style={{ "margin-top": "6px" }}
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}?game=${onlineGameId()}`)}
                >Copy Link</button>
              </div>
            </Show>
            <Show when={waitingForOpponent() && props.onlineGameId}>
              <div style={{ "font-size": "12px", "text-align": "center", color: "var(--text-secondary)" }}>
                Connecting to game...
              </div>
            </Show>
            <Show when={currentState().phase === 'waiting' && !isAiTurn() && !waitingForOpponent() && isMyTurn()}>
              <button class="btn btn-primary" onClick={handleRoll} disabled={isRolling()}>
                Roll <span class="shortcut-hint">Enter</span>
              </button>
              <Show when={canDouble(currentState().cube, currentState().turn)}>
                <button class="btn" onClick={handleDouble}>
                  Double <span class="shortcut-hint">D</span>
                </button>
              </Show>
            </Show>

            <Show when={currentState().phase === 'cubeOffered' && !isAiTurn()}>
              <div class="double-offer">
                <span class="double-msg">
                  {isAiMode() ? 'AI doubles!' : (currentState().turn === 'w' ? 'White' : 'Black') + ' doubles!'}
                </span>
                <button class="btn btn-primary" onClick={handleAcceptDouble}>Accept</button>
                <button class="btn btn-danger" onClick={handleDropDouble}>Drop</button>
              </div>
            </Show>

            <Show when={currentState().phase === 'moving' && !isAiTurn()}>
              <span class="move-hint">
                {currentState().movesLeft.length > 0
                  ? `Move (${currentState().movesLeft.join(', ')} left)`
                  : 'All dice used'}
              </span>
              <button class="btn btn-small" onClick={handleUndo} disabled={!canUndo()}>
                Undo <span class="shortcut-hint">Z</span>
              </button>
              <Show when={canConfirmTurn()}>
                <button class="btn btn-primary btn-small" onClick={handleConfirm}>
                  Confirm <span class="shortcut-hint">Enter</span>
                </button>
              </Show>
            </Show>
          </div>
        </div>

        <div class="panel-section" style={{ flex: 1, "min-height": 0 }}>
          <div class="panel-title">Moves</div>
          <div class="move-list" id="move-list">
            {history().map((h, i) => (
              <div
                class={`move-entry ${historyIndex() === i ? 'active' : ''}`}
                data-idx={i}
                onClick={() => { clearAnimations(); setHistoryIndex(historyIndex() === i ? null : i); }}
                style={{ cursor: 'pointer' }}
              >
                <span class="ply">{h.ply + 1}.</span>
                <span class={`color-indicator ${h.player === 'w' ? 'white' : 'black'}`} />
                <span class="dice-label">{formatDice(h.dice)}</span>
                <span>{formatTurn(h.moves, h.player)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Options */}
        <div class="panel-section options-section">
          <div class="panel-title">Options</div>
          <label class="option-row">
            <input type="checkbox" checked={bunnyHop()} onChange={() => setBunnyHop(b => !b)} />
            Hop animation <span class="shortcut-hint">B</span>
          </label>
          <label class="option-row">
            <input type="checkbox" checked={arrowsEnabled()} onChange={() => setArrowsEnabled(e => !e)} />
            Move arrows <span class="shortcut-hint">A</span>
          </label>
          <label class="option-row">
            <span>Direction</span>
            <button class="btn btn-small" onClick={() => setDirection(d => d === 'right' ? 'left' : 'right')}>
              {direction() === 'right' ? '\u2192' : '\u2190'} <span class="shortcut-hint">R</span>
            </button>
          </label>
          <Show when={isAiMode()}>
            <label class="option-row">
              <span>AI strength</span>
              <select value={aiDifficulty()} onChange={(e) => setAiDifficulty(e.currentTarget.value as AiDifficulty)}>
                <option value="strong">Strong</option>
                <option value="expert">Expert (NN)</option>
              </select>
            </label>
          </Show>
          <Show when={!isOnline()}>
            <label class="option-row">
              <span>Turn time</span>
              <select
                value={timePerMove() === null ? 'none' : String(timePerMove())}
                disabled={timeLocked()}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setTimePerMove(v === 'none' ? null : Number(v));
                }}
              >
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
                <option value="none">Untimed</option>
              </select>
            </label>
          </Show>
        </div>

        <div class="controls bottom-controls">
          <button class="btn btn-small" onClick={() => setFlipped(f => !f)}>
            Flip <span class="shortcut-hint">F</span>
          </button>
          <Show when={isOnline() && currentState().phase !== 'gameOver'}>
            <button class="btn btn-small" style={{ color: '#e53935' }} onClick={handleResign}>Resign</button>
          </Show>
          <Show when={!isOnline()}>
            <button class="btn btn-small" onClick={handleNewGame}>New</button>
          </Show>
          <button class="btn btn-small" onClick={handleExit}>Exit</button>
        </div>
      </div>

      {/* Connection indicator */}
      <Show when={isOnline()}>
        <div class="connection-indicator">
          <div class={`connection-dot ${wsConnected() ? (opponentDisconnected() ? 'disconnected' : 'connected') : 'disconnected'}`} />
          <span>{
            !wsConnected() ? 'Reconnecting...' :
            waitingForOpponent() ? 'Waiting for opponent' :
            opponentDisconnected() ? 'Opponent offline' :
            'Online'
          }</span>
        </div>
      </Show>

      <Show when={gameResult() || (isOnline() && currentState().phase === 'gameOver')} keyed>
        {(_when) => {
          const result = gameResult();
          const winnerLabel = () => {
            if (!result) return 'Game Over';
            if (isOnline()) return result.winner === myColor() ? 'You Win!' : 'You Lose';
            if (isAiMode()) return result.winner === 'w' ? 'You Win!' : 'AI Wins!';
            return (result.winner === 'w' ? 'White' : 'Black') + ' Wins!';
          };
          return (
            <div class="game-over-overlay" onClick={isOnline() ? undefined : handleNewGame}>
              <div class="game-over-modal" onClick={(e) => e.stopPropagation()}>
                <h2>{winnerLabel()}</h2>
                <Show when={result}>
                  <div class="result-type">
                    {result!.type === 'backgammon' ? 'Backgammon!' :
                      result!.type === 'gammon' ? 'Gammon!' : 'Single game'}
                  </div>
                  <div class="points">{result!.points} pts</div>
                </Show>
                <div style={{ display: 'flex', gap: '8px', "justify-content": 'center', "margin-top": '12px' }}>
                  <Show when={isOnline()}>
                    <button class="btn btn-primary" onClick={handleRematch}>
                      {rematchOffered() ? 'Accept Rematch' : 'Rematch'}
                    </button>
                  </Show>
                  <Show when={!isOnline()}>
                    <button class="btn btn-primary" onClick={handleNewGame}>New Game</button>
                  </Show>
                  <button class="btn" onClick={handleExit}>Exit</button>
                </div>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
};

export default GameView;
