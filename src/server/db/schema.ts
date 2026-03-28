import { pgTable, serial, varchar, integer, timestamp, real, jsonb, unique } from 'drizzle-orm/pg-core';

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
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: varchar('token', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
