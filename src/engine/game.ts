import type { GameState, Color, CheckerMove, GameResult, GameResultType } from '../shared/types';
import { createInitialGameState, CHECKERS_PER_PLAYER } from '../shared/constants';
import { cloneBoard, applyMove, countCheckers, checkersAt } from './board';
import { rollDice, diceToMoves } from './dice';
import { generateAllTurns, hasAnyMoves } from './moves';
import { canDouble, offerDouble, acceptDouble } from './cube';

/** Create a fresh game */
export function newGame(gameId: string = 'local'): GameState {
  return createInitialGameState(gameId);
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

  // Replay all moves except the last one from the turn start
  const originalMovesLeft = diceToMoves(state.dice);
  const turnsToReplay = state.turnMoves.slice(0, -1);

  // Reset to start-of-turn state
  // We need to reconstruct the board from before this turn
  // The simplest way: re-derive from a saved "turn start" board
  // For now, we reverse the last move

  const lastMove = state.turnMoves[state.turnMoves.length - 1];
  const newBoard = cloneBoard(state.board);
  const sign = state.turn === 'w' ? 1 : -1;
  const opponentBar = state.turn === 'w' ? 25 : 0;

  // Reverse: remove from destination
  if (lastMove.to > 0 && lastMove.to < 25) {
    newBoard[lastMove.to] -= sign;
  }

  // If it was a bear off, adjust count
  let whiteOff = state.whiteOff;
  let blackOff = state.blackOff;
  if (lastMove.to <= 0 || lastMove.to >= 25) {
    if (state.turn === 'w') whiteOff--;
    else blackOff--;
  }

  // Reverse hit: restore opponent from bar
  if (lastMove.hit) {
    newBoard[opponentBar] -= (state.turn === 'w' ? -1 : 1);
    newBoard[lastMove.to] += (state.turn === 'w' ? -1 : 1);
  }

  // Restore checker to source
  newBoard[lastMove.from] += sign;

  return {
    ...state,
    board: newBoard,
    movesLeft: [...state.movesLeft, lastMove.die],
    whiteOff,
    blackOff,
    turnMoves: state.turnMoves.slice(0, -1),
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
