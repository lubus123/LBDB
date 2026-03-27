import type { BoardArray, Color, CheckerMove } from '../shared/types';
import { W_BAR, B_BAR } from '../shared/constants';
import {
  cloneBoard,
  checkersAt,
  isBlot,
  isBlocked,
  hasBarCheckers,
  allInHome,
  furthestChecker,
  applyMove,
} from './board';

/**
 * Get the destination point for a checker move.
 * Handles bar entry as a special case.
 * Returns the target point, or a bear-off indicator (<=0 for white, >=25 for black).
 */
function destination(from: number, die: number, color: Color): number {
  if (color === 'w') {
    // White enters from bar (index 0) at point 25-die (opponent's home board)
    if (from === W_BAR) return 25 - die;
    return from - die;
  }
  // Black enters from bar (index 25) at point die (opponent's home board)
  if (from === B_BAR) return die;
  return from + die;
}

/**
 * Check if a single die can be used to move a checker from `from`.
 * Returns the target point if legal, or null.
 */
function tryMove(
  board: BoardArray,
  from: number,
  die: number,
  color: Color,
): CheckerMove | null {
  // Must have a checker there
  if (checkersAt(board, from, color) === 0) return null;

  const to = destination(from, die, color);

  // Bearing off
  if ((color === 'w' && to <= 0) || (color === 'b' && to >= 25)) {
    if (!allInHome(board, color)) return null;

    // Exact bear off is always legal
    const dist = color === 'w' ? from : 25 - from;
    if (die === dist) {
      const bearOffTo = color === 'w' ? 0 : 25;
      return { from, to: bearOffTo, die, hit: false };
    }

    // Over-bearing: only if no checker on a higher point
    if (die > dist) {
      const highest = furthestChecker(board, color);
      // Only allowed if this IS the furthest checker
      if (color === 'w' && from < highest) return null;
      if (color === 'b' && from > highest) return null;
      // Actually we need: no checker exists further from home than this one
      if (color === 'w' && highest <= from) {
        return { from, to: 0, die, hit: false };
      }
      if (color === 'b' && highest >= from) {
        return { from, to: 25, die, hit: false };
      }
      return null;
    }

    // die < dist: can't bear off, this is a normal move within home board
    // Fall through to normal logic
    return null; // to < 1 for white means bear off, already handled
  }

  // Normal move: check destination isn't blocked
  if (isBlocked(board, to, color)) return null;

  const hit = isBlot(board, to, color);
  return { from, to, die, hit };
}

/**
 * Generate all possible single checker moves for a given die value.
 */
function singleDieMoves(board: BoardArray, die: number, color: Color): CheckerMove[] {
  const moves: CheckerMove[] = [];
  const bar = color === 'w' ? W_BAR : B_BAR;

  // Must enter from bar first
  if (hasBarCheckers(board, color)) {
    const move = tryMove(board, bar, die, color);
    if (move) moves.push(move);
    return moves; // Can only move from bar
  }

  // Try all points
  for (let i = 1; i <= 24; i++) {
    if (checkersAt(board, i, color) > 0) {
      const move = tryMove(board, i, die, color);
      if (move) moves.push(move);
    }
  }

  return moves;
}

interface MoveSequence {
  moves: CheckerMove[];
  board: BoardArray;
  diceUsed: number;
}

/**
 * Generate all legal turn sequences (complete turns) for the given board and dice.
 *
 * Rules:
 * 1. Must use both dice if possible
 * 2. If only one die can be used, must use the higher one
 * 3. Doubles give 4 uses of the same value
 * 4. Must use as many dice as possible
 */
