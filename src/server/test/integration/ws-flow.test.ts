import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, or } from 'drizzle-orm';
import { setupTestDb, cleanDb, teardownTestDb, seedUser } from '../helpers/db';
import { setupGameServer, createTwoPlayerGame } from '../helpers/fixtures';
import { TestWsClient } from '../helpers/ws-client';
import { getDb } from '../../db/index';
import { games } from '../../db/schema';
import { movableCheckers, legalDestinations } from '../../../engine/moves';

describe('WebSocket Game Flow', () => {
  let port: number;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    await setupTestDb();
    const server = await setupGameServer();
    port = server.port;
    cleanup = server.cleanup;
  });

  afterAll(async () => {
    await cleanup();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  describe('game creation and joining', () => {
    it('creates a game and returns gameId', async () => {
      const client = new TestWsClient(port);
      await client.connect();
      client.send({ type: 'create' });
      const msg = await client.waitFor<any>('game_created');
      expect(msg.gameId).toBeTruthy();
      expect(msg.gameId.length).toBe(6);
      client.close();
    });

    it('both players receive game_start on join', async () => {
      const { white, black, gameId } = await createTwoPlayerGame(port);
      expect(gameId).toBeTruthy();
      white.close();
      black.close();
    });

    it('rejects joining a full game', async () => {
      const { white, black, gameId } = await createTwoPlayerGame(port);

      const third = new TestWsClient(port);
      await third.connect();
      third.send({ type: 'join', gameId });
      const err = await third.waitFor<any>('error');
      expect(err.message).toContain('full');

      white.close();
      black.close();
      third.close();
    });

    it('rejects joining nonexistent game', async () => {
      const client = new TestWsClient(port);
      await client.connect();
      client.send({ type: 'join', gameId: 'xxxxxx' });
      const err = await client.waitFor<any>('error');
      expect(err.message).toContain('not found');
      client.close();
    });
  });

  describe('gameplay', () => {
    it('rolls dice and both players receive state', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'roll' });
      const whiteState = await white.waitFor<any>('state');
      const blackState = await black.waitFor<any>('state');

      expect(whiteState.state.dice).toBeTruthy();
      expect(whiteState.state.dice).toEqual(blackState.state.dice);

      white.close();
      black.close();
    });

    it('makes a legal move', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'roll' });
      const rollState = await white.waitFor<any>('state');
      await black.waitFor('state');

      if (rollState.state.phase === 'moving') {
        const state = rollState.state;
        const sources = movableCheckers(state.board, state.movesLeft, 'w');
        expect(sources.length).toBeGreaterThan(0);

        const from = sources[0];
        const dests = legalDestinations(state.board, from, state.movesLeft, 'w');
        const to = dests[0];

        // Determine die
        const uniqueDice = [...new Set(state.movesLeft as number[])];
        let usedDie = 0;
        for (const d of uniqueDice) {
          const dest = from === 0 ? 25 - d : from - d;
          if (dest === to || (dest <= 0 && to === 0)) { usedDie = d; break; }
        }

        const isHit = to > 0 && to < 25 && state.board[to] === -1;
        white.send({ type: 'move', move: { from, to, die: usedDie, hit: isHit } });
        const moveState = await white.waitFor<any>('state');
        await black.waitFor('state');
        expect(moveState.state.board[from]).toBeLessThan(state.board[from]);
      }

      white.close();
      black.close();
    });

    it('rejects move from wrong player', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'roll' });
      await white.waitFor('state');
      await black.waitFor('state');

      // Black tries to move (it's white's turn)
      black.send({ type: 'move', move: { from: 19, to: 22, die: 3, hit: false } });
      const err = await black.waitFor<any>('error');
      expect(err.message).toContain('Not your turn');

      white.close();
      black.close();
    });
  });

  describe('resign', () => {
    it('ends game and opponent receives resigned', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'resign' });
      const msg = await black.waitFor<any>('resigned');
      expect(msg.winner).toBe('b');

      white.close();
      black.close();
    });
  });

  describe('rematch', () => {
    it('starts new game with swapped colors', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'resign' });
      await white.waitFor('resigned');
      await black.waitFor('resigned');

      // White offers rematch
      white.send({ type: 'rematch' });
      await black.waitFor('rematch_offered');

      // Black accepts
      black.send({ type: 'accept_rematch' });
      const whiteRematch = await white.waitFor<any>('rematch_start');
      const blackRematch = await black.waitFor<any>('rematch_start');

      // Colors should be swapped
      expect(whiteRematch.color).toBe('b');
      expect(blackRematch.color).toBe('w');

      white.close();
      black.close();
    });
  });

  describe('chat', () => {
    it('relays messages between players', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'chat', text: 'hello!' });
      const whiteChat = await white.waitFor<any>('chat');
      const blackChat = await black.waitFor<any>('chat');

      expect(whiteChat.text).toBe('hello!');
      expect(blackChat.text).toBe('hello!');

      white.close();
      black.close();
    });

    it('truncates long messages', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'chat', text: 'x'.repeat(500) });
      const msg = await black.waitFor<any>('chat');
      expect(msg.text.length).toBe(200);

      white.close();
      black.close();
    });
  });

  describe('doubling cube', () => {
    it('offer and accept doubles the cube', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'double' });
      const offered = await white.waitFor<any>('state');
      expect(offered.state.phase).toBe('cubeOffered');

      black.send({ type: 'accept_double' });
      const accepted = await white.waitFor<any>('state');
      expect(accepted.state.cube.value).toBe(2);

      white.close();
      black.close();
    });

    it('dropping ends the game', async () => {
      const { white, black } = await createTwoPlayerGame(port);

      white.send({ type: 'double' });
      await white.waitFor('state');
      await black.waitFor('state');

      black.send({ type: 'drop_double' });
      const gameOver = await white.waitFor<any>('game_over');
      expect(gameOver.result.winner).toBe('w');

      white.close();
      black.close();
    });
  });

  describe('authenticated game with move persistence', () => {
    // Play one turn using the engine to compute legal moves (deterministic, no guessing).
    async function playTurn(activeWs: TestWsClient, passiveWs: TestWsClient, color: 'w' | 'b') {
      activeWs.send({ type: 'roll' });
      let state = (await activeWs.waitFor<any>('state')).state;
      await passiveWs.waitFor('state');

      if (state.phase !== 'moving') return; // auto-passed

      while (state.phase === 'moving' && state.turn === color && state.movesLeft.length > 0) {
        const sources = movableCheckers(state.board, state.movesLeft, color);
        if (sources.length === 0) break;

        const from = sources[0];
        const dests = legalDestinations(state.board, from, state.movesLeft, color);
        if (dests.length === 0) break;
        const to = dests[0];

        // Determine which die value produces this (from, to) pair
        const uniqueDice = [...new Set(state.movesLeft as number[])];
        let usedDie = 0;
        for (const d of uniqueDice) {
          let dest: number;
          if (color === 'w') {
            dest = from === 0 ? 25 - d : from - d;
            if (dest <= 0) dest = 0;
          } else {
            dest = from === 25 ? d : from + d;
            if (dest >= 25) dest = 25;
          }
          if (dest === to) { usedDie = d; break; }
        }
        if (usedDie === 0) break;

        const isHit = to > 0 && to < 25 && (
          color === 'w' ? state.board[to] === -1 : state.board[to] === 1
        );

        activeWs.send({ type: 'move', move: { from, to, die: usedDie, hit: isHit } });
        const resp = await activeWs.waitForAny();
        await passiveWs.waitForAny();

        if (resp.type === 'game_over') return;
        if (resp.type === 'state') state = (resp as any).state;
        else break;
      }
    }

    // Helper: connect two authenticated users and start a game
    async function setupAuthGame() {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');

      const whiteWs = new TestWsClient(port);
      const blackWs = new TestWsClient(port);
      await Promise.all([whiteWs.connect(), blackWs.connect()]);

      whiteWs.send({ type: 'auth', token: alice.token });
      blackWs.send({ type: 'auth', token: bob.token });
      await Promise.all([
        whiteWs.waitFor('authenticated'),
        blackWs.waitFor('authenticated'),
      ]);

      whiteWs.send({ type: 'create' });
      const created = await whiteWs.waitFor<any>('game_created');
      blackWs.send({ type: 'join', gameId: created.gameId });
      await Promise.all([
        whiteWs.waitFor('game_start'),
        blackWs.waitFor('game_start'),
      ]);

      return { alice, bob, whiteWs, blackWs, gameId: created.gameId };
    }

    it('saves game and moves to DB after authenticated play + resign', async () => {
      const { alice, bob, whiteWs, blackWs } = await setupAuthGame();

      // Play one turn then resign
      await playTurn(whiteWs, blackWs, 'w');
      whiteWs.send({ type: 'resign' });
      await whiteWs.waitFor('resigned');
      await blackWs.waitFor('resigned');

      // Wait for async DB save
      await new Promise(r => setTimeout(r, 200));

      const db = getDb()!;
      const savedGames = await db.select().from(games).where(
        or(eq(games.whiteId, alice.id), eq(games.blackId, alice.id))
      );

      expect(savedGames.length).toBe(1);
      const game = savedGames[0];
      expect(game.whiteId).toBe(alice.id);
      expect(game.blackId).toBe(bob.id);
      expect(game.resultType).toBe('resign');
      expect(game.timeControl).toBe(30);
      expect(Array.isArray(game.moves)).toBe(true);

      whiteWs.close();
      blackWs.close();
    });

    it('records multiple turns with correct structure in move history', async () => {
      const { alice, whiteWs, blackWs } = await setupAuthGame();

      // Play 4 half-turns (2 each)
      await playTurn(whiteWs, blackWs, 'w');
      await playTurn(blackWs, whiteWs, 'b');
      await playTurn(whiteWs, blackWs, 'w');
      await playTurn(blackWs, whiteWs, 'b');

      // Resign to end game
      whiteWs.send({ type: 'resign' });
      await whiteWs.waitFor('resigned');
      await blackWs.waitFor('resigned');

      await new Promise(r => setTimeout(r, 200));

      const db = getDb()!;
      const savedGames = await db.select().from(games).where(eq(games.whiteId, alice.id));

      expect(savedGames.length).toBe(1);
      const moves = savedGames[0].moves as any[];

      expect(Array.isArray(moves)).toBe(true);
      expect(moves.length).toBeGreaterThanOrEqual(2);

      // Verify structure of each recorded turn
      for (const turn of moves) {
        expect(turn).toHaveProperty('ply');
        expect(turn).toHaveProperty('player');
        expect(turn).toHaveProperty('dice');
        expect(turn).toHaveProperty('moves');
        expect(['w', 'b']).toContain(turn.player);
        expect(turn.dice).toHaveLength(2);
        expect(Array.isArray(turn.moves)).toBe(true);
      }

      // Verify alternating players
      for (let i = 1; i < moves.length; i++) {
        expect(moves[i].player).not.toBe(moves[i - 1].player);
      }

      whiteWs.close();
      blackWs.close();
    });
  });
});
