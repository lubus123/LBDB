import type { BoardArray, Color, CheckerMove } from '../shared/types';
import { W_BAR, B_BAR } from '../shared/constants';

/** Clone a board array */
export function cloneBoard(board: BoardArray): BoardArray {
  return [...board];
}

/** Get the number of checkers for a color on a point (always positive) */
export function checkersAt(board: BoardArray, point: number, color: Color): number {
  const val = board[point];
  if (color === 'w') return val > 0 ? val : 0;
  return val < 0 ? -val : 0;
}

/** Check if a point has a blot (single opponent checker) */
export function isBlot(board: BoardArray, point: number, color: Color): boolean {
  const opponent = color === 'w' ? 'b' : 'w';
  return checkersAt(board, point, opponent) === 1;
}

/** Check if a point is blocked by the opponent (2+ opponent checkers) */
export function isBlocked(board: BoardArray, point: number, color: Color): boolean {
  const opponent = color === 'w' ? 'b' : 'w';
  return checkersAt(board, point, opponent) >= 2;
}

/** Check if a color has any checkers on the bar */
export function hasBarCheckers(board: BoardArray, color: Color): boolean {
  const bar = color === 'w' ? W_BAR : B_BAR;
  return checkersAt(board, bar, color) > 0;
}

/** Check if all checkers are in the home board (required for bearing off) */
export function allInHome(board: BoardArray, color: Color): boolean {
  const bar = color === 'w' ? W_BAR : B_BAR;
  if (checkersAt(board, bar, color) > 0) return false;

  if (color === 'w') {
    // White home = points 1-6. Check no white checkers on points 7-24
    for (let i = 7; i <= 24; i++) {
      if (board[i] > 0) return false;
    }
  } else {
    // Black home = points 19-24. Check no black checkers on points 1-18
    for (let i = 1; i <= 18; i++) {
      if (board[i] < 0) return false;
    }
  }
  return true;
}

/** Find the furthest checker from bearing off for a color */
export function furthestChecker(board: BoardArray, color: Color): number {
  if (color === 'w') {
    // White bears off past point 0, so furthest = highest point number
    if (board[W_BAR] > 0) return 25; // on bar = furthest
    for (let i = 24; i >= 1; i--) {
      if (board[i] > 0) return i;
    }
    return 0;
  } else {
    // Black bears off past point 25, so furthest = lowest point number
    if (board[B_BAR] < 0) return 0; // on bar = furthest
    for (let i = 1; i <= 24; i++) {
      if (board[i] < 0) return i;
    }
    return 25;
  }
}

/**
 * Apply a single checker move to the board. Mutates the board.
 * Returns whether a hit occurred.
 */
export function applyMove(board: BoardArray, move: CheckerMove, color: Color): void {
  const sign = color === 'w' ? 1 : -1;
  const opponentBar = color === 'w' ? B_BAR : W_BAR;

  // Remove checker from source
  board[move.from] -= sign;

  // Handle bear off
  if (move.to <= 0 || move.to >= 25) {
    // Checker is borne off - don't place on board
    return;
  }

  // Check for hit
  if (move.hit) {
    // Remove opponent blot to their bar
    board[move.to] = 0;
    board[opponentBar] += (color === 'w' ? -1 : 1);
  }

  // Place checker on destination
  board[move.to] += sign;
}

/** Count total checkers for a color on the board (including bar, excluding borne off) */
export function countCheckers(board: BoardArray, color: Color): number {
  let count = 0;
  for (let i = 0; i <= 25; i++) {
    count += checkersAt(board, i, color);
  }
  return count;
}