export function generateAllTurns(
  board: BoardArray,
  dice: [number, number],
  color: Color,
): CheckerMove[][] {
  const isDoubles = dice[0] === dice[1];
  const diceValues = isDoubles
    ? [dice[0], dice[0], dice[0], dice[0]]
    : [dice[0], dice[1]];

  const results: MoveSequence[] = [];

  function search(
    currentBoard: BoardArray,
    remainingDice: number[],
    movesSoFar: CheckerMove[],
    diceUsed: number,
  ): void {
    if (remainingDice.length === 0) {
      results.push({ moves: [...movesSoFar], board: cloneBoard(currentBoard), diceUsed });
      return;
    }

    let anyMoveFound = false;

    // Try each unique remaining die
    const triedDice = new Set<number>();
    for (let di = 0; di < remainingDice.length; di++) {
      const die = remainingDice[di];
      if (triedDice.has(die)) continue;
      triedDice.add(die);

      const possibleMoves = singleDieMoves(currentBoard, die, color);
      for (const move of possibleMoves) {
        anyMoveFound = true;
        const newBoard = cloneBoard(currentBoard);
        applyMove(newBoard, move, color);

        const newRemaining = [...remainingDice];
        newRemaining.splice(di, 1);

        movesSoFar.push(move);
        search(newBoard, newRemaining, movesSoFar, diceUsed + 1);
        movesSoFar.pop();
      }
    }

    if (!anyMoveFound) {
      // Can't use any more dice
      results.push({ moves: [...movesSoFar], board: cloneBoard(currentBoard), diceUsed });
    }
  }

  search(cloneBoard(board), diceValues, [], 0);

  if (results.length === 0) {
    return [[]]; // Forced pass
  }

  // Rule: must use maximum number of dice
  const maxDiceUsed = Math.max(...results.map(r => r.diceUsed));
  let filtered = results.filter(r => r.diceUsed === maxDiceUsed);

  // Rule: if only one die can be used (maxDiceUsed === 1) and not doubles,
  // must use the higher die if possible
  if (!isDoubles && maxDiceUsed === 1) {
    const higherDie = Math.max(dice[0], dice[1]);
    const usesHigher = filtered.filter(r => r.moves[0]?.die === higherDie);
    if (usesHigher.length > 0) {
      filtered = usesHigher;
    }
  }

  // Deduplicate by final board state
  const seen = new Set<string>();
  const unique: CheckerMove[][] = [];
  for (const seq of filtered) {
    const key = seq.board.join(',') + '|' + seq.moves.map(m => `${m.from}-${m.to}`).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(seq.moves);
    }
  }

  return unique.length > 0 ? unique : [[]];
}

/**
 * Get legal destinations for a specific checker given remaining dice.
 * Used by the UI to highlight valid moves.
 */
export function legalDestinations(
  board: BoardArray,
  from: number,
  remainingDice: number[],
  color: Color,
): number[] {
  const dests = new Set<number>();
  const uniqueDice = [...new Set(remainingDice)];

  for (const die of uniqueDice) {
    const move = tryMove(board, from, die, color);
    if (move) {
      dests.add(move.to);
    }
  }

  return [...dests];
}

/**
 * Get all points that have movable checkers (for UI highlighting).
 */
export function movableCheckers(
  board: BoardArray,
  remainingDice: number[],
  color: Color,
): number[] {
  const points: number[] = [];
  const bar = color === 'w' ? W_BAR : B_BAR;

  // If on bar, can only move from bar
  if (hasBarCheckers(board, color)) {
    const dests = legalDestinations(board, bar, remainingDice, color);
    if (dests.length > 0) points.push(bar);
    return points;
  }

  for (let i = 1; i <= 24; i++) {
    if (checkersAt(board, i, color) > 0) {
      const dests = legalDestinations(board, i, remainingDice, color);
      if (dests.length > 0) points.push(i);
    }
  }

  return points;
}

/**
 * Check if any moves are possible with the remaining dice.
 */
export function hasAnyMoves(
  board: BoardArray,
  remainingDice: number[],
  color: Color,
): boolean {
  return movableCheckers(board, remainingDice, color).length > 0;
}
