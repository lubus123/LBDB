import { describe, it, expect } from 'vitest';
import { encodeBoard, nnForward, type NNWeights } from '../nn';
import { INITIAL_BOARD } from '../../shared/constants';

describe('Neural Network', () => {
  describe('encodeBoard', () => {
    it('should produce 198-element vector', () => {
      const x = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      expect(x.length).toBe(198);
    });

    it('should have bias = 1.0 at position 197', () => {
      const x = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      expect(x[197]).toBe(1.0);
    });

    it('should encode turn indicator correctly', () => {
      const xW = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      const xB = encodeBoard(INITIAL_BOARD, 0, 0, 'b');
      expect(xW[196]).toBe(1.0);
      expect(xB[196]).toBe(0.0);
    });

    it('should encode borne-off counts', () => {
      const x = encodeBoard(INITIAL_BOARD, 5, 3, 'w');
      expect(x[194]).toBeCloseTo(5 / 15);
      expect(x[195]).toBeCloseTo(3 / 15);
    });

    it('should encode point 6 (5 white checkers) correctly', () => {
      const x = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      // Point 6 white features: idx = (6-1) * 8 = 40
      const idx = 40;
      expect(x[idx]).toBe(1.0);     // >= 1
      expect(x[idx + 1]).toBe(1.0); // >= 2
      expect(x[idx + 2]).toBe(1.0); // >= 3
      expect(x[idx + 3]).toBe(1.0); // (5-3)/2 = 1.0
    });

    it('should encode point 1 (2 black checkers) correctly', () => {
      const x = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      // Point 1 black features: idx = (1-1) * 8 + 4 = 4
      const idx = 4;
      expect(x[idx]).toBe(1.0);     // >= 1
      expect(x[idx + 1]).toBe(1.0); // >= 2
      expect(x[idx + 2]).toBe(0.0); // not >= 3
      expect(x[idx + 3]).toBe(0.0);
    });

    it('should encode empty points as all zeros', () => {
      const x = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      // Point 2 (empty): idx = (2-1) * 8 = 8
      for (let i = 8; i < 16; i++) {
        expect(x[i]).toBe(0.0);
      }
    });

    it('should encode bar checkers', () => {
      const board = [...INITIAL_BOARD];
      board[0] = 2;  // 2 white on bar
      board[6] = 3;  // reduce white on point 6
      const x = encodeBoard(board, 0, 0, 'w');
      expect(x[192]).toBeCloseTo(2 / 2); // white bar / 2
    });
  });

  describe('nnForward', () => {
    it('should return value in [0, 1]', () => {
      // Create tiny test weights
      const weights: NNWeights = {
        W1: Array.from({ length: 198 }, () => Array.from({ length: 4 }, () => Math.random() * 0.1 - 0.05)),
        b1: Array.from({ length: 4 }, () => 0),
        W2: Array.from({ length: 4 }, () => [Math.random() * 0.1 - 0.05]),
        b2: [0],
      };

      const input = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      const result = nnForward(input, weights);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should produce consistent results for same input', () => {
      const weights: NNWeights = {
        W1: Array.from({ length: 198 }, (_, i) => Array.from({ length: 4 }, (_, j) => Math.sin(i * 4 + j) * 0.1)),
        b1: [0.01, -0.01, 0.02, -0.02],
        W2: [[0.1], [-0.1], [0.05], [-0.05]],
        b2: [0.0],
      };

      const input = encodeBoard(INITIAL_BOARD, 0, 0, 'w');
      const r1 = nnForward(input, weights);
      const r2 = nnForward(input, weights);

      expect(r1).toBe(r2);
    });
  });
});
