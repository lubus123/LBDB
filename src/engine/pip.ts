import type { BoardArray, Color } from '../shared/types';
import { W_BAR, B_BAR } from '../shared/constants';

/**
 * Calculate pip count for a color.
 * Pip count = sum of (checkers on point * distance to bear off)
 *
 * White bears off past point 0, so distance = point number.
 * Black bears off past point 25, so distance = 25 - point number.
 * Bar checkers: white bar = 25 pips, black bar = 25 pips.
 */
export function pipCount(board: BoardArray, color: Color): number {
  let pips = 0;

  if (color === 'w') {
    // White bar = 25 pips each
    if (board[W_BAR] > 0) pips += board[W_BAR] * 25;
    for (let i = 1; i <= 24; i++) {
      if (board[i] > 0) pips += board[i] * i;
    }
  } else {
    // Black bar = 25 pips each
    if (board[B_BAR] < 0) pips += (-board[B_BAR]) * 25;
    for (let i = 1; i <= 24; i++) {
      if (board[i] < 0) pips += (-board[i]) * (25 - i);
    }
  }

  return pips;
}
