import { randomInt } from 'crypto';
import type { WebSocket } from 'ws';
import type { GameState, Color, CheckerMove, GameResult } from '../shared/types';
import type { ServerMessage } from './protocol';
import { createInitialGameState } from '../shared/constants';
import { doMove, doDouble, doAcceptDouble, doDropDouble, undoMove, confirmTurn, getGameResult } from '../engine/game';
import { legalDestinations, movableCheckers, hasAnyMoves } from '../engine/moves';
import { diceToMoves } from '../engine/dice';
import { canDouble } from '../engine/cube';

function rollDie(): number {
  return randomInt(1, 7); // crypto-secure [1,6]
}

function serverRollDice(): [number, number] {
  return [rollDie(), rollDie()];
}

interface Player {
  ws: WebSocket;
  color: Color;
  userId?: number;
  username?: string;
}

export class GameRoom {
  id: string;
  state: GameState;
  players: Map<WebSocket, Player> = new Map();
  white: WebSocket | null = null;
  black: WebSocket | null = null;
  whiteUserId: number | undefined;
  blackUserId: number | undefined;
  whiteUsername: string | undefined;
  blackUsername: string | undefined;
  timeLimit: number | null;
  timer: ReturnType<typeof setTimeout> | null = null;
  rematchOffer: Color | null = null;
  disconnectTimer: Map<WebSocket, ReturnType<typeof setTimeout>> = new Map();
  saved = false;
  resultType: string | null = null;
  moveHistory: any[] = [];
  luckWhite = 0;
  luckBlack = 0;

  constructor(id: string, timeLimit: number | null = 30) {
    this.id = id;
    this.state = createInitialGameState(id);
    this.timeLimit = timeLimit;
  }

  get isFull(): boolean {
    return this.white !== null && this.black !== null;
  }

  addPlayer(ws: WebSocket, userId?: number, username?: string): Color | null {
    if (this.white === null) {
      this.white = ws;
      this.whiteUserId = userId;
      this.whiteUsername = username;
      this.players.set(ws, { ws, color: 'w', userId, username });
      return 'w';
    }
    if (this.black === null) {
      this.black = ws;
      this.blackUserId = userId;
      this.blackUsername = username;
      this.players.set(ws, { ws, color: 'b', userId, username });
      return 'b';
    }
    return null;
  }

  getColor(ws: WebSocket): Color | null {
    return this.players.get(ws)?.color ?? null;
  }

