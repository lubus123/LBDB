/**
 * Luck calculation for backgammon.
 *
 * Luck = equity of actual roll's best move - average equity across all possible rolls.
 * Positive = lucky, negative = unlucky.
 */

import type { BoardArray, Color, GameState } from '../shared/types';
import { generateAllTurns } from './moves';
import { evaluatePosition, applyTurnMoves } from './ai';

/** Find the best equity achievable for a given dice roll (deterministic, no noise) */
function bestEquityForRoll(
  board: BoardArray,
  dice: [number, number],
  color: Color,
  whiteOff: number,
  blackOff: number,
): number {
  const allTurns = generateAllTurns(board, dice, color);

  if (allTurns.length === 0 || (allTurns.length === 1 && allTurns[0].length === 0)) {
    // No moves possible — evaluate current position
    const myOff = color === 'w' ? whiteOff : blackOff;
    const oppOff = color === 'w' ? blackOff : whiteOff;
    return evaluatePosition(board, color, myOff, oppOff);
  }

  let best = -Infinity;
  for (const turnMoves of allTurns) {
    const result = applyTurnMoves(board, turnMoves, color, whiteOff, blackOff);
    const myOff = color === 'w' ? result.whiteOff : result.blackOff;
    const oppOff = color === 'w' ? result.blackOff : result.whiteOff;
    let score = evaluatePosition(result.board, color, myOff, oppOff);
    // Bonus for hitting (same as AI)
    const hits = turnMoves.filter(m => m.hit).length;
    score += hits * 12;
    if (score > best) best = score;
  }
  return best;
}

/**
 * Compute the luck of the current roll.
 * Call after dice are rolled (phase === 'moving').
 */
export function computeTurnLuck(state: GameState): number {
  const { board, dice, turn, whiteOff, blackOff } = state;
  if (!dice) return 0;

  // Equity for the actual roll
  const actualEquity = bestEquityForRoll(board, dice, turn, whiteOff, blackOff);

  // Expected equity across all 21 distinct rolls
  let totalEquity = 0;
  let totalWeight = 0;

  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = d1; d2 <= 6; d2++) {
      const weight = d1 === d2 ? 1 : 2; // doubles: 1/36, non-doubles: 2/36
      const equity = bestEquityForRoll(board, [d1, d2] as [number, number], turn, whiteOff, blackOff);
      totalEquity += equity * weight;
      totalWeight += weight;
    }
  }

  const expectedEquity = totalEquity / totalWeight;
  return actualEquity - expectedEquity;
}
