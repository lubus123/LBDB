/**
 * WebSocket protocol messages between client and server.
 * Shared by both — imported by server and client code.
 */

import type { CheckerMove, Color, GameState, GameResult } from '../shared/types';

// ─── Client → Server ───

export type ClientMessage =
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
  | { type: 'accept_rematch' };

// ─── Server → Client ───

export type ServerMessage =
  | { type: 'game_created'; gameId: string }
  | { type: 'game_start'; state: GameState; color: Color }
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'opponent_disconnected' }
  | { type: 'opponent_reconnected' }
  | { type: 'game_over'; result: GameResult }
  | { type: 'rematch_offered' }
  | { type: 'rematch_start'; state: GameState; color: Color }
  | { type: 'resigned'; winner: Color }
  | { type: 'timeout'; state: GameState };
