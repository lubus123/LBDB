/**
 * Luck calculation for backgammon.
 *
 * Luck = equity of actual roll's best move - average equity across all possible rolls.
 * Positive = lucky, negative = unlucky.
 */

import type { BoardArray, Color, GameState } from '../shared/types';
import { generateAllTurns } from './moves';
import { evaluatePosition, applyTurnMoves, type PositionEvaluator } from './ai';

/** Find the best equity achievable for a given dice roll (deterministic, no noise) */
function bestEquityForRoll(
  board: BoardArray,
  dice: [number, number],
  color: Color,
  whiteOff: number,
  blackOff: number,
  evaluator: PositionEvaluator,
): number {
  const allTurns = generateAllTurns(board, dice, color);

  if (allTurns.length === 0 || (allTurns.length === 1 && allTurns[0].length === 0)) {
    const myOff = color === 'w' ? whiteOff : blackOff;
    const oppOff = color === 'w' ? blackOff : whiteOff;
    return evaluator(board, color, myOff, oppOff);
  }

  const useHeuristic = evaluator === evaluatePosition;
  let best = -Infinity;
  for (const turnMoves of allTurns) {
    const result = applyTurnMoves(board, turnMoves, color, whiteOff, blackOff);
    const myOff = color === 'w' ? result.whiteOff : result.blackOff;
    const oppOff = color === 'w' ? result.blackOff : result.whiteOff;
    let score = evaluator(result.board, color, myOff, oppOff);
    if (useHeuristic) {
      const hits = turnMoves.filter(m => m.hit).length;
      score += hits * 12;
    }
    if (score > best) best = score;
  }
  return best;
}

export interface RollEquity {
  dice: [number, number];
  equity: number;
  weight: number;   // 1 for doubles, 2 for non-doubles
}

export interface LuckAnalysis {
  luck: number;
  rolls: RollEquity[];
  actualEquity: number;
  expectedEquity: number;
  rank: number;      // 1 = best roll, 21 = worst
}

/**
 * Compute luck with full roll distribution data.
 * Returns the luck value plus equity for all 21 possible dice rolls.
 */
export function computeTurnLuckFull(state: GameState, evaluator?: PositionEvaluator): LuckAnalysis {
  const { board, dice, turn, whiteOff, blackOff } = state;
  if (!dice) return { luck: 0, rolls: [], actualEquity: 0, expectedEquity: 0, rank: 0 };

  const eval_ = evaluator ?? evaluatePosition;
  const rolls: RollEquity[] = [];
  let totalEquity = 0;
  let totalWeight = 0;

  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = d1; d2 <= 6; d2++) {
      const weight = d1 === d2 ? 1 : 2;
      const equity = bestEquityForRoll(board, [d1, d2] as [number, number], turn, whiteOff, blackOff, eval_);
      rolls.push({ dice: [d1, d2], equity, weight });
      totalEquity += equity * weight;
      totalWeight += weight;
    }
  }

  const expectedEquity = totalEquity / totalWeight;
  const actualDice: [number, number] = dice[0] <= dice[1] ? [dice[0], dice[1]] : [dice[1], dice[0]];
  const actualRoll = rolls.find(r => r.dice[0] === actualDice[0] && r.dice[1] === actualDice[1])!;
  const actualEquity = actualRoll.equity;

  // Rank: sort descending, find position of actual roll
  const sorted = [...rolls].sort((a, b) => b.equity - a.equity);
  const rank = sorted.findIndex(r => r.dice[0] === actualDice[0] && r.dice[1] === actualDice[1]) + 1;

  return { luck: actualEquity - expectedEquity, rolls, actualEquity, expectedEquity, rank };
}

/**
 * Compute the luck of the current roll (simple version, backward compatible).
 */
export function computeTurnLuck(state: GameState, evaluator?: PositionEvaluator): number {
  return computeTurnLuckFull(state, evaluator).luck;
}
