import type { GameState, Color, CheckerMove, GameResult, GameResultType, BoardArray } from '../shared/types';
import { createInitialGameState, CHECKERS_PER_PLAYER, W_BAR, B_BAR } from '../shared/constants';
import { cloneBoard, applyMove, countCheckers, checkersAt } from './board';
import { rollDice, diceToMoves } from './dice';
import { generateAllTurns, hasAnyMoves, legalDestinations, movableCheckers } from './moves';
import { canDouble, offerDouble, acceptDouble } from './cube';

/** Create a fresh game */
export function newGame(gameId: string = 'local'): GameState {
  return createInitialGameState(gameId);
}

/** Create a game from a custom board position */
export function newGameFromPosition(
  board: BoardArray, whiteOff = 0, blackOff = 0
): GameState {
  return {
    board: [...board],
    turn: 'w',
    dice: null,
    movesLeft: [],
    cube: { value: 1, owner: 'center', offered: false },
    whiteOff,
    blackOff,
    phase: 'waiting',
    gameId: 'dev',
    ply: 0,
    turnMoves: [],
  };
}

/** Roll dice for the current player */
export function doRoll(state: GameState): GameState {
  if (state.phase !== 'waiting') return state;

  const dice = rollDice();
  const movesLeft = diceToMoves(dice);

  const newState: GameState = {
    ...state,
    dice,
    movesLeft,
    phase: 'moving',
    turnMoves: [],
    boardAtTurnStart: [...state.board],
    whiteOffAtTurnStart: state.whiteOff,
    blackOffAtTurnStart: state.blackOff,
  };

  // Check if player has any legal moves
  if (!hasAnyMoves(newState.board, movesLeft, newState.turn)) {
    // Forced pass - skip to next player
    return endTurn(newState);
  }

  return newState;
}

/** Offer the doubling cube */
export function doDouble(state: GameState): GameState {
  if (state.phase !== 'waiting') return state;
  if (!canDouble(state.cube, state.turn)) return state;

  return {
    ...state,
    cube: offerDouble(state.cube),
    phase: 'cubeOffered',
  };
}

/** Accept a doubling offer */
export function doAcceptDouble(state: GameState): GameState {
  if (state.phase !== 'cubeOffered') return state;

  const opponent = state.turn === 'w' ? 'b' : 'w';
  return {
    ...state,
    cube: acceptDouble(state.cube, opponent as Color),
    phase: 'waiting',
  };
}

/** Drop (decline) a doubling offer - game over */
export function doDropDouble(state: GameState): GameState {
  if (state.phase !== 'cubeOffered') return state;

  return {
    ...state,
    phase: 'gameOver',
  };
}

/** Apply a single checker move during a turn */
export function doMove(state: GameState, move: CheckerMove): GameState {
  if (state.phase !== 'moving') return state;

  // Validate move is legal
  const sources = movableCheckers(state.board, state.movesLeft, state.turn);
  if (!sources.includes(move.from)) return state;
  const dests = legalDestinations(state.board, move.from, state.movesLeft, state.turn);
  if (!dests.includes(move.to)) return state;

  const newBoard = cloneBoard(state.board);
  applyMove(newBoard, move, state.turn);

  // Remove the used die from movesLeft
  const newMovesLeft = [...state.movesLeft];
  const dieIdx = newMovesLeft.indexOf(move.die);
  if (dieIdx === -1) return state; // invalid die
  newMovesLeft.splice(dieIdx, 1);

  // Update borne off count
  let whiteOff = state.whiteOff;
  let blackOff = state.blackOff;
  if (move.to <= 0 || move.to >= 25) {
    if (state.turn === 'w') whiteOff++;
    else blackOff++;
  }

  const newState: GameState = {
    ...state,
    board: newBoard,
    movesLeft: newMovesLeft,
    whiteOff,
    blackOff,
    turnMoves: [...state.turnMoves, move],
  };

  // Check for game over
  if (whiteOff === CHECKERS_PER_PLAYER || blackOff === CHECKERS_PER_PLAYER) {
    return { ...newState, phase: 'gameOver' };
  }

  // Check if turn is over (no dice left or no more moves)
  if (newMovesLeft.length === 0 || !hasAnyMoves(newBoard, newMovesLeft, state.turn)) {
    return endTurn(newState);
  }

  return newState;
}

