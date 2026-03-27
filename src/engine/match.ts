import type { MatchState, GameResult, Color } from '../shared/types';

/** Create a new match state */
export function newMatch(length: number): MatchState {
  return {
    score: [0, 0],
    length,
    crawfordUsed: false,
    isCrawford: false,
    gameNumber: 1,
  };
}

/** Update match state after a game ends */
export function updateMatch(match: MatchState, result: GameResult): MatchState {
  const newScore: [number, number] = [...match.score];
  if (result.winner === 'w') {
    newScore[0] += result.points;
  } else {
    newScore[1] += result.points;
  }

  // Crawford rule: when a player reaches match point - 1,
  // the next game has no doubling cube
  let isCrawford = false;
  let crawfordUsed = match.crawfordUsed;

  if (!crawfordUsed) {
    const matchPoint = match.length;
    if (newScore[0] === matchPoint - 1 || newScore[1] === matchPoint - 1) {
      isCrawford = true;
      crawfordUsed = true;
    }
  }

  return {
    score: newScore,
    length: match.length,
    crawfordUsed,
    isCrawford,
    gameNumber: match.gameNumber + 1,
  };
}

/** Check if the match is over */
export function isMatchOver(match: MatchState): boolean {
  return match.score[0] >= match.length || match.score[1] >= match.length;
}

/** Get the match winner */
export function matchWinner(match: MatchState): Color | null {
  if (match.score[0] >= match.length) return 'w';
  if (match.score[1] >= match.length) return 'b';
  return null;
}
