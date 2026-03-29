import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanDb, teardownTestDb, seedUser } from '../helpers/db';
import { setupGameServer } from '../helpers/fixtures';
import { api } from '../helpers/http';

describe('REST API', () => {
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

  describe('POST /api/register', () => {
    it('creates user and returns token', async () => {
      const res = await api(port, 'POST', '/api/register', { username: 'alice', password: 'test1234' });
      expect(res.status).toBe(200);
      expect(res.data.user.username).toBe('alice');
      expect(res.data.token).toBeTruthy();
    });

    it('rejects duplicate username', async () => {
      await api(port, 'POST', '/api/register', { username: 'alice', password: 'test1234' });
      const res = await api(port, 'POST', '/api/register', { username: 'alice', password: 'test5678' });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('taken');
    });

    it('validates username length', async () => {
      const res = await api(port, 'POST', '/api/register', { username: 'a', password: 'test1234' });
      expect(res.status).toBe(400);
    });

    it('validates password length', async () => {
      const res = await api(port, 'POST', '/api/register', { username: 'alice', password: '123' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/login', () => {
    beforeEach(async () => {
      await seedUser('alice', 'test1234');
    });

    it('returns token for valid credentials', async () => {
      const res = await api(port, 'POST', '/api/login', { username: 'alice', password: 'test1234' });
      expect(res.status).toBe(200);
      expect(res.data.token).toBeTruthy();
    });

    it('rejects wrong password', async () => {
      const res = await api(port, 'POST', '/api/login', { username: 'alice', password: 'wrong' });
      expect(res.status).toBe(400);
    });

    it('rejects nonexistent user', async () => {
      const res = await api(port, 'POST', '/api/login', { username: 'nobody', password: 'test1234' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/logout', () => {
    it('returns ok', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'POST', '/api/logout', undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
    });

    it('invalidates the token', async () => {
      const user = await seedUser('alice');
      await api(port, 'POST', '/api/logout', undefined, user.token);
      const res = await api(port, 'GET', '/api/me', undefined, user.token);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/me', () => {
    it('returns profile for authenticated user', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'GET', '/api/me', undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data.username).toBe('alice');
      expect(res.data.gamesPlayed).toBe(0);
    });

    it('returns 401 without token', async () => {
      const res = await api(port, 'GET', '/api/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await api(port, 'GET', '/api/me', undefined, 'bad-token');
      expect(res.status).toBe(401);
    });
  });

  describe('Friends API', () => {
    let alice: { id: number; username: string; token: string };
    let bob: { id: number; username: string; token: string };

    beforeEach(async () => {
      alice = await seedUser('alice');
      bob = await seedUser('bob');
    });

    it('sends friend request', async () => {
      const res = await api(port, 'POST', '/api/friends', { username: 'bob' }, alice.token);
      expect(res.status).toBe(200);
    });

    it('rejects self-friend', async () => {
      const res = await api(port, 'POST', '/api/friends', { username: 'alice' }, alice.token);
      expect(res.status).toBe(400);
    });

    it('rejects duplicate friend request', async () => {
      await api(port, 'POST', '/api/friends', { username: 'bob' }, alice.token);
      const res = await api(port, 'POST', '/api/friends', { username: 'bob' }, alice.token);
      expect(res.status).toBe(400);
    });

    it('lists friends', async () => {
      await api(port, 'POST', '/api/friends', { username: 'bob' }, alice.token);
      const res = await api(port, 'GET', '/api/friends', undefined, alice.token);
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(1);
      expect(res.data[0].status).toBe('pending');
    });

    it('accepts friend request', async () => {
      await api(port, 'POST', '/api/friends', { username: 'bob' }, alice.token);
      // Get the friendship ID from bob's perspective
      const friendsList = await api(port, 'GET', '/api/friends', undefined, bob.token);
      const friendshipId = friendsList.data[0].id;

      const res = await api(port, 'POST', `/api/friends/${friendshipId}/accept`, undefined, bob.token);
      expect(res.status).toBe(200);

      // Verify it's accepted
      const updated = await api(port, 'GET', '/api/friends', undefined, alice.token);
      expect(updated.data[0].status).toBe('accepted');
    });

    it('deletes friendship', async () => {
      await api(port, 'POST', '/api/friends', { username: 'bob' }, alice.token);
      const friendsList = await api(port, 'GET', '/api/friends', undefined, alice.token);
      const friendshipId = friendsList.data[0].id;

      const res = await api(port, 'DELETE', `/api/friends/${friendshipId}`, undefined, alice.token);
      expect(res.status).toBe(200);

      const updated = await api(port, 'GET', '/api/friends', undefined, alice.token);
      expect(updated.data.length).toBe(0);
    });
  });

  describe('GET /api/history', () => {
    it('returns empty array for new user', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'GET', '/api/history', undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });

    it('requires auth', async () => {
      const res = await api(port, 'GET', '/api/history');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('returns ok with room and user counts', async () => {
      const res = await api(port, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
      expect(typeof res.data.rooms).toBe('number');
      expect(typeof res.data.users).toBe('number');
    });
  });
});
