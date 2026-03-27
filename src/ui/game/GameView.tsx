import { Component, Show, createSignal, createMemo, createEffect, onCleanup } from 'solid-js';
import type { GameState, Color, CheckerMove, GameResult } from '../../shared/types';
import { W_BAR, B_BAR } from '../../shared/constants';
import { newGame, doRoll, doMove, doDouble, doAcceptDouble, doDropDouble, undoMove, confirmTurn, getGameResult } from '../../engine/game';
import { legalDestinations, movableCheckers, hasAnyMoves } from '../../engine/moves';
import { canDouble } from '../../engine/cube';
import { pipCount } from '../../engine/pip';
import { chooseBestTurn } from '../../engine/ai';
import { formatTurn, formatDice } from '../../shared/notation';
import Board from '../board/Board';
import Dice from '../board/Dice';

interface TurnRecord {
  ply: number;
  player: Color;
  dice: [number, number];
  moves: CheckerMove[];
}

export type GameMode = 'local' | 'ai';

const AI_ROLL_DELAY = 500;
const AI_MOVE_DELAY = 350;

const GameView: Component<{ onExit: () => void; mode: GameMode }> = (props) => {
  const [state, setState] = createSignal<GameState>(newGame());
  const [selectedPoint, setSelectedPoint] = createSignal<number | null>(null);
  const [flipped, setFlipped] = createSignal(false);
  const [history, setHistory] = createSignal<TurnRecord[]>([]);
  const [aiThinking, setAiThinking] = createSignal(false);

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
  const playerColor = (): Color => 'w';

  const moveablePoints = createMemo(() => {
    const s = currentState();
    if (s.phase !== 'moving') return [];
    if (isAiTurn()) return []; // Don't show highlights during AI turn
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

  // AI auto-play effect
  createEffect(() => {
    const s = currentState();
    if (!isAiMode()) return;
    if (s.phase === 'gameOver') return;
    if (s.turn !== 'b') return;

    if (s.phase === 'cubeOffered') {
      // AI always accepts doubles (simple strategy)
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
        setState(prev => {
          if (prev.phase !== 'waiting' || prev.turn !== 'b') return prev;
          return doRoll(prev);
        });
      }, AI_ROLL_DELAY);
      aiTimeouts.push(t);
      return;
    }

    if (s.phase === 'moving' && s.dice) {
      setAiThinking(true);
      const aiResult = chooseBestTurn(s);

      if (aiResult.moves.length === 0) {
        // No moves - confirm turn
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

      // Apply AI moves one by one with delays for animation feel
      let currentDelay = AI_MOVE_DELAY;
      const savedDice = s.dice;

      for (let i = 0; i < aiResult.moves.length; i++) {
        const move = aiResult.moves[i];
        const isLast = i === aiResult.moves.length - 1;

        const t = window.setTimeout(() => {
          setState(prev => {
            if (prev.turn !== 'b' || prev.phase !== 'moving') return prev;
            const next = doMove(prev, move);

            if (isLast || next.phase === 'waiting' || next.phase === 'gameOver') {
              // Turn ended
              setHistory(h => [...h, {
                ply: prev.ply,
                player: 'b',
                dice: savedDice,
                moves: aiResult.moves,
              }]);
              setAiThinking(false);
            }
            return next;
          });
        }, currentDelay);
        aiTimeouts.push(t);
        currentDelay += AI_MOVE_DELAY;
      }
    }
  });

  function handleRoll() {
    const s = currentState();
    if (s.phase !== 'waiting') return;
    if (isAiTurn()) return;
    const newState = doRoll(s);
    setState(newState);
  }

  function handleDouble() {
    const s = currentState();
    if (s.phase !== 'waiting') return;
    if (isAiTurn()) return;
    setState(doDouble(s));
  }

  function handleAcceptDouble() {
    setState(doAcceptDouble(currentState()));
  }

  function handleDropDouble() {
    setState(doDropDouble(currentState()));
  }

  function handlePointClick(point: number) {
    const s = currentState();
    if (s.phase !== 'moving') return;
    if (isAiTurn()) return;

    const sel = selectedPoint();

    // If clicking a destination
    if (sel !== null && legalDests().includes(point)) {
      const dests = legalDestinations(s.board, sel, s.movesLeft, s.turn);
      if (dests.includes(point)) {
        const uniqueDice = [...new Set(s.movesLeft)];
        let usedDie = 0;
        for (const die of uniqueDice) {
          const dest = s.turn === 'w' ? sel - die : sel + die;
          if (s.turn === 'w' && dest <= 0 && (point === 0)) {
            usedDie = die;
            break;
          }
          if (s.turn === 'b' && dest >= 25 && (point === 25)) {
            usedDie = die;
            break;
          }
          if (dest === point) {
            usedDie = die;
            break;
          }
        }

        if (usedDie === 0) return;

        const isHit = s.turn === 'w'
          ? s.board[point] < 0 && s.board[point] >= -1
          : s.board[point] > 0 && s.board[point] <= 1;

        const move: CheckerMove = {
          from: sel,
          to: point,
          die: usedDie,
          hit: isHit && point > 0 && point < 25,
        };

        const newState = doMove(s, move);
        setState(newState);
        setSelectedPoint(null);

        if (newState.phase === 'waiting' || newState.phase === 'gameOver') {
          recordTurn(s, newState);
        }
        return;
      }
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

  function handleUndo() {
    if (isAiTurn()) return;
    const newState = undoMove(currentState());
    setState(newState);
    setSelectedPoint(null);
  }

  function handleConfirm() {
    const s = currentState();
    if (s.phase !== 'moving') return;
    if (isAiTurn()) return;

    if (!hasAnyMoves(s.board, s.movesLeft, s.turn)) {
      const newState = confirmTurn(s);
      recordTurn(s, newState);
      setState(newState);
      setSelectedPoint(null);
    }
  }

  function recordTurn(before: GameState, _after: GameState) {
    if (before.dice) {
      setHistory(prev => [...prev, {
        ply: before.ply,
        player: before.turn,
        dice: before.dice!,
        moves: before.turnMoves,
      }]);
    }
  }

  function handleNewGame() {
    clearAiTimeouts();
    setAiThinking(false);
    setState(newGame());
    setSelectedPoint(null);
    setHistory([]);
  }

  function handleExit() {
    clearAiTimeouts();
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
    const s = currentState();
    if (s.phase === 'gameOver') return '';
    if (isAiMode()) {
      if (s.turn === 'w') return "Your turn";
      return "AI thinking...";
    }
    return s.turn === 'w' ? "White's turn" : "Black's turn";
  };

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'f':
        setFlipped(f => !f);
        break;
      case 'z':
        handleUndo();
        break;
      case 'Enter':
        if (currentState().phase === 'waiting' && !isAiTurn()) {
          handleRoll();
        } else if (canConfirmTurn()) {
          handleConfirm();
        }
        break;
      case 'd':
        handleDouble();
        break;
      case 'Escape':
        setSelectedPoint(null);
        break;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  }

  return (
    <div class="board-container">
      <div class="board-wrapper">
        <Board
          board={currentState().board}
          turn={currentState().turn}
          whiteOff={currentState().whiteOff}
          blackOff={currentState().blackOff}
          selectedPoint={selectedPoint()}
          moveablePoints={moveablePoints()}
          legalDests={legalDests()}
          onPointClick={handlePointClick}
          onBearOffClick={handleBearOffClick}
          flipped={flipped()}
        />
        {/* Dice overlay on board */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            "pointer-events": 'none',
          }}
          viewBox="0 0 920 560"
        >
          <Dice dice={currentState().dice} movesLeft={currentState().movesLeft} />
        </svg>
      </div>

      <div class="side-panel">
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
        </div>

        {/* Player info */}
        <div class="panel-section">
          <div class={`player-info ${currentState().turn === 'b' ? 'active' : ''}`}>
            <div class="color-dot black" />
            <span>{isAiMode() ? 'AI' : 'Black'}</span>
            <span class="pip-inline">{blackPips()} pips</span>
          </div>
          <div class={`player-info ${currentState().turn === 'w' ? 'active' : ''}`}>
            <div class="color-dot white" />
            <span>{isAiMode() ? 'You' : 'White'}</span>
            <span class="pip-inline">{whitePips()} pips</span>
          </div>
        </div>

        {/* Cube */}
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

        {/* Controls */}
        <div class="panel-section">
          <div class="panel-title">Actions</div>
          <div class="controls">
            <Show when={currentState().phase === 'waiting' && !isAiTurn()}>
              <button class="btn btn-primary" onClick={handleRoll}>
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
              <button
                class="btn btn-small"
                onClick={handleUndo}
                disabled={!canUndo()}
              >
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

        {/* Move history */}
        <div class="panel-section" style={{ flex: 1, "min-height": 0 }}>
          <div class="panel-title">Moves</div>
          <div class="move-list" id="move-list">
            {history().map(h => (
              <div class="move-entry">
                <span class="ply">{h.ply + 1}.</span>
                <span class={`color-indicator ${h.player === 'w' ? 'white' : 'black'}`} />
                <span class="dice-label">{formatDice(h.dice)}</span>
                <span>{formatTurn(h.moves, h.player)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Misc controls */}
        <div class="controls bottom-controls">
          <button class="btn btn-small" onClick={() => setFlipped(f => !f)}>
            Flip <span class="shortcut-hint">F</span>
          </button>
          <button class="btn btn-small" onClick={handleNewGame}>New</button>
          <button class="btn btn-small" onClick={handleExit}>Exit</button>
        </div>
      </div>

      {/* Game over modal */}
      <Show when={gameResult()}>
        {(result) => {
          const winnerLabel = () => {
            if (isAiMode()) {
              return result().winner === 'w' ? 'You Win!' : 'AI Wins!';
            }
            return (result().winner === 'w' ? 'White' : 'Black') + ' Wins!';
          };

          return (
            <div class="game-over-overlay" onClick={handleNewGame}>
              <div class="game-over-modal" onClick={(e) => e.stopPropagation()}>
                <h2>{winnerLabel()}</h2>
                <div class="result-type">
                  {result().type === 'backgammon' ? 'Backgammon!' :
                    result().type === 'gammon' ? 'Gammon!' : 'Single game'}
                </div>
                <div class="points">{result().points} pts</div>
                <button class="btn btn-primary" onClick={handleNewGame}>New Game</button>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
};

export default GameView;
