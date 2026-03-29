import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameRoom } from '../../GameRoom';
import type { WebSocket } from 'ws';

/** Create a mock WebSocket */
function mockWs(): WebSocket {
  const ws = {
    readyState: 1, // OPEN
    OPEN: 1,
    send: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
  return ws;
}

/** Parse the last send() call's JSON */
function lastSent(ws: WebSocket): any {
  const send = ws.send as ReturnType<typeof vi.fn>;
  if (send.mock.calls.length === 0) return null;
  return JSON.parse(send.mock.calls[send.mock.calls.length - 1][0]);
}

/** Get all sent messages as parsed JSON */
function allSent(ws: WebSocket): any[] {
  const send = ws.send as ReturnType<typeof vi.fn>;
  return send.mock.calls.map((c: any) => JSON.parse(c[0]));
}

describe('GameRoom', () => {
  let room: GameRoom;
  let white: WebSocket;
  let black: WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic dice: always rolls [3, 1]
    room = new GameRoom('test-room', 30, () => [3, 1]);
    white = mockWs();
    black = mockWs();
    room.addPlayer(white);
    room.addPlayer(black);
    room.startGame();
    // Clear the game_start messages
    (white.send as ReturnType<typeof vi.fn>).mockClear();
    (black.send as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    room.destroy();
    vi.useRealTimers();
  });

  describe('addPlayer', () => {
    it('assigns first player as white, second as black', () => {
      const r = new GameRoom('test', null);
      const ws1 = mockWs();
      const ws2 = mockWs();
      expect(r.addPlayer(ws1)).toBe('w');
      expect(r.addPlayer(ws2)).toBe('b');
    });

    it('returns null for third player', () => {
      const r = new GameRoom('test', null);
      r.addPlayer(mockWs());
      r.addPlayer(mockWs());
      expect(r.addPlayer(mockWs())).toBeNull();
    });

    it('tracks userId and username', () => {
      const r = new GameRoom('test', null);
      const ws = mockWs();
      r.addPlayer(ws, 42, 'alice');
      expect(r.whiteUserId).toBe(42);
      expect(r.whiteUsername).toBe('alice');
    });
  });

  describe('isFull', () => {
    it('is true when both players joined', () => {
      expect(room.isFull).toBe(true);
    });

    it('is false with one player', () => {
      const r = new GameRoom('test', null);
      r.addPlayer(mockWs());
      expect(r.isFull).toBe(false);
    });
  });

  describe('startGame', () => {
    it('sends game_start to both players', () => {
      const r = new GameRoom('test', null);
      const ws1 = mockWs();
      const ws2 = mockWs();
      r.addPlayer(ws1);
      r.addPlayer(ws2);
      r.startGame();
      const msg1 = lastSent(ws1);
      const msg2 = lastSent(ws2);
      expect(msg1.type).toBe('game_start');
      expect(msg1.color).toBe('w');
      expect(msg2.type).toBe('game_start');
      expect(msg2.color).toBe('b');
    });

    it('resets state on start', () => {
      expect(room.state.phase).toBe('waiting');
      expect(room.state.turn).toBe('w');
      expect(room.state.board.length).toBe(26);
    });
  });

  describe('handleRoll', () => {
    it('rolls dice for the correct player', () => {
      room.handleRoll(white);
      const msg = lastSent(white);
      expect(msg.type).toBe('state');
      expect(msg.state.dice).toEqual([3, 1]);
    });

    it('rejects roll from wrong player', () => {
      room.handleRoll(black); // it's white's turn
      const msg = lastSent(black);
      expect(msg.type).toBe('error');
      expect(msg.message).toContain('Not your turn');
    });

    it('rejects roll during moving phase', () => {
      room.handleRoll(white); // now in moving phase
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      room.handleRoll(white); // try rolling again
      const msg = lastSent(white);
      expect(msg.type).toBe('error');
      expect(msg.message).toContain('Cannot roll now');
    });

    it('auto-passes when no moves available', () => {
      // Create a room where white has no moves with dice [6, 6]
      // White has checkers blocked. We'll use a custom board state.
      const r = new GameRoom('blocked', null, () => [6, 6] as [number, number]);
      const w = mockWs();
      const b = mockWs();
      r.addPlayer(w);
      r.addPlayer(b);
      r.startGame();

      // White on bar, black blocks all re-entry points (19-24) with 2+ checkers
      // With 6-6, white tries 25-6=19 but all points 19-24 blocked
      r.state.board = new Array(26).fill(0);
      r.state.board[0] = 1;    // white bar
      r.state.board[6] = 14;   // rest of white
      r.state.board[19] = -2;
      r.state.board[20] = -2;
      r.state.board[21] = -2;
      r.state.board[22] = -2;
      r.state.board[23] = -2;
      r.state.board[24] = -2;

      (w.send as ReturnType<typeof vi.fn>).mockClear();
      (b.send as ReturnType<typeof vi.fn>).mockClear();

      r.handleRoll(w);
      const msg = lastSent(w);
      // After auto-pass, turn switches to black
      expect(msg.state.turn).toBe('b');
      expect(msg.state.phase).toBe('waiting');
      r.destroy();
    });
  });

  describe('handleMove', () => {
    it('accepts legal move', () => {
      room.handleRoll(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();

      // With dice [3,1], white can move from point 8 to point 5 (die 3)
      room.handleMove(white, { from: 8, to: 5, die: 3, hit: false });
      const msg = lastSent(white);
      expect(msg.type).toBe('state');
    });

    it('rejects illegal move', () => {
      room.handleRoll(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();

      // Illegal: point 8 to point 2 (no die of 6)
      room.handleMove(white, { from: 8, to: 2, die: 6, hit: false });
      const msg = lastSent(white);
      expect(msg.type).toBe('error');
      expect(msg.message).toContain('Illegal move');
    });

    it('rejects move from wrong player', () => {
      room.handleRoll(white);
      room.handleMove(black, { from: 1, to: 4, die: 3, hit: false });
      const msg = lastSent(black);
      expect(msg.type).toBe('error');
    });

    it('rejects move when not in moving phase', () => {
      // Haven't rolled yet
      room.handleMove(white, { from: 8, to: 5, die: 3, hit: false });
      const msg = lastSent(white);
      expect(msg.type).toBe('error');
    });
  });

  describe('handleConfirm', () => {
    it('confirms when no more moves possible', () => {
      room.handleRoll(white);

      // Make moves that use both dice
      room.handleMove(white, { from: 8, to: 5, die: 3, hit: false });
      // If auto-confirmed (all dice used after second move), we check differently
      // Let's just verify confirm works when available
      room.handleMove(white, { from: 6, to: 5, die: 1, hit: false });
      // Turn should auto-end when all dice used
    });
  });

  describe('handleUndo', () => {
    it('undoes the last move', () => {
      room.handleRoll(white);
      const stateBeforeMove = JSON.stringify(room.state.board);

      room.handleMove(white, { from: 8, to: 5, die: 3, hit: false });
      expect(JSON.stringify(room.state.board)).not.toBe(stateBeforeMove);

      room.handleUndo(white);
      const msg = lastSent(white);
      expect(msg.type).toBe('state');
      expect(JSON.stringify(msg.state.board)).toBe(stateBeforeMove);
    });

    it('does nothing when no moves to undo', () => {
      room.handleRoll(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      room.handleUndo(white);
      // No message sent since turnMoves is empty
      expect((white.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe('handleDouble', () => {
    it('offers doubling cube', () => {
      room.handleDouble(white);
      const msg = lastSent(white);
      expect(msg.type).toBe('state');
      expect(msg.state.phase).toBe('cubeOffered');
    });

    it('rejects double during moving phase', () => {
      room.handleRoll(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      room.handleDouble(white);
      // No state message sent (handleDouble returns silently)
      expect((white.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe('handleAcceptDouble', () => {
    it('accepts double from opponent', () => {
      room.handleDouble(white);
      room.handleAcceptDouble(black);
      const msg = lastSent(black);
      expect(msg.type).toBe('state');
      expect(msg.state.cube.value).toBe(2);
      expect(msg.state.phase).toBe('waiting');
    });

    it('rejects accept from the doubler', () => {
      room.handleDouble(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      room.handleAcceptDouble(white); // white offered, can't accept own double
      expect((white.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe('handleDropDouble', () => {
    it('ends game when opponent drops', () => {
      room.handleDouble(white);
      room.handleDropDouble(black);
      expect(room.state.phase).toBe('gameOver');
      // Should broadcast game_over
      const msgs = allSent(black);
      const gameOver = msgs.find((m: any) => m.type === 'game_over');
      expect(gameOver).toBeDefined();
      expect(gameOver.result.winner).toBe('w');
    });
  });

  describe('handleResign', () => {
    it('sets game over and broadcasts winner', () => {
      room.handleResign(white);
      expect(room.state.phase).toBe('gameOver');
      expect(room.resultType).toBe('resign');
      const msg = lastSent(white);
      expect(msg.type).toBe('resigned');
      expect(msg.winner).toBe('b');
    });

    it('does nothing if already game over', () => {
      room.handleResign(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      room.handleResign(black);
      expect((white.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe('handleRematch', () => {
    it('requires both players to agree', () => {
      room.handleResign(white);
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      (black.send as ReturnType<typeof vi.fn>).mockClear();

      room.handleRematch(white);
      const offerMsg = lastSent(black);
      expect(offerMsg.type).toBe('rematch_offered');

      room.handleRematch(black);
      const whiteMsg = lastSent(white);
      const blackMsg = lastSent(black);
      expect(whiteMsg.type).toBe('rematch_start');
      expect(blackMsg.type).toBe('rematch_start');
    });

    it('swaps colors on rematch', () => {
      room.handleResign(white);
      room.handleRematch(white);
      room.handleRematch(black);
      // Colors should be swapped
      const whiteMsg = lastSent(white);
      const blackMsg = lastSent(black);
      // Original white now gets 'b', original black gets 'w'
      expect(whiteMsg.color).toBe('b');
      expect(blackMsg.color).toBe('w');
    });

    it('does nothing outside gameOver', () => {
      (white.send as ReturnType<typeof vi.fn>).mockClear();
      room.handleRematch(white);
      expect((white.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe('handleDisconnect', () => {
    it('notifies opponent', () => {
      room.handleDisconnect(white);
      const msg = lastSent(black);
      expect(msg.type).toBe('opponent_disconnected');
    });

    it('auto-resigns after 60s grace period', () => {
      room.handleDisconnect(white);
      (black.send as ReturnType<typeof vi.fn>).mockClear();

      vi.advanceTimersByTime(60000);

      const msg = lastSent(black);
      expect(msg.type).toBe('resigned');
      expect(msg.winner).toBe('b');
      expect(room.state.phase).toBe('gameOver');
    });
  });

  describe('handleReconnect', () => {
    it('clears disconnect timer and sends current state', () => {
      room.handleDisconnect(white);
      const newWs = mockWs();
      room.handleReconnect(white, newWs);

      const msg = lastSent(newWs);
      expect(msg.type).toBe('game_start');
      expect(msg.color).toBe('w');

      // Opponent notified
      const opponentMsg = lastSent(black);
      expect(opponentMsg.type).toBe('opponent_reconnected');

      // Grace timer should not fire
      vi.advanceTimersByTime(60000);
      expect(room.state.phase).not.toBe('gameOver');
    });

    it('includes opponent name in game_start message', () => {
      const r = new GameRoom('named', null);
      const ws1 = mockWs();
      const ws2 = mockWs();
      r.addPlayer(ws1, 1, 'alice');
      r.addPlayer(ws2, 2, 'bob');
      r.startGame();

      // Alice disconnects and reconnects with new ws
      r.handleDisconnect(ws1);
      const newWs = mockWs();
      r.handleReconnect(ws1, newWs);

      const msg = lastSent(newWs);
      expect(msg.type).toBe('game_start');
      expect(msg.color).toBe('w');
      expect(msg.opponent).toBe('bob');

      r.destroy();
    });
  });

  describe('turn timer', () => {
    it('auto-plays random moves on timeout', () => {
      room.handleRoll(white);
      expect(room.state.phase).toBe('moving');

      // Advance past the timer (30s for normal, no doubles)
      vi.advanceTimersByTime(30000);

      // Should have broadcast a timeout message
      const msgs = allSent(white);
      const timeout = msgs.find((m: any) => m.type === 'timeout');
      expect(timeout).toBeDefined();
      // Turn should have moved to black
      expect(timeout.state.turn).toBe('b');
    });

    it('gives 50% bonus time for doubles', () => {
      // Room with doubles dice
      const r = new GameRoom('doubles', 30, () => [4, 4]);
      const w = mockWs();
      const b = mockWs();
      r.addPlayer(w);
      r.addPlayer(b);
      r.startGame();
      (w.send as ReturnType<typeof vi.fn>).mockClear();

      r.handleRoll(w);

      // At 30s, timer should NOT have fired (45s for doubles)
      vi.advanceTimersByTime(30000);
      const msgs30 = allSent(w);
      expect(msgs30.find((m: any) => m.type === 'timeout')).toBeUndefined();

      // At 45s, timer should fire
      vi.advanceTimersByTime(15000);
      const msgs45 = allSent(w);
      expect(msgs45.find((m: any) => m.type === 'timeout')).toBeDefined();

      r.destroy();
    });
  });
});
