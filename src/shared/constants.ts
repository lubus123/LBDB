import type { BoardArray, CubeState, GameState } from './types';

/** Number of points on the board */
export const POINTS = 24;

/** Checkers per player */
export const CHECKERS_PER_PLAYER = 15;

/** White bar index */
export const W_BAR = 0;

/** Black bar index */
export const B_BAR = 25;

/** White bear-off "destination" (conceptual, off the low end) */
export const W_OFF = -1;

/** Black bear-off "destination" (conceptual, off the high end) */
export const B_OFF = 26;

/**
 * Standard starting position.
 * Index 0 = white bar, 1-24 = points, 25 = black bar
 * Positive = white, negative = black.
 *
 * Standard setup:
 *   White: 2 on point 24, 5 on point 13, 3 on point 8, 5 on point 6
 *   Black: 2 on point 1, 5 on point 12, 3 on point 17, 5 on point 19
 */
export const INITIAL_BOARD: BoardArray = [
  0,    // index 0: white bar
  -2,   // point 1:  2 black
  0,    // point 2
  0,    // point 3
  0,    // point 4
  0,    // point 5
  5,    // point 6:  5 white
  0,    // point 7
  3,    // point 8:  3 white
  0,    // point 9
  0,    // point 10
  0,    // point 11
  -5,   // point 12: 5 black
  5,    // point 13: 5 white
  0,    // point 14
  0,    // point 15
  0,    // point 16
  -3,   // point 17: 3 black
  0,    // point 18
  -5,   // point 19: 5 black
  0,    // point 20
  0,    // point 21
  0,    // point 22
  0,    // point 23
  2,    // point 24: 2 white
  0,    // index 25: black bar
];

export const INITIAL_CUBE: CubeState = {
  value: 1,
  owner: 'center',
  offered: false,
};

export function createInitialGameState(gameId: string = 'local'): GameState {
  return {
    board: [...INITIAL_BOARD],
    turn: 'w',
    dice: null,
    movesLeft: [],
    cube: { ...INITIAL_CUBE },
    whiteOff: 0,
    blackOff: 0,
    phase: 'waiting',
    gameId,
    ply: 0,
    turnMoves: [],
  };
}

/**
 * Direction of movement for each color.
 * White moves from high points to low (24 -> 1 -> off).
 * Black moves from low points to high (1 -> 24 -> off).
 */
export function moveDirection(color: 'w' | 'b'): number {
  return color === 'w' ? -1 : 1;
}

/** Bar index for a color */
export function barIndex(color: 'w' | 'b'): number {
  return color === 'w' ? W_BAR : B_BAR;
}

/** Home board range for a color (inclusive) */
export function homeRange(color: 'w' | 'b'): [number, number] {
  return color === 'w' ? [1, 6] : [19, 24];
}
