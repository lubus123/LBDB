/** Roll a single die (1-6). Client-side random for local play. */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Roll two dice */
export function rollDice(): [number, number] {
  return [rollDie(), rollDie()];
}

/** Get the list of dice values to use (doubles = 4x) */
export function diceToMoves(dice: [number, number]): number[] {
  if (dice[0] === dice[1]) {
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return [dice[0], dice[1]];
}

/** Check if dice are doubles */
export function isDoubles(dice: [number, number]): boolean {
  return dice[0] === dice[1];
}
