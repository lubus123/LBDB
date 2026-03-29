import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { createLogger } from '../logger';

const log = createLogger('db');

const DATABASE_URL = process.env.DATABASE_URL;

let db: ReturnType<typeof drizzle> | null = null;

/** Inject a Drizzle instance (used by tests to provide a test database) */
export function setDb(instance: ReturnType<typeof drizzle> | null) {
  db = instance;
}

export function getDb() {
  if (!db) {
    if (!DATABASE_URL) {
      log.warn('DATABASE_URL not set — database features disabled');
      return null;
    }
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool, { schema });
    log.info('Connected to PostgreSQL');
  }
  return db;
}

/** Push schema to DB (creates tables if they don't exist) */
export async function migrateDb() {
  const d = getDb();
  if (!d) return;
  // Use raw SQL to create tables — simpler than drizzle-kit for auto-migration
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
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
    CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
    CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
    CREATE INDEX IF NOT EXISTS idx_games_white_id ON games(white_id);
    CREATE INDEX IF NOT EXISTS idx_games_black_id ON games(black_id);
    CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
  `);
  await pool.end();
  log.info('Schema migrated');
}
