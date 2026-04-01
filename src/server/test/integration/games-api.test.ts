import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanDb, teardownTestDb, seedUser } from '../helpers/db';
import { setupGameServer } from '../helpers/fixtures';
import { api } from '../helpers/http';

describe('Games API', () => {
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

  describe('POST /api/games', () => {
    it('creates an AI game', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'POST', '/api/games', { mode: 'ai', aiDifficulty: 'expert' }, user.token);
      expect(res.status).toBe(200);
      expect(res.data.gameId).toBeTruthy();
    });

    it('creates a local game', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'POST', '/api/games', { mode: 'local' }, user.token);
      expect(res.status).toBe(200);
      expect(res.data.gameId).toBeTruthy();
    });

    it('rejects unauthenticated', async () => {
      const res = await api(port, 'POST', '/api/games', { mode: 'ai' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/games/:id/moves', () => {
    it('appends a turn', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);
      const gameId = create.data.gameId;

      const turn = { ply: 0, player: 'w', dice: [3, 1], moves: [{ from: 8, to: 5, die: 3, hit: false }] };
      const res = await api(port, 'PATCH', `/api/games/${gameId}/moves`, turn, user.token);
      expect(res.status).toBe(200);
      expect(res.data.moveCount).toBe(1);
    });

    it('appends multiple turns', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);
      const gameId = create.data.gameId;

      await api(port, 'PATCH', `/api/games/${gameId}/moves`, { ply: 0, player: 'w', dice: [3, 1], moves: [] }, user.token);
      const res = await api(port, 'PATCH', `/api/games/${gameId}/moves`, { ply: 1, player: 'b', dice: [6, 5], moves: [] }, user.token);
      expect(res.data.moveCount).toBe(2);
    });

    it('rejects moves from non-owner', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, alice.token);
      const gameId = create.data.gameId;

      const turn = { ply: 0, player: 'w', dice: [3, 1], moves: [] };
      const res = await api(port, 'PATCH', `/api/games/${gameId}/moves`, turn, bob.token);
      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated', async () => {
      const res = await api(port, 'PATCH', '/api/games/999/moves', { ply: 0, player: 'w', dice: [1, 1], moves: [] });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/games/:id/complete', () => {
    it('marks game completed', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);
      const gameId = create.data.gameId;

      const res = await api(port, 'PATCH', `/api/games/${gameId}/complete`, { winner: 'w', resultType: 'single' }, user.token);
      expect(res.status).toBe(200);

      const game = await api(port, 'GET', `/api/games/${gameId}`, undefined, user.token);
      expect(game.data.status).toBe('completed');
      expect(game.data.winner).toBe('w');
    });

    it('rejects non-owner', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, alice.token);
      const res = await api(port, 'PATCH', `/api/games/${create.data.gameId}/complete`, { winner: 'w' }, bob.token);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/games/:id', () => {
    it('returns full game with moves', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai', aiDifficulty: 'expert' }, user.token);
      const gameId = create.data.gameId;

      const turn = { ply: 0, player: 'w', dice: [6, 5], moves: [{ from: 13, to: 7, die: 6, hit: false }] };
      await api(port, 'PATCH', `/api/games/${gameId}/moves`, turn, user.token);

      const res = await api(port, 'GET', `/api/games/${gameId}`, undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data.mode).toBe('ai');
      expect(res.data.aiDifficulty).toBe('expert');
      expect(res.data.moves).toHaveLength(1);
      expect(res.data.status).toBe('in_progress');
    });

    it('rejects non-owner', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, alice.token);
      const res = await api(port, 'GET', `/api/games/${create.data.gameId}`, undefined, bob.token);
      expect(res.status).toBe(403);
    });

    it('returns 404 for nonexistent game', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'GET', '/api/games/99999', undefined, user.token);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/history', () => {
    it('includes status and mode fields', async () => {
      const user = await seedUser('alice');
      await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);

      const res = await api(port, 'GET', '/api/history', undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(1);
      expect(res.data[0].status).toBe('in_progress');
      expect(res.data[0].mode).toBe('ai');
      expect(res.data[0].moveCount).toBe(0);
    });
  });
});