/** Undo the last move in the current turn */
export function undoMove(state: GameState): GameState {
  if (state.phase !== 'moving' || state.turnMoves.length === 0) return state;
  if (!state.dice) return state;

  const movesToReplay = state.turnMoves.slice(0, -1);
  const lastMove = state.turnMoves[state.turnMoves.length - 1];

  // Use saved turn-start snapshot if available, otherwise fall back to reversal
  const startBoard = state.boardAtTurnStart
    ? [...state.boardAtTurnStart]
    : cloneBoard(state.board);
  let whiteOff = state.whiteOffAtTurnStart ?? state.whiteOff;
  let blackOff = state.blackOffAtTurnStart ?? state.blackOff;

  if (state.boardAtTurnStart) {
    // Replay all moves except the last from the clean turn-start board
    const newBoard = startBoard;
    for (const move of movesToReplay) {
      applyMove(newBoard, move, state.turn);
      if (move.to <= 0 || move.to >= 25) {
        if (state.turn === 'w') whiteOff++;
        else blackOff++;
      }
    }

    // Reconstruct movesLeft: start with full dice, remove used ones
    const originalMovesLeft = diceToMoves(state.dice);
    for (const move of movesToReplay) {
      const idx = originalMovesLeft.indexOf(move.die);
      if (idx !== -1) originalMovesLeft.splice(idx, 1);
    }

    return {
      ...state,
      board: newBoard,
      movesLeft: originalMovesLeft,
      whiteOff,
      blackOff,
      turnMoves: movesToReplay,
    };
  }

  // Fallback: incremental reversal (for states without boardAtTurnStart, e.g. from server)
  const newBoard = cloneBoard(state.board);
  const sign = state.turn === 'w' ? 1 : -1;
  const opponentBar = state.turn === 'w' ? B_BAR : W_BAR;

  // Reverse: remove from destination
  if (lastMove.to > 0 && lastMove.to < 25) {
    newBoard[lastMove.to] -= sign;
  }

  // If it was a bear off, adjust count
  whiteOff = state.whiteOff;
  blackOff = state.blackOff;
  if (lastMove.to <= 0 || lastMove.to >= 25) {
    if (state.turn === 'w') whiteOff--;
    else blackOff--;
  }

  // Reverse hit: restore opponent from bar
  // opponentBar holds negative values for black (B_BAR) and positive for white (W_BAR).
  // To REMOVE one opponent checker from bar: decrement the magnitude, i.e. add the
  // opposite-sign unit for that player's encoding.
  // To RESTORE the blot on the destination square: subtract our own sign so the square
  // reflects the opponent's checker.
  if (lastMove.hit) {
    newBoard[opponentBar] -= (state.turn === 'w' ? -1 : 1); // remove opponent from bar
    newBoard[lastMove.to] -= sign;                           // restore opponent blot on dest
  }

  // Restore checker to source
  newBoard[lastMove.from] += sign;

  return {
    ...state,
    board: newBoard,
    movesLeft: [...state.movesLeft, lastMove.die],
    whiteOff,
    blackOff,
    turnMoves: movesToReplay,
  };
}

/** End the current turn, switch to next player */
function endTurn(state: GameState): GameState {
  const nextTurn: Color = state.turn === 'w' ? 'b' : 'w';
  return {
    ...state,
    turn: nextTurn,
    dice: null,
    movesLeft: [],
    phase: 'waiting',
    ply: state.ply + 1,
    turnMoves: [],
  };
}

/** Confirm/submit the current turn (when player has used all possible dice) */
export function confirmTurn(state: GameState): GameState {
  if (state.phase !== 'moving') return state;
  return endTurn(state);
}

/** Determine the game result */
export function getGameResult(state: GameState): GameResult | null {
  if (state.phase !== 'gameOver') return null;

  // Dropped double
  if (state.cube.offered) {
    const winner = state.turn; // the one who offered
    return {
      winner,
      type: 'single',
      cubeValue: state.cube.value,
      points: state.cube.value,
    };
  }

  // Someone bore off all checkers
  let winner: Color;
  if (state.whiteOff === CHECKERS_PER_PLAYER) {
    winner = 'w';
  } else if (state.blackOff === CHECKERS_PER_PLAYER) {
    winner = 'b';
  } else {
    return null;
  }

  const loser: Color = winner === 'w' ? 'b' : 'w';
  const loserOff = loser === 'w' ? state.whiteOff : state.blackOff;

  let type: GameResultType = 'single';
  if (loserOff === 0) {
    // Gammon or backgammon
    const loserBar = loser === 'w' ? 0 : 25;
    const winnerHome = winner === 'w' ? [1, 6] : [19, 24];

    // Check if loser has checkers in winner's home or on bar
    let hasInWinnerHome = checkersAt(state.board, loserBar, loser) > 0;
    if (!hasInWinnerHome) {
      for (let i = winnerHome[0]; i <= winnerHome[1]; i++) {
        if (checkersAt(state.board, i, loser) > 0) {
          hasInWinnerHome = true;
          break;
        }
      }
    }

    type = hasInWinnerHome ? 'backgammon' : 'gammon';
  }

  const multiplier = type === 'backgammon' ? 3 : type === 'gammon' ? 2 : 1;
  return {
    winner,
    type,
    cubeValue: state.cube.value,
    points: multiplier * state.cube.value,
  };
}
