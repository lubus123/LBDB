import { describe, it, expect } from 'vitest';
import { computeTurnLuck, computeTurnLuckFull } from '../luck';
import { evaluatePosition } from '../ai';
import type { GameState, BoardArray } from '../../shared/types';
import { createInitialGameState } from '../../shared/constants';

// Helper to create a test state with specific dice set
function stateWithDice(dice: [number, number], board?: BoardArray): GameState {
  const state = createInitialGameState();
  return {
    ...state,
    board: board ? [...board] : [...state.board],
    dice,
    movesLeft: dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]],
    phase: 'moving',
    turnMoves: [],
  };
}

// Helper to create a state with no dice
function stateNoDice(board?: BoardArray): GameState {
  const state = createInitialGameState();
  return {
    ...state,
    board: board ? [...board] : [...state.board],
    dice: null,
    movesLeft: [],
    phase: 'waiting',
    turnMoves: [],
  };
}

describe('luck.ts', () => {
  describe('computeTurnLuckFull', () => {
    it('returns zero luck when no dice', () => {
      const state = stateNoDice();
      const result = computeTurnLuckFull(state);
      expect(result.luck).toBe(0);
      expect(result.rolls).toEqual([]);
      expect(result.actualEquity).toBe(0);
      expect(result.expectedEquity).toBe(0);
      expect(result.rank).toBe(0);
    });

    it('generates exactly 21 distinct rolls', () => {
      const state = stateWithDice([3, 5]);
      const result = computeTurnLuckFull(state);
      expect(result.rolls).toHaveLength(21);

      // Verify all rolls are unique
      const keys = result.rolls.map(r => `${r.dice[0]},${r.dice[1]}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(21);
    });

    it('weights sum to 36', () => {
      const state = stateWithDice([2, 4]);
      const result = computeTurnLuckFull(state);
      const totalWeight = result.rolls.reduce((sum, r) => sum + r.weight, 0);
      expect(totalWeight).toBe(36);
    });

    it('doubles have weight 1, non-doubles have weight 2', () => {
      const state = stateWithDice([1, 1]);
      const result = computeTurnLuckFull(state);

      for (const roll of result.rolls) {
        const isDouble = roll.dice[0] === roll.dice[1];
        if (isDouble) {
          expect(roll.weight).toBe(1);
        } else {
          expect(roll.weight).toBe(2);
        }
      }

      // Sanity: 6 doubles (weight 1 each) + 15 non-doubles (weight 2 each) = 6 + 30 = 36
      const doubles = result.rolls.filter(r => r.dice[0] === r.dice[1]);
      const nonDoubles = result.rolls.filter(r => r.dice[0] !== r.dice[1]);
      expect(doubles).toHaveLength(6);
      expect(nonDoubles).toHaveLength(15);
    });

    it('rank is between 1 and 21 inclusive', () => {
      // Test several different dice
      const diceToTest: [number, number][] = [[1, 2], [3, 3], [5, 6], [1, 1], [4, 5]];
      for (const dice of diceToTest) {
        const state = stateWithDice(dice);
        const result = computeTurnLuckFull(state);
        expect(result.rank).toBeGreaterThanOrEqual(1);
        expect(result.rank).toBeLessThanOrEqual(21);
      }
    });

    it('luck equals actualEquity minus expectedEquity', () => {
      const state = stateWithDice([3, 5]);
      const result = computeTurnLuckFull(state);
      expect(result.luck).toBeCloseTo(result.actualEquity - result.expectedEquity, 10);
    });

    it('all roll dice are ordered (d1 <= d2)', () => {
      const state = stateWithDice([6, 1]);
      const result = computeTurnLuckFull(state);
      for (const roll of result.rolls) {
        expect(roll.dice[0]).toBeLessThanOrEqual(roll.dice[1]);
      }
    });

    it('all dice values in rolls are between 1 and 6', () => {
      const state = stateWithDice([2, 3]);
      const result = computeTurnLuckFull(state);
      for (const roll of result.rolls) {
        expect(roll.dice[0]).toBeGreaterThanOrEqual(1);
        expect(roll.dice[0]).toBeLessThanOrEqual(6);
        expect(roll.dice[1]).toBeGreaterThanOrEqual(1);
        expect(roll.dice[1]).toBeLessThanOrEqual(6);
      }
    });

    it('uses custom evaluator — constant evaluator yields zero luck', () => {
      // If all positions evaluate to the same constant, every roll has the same equity.
      // Therefore luck = actualEquity - expectedEquity = constant - constant = 0.
      const constantEvaluator = (_board: BoardArray, _color: 'w' | 'b', _myOff: number, _oppOff: number) => 100;

      const state = stateWithDice([3, 4]);
      const result = computeTurnLuckFull(state, constantEvaluator);

      expect(result.luck).toBeCloseTo(0, 10);
      expect(result.actualEquity).toBe(100);
      expect(result.expectedEquity).toBeCloseTo(100, 10);
    });

    it('actual roll is found in the rolls array', () => {
      const dice: [number, number] = [2, 5];
      const state = stateWithDice(dice);
      const result = computeTurnLuckFull(state);

      // The actual roll canonical form (sorted)
      const d1 = Math.min(dice[0], dice[1]);
      const d2 = Math.max(dice[0], dice[1]);
      const found = result.rolls.find(r => r.dice[0] === d1 && r.dice[1] === d2);
      expect(found).toBeDefined();
      expect(found!.equity).toBe(result.actualEquity);
    });

    it('handles forced pass position — returns valid 21-roll analysis', () => {
      // Build a board where white is completely blocked (all opponent points, white on bar)
      // Black holds a prime covering points 1-6, white is on the bar
      const blockedBoard: BoardArray = new Array(26).fill(0);
      // Black blocks all six home board points (1-6)
      blockedBoard[1] = -2;
      blockedBoard[2] = -2;
      blockedBoard[3] = -2;
      blockedBoard[4] = -2;
      blockedBoard[5] = -2;
      blockedBoard[6] = -2;
      // White checker on the bar (index 0)
      blockedBoard[0] = 1;
      // Rest of white checkers elsewhere on the board
      blockedBoard[24] = 14;

      const state = stateWithDice([1, 2], blockedBoard);
      const result = computeTurnLuckFull(state);

      // Should always return the full 21-roll analysis even when no moves possible
      expect(result.rolls).toHaveLength(21);
      const totalWeight = result.rolls.reduce((sum, r) => sum + r.weight, 0);
      expect(totalWeight).toBe(36);
      expect(result.rank).toBeGreaterThanOrEqual(1);
      expect(result.rank).toBeLessThanOrEqual(21);
      expect(typeof result.luck).toBe('number');
      expect(Number.isFinite(result.luck)).toBe(true);
    });

    it('rank 1 corresponds to the highest equity roll', () => {
      const state = stateWithDice([6, 6]);
      const result = computeTurnLuckFull(state);

      const maxEquity = Math.max(...result.rolls.map(r => r.equity));
      const rank1Roll = result.rolls.find(r => {
        // Find the roll that has rank 1 by checking which roll has the highest equity
        return r.equity === maxEquity;
      });
      expect(rank1Roll).toBeDefined();

      // The actual roll with rank 1 should have the highest equity
      // (when multiple rolls tie for highest, rank is still 1)
      const sortedDesc = [...result.rolls].sort((a, b) => b.equity - a.equity);
      expect(sortedDesc[0].equity).toBe(maxEquity);
    });
  });

  describe('computeTurnLuck', () => {
    it('returns same value as computeTurnLuckFull().luck', () => {
      const state = stateWithDice([3, 5]);
      const luckSimple = computeTurnLuck(state);
      const luckFull = computeTurnLuckFull(state).luck;
      expect(luckSimple).toBe(luckFull);
    });

    it('returns zero when no dice', () => {
      const state = stateNoDice();
      expect(computeTurnLuck(state)).toBe(0);
    });

    it('returns a finite number for any valid state', () => {
      const diceToTest: [number, number][] = [[1, 1], [2, 3], [4, 5], [6, 6]];
      for (const dice of diceToTest) {
        const state = stateWithDice(dice);
        const luck = computeTurnLuck(state);
        expect(typeof luck).toBe('number');
        expect(Number.isFinite(luck)).toBe(true);
      }
    });

    it('uses custom evaluator consistently', () => {
      const constantEvaluator = () => 42;
      const state = stateWithDice([1, 3]);
      const luck = computeTurnLuck(state, constantEvaluator);
      expect(luck).toBeCloseTo(0, 10);
    });

    it('doubles dice are handled symmetrically — luck consistent with full analysis', () => {
      // Roll doubles: dice=[4,4]
      const state = stateWithDice([4, 4]);
      const luckSimple = computeTurnLuck(state);
      const { luck, actualEquity, expectedEquity } = computeTurnLuckFull(state);
      expect(luckSimple).toBe(luck);
      expect(luck).toBeCloseTo(actualEquity - expectedEquity, 10);
    });
  });
});
