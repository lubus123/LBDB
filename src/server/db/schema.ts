import { pgTable, serial, varchar, integer, timestamp, real, jsonb, unique, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 20 }).unique().notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  gamesPlayed: integer('games_played').default(0).notNull(),
  gamesWon: integer('games_won').default(0).notNull(),
  totalLuck: real('total_luck').default(0).notNull(),
  luckStreak: real('luck_streak').default(0).notNull(),
  bestLuckStreak: real('best_luck_streak').default(0).notNull(),
  worstLuckStreak: real('worst_luck_streak').default(0).notNull(),
  luckCapitalisation: real('luck_capitalisation').default(0).notNull(),
});

export const friends = pgTable('friends', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  friendId: integer('friend_id').references(() => users.id).notNull(),
  status: varchar('status', { length: 10 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  unique().on(t.userId, t.friendId),
  index('idx_friends_user_id').on(t.userId),
  index('idx_friends_friend_id').on(t.friendId),
]);

export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  whiteId: integer('white_id').references(() => users.id),
  blackId: integer('black_id').references(() => users.id),
  winner: varchar('winner', { length: 1 }),
  resultType: varchar('result_type', { length: 15 }),
  moves: jsonb('moves'),
  luckWhite: real('luck_white'),
  luckBlack: real('luck_black'),
  timeControl: integer('time_control'),
  createdAt: timestamp('created_at').defaultNow(),
  status: varchar('status', { length: 15 }).default('completed').notNull(),
  mode: varchar('mode', { length: 10 }),
  aiDifficulty: varchar('ai_difficulty', { length: 10 }),
  currentTurn: varchar('current_turn', { length: 1 }).default('w'),
  moveCount: integer('move_count').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  index('idx_games_white_id').on(t.whiteId),
  index('idx_games_black_id').on(t.blackId),
  index('idx_games_created_at').on(t.createdAt),
  index('idx_games_status').on(t.status),
  index('idx_games_updated_at').on(t.updatedAt),
]);

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: varchar('token', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
