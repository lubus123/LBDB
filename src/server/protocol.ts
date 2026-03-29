/**
 * WebSocket protocol messages between client and server.
 */

import type { CheckerMove, Color, GameState, GameResult } from '../shared/types';

// ─── Client → Server ───

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'create'; timeLimit?: number | null }
  | { type: 'join'; gameId: string }
  | { type: 'roll' }
  | { type: 'move'; move: CheckerMove }
  | { type: 'confirm' }
  | { type: 'undo' }
  | { type: 'double' }
  | { type: 'accept_double' }
  | { type: 'drop_double' }
  | { type: 'resign' }
  | { type: 'rematch' }
  | { type: 'accept_rematch' }
  | { type: 'chat'; text: string }
  | { type: 'challenge'; username: string; timeLimit?: number }
  | { type: 'accept_challenge'; challengeId: string };

// ─── Server → Client ───

export type ServerMessage =
  | { type: 'authenticated'; user: { id: number; username: string }; onlineFriends?: string[] }
  | { type: 'auth_error'; message: string }
  | { type: 'game_created'; gameId: string }
  | { type: 'game_start'; state: GameState; color: Color; opponent?: string }
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'opponent_disconnected' }
  | { type: 'opponent_reconnected' }
  | { type: 'game_over'; result: GameResult }
  | { type: 'rematch_offered' }
  | { type: 'rematch_start'; state: GameState; color: Color }
  | { type: 'resigned'; winner: Color }
  | { type: 'timeout'; state: GameState }
  | { type: 'chat'; from: string; text: string }
  | { type: 'challenge_received'; from: string; challengeId: string; timeLimit: number }
  | { type: 'challenge_accepted'; gameId: string }
  | { type: 'friend_online'; username: string }
  | { type: 'friend_offline'; username: string };
