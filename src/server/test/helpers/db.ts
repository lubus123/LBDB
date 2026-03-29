import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { setDb } from '../../db/index';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST
  || 'postgresql://duckgammon:duck123@localhost:5432/duckgammon_test';

let pool: pg.Pool | null = null;

/** Connect to the test database and run migrations */
export async function setupTestDb() {
  pool = new pg.Pool({ connectionString: DATABASE_URL_TEST });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      games_played INTEGER DEFAULT 0 NOT NULL,
      games_won INTEGER DEFAULT 0 NOT NULL,
      total_luck REAL DEFAULT 0 NOT NULL,
      luck_streak REAL DEFAULT 0 NOT NULL,
      best_luck_streak REAL DEFAULT 0 NOT NULL,
      worst_luck_streak REAL DEFAULT 0 NOT NULL,
      luck_capitalisation REAL DEFAULT 0 NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friends (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      friend_id INTEGER REFERENCES users(id) NOT NULL,
      status VARCHAR(10) DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      white_id INTEGER REFERENCES users(id),
      black_id INTEGER REFERENCES users(id),
      winner VARCHAR(1),
      result_type VARCHAR(15),
      moves JSONB,
      luck_white REAL,
      luck_black REAL,
      time_control INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      token VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL
    );
  `);

  const db = drizzle(pool, { schema });
  setDb(db);
  return db;
}

/** Truncate all tables (call between test suites) */
export async function cleanDb() {
  if (!pool) return;
  await pool.query('TRUNCATE sessions, games, friends, users RESTART IDENTITY CASCADE');
}

/** Close the test database pool */
export async function teardownTestDb() {
  setDb(null);
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Seed a user with a session token, returns { id, username, token } */
export async function seedUser(username: string, password: string = 'test1234') {
  if (!pool) throw new Error('Test DB not initialized');

  const hash = await bcrypt.hash(password, 4); // low rounds for speed
  const result = await pool.query(
    'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
    [username.toLowerCase(), hash]
  );
  const user = result.rows[0];

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  return { id: user.id as number, username: user.username as string, token };
}
