/** Player color. White moves 24->1 (bearing off past 0), Black moves 1->24 (bearing off past 25). */
export type Color = 'w' | 'b';

/**
 * Board encoded as a 26-element number array.
 * Index 0  = White's bar
 * Index 1-24 = Points 1-24
 * Index 25 = Black's bar
 *
 * Positive values = white checkers
 * Negative values = black checkers
 * GNU Backgammon convention.
 */
export type BoardArray = number[];

export interface CubeState {
  value: number;              // 1, 2, 4, 8, 16, 32, 64
  owner: Color | 'center';   // who last doubled (or center at start)
  offered: boolean;           // is a double currently offered?
}

export type TurnPhase =
  | 'waiting'      // waiting for player to roll or double
  | 'cubeOffered'  // double offered, opponent must accept/drop
  | 'rolling'      // dice animation (client-only)
  | 'moving'       // dice rolled, player selecting moves
  | 'gameOver';

export interface GameState {
  board: BoardArray;
  turn: Color;
  dice: [number, number] | null;
  movesLeft: number[];        // remaining dice values to use
  cube: CubeState;
  whiteOff: number;           // checkers borne off (0-15)
  blackOff: number;
  phase: TurnPhase;
  gameId: string;
  ply: number;                // move counter
  turnMoves: CheckerMove[];   // moves made so far this turn
  boardAtTurnStart?: BoardArray;   // snapshot for reliable undo
  whiteOffAtTurnStart?: number;
  blackOffAtTurnStart?: number;
}

export interface MatchState {
  score: [number, number];    // [white, black]
  length: number;             // e.g., 7 for first-to-7
  crawfordUsed: boolean;
  isCrawford: boolean;
  gameNumber: number;
}

/** A single checker move: from point -> to point. */
export interface CheckerMove {
  from: number;   // 0=white bar, 1-24=point, 25=black bar
  to: number;     // 0=bear off (black direction), 25=bear off (white direction), 1-24=point
  die: number;    // which die value was used
  hit: boolean;   // did this move send an opponent to the bar?
}

/** A complete turn is 1-4 checker moves (or a forced pass). */
export interface Turn {
  dice: [number, number];
  moves: CheckerMove[];
  player: Color;
  ply: number;
  timestamp: number;
}

export type GameResultType = 'single' | 'gammon' | 'backgammon';

export interface GameResult {
  winner: Color;
  type: GameResultType;
  cubeValue: number;
  points: number;             // type multiplier * cube value
}
