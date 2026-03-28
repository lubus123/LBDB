import type { IncomingMessage, ServerResponse } from 'http';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { register, login, logout, validateToken, type AuthUser } from './auth';
import { getDb } from './db/index';
import { users, friends, games } from './db/schema';

/** Parse JSON body from request */
function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

/** Extract auth token from Authorization header */
function getToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function requireAuth(req: IncomingMessage, res: ServerResponse): Promise<AuthUser | null> {
  const token = getToken(req);
  if (!token) { json(res, 401, { error: 'Not authenticated' }); return null; }
  const user = await validateToken(token);
  if (!user) { json(res, 401, { error: 'Invalid or expired token' }); return null; }
  return user;
}

/**
 * Handle API routes. Returns true if handled, false if not an API route.
 */
export async function handleApiRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split('?')[0] || '';
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS' && url.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  if (!url.startsWith('/api/')) return false;

  try {
    // ─── Auth ───
    if (method === 'POST' && url === '/api/register') {
      const { username, password } = await parseBody(req);
      const result = await register(username, password);
      if ('error' in result) { json(res, 400, result); return true; }
      json(res, 200, result);
      return true;
    }

    if (method === 'POST' && url === '/api/login') {
      const { username, password } = await parseBody(req);
      const result = await login(username, password);
      if ('error' in result) { json(res, 400, result); return true; }
      json(res, 200, result);
      return true;
    }

    if (method === 'POST' && url === '/api/logout') {
      const token = getToken(req);
      if (token) await logout(token);
      json(res, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && url === '/api/me') {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'Database not available' }); return true; }
      const [profile] = await db.select({
        id: users.id,
        username: users.username,
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
        totalLuck: users.totalLuck,
        luckStreak: users.luckStreak,
        bestLuckStreak: users.bestLuckStreak,
        worstLuckStreak: users.worstLuckStreak,
        luckCapitalisation: users.luckCapitalisation,
      }).from(users).where(eq(users.id, user.id)).limit(1);
      json(res, 200, profile);
      return true;
    }

    // ─── Friends ───
    if (method === 'GET' && url === '/api/friends') {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }

      // Get all accepted friends + pending incoming
      const rows = await db.select({
        id: friends.id,
        userId: friends.userId,
        friendId: friends.friendId,
        status: friends.status,
        friendUsername: users.username,
      })
        .from(friends)
        .innerJoin(users, or(
          and(eq(friends.userId, user.id), eq(users.id, friends.friendId)),
          and(eq(friends.friendId, user.id), eq(users.id, friends.userId)),
        ))
        .where(or(eq(friends.userId, user.id), eq(friends.friendId, user.id)));

      json(res, 200, rows);
      return true;
    }

    if (method === 'POST' && url === '/api/friends') {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const { username } = await parseBody(req);
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }

      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.username, username.toLowerCase())).limit(1);
      if (!target) { json(res, 404, { error: 'User not found' }); return true; }
      if (target.id === user.id) { json(res, 400, { error: 'Cannot friend yourself' }); return true; }

      // Check existing
      const existing = await db.select().from(friends).where(
        or(
          and(eq(friends.userId, user.id), eq(friends.friendId, target.id)),
          and(eq(friends.userId, target.id), eq(friends.friendId, user.id)),
        )
      ).limit(1);
      if (existing.length > 0) { json(res, 400, { error: 'Friend request already exists' }); return true; }

      await db.insert(friends).values({ userId: user.id, friendId: target.id, status: 'pending' });
      json(res, 200, { ok: true });
      return true;
    }

    // POST /api/friends/:id/accept
    const acceptMatch = url.match(/^\/api\/friends\/(\d+)\/accept$/);
    if (method === 'POST' && acceptMatch) {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }
      const friendshipId = parseInt(acceptMatch[1]);
      await db.update(friends).set({ status: 'accepted' }).where(
        and(eq(friends.id, friendshipId), eq(friends.friendId, user.id))
      );
      json(res, 200, { ok: true });
      return true;
    }

    // DELETE /api/friends/:id
    const deleteMatch = url.match(/^\/api\/friends\/(\d+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }
      const friendshipId = parseInt(deleteMatch[1]);
      await db.delete(friends).where(
        and(eq(friends.id, friendshipId), or(eq(friends.userId, user.id), eq(friends.friendId, user.id)))
      );
      json(res, 200, { ok: true });
      return true;
    }

    // ─── Game History ───
    if (method === 'GET' && url === '/api/history') {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }

      const rows = await db.select({
        id: games.id,
        winner: games.winner,
        resultType: games.resultType,
        luckWhite: games.luckWhite,
        luckBlack: games.luckBlack,
        createdAt: games.createdAt,
        whiteUsername: sql<string>`(SELECT username FROM users WHERE id = ${games.whiteId})`,
        blackUsername: sql<string>`(SELECT username FROM users WHERE id = ${games.blackId})`,
      })
        .from(games)
        .where(or(eq(games.whiteId, user.id), eq(games.blackId, user.id)))
        .orderBy(desc(games.createdAt))
        .limit(50);

      json(res, 200, rows);
      return true;
    }

    json(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    console.error('[api]', err);
    json(res, 500, { error: 'Internal error' });
    return true;
  }
}
