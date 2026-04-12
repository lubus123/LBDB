// src/engine/test/notation.test.ts
import { describe, it, expect } from 'vitest';
import { formatMove, formatTurn, formatDice } from '../../shared/notation';
import type { CheckerMove } from '../../shared/types';

describe('notation', () => {
  describe('formatMove', () => {
    it('formats normal move', () => {
      const move: CheckerMove = { from: 8, to: 5, die: 3, hit: false };
      expect(formatMove(move, 'w')).toBe('8/5');
    });

    it('formats white bar entry', () => {
      const move: CheckerMove = { from: 0, to: 20, die: 5, hit: false };
      expect(formatMove(move, 'w')).toBe('bar/20');
    });

    it('formats black bar entry', () => {
      const move: CheckerMove = { from: 25, to: 5, die: 5, hit: false };
      expect(formatMove(move, 'b')).toBe('bar/5');
    });

    it('formats white bear-off', () => {
      const move: CheckerMove = { from: 3, to: 0, die: 3, hit: false };
      expect(formatMove(move, 'w')).toBe('3/off');
    });

    it('formats black bear-off', () => {
      const move: CheckerMove = { from: 22, to: 25, die: 3, hit: false };
      expect(formatMove(move, 'b')).toBe('22/off');
    });

    it('formats move with hit (same as normal)', () => {
      const move: CheckerMove = { from: 8, to: 5, die: 3, hit: true };
      expect(formatMove(move, 'w')).toBe('8/5');
    });
  });

  describe('formatTurn', () => {
    it('formats multiple moves', () => {
      const moves: CheckerMove[] = [
        { from: 8, to: 5, die: 3, hit: false },
        { from: 6, to: 5, die: 1, hit: false },
      ];
      expect(formatTurn(moves, 'w')).toBe('8/5 6/5');
    });

    it('formats forced pass (empty moves)', () => {
      expect(formatTurn([], 'w')).toBe('no move');
    });

    it('formats single move', () => {
      const moves: CheckerMove[] = [{ from: 24, to: 20, die: 4, hit: false }];
      expect(formatTurn(moves, 'w')).toBe('24/20');
    });
  });

  describe('formatDice', () => {
    it('formats normal dice', () => {
      expect(formatDice([3, 1])).toBe('31');
    });

    it('formats doubles', () => {
      expect(formatDice([6, 6])).toBe('66');
    });
  });
});
