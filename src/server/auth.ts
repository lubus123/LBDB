import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and, gt } from 'drizzle-orm';
import { getDb } from './db/index';
import { users, sessions } from './db/schema';

export interface AuthUser {
  id: number;
  username: string;
}

export async function register(username: string, password: string): Promise<{ user: AuthUser; token: string } | { error: string }> {
  const db = getDb();
  if (!db) return { error: 'Database not available' };

  if (!username || username.length < 2 || username.length > 20) return { error: 'Username must be 2-20 characters' };
  if (!password || password.length < 4) return { error: 'Password must be at least 4 characters' };
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { error: 'Username: letters, numbers, underscore only' };

  const existing = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
  if (existing.length > 0) return { error: 'Username taken' };

  const hash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(users).values({
    username: username.toLowerCase(),
    password: hash,
  }).returning({ id: users.id, username: users.username });

  const token = await createSession(db, user.id);
  return { user: { id: user.id, username: user.username }, token };
}

export async function login(username: string, password: string): Promise<{ user: AuthUser; token: string } | { error: string }> {
  const db = getDb();
  if (!db) return { error: 'Database not available' };

  const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
  if (!user) return { error: 'Invalid username or password' };

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return { error: 'Invalid username or password' };

  const token = await createSession(db, user.id);
  return { user: { id: user.id, username: user.username }, token };
}

export async function validateToken(token: string): Promise<AuthUser | null> {
  const db = getDb();
  if (!db) return null;

  const [session] = await db.select({
    userId: sessions.userId,
    username: users.username,
  })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;
  return { id: session.userId, username: session.username };
}

export async function logout(token: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(sessions).where(eq(sessions.token, token));
}

async function createSession(db: NonNullable<ReturnType<typeof getDb>>, userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.insert(sessions).values({ userId, token, expiresAt });
  return token;
}
