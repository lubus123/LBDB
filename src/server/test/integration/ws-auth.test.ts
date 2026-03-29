import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanDb, teardownTestDb, seedUser, seedFriendship } from '../helpers/db';
import { setupGameServer } from '../helpers/fixtures';
import { TestWsClient } from '../helpers/ws-client';

describe('WebSocket Auth & Challenges', () => {
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

  describe('auth', () => {
    it('authenticates with valid token', async () => {
      const user = await seedUser('alice');
      const client = new TestWsClient(port);
      await client.connect();

      client.send({ type: 'auth', token: user.token });
      const msg = await client.waitFor<any>('authenticated');
      expect(msg.user.username).toBe('alice');
      expect(msg.user.id).toBe(user.id);

      client.close();
    });

    it('rejects invalid token', async () => {
      const client = new TestWsClient(port);
      await client.connect();

      client.send({ type: 'auth', token: 'invalid-token-here' });
      const msg = await client.waitFor<any>('auth_error');
      expect(msg.message).toContain('Invalid');

      client.close();
    });
  });

  describe('friend online status', () => {
    it('returns online friends in authenticated response', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      await seedFriendship(alice.id, bob.id);

      // Alice connects first
      const aliceWs = new TestWsClient(port);
      await aliceWs.connect();
      aliceWs.send({ type: 'auth', token: alice.token });
      const aliceAuth = await aliceWs.waitFor<any>('authenticated');
      // Bob isn't online yet
      expect(aliceAuth.onlineFriends).toEqual([]);

      // Bob connects — should see alice in onlineFriends
      const bobWs = new TestWsClient(port);
      await bobWs.connect();
      bobWs.send({ type: 'auth', token: bob.token });
      const bobAuth = await bobWs.waitFor<any>('authenticated');
      expect(bobAuth.onlineFriends).toEqual(['alice']);

      // Alice should also receive friend_online push for bob
      const aliceNotif = await aliceWs.waitFor<any>('friend_online');
      expect(aliceNotif.username).toBe('bob');

      aliceWs.close();
      bobWs.close();
    });

    it('both users see each other online regardless of connect order', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      await seedFriendship(alice.id, bob.id);

      // Alice connects
      const aliceWs = new TestWsClient(port);
      await aliceWs.connect();
      aliceWs.send({ type: 'auth', token: alice.token });
      await aliceWs.waitFor('authenticated');

      // Bob connects — gets alice in initial snapshot
      const bobWs = new TestWsClient(port);
      await bobWs.connect();
      bobWs.send({ type: 'auth', token: bob.token });
      const bobAuth = await bobWs.waitFor<any>('authenticated');
      expect(bobAuth.onlineFriends).toContain('alice');

      // Alice gets push notification for bob
      const aliceNotif = await aliceWs.waitFor<any>('friend_online');
      expect(aliceNotif.username).toBe('bob');

      // Now bob disconnects — alice should get friend_offline
      bobWs.close();
      const offlineNotif = await aliceWs.waitFor<any>('friend_offline');
      expect(offlineNotif.username).toBe('bob');

      aliceWs.close();
    });

    it('does not include non-friends in online list', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      // No friendship created

      const aliceWs = new TestWsClient(port);
      await aliceWs.connect();
      aliceWs.send({ type: 'auth', token: alice.token });
      await aliceWs.waitFor('authenticated');

      const bobWs = new TestWsClient(port);
      await bobWs.connect();
      bobWs.send({ type: 'auth', token: bob.token });
      const bobAuth = await bobWs.waitFor<any>('authenticated');
      expect(bobAuth.onlineFriends).toEqual([]);

      aliceWs.close();
      bobWs.close();
    });
  });

  describe('challenges', () => {
    it('sends and receives challenge', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');

      const aliceWs = new TestWsClient(port);
      const bobWs = new TestWsClient(port);
      await Promise.all([aliceWs.connect(), bobWs.connect()]);

      // Auth both
      aliceWs.send({ type: 'auth', token: alice.token });
      bobWs.send({ type: 'auth', token: bob.token });
      await Promise.all([
        aliceWs.waitFor('authenticated'),
        bobWs.waitFor('authenticated'),
      ]);

      // Alice challenges Bob
      aliceWs.send({ type: 'challenge', username: 'bob', timeLimit: 30 });
      const challenge = await bobWs.waitFor<any>('challenge_received');
      expect(challenge.from).toBe('alice');
      expect(challenge.challengeId).toBeTruthy();

      aliceWs.close();
      bobWs.close();
    });

    it('accepts challenge and creates game', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');

      const aliceWs = new TestWsClient(port);
      const bobWs = new TestWsClient(port);
      await Promise.all([aliceWs.connect(), bobWs.connect()]);

      aliceWs.send({ type: 'auth', token: alice.token });
      bobWs.send({ type: 'auth', token: bob.token });
      await Promise.all([
        aliceWs.waitFor('authenticated'),
        bobWs.waitFor('authenticated'),
      ]);

      // Challenge
      aliceWs.send({ type: 'challenge', username: 'bob' });
      const challenge = await bobWs.waitFor<any>('challenge_received');

      // Accept
      bobWs.send({ type: 'accept_challenge', challengeId: challenge.challengeId });

      const aliceAccepted = await aliceWs.waitFor<any>('challenge_accepted');
      const bobAccepted = await bobWs.waitFor<any>('challenge_accepted');
      expect(aliceAccepted.gameId).toBeTruthy();
      expect(aliceAccepted.gameId).toBe(bobAccepted.gameId);

      // Both should receive game_start
      const aliceStart = await aliceWs.waitFor<any>('game_start');
      const bobStart = await bobWs.waitFor<any>('game_start');
      expect(aliceStart.state).toBeTruthy();
      expect(bobStart.state).toBeTruthy();

      aliceWs.close();
      bobWs.close();
    });

    it('rejects challenge when not logged in', async () => {
      const client = new TestWsClient(port);
      await client.connect();

      client.send({ type: 'challenge', username: 'bob' });
      const err = await client.waitFor<any>('error');
      expect(err.message).toContain('logged in');

      client.close();
    });

    it('rejects challenge to offline user', async () => {
      const alice = await seedUser('alice');
      await seedUser('bob'); // bob exists but not connected

      const aliceWs = new TestWsClient(port);
      await aliceWs.connect();
      aliceWs.send({ type: 'auth', token: alice.token });
      await aliceWs.waitFor('authenticated');

      aliceWs.send({ type: 'challenge', username: 'bob' });
      const err = await aliceWs.waitFor<any>('error');
      expect(err.message).toContain('not online');

      aliceWs.close();
    });
  });
});
