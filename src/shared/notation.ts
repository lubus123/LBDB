import type { CheckerMove, Color } from './types';
import { W_BAR, B_BAR } from './constants';

/** Format a source point (from). 0 = white bar, 25 = black bar. */
function fromLabel(point: number): string {
  if (point === W_BAR || point === B_BAR) return 'bar';
  return String(point);
}

/** Format a destination point (to). 0 = white off, 25 = black off, 1-24 = normal point. */
function toLabel(point: number): string {
  if (point <= 0 || point >= 25) return 'off';
  return String(point);
}

/** Format a single checker move: "8/5", "bar/20", "6/off" */
export function formatMove(move: CheckerMove, color: Color): string {
  const from = fromLabel(move.from);
  const to = toLabel(move.to);
  return `${from}/${to}`;
}

/** Format a complete turn's moves: "8/5 6/5" */
export function formatTurn(moves: CheckerMove[], color: Color): string {
  if (moves.length === 0) return 'no move';
  return moves.map(m => formatMove(m, color)).join(' ');
}

/** Format dice: "31", "66" */
export function formatDice(dice: [number, number]): string {
  return `${dice[0]}${dice[1]}`;
}
