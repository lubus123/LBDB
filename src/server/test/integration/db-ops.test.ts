import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, or, and } from 'drizzle-orm';
import { setupTestDb, cleanDb, teardownTestDb, seedUser } from '../helpers/db';
import { getDb } from '../../db/index';
import { users, friends, games, sessions } from '../../db/schema';

describe('Database Operations', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  describe('users', () => {
    it('creates user with default stats', async () => {
      const user = await seedUser('alice');
      const db = getDb()!;
      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      expect(row.username).toBe('alice');
      expect(row.gamesPlayed).toBe(0);
      expect(row.gamesWon).toBe(0);
      expect(row.totalLuck).toBe(0);
    });

    it('enforces unique username', async () => {
      await seedUser('alice');
      await expect(seedUser('alice')).rejects.toThrow();
    });
  });

  describe('sessions', () => {
    it('creates session with token and expiry', async () => {
      const user = await seedUser('alice');
      const db = getDb()!;
      const [session] = await db.select().from(sessions).where(eq(sessions.token, user.token));
      expect(session).toBeTruthy();
      expect(session.userId).toBe(user.id);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('friends', () => {
    it('creates pending friend request', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const db = getDb()!;

      await db.insert(friends).values({ userId: alice.id, friendId: bob.id, status: 'pending' });

      const [row] = await db.select().from(friends).where(
        and(eq(friends.userId, alice.id), eq(friends.friendId, bob.id))
      );
      expect(row.status).toBe('pending');
    });

    it('accepts friend request', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const db = getDb()!;

      const [inserted] = await db.insert(friends).values({ userId: alice.id, friendId: bob.id }).returning();
      await db.update(friends).set({ status: 'accepted' }).where(eq(friends.id, inserted.id));

      const [row] = await db.select().from(friends).where(eq(friends.id, inserted.id));
      expect(row.status).toBe('accepted');
    });

    it('enforces unique constraint on (userId, friendId)', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const db = getDb()!;

      await db.insert(friends).values({ userId: alice.id, friendId: bob.id });
      await expect(
        db.insert(friends).values({ userId: alice.id, friendId: bob.id })
      ).rejects.toThrow();
    });
  });

  describe('games', () => {
    it('stores game with JSONB moves', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const db = getDb()!;

      const moveData = [
        { ply: 0, player: 'w', dice: [3, 1], moves: [{ from: 8, to: 5, die: 3, hit: false }] },
      ];

      await db.insert(games).values({
        whiteId: alice.id,
        blackId: bob.id,
        winner: 'w',
        resultType: 'single',
        moves: moveData,
        luckWhite: 0.5,
        luckBlack: -0.5,
        timeControl: 30,
      });

      const [row] = await db.select().from(games).where(eq(games.whiteId, alice.id));
      expect(row.winner).toBe('w');
      expect(row.resultType).toBe('single');
      expect(row.moves).toEqual(moveData);
      expect(row.luckWhite).toBeCloseTo(0.5);
      expect(row.luckBlack).toBeCloseTo(-0.5);
    });

    it('queries games for a specific user', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const charlie = await seedUser('charlie');
      const db = getDb()!;

      // Alice vs Bob
      await db.insert(games).values({ whiteId: alice.id, blackId: bob.id, winner: 'w' });
      // Bob vs Charlie
      await db.insert(games).values({ whiteId: bob.id, blackId: charlie.id, winner: 'b' });

      // Alice's games
      const aliceGames = await db.select().from(games).where(
        or(eq(games.whiteId, alice.id), eq(games.blackId, alice.id))
      );
      expect(aliceGames.length).toBe(1);

      // Bob's games (should be in both)
      const bobGames = await db.select().from(games).where(
        or(eq(games.whiteId, bob.id), eq(games.blackId, bob.id))
      );
      expect(bobGames.length).toBe(2);
    });
  });

  describe('user stats update', () => {
    it('increments games played and won', async () => {
      const alice = await seedUser('alice');
      const db = getDb()!;

      await db.update(users).set({
        gamesPlayed: 5,
        gamesWon: 3,
        totalLuck: 1.5,
      }).where(eq(users.id, alice.id));

      const [row] = await db.select().from(users).where(eq(users.id, alice.id));
      expect(row.gamesPlayed).toBe(5);
      expect(row.gamesWon).toBe(3);
      expect(row.totalLuck).toBeCloseTo(1.5);
    });
  });
});