  send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: ServerMessage) {
    if (this.white) this.send(this.white, msg);
    if (this.black) this.send(this.black, msg);
  }

  startGame() {
    this.state = createInitialGameState(this.id);
    this.saved = false;
    this.moveHistory = [];
    this.luckWhite = 0;
    this.luckBlack = 0;
    this.resultType = null;
    if (this.white) this.send(this.white, { type: 'game_start', state: this.state, color: 'w', opponent: this.blackUsername });
    if (this.black) this.send(this.black, { type: 'game_start', state: this.state, color: 'b', opponent: this.whiteUsername });
  }

  /** Record a completed turn in move history */
  private recordTurn(player: Color, dice: [number, number], moves: CheckerMove[]) {
    this.moveHistory.push({ ply: this.state.ply, player, dice, moves });
  }

  handleRoll(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color || color !== this.state.turn) return this.send(ws, { type: 'error', message: 'Not your turn' });
    if (this.state.phase !== 'waiting') return this.send(ws, { type: 'error', message: 'Cannot roll now' });

    const dice = serverRollDice();
    const movesLeft = diceToMoves(dice);

    // Apply roll to state
    this.state = {
      ...this.state,
      dice,
      movesLeft,
      phase: hasAnyMoves(this.state.board, movesLeft, this.state.turn) ? 'moving' : 'waiting',
      turnMoves: [],
    };

    // If no moves possible, auto-pass
    if (this.state.phase === 'waiting') {
      this.recordTurn(this.state.turn, dice, []);
      this.state = {
        ...this.state,
        dice: null,
        movesLeft: [],
        turn: this.state.turn === 'w' ? 'b' : 'w',
        ply: this.state.ply + 1,
      };
    }

    this.broadcast({ type: 'state', state: this.state });
    this.startTurnTimer();
  }

  handleMove(ws: WebSocket, move: CheckerMove) {
    const color = this.getColor(ws);
    if (!color || color !== this.state.turn) return this.send(ws, { type: 'error', message: 'Not your turn' });
    if (this.state.phase !== 'moving') return this.send(ws, { type: 'error', message: 'Cannot move now' });

    // Validate move is legal
    const dests = legalDestinations(this.state.board, move.from, this.state.movesLeft, this.state.turn);
    if (!dests.includes(move.to)) {
      return this.send(ws, { type: 'error', message: 'Illegal move' });
    }

    const prevTurn = this.state.turn;
    const prevDice = this.state.dice!;
    const prevMoves = [...this.state.turnMoves, move];

    this.state = doMove(this.state, move);
    this.broadcast({ type: 'state', state: this.state });

    // Check game over
    const result = getGameResult(this.state);
    if (result) {
      this.recordTurn(prevTurn, prevDice, prevMoves);
      this.clearTimer();
      this.broadcast({ type: 'game_over', result });
      return;
    }

    // Auto-ended turn (all dice used or no more moves)
    if (this.state.phase === 'waiting') {
      this.recordTurn(prevTurn, prevDice, prevMoves);
      this.clearTimer();
      this.startTurnTimer();
    }
  }

  handleConfirm(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color || color !== this.state.turn) return this.send(ws, { type: 'error', message: 'Not your turn' });
    if (this.state.phase !== 'moving') return this.send(ws, { type: 'error', message: 'Cannot confirm now' });

    if (!hasAnyMoves(this.state.board, this.state.movesLeft, this.state.turn)) {
      if (this.state.dice) this.recordTurn(this.state.turn, this.state.dice, this.state.turnMoves);
      this.state = confirmTurn(this.state);
      this.clearTimer();
      this.broadcast({ type: 'state', state: this.state });
    }
  }

  handleUndo(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color || color !== this.state.turn) return this.send(ws, { type: 'error', message: 'Not your turn' });
    if (this.state.phase !== 'moving') return;
    if (this.state.turnMoves.length === 0) return;

    this.state = undoMove(this.state);
    this.broadcast({ type: 'state', state: this.state });
  }

  handleDouble(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color || color !== this.state.turn) return;
    if (this.state.phase !== 'waiting') return;
    if (!canDouble(this.state.cube, color)) return;

    this.state = doDouble(this.state);
    this.broadcast({ type: 'state', state: this.state });
  }

  handleAcceptDouble(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color) return;
    if (this.state.phase !== 'cubeOffered') return;
    // The player who DIDN'T offer the double must accept
    if (color === this.state.turn) return;

    this.state = doAcceptDouble(this.state);
    this.broadcast({ type: 'state', state: this.state });
  }

  handleDropDouble(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color) return;
    if (this.state.phase !== 'cubeOffered') return;
    if (color === this.state.turn) return;

    this.state = doDropDouble(this.state);
    this.broadcast({ type: 'state', state: this.state });

    const result = getGameResult(this.state);
    if (result) {
      this.clearTimer();
      this.broadcast({ type: 'game_over', result });
    }
  }

  handleResign(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color) return;
    if (this.state.phase === 'gameOver') return;

    const winner: Color = color === 'w' ? 'b' : 'w';
    this.state = { ...this.state, phase: 'gameOver' };
    this.resultType = 'resign';
    this.clearTimer();
    this.broadcast({ type: 'resigned', winner });
  }

  handleRematch(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color) return;
    if (this.state.phase !== 'gameOver') return;

    if (this.rematchOffer === null) {
      this.rematchOffer = color;
      // Notify opponent
      const opponent = color === 'w' ? this.black : this.white;
      if (opponent) this.send(opponent, { type: 'rematch_offered' });
    } else if (this.rematchOffer !== color) {
      // Both agreed — swap colors and restart
      this.rematchOffer = null;
      const temp = this.white;
      this.white = this.black;
      this.black = temp;
      // Update player color mappings
      if (this.white) this.players.set(this.white, { ws: this.white, color: 'w' });
      if (this.black) this.players.set(this.black, { ws: this.black, color: 'b' });

      this.state = createInitialGameState(this.id);
      if (this.white) this.send(this.white, { type: 'rematch_start', state: this.state, color: 'w' });
      if (this.black) this.send(this.black, { type: 'rematch_start', state: this.state, color: 'b' });
    }
  }

  handleDisconnect(ws: WebSocket) {
    const color = this.getColor(ws);
    if (!color) return;

    // Notify opponent
    const opponent = color === 'w' ? this.black : this.white;
    if (opponent) this.send(opponent, { type: 'opponent_disconnected' });

    // Grace period: 60 seconds to reconnect
    const timer = setTimeout(() => {
      // Auto-resign after grace period
      if (this.state.phase !== 'gameOver') {
        const winner: Color = color === 'w' ? 'b' : 'w';
        this.state = { ...this.state, phase: 'gameOver' };
        this.clearTimer();
        this.broadcast({ type: 'resigned', winner });
      }
    }, 60000);
    this.disconnectTimer.set(ws, timer);
  }

  handleReconnect(oldWs: WebSocket, newWs: WebSocket) {
    const player = this.players.get(oldWs);
    if (!player) return;

    // Clear disconnect timer
    const timer = this.disconnectTimer.get(oldWs);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimer.delete(oldWs);
    }

    // Swap ws reference
    this.players.delete(oldWs);
    player.ws = newWs;
    this.players.set(newWs, player);
    if (player.color === 'w') this.white = newWs;
    else this.black = newWs;

    // Send current state
    this.send(newWs, { type: 'game_start', state: this.state, color: player.color });

    // Notify opponent
    const opponent = player.color === 'w' ? this.black : this.white;
    if (opponent) this.send(opponent, { type: 'opponent_reconnected' });
  }

  private startTurnTimer() {
    this.clearTimer();
    if (this.timeLimit === null) return;
    if (this.state.phase !== 'moving') return;

    const isDoubles = this.state.dice && this.state.dice[0] === this.state.dice[1];
    const time = isDoubles ? Math.floor(this.timeLimit * 1.5) : this.timeLimit;

    this.timer = setTimeout(() => {
      if (this.state.phase !== 'moving') return;

      // Play random moves for remaining dice
      while (this.state.phase === 'moving' && this.state.movesLeft.length > 0) {
        const moveable = movableCheckers(this.state.board, this.state.movesLeft, this.state.turn);
        if (moveable.length === 0) break;
        const from = moveable[Math.floor(Math.random() * moveable.length)];
        const dests = legalDestinations(this.state.board, from, this.state.movesLeft, this.state.turn);
        if (dests.length === 0) break;
        const to = dests[Math.floor(Math.random() * dests.length)];
        // Find die
        const uniqueDice = [...new Set(this.state.movesLeft)];
        let usedDie = 0;
        for (const die of uniqueDice) {
          let dest: number;
          if (from === 0 && this.state.turn === 'w') dest = 25 - die;
          else if (from === 25 && this.state.turn === 'b') dest = die;
          else dest = this.state.turn === 'w' ? from - die : from + die;
          if ((this.state.turn === 'w' && dest <= 0 && to === 0) ||
              (this.state.turn === 'b' && dest >= 25 && to === 25) ||
              dest === to) {
            usedDie = die; break;
          }
        }
        if (usedDie === 0) break;
        const isHit = this.state.turn === 'w'
          ? this.state.board[to] < 0 && this.state.board[to] >= -1
          : this.state.board[to] > 0 && this.state.board[to] <= 1;
        this.state = doMove(this.state, { from, to, die: usedDie, hit: isHit && to > 0 && to < 25 });
      }

      if (this.state.phase === 'moving') {
        this.state = confirmTurn(this.state);
      }

      this.broadcast({ type: 'timeout', state: this.state });

      const result = getGameResult(this.state);
      if (result) {
        this.broadcast({ type: 'game_over', result });
      }
    }, time * 1000);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.clearTimer();
    for (const [, timer] of this.disconnectTimer) clearTimeout(timer);
  }
}
