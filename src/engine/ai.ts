/**
 * Simple heuristic AI for backgammon.
 *
 * Evaluates positions using classic principles:
 * - Lower pip count is better
 * - Making points (2+ checkers) is good, especially in home board
 * - Blots (single checkers) in dangerous positions are bad
 * - Hitting opponent blots is good
 * - Primes (consecutive blocked points) are very good
 * - Bearing off progress is rewarded
 * - Being on the bar is heavily penalized
 */

import type { BoardArray, Color, CheckerMove, GameState } from '../shared/types';
import { W_BAR, B_BAR, CHECKERS_PER_PLAYER } from '../shared/constants';
import { cloneBoard, applyMove, checkersAt, countCheckers } from './board';
import { generateAllTurns } from './moves';
import { pipCount } from './pip';

/** Evaluate a board position from `color`'s perspective. Higher = better. */
export function evaluatePosition(board: BoardArray, color: Color, colorOff: number, opponentOff: number): number {
  const opp: Color = color === 'w' ? 'b' : 'w';
  let score = 0;

  // 1. Pip count difference (lower is better for us)
  const myPips = pipCount(board, color);
  const oppPips = pipCount(board, opp);
  score += (oppPips - myPips) * 0.5;

  // 2. Borne-off checkers
  score += colorOff * 15;
  score -= opponentOff * 15;

  // 3. Bar penalty
  const myBar = color === 'w' ? W_BAR : B_BAR;
  const oppBar = color === 'w' ? B_BAR : W_BAR;
  const myBarCount = checkersAt(board, myBar, color);
  const oppBarCount = checkersAt(board, oppBar, opp);
  score -= myBarCount * 30;
  score += oppBarCount * 25;

  // 4. Point control and blot penalties
  const homeStart = color === 'w' ? 1 : 19;
  const homeEnd = color === 'w' ? 6 : 24;
  const outerStart = color === 'w' ? 7 : 13;
  const outerEnd = color === 'w' ? 12 : 18;

  for (let i = 1; i <= 24; i++) {
    const myCount = checkersAt(board, i, color);
    const oppCount = checkersAt(board, i, opp);

    if (myCount >= 2) {
      // Anchors / made points
      if (i >= homeStart && i <= homeEnd) {
        // Home board points are very valuable
        score += 8 + myCount;
      } else if (i >= outerStart && i <= outerEnd) {
        // Outer board points
        score += 5;
      } else {
        // Points in opponent's area (anchors)
        score += 4;
      }
    } else if (myCount === 1) {
      // Blot - penalize based on exposure
      const distFromHome = color === 'w' ? i : 25 - i;
      if (distFromHome > 6) {
        // Blots far from home are more dangerous
        score -= 6 + distFromHome * 0.5;
      } else {
        // Blots in home board are less dangerous
        score -= 3;
      }
    }
  }

  // 5. Prime detection (consecutive made points)
  let consecutive = 0;
  let maxPrime = 0;
  for (let i = 1; i <= 24; i++) {
    if (checkersAt(board, i, color) >= 2) {
      consecutive++;
      if (consecutive > maxPrime) maxPrime = consecutive;
    } else {
      consecutive = 0;
    }
  }
  if (maxPrime >= 3) score += maxPrime * 8;
  if (maxPrime >= 6) score += 30; // Full prime bonus

  // 6. Home board coverage (count made points in home)
  let homePoints = 0;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (checkersAt(board, i, color) >= 2) homePoints++;
  }
  score += homePoints * 5;

  // 7. Checker distribution - penalize stacking too many on one point
  for (let i = 1; i <= 24; i++) {
    const c = checkersAt(board, i, color);
    if (c > 3) score -= (c - 3) * 2;
  }

  return score;
}

/** Apply a full turn's moves to a board and return the new board + off counts */
function applyTurnMoves(
  board: BoardArray,
  moves: CheckerMove[],
  color: Color,
  whiteOff: number,
  blackOff: number,
): { board: BoardArray; whiteOff: number; blackOff: number } {
  const newBoard = cloneBoard(board);
  let wOff = whiteOff;
  let bOff = blackOff;

  for (const move of moves) {
    applyMove(newBoard, move, color);
    if (move.to <= 0 || move.to >= 25) {
      if (color === 'w') wOff++;
      else bOff++;
    }
  }

  return { board: newBoard, whiteOff: wOff, blackOff: bOff };
}

export interface AIMoveResult {
  moves: CheckerMove[];
  score: number;
}

/**
 * Choose the best turn for the AI.
 * Generates all legal turns, evaluates each resulting position,
 * and picks the best one (with small random noise for variety).
 */
export function chooseBestTurn(state: GameState): AIMoveResult {
  const { board, dice, turn, whiteOff, blackOff } = state;
  if (!dice) return { moves: [], score: 0 };

  const allTurns = generateAllTurns(board, dice, turn);

  if (allTurns.length === 0 || (allTurns.length === 1 && allTurns[0].length === 0)) {
    return { moves: [], score: 0 };
  }

  const opp: Color = turn === 'w' ? 'b' : 'w';
  let bestScore = -Infinity;
  let bestTurn = allTurns[0];

  for (const turnMoves of allTurns) {
    const result = applyTurnMoves(board, turnMoves, turn, whiteOff, blackOff);
    const myOff = turn === 'w' ? result.whiteOff : result.blackOff;
    const oppOff = turn === 'w' ? result.blackOff : result.whiteOff;

    let score = evaluatePosition(result.board, turn, myOff, oppOff);

    // Bonus for hitting
    const hits = turnMoves.filter(m => m.hit).length;
    score += hits * 12;

    // Small noise for variety (avoids robotic play)
    score += (Math.random() - 0.5) * 2;

    // Instant win detection
    if ((turn === 'w' && result.whiteOff === CHECKERS_PER_PLAYER) ||
        (turn === 'b' && result.blackOff === CHECKERS_PER_PLAYER)) {
      return { moves: turnMoves, score: 1000 };
    }

    if (score > bestScore) {
      bestScore = score;
      bestTurn = turnMoves;
    }
  }

  return { moves: bestTurn, score: bestScore };
}
