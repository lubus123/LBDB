/**
 * Pure engine test: play full AI vs AI games and validate that
 * replaying recorded history from the initial board always yields
 * the current live board state. No browser, no UI, no network.
 */

import { describe, test, expect } from 'vitest';
import { newGame, doRoll, doMove, confirmTurn } from '../game';
import { chooseBestTurn } from '../ai';
import { cloneBoard, applyMove } from '../board';
import type { GameState, CheckerMove, Color, BoardArray } from '../../shared/types';
import { INITIAL_BOARD } from '../../shared/constants';

interface TurnRecord {
  ply: number;
  player: Color;
  dice: [number, number];
  moves: CheckerMove[];
}

/** Replay all recorded turns from the initial board */
function replayHistory(history: TurnRecord[], initialBoard: BoardArray): { board: BoardArray; wOff: number; bOff: number } {
  const board = cloneBoard(initialBoard);
  let wOff = 0, bOff = 0;
  for (const turn of history) {
    for (const move of turn.moves) {
      applyMove(board, move, turn.player);
      if ((turn.player === 'w' && move.to <= 0) || (turn.player === 'b' && move.to >= 25)) {
        if (turn.player === 'w') wOff++; else bOff++;
      }
    }
  }
  return { board, wOff, bOff };
}

function boardsEqual(a: BoardArray, b: BoardArray): boolean {
  for (let i = 0; i < 26; i++) if (a[i] !== b[i]) return false;
  return true;
}

function boardDiff(a: BoardArray, b: BoardArray): string {
  const diffs: string[] = [];
  for (let i = 0; i < 26; i++) {
    if (a[i] !== b[i]) diffs.push(`pt${i}:replay=${a[i]},live=${b[i]}`);
  }
  return diffs.join('; ');
}

function movesToStr(moves: CheckerMove[]): string {
  return moves.map(m => `${m.from}→${m.to}${m.hit ? '!' : ''} (die=${m.die})`).join(', ');
}

describe('History replay validation', () => {
  test('replaying aiResult.moves matches live state for 100 games', () => {
    let totalTurns = 0;
    let totalGames = 0;

    for (let game = 0; game < 100; game++) {
      let state = newGame();
      const history: TurnRecord[] = [];

      for (let ply = 0; ply < 200 && state.phase !== 'gameOver'; ply++) {
        // Roll dice
        const preRollTurn = state.turn;
        state = doRoll(state);

        // Forced pass: doRoll returned with dice=null, turn changed
        if (!state.dice) {
          // Can't record dice — they were consumed by endTurn inside doRoll
          // Skip (this is a known gap — forced passes from doRoll lose dice info)
          continue;
        }

        const dice = state.dice;
        const turn = state.turn;

        // AI picks best moves
        const aiResult = chooseBestTurn(state);

        // Apply each move
        for (const move of aiResult.moves) {
          const before = state;
          state = doMove(state, move);
          // Verify doMove actually applied the move
          if (state === before) {
            throw new Error(`Game ${game}, ply ${ply}: doMove rejected move ${movesToStr([move])} with movesLeft=[${before.movesLeft}]`);
          }
        }

        // Record the turn using aiResult.moves (same as GameView does)
        history.push({
          ply: ply,
          player: turn,
          dice: dice,
          moves: aiResult.moves,
        });
        totalTurns++;

        // Validate: replay all history and compare with live state
        const replayed = replayHistory(history, [...INITIAL_BOARD]);
        const boardMatch = boardsEqual(replayed.board, state.board);
        const offMatch = replayed.wOff === state.whiteOff && replayed.bOff === state.blackOff;

        if (!boardMatch || !offMatch) {
          const lastTurn = history[history.length - 1];
          throw new Error(
            `Game ${game}, turn ${history.length}, ply ${ply}: REPLAY MISMATCH!\n` +
            `  Board diffs: ${boardDiff(replayed.board, state.board)}\n` +
            `  Off: replay w=${replayed.wOff} b=${replayed.bOff}, live w=${state.whiteOff} b=${state.blackOff}\n` +
            `  Last turn: ${lastTurn.player} dice=[${lastTurn.dice}] moves=[${movesToStr(lastTurn.moves)}]\n` +
            `  Total history: ${history.length} turns`
          );
        }

        // Confirm turn if still in moving phase (partial moves, can't move more)
        if (state.phase === 'moving') {
          state = confirmTurn(state);
        }
      }
      totalGames++;
    }

    console.log(`Validated ${totalTurns} turns across ${totalGames} games — all match.`);
    expect(totalTurns).toBeGreaterThan(1000);
  });

  test('GameView-style recording: move-by-move with endTurn clearing turnMoves', () => {
    /**
     * Simulates exactly how GameView records:
     * - Human moves: each doMove called individually, recording fires when
     *   newState.phase === 'waiting' with extraMove pattern
     * - AI moves: aiResult.moves used directly
     */
    let totalTurns = 0;

    for (let game = 0; game < 100; game++) {
      let state = newGame();
      const history: TurnRecord[] = [];

      for (let ply = 0; ply < 200 && state.phase !== 'gameOver'; ply++) {
        const preRollTurn = state.turn;
        state = doRoll(state);
        if (!state.dice) continue; // forced pass

        const dice = state.dice;
        const turn = state.turn;
        const aiResult = chooseBestTurn(state);

        // Simulate GameView move-by-move pattern
        for (let i = 0; i < aiResult.moves.length; i++) {
          const move = aiResult.moves[i];
          const before = state;
          state = doMove(state, move);

          // GameView recording pattern: record when turn auto-ends
          if (state.phase === 'waiting' || state.phase === 'gameOver') {
            // GameView does: recordTurn(before, state, move)
            // which produces: moves = [...before.turnMoves, move]
            const recordedMoves = [...before.turnMoves, move];
            history.push({ ply, player: turn, dice, moves: recordedMoves });
            totalTurns++;
            break;
          }
        }

        // If turn didn't auto-end (all moves made but still has legal moves?), confirm
        if (state.phase === 'moving') {
          // GameView does: recordTurn(state, confirmTurn(state))
          // which produces: moves = state.turnMoves
          history.push({ ply, player: turn, dice, moves: state.turnMoves });
          totalTurns++;
          state = confirmTurn(state);
        }

        // Validate replay
        const replayed = replayHistory(history, [...INITIAL_BOARD]);
        if (!boardsEqual(replayed.board, state.board) || replayed.wOff !== state.whiteOff || replayed.bOff !== state.blackOff) {
          const lastTurn = history[history.length - 1];
          throw new Error(
            `Game ${game}, ply ${ply}: GameView-style MISMATCH!\n` +
            `  Board diffs: ${boardDiff(replayed.board, state.board)}\n` +
            `  Off: replay w=${replayed.wOff} b=${replayed.bOff}, live w=${state.whiteOff} b=${state.blackOff}\n` +
            `  Last turn: ${lastTurn.player} dice=[${lastTurn.dice}] moves=[${movesToStr(lastTurn.moves)}]\n` +
            `  AI planned: [${movesToStr(aiResult.moves)}]`
          );
        }
      }
    }

    console.log(`GameView-style: validated ${totalTurns} turns across 100 games — all match.`);
    expect(totalTurns).toBeGreaterThan(1000);
  });
});
