import { Component, Show, createSignal, createMemo, createEffect } from 'solid-js';
import type { GameState, Color, CheckerMove, GameResult } from '../../shared/types';
import { W_BAR, B_BAR } from '../../shared/constants';
import { cloneBoard, applyMove as applyBoardMove } from '../../engine/board';
import { newGame, doRoll, doMove, doDouble, doAcceptDouble, doDropDouble, undoMove, confirmTurn, getGameResult } from '../../engine/game';
import { legalDestinations, movableCheckers, hasAnyMoves } from '../../engine/moves';
import { canDouble } from '../../engine/cube';
import { pipCount } from '../../engine/pip';
import { formatTurn, formatDice } from '../../shared/notation';
import Board from '../board/Board';
import Dice from '../board/Dice';

interface TurnRecord {
  ply: number;
  player: Color;
  dice: [number, number];
  moves: CheckerMove[];
}

const GameView: Component<{ onExit: () => void }> = (props) => {
  const [state, setState] = createSignal<GameState>(newGame());
  const [selectedPoint, setSelectedPoint] = createSignal<number | null>(null);
  const [flipped, setFlipped] = createSignal(false);
  const [history, setHistory] = createSignal<TurnRecord[]>([]);

  const currentState = () => state();

  const moveablePoints = createMemo(() => {
    const s = currentState();
    if (s.phase !== 'moving') return [];
    return movableCheckers(s.board, s.movesLeft, s.turn);
  });

  const legalDests = createMemo(() => {
    const s = currentState();
    const sel = selectedPoint();
    if (s.phase !== 'moving' || sel === null) return [];
    return legalDestinations(s.board, sel, s.movesLeft, s.turn);
  });

  const whitePips = createMemo(() => pipCount(currentState().board, 'w'));
  const blackPips = createMemo(() => pipCount(currentState().board, 'b'));

  const gameResult = createMemo(() => getGameResult(currentState()));

  function handleRoll() {
    const s = currentState();
    if (s.phase !== 'waiting') return;
    const newState = doRoll(s);
    setState(newState);

    // If it was a forced pass (phase went back to 'waiting'), record it
    if (newState.phase === 'waiting' && newState.dice === null) {
      // Turn was auto-skipped
    }
  }

  function handleDouble() {
    const s = currentState();
    if (s.phase !== 'waiting') return;
    setState(doDouble(s));
  }

  function handleAcceptDouble() {
    setState(doAcceptDouble(currentState()));
  }

  function handleDropDouble() {
    setState(doDropDouble(currentState()));
  }

  function handlePointClick(point: number) {
    const s = currentState();
    if (s.phase !== 'moving') return;

    const sel = selectedPoint();

    // If clicking a destination
    if (sel !== null && legalDests().includes(point)) {
      // Find the move
      const dests = legalDestinations(s.board, sel, s.movesLeft, s.turn);
      if (dests.includes(point)) {
        // Determine which die to use
        const uniqueDice = [...new Set(s.movesLeft)];
        let usedDie = 0;
        for (const die of uniqueDice) {
          const dest = s.turn === 'w' ? sel - die : sel + die;
          // Handle bear off
          if (s.turn === 'w' && dest <= 0 && (point === 0)) {
            usedDie = die;
            break;
          }
          if (s.turn === 'b' && dest >= 25 && (point === 25)) {
            usedDie = die;
            break;
          }
          if (dest === point) {
            usedDie = die;
            break;
          }
        }

        if (usedDie === 0) return;

        const isHit = s.turn === 'w'
          ? s.board[point] < 0 && s.board[point] >= -1
          : s.board[point] > 0 && s.board[point] <= 1;

        const move: CheckerMove = {
          from: sel,
          to: point,
          die: usedDie,
          hit: isHit && point > 0 && point < 25,
        };

        const newState = doMove(s, move);
        setState(newState);
        setSelectedPoint(null);

        // If turn ended, record it
        if (newState.phase === 'waiting' || newState.phase === 'gameOver') {
          recordTurn(s, newState);
        }
        return;
      }
    }

    // If clicking a moveable checker
    if (moveablePoints().includes(point)) {
      setSelectedPoint(sel === point ? null : point);
      return;
    }

    // Clicking elsewhere deselects
    setSelectedPoint(null);
  }

  function handleBearOffClick() {
    const s = currentState();
    const sel = selectedPoint();
    if (sel === null || s.phase !== 'moving') return;

    const bearOffPoint = s.turn === 'w' ? 0 : 25;
    handlePointClick(bearOffPoint);
  }

  function handleUndo() {
    const newState = undoMove(currentState());
    setState(newState);
    setSelectedPoint(null);
  }

  function handleConfirm() {
    const s = currentState();
    if (s.phase !== 'moving') return;

    // Only confirm if no more moves possible
    if (!hasAnyMoves(s.board, s.movesLeft, s.turn)) {
      const newState = confirmTurn(s);
      recordTurn(s, newState);
      setState(newState);
      setSelectedPoint(null);
    }
  }

  function recordTurn(before: GameState, after: GameState) {
    if (before.dice) {
      setHistory(prev => [...prev, {
        ply: before.ply,
        player: before.turn,
        dice: before.dice!,
        moves: before.turnMoves.length > 0 ? before.turnMoves : after.turnMoves.length > 0 ? after.turnMoves : before.turnMoves,
      }]);
    }
  }

  function handleNewGame() {
    setState(newGame());
    setSelectedPoint(null);
    setHistory([]);
  }

  const canConfirmTurn = createMemo(() => {
    const s = currentState();
    return s.phase === 'moving' && !hasAnyMoves(s.board, s.movesLeft, s.turn);
  });

  const canUndo = createMemo(() => {
    const s = currentState();
    return s.phase === 'moving' && s.turnMoves.length > 0;
  });

  return (
    <div class="board-container">
      <div style={{ position: 'relative' }}>
        <Board
          board={currentState().board}
          turn={currentState().turn}
          whiteOff={currentState().whiteOff}
          blackOff={currentState().blackOff}
          selectedPoint={selectedPoint()}
          moveablePoints={moveablePoints()}
          legalDests={legalDests()}
          onPointClick={handlePointClick}
          onBearOffClick={handleBearOffClick}
          flipped={flipped()}
        />
        {/* Dice overlay on board */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            "pointer-events": 'none',
          }}
          viewBox="0 0 920 560"
        >
          <Dice dice={currentState().dice} movesLeft={currentState().movesLeft} />
        </svg>
      </div>

      <div class="side-panel">
        {/* Player info */}
        <div class="panel-section">
          <div class={`player-info ${currentState().turn === 'b' ? 'active' : ''}`}>
            <div class="color-dot black" />
            <span>Black</span>
          </div>
          <div class={`player-info ${currentState().turn === 'w' ? 'active' : ''}`}>
            <div class="color-dot white" />
            <span>White</span>
          </div>
        </div>

        {/* Pip count */}
        <div class="panel-section">
          <div class="panel-title">Pip Count</div>
          <div class="pip-display">
            <span>White: <span class="pip-value">{whitePips()}</span></span>
            <span>Black: <span class="pip-value">{blackPips()}</span></span>
          </div>
        </div>

        {/* Cube */}
        <div class="panel-section">
          <div class="panel-title">Cube</div>
          <div class="cube-display">
            <span class="cube-value">{currentState().cube.value}</span>
            <span style={{ color: 'var(--text-secondary)', "font-size": '12px' }}>
              {currentState().cube.owner === 'center' ? 'Center' :
                currentState().cube.owner === 'w' ? 'White' : 'Black'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div class="panel-section">
          <div class="panel-title">Actions</div>
          <div class="controls">
            <Show when={currentState().phase === 'waiting'}>
              <button class="btn btn-primary" onClick={handleRoll}>Roll</button>
              <Show when={canDouble(currentState().cube, currentState().turn)}>
                <button class="btn" onClick={handleDouble}>Double</button>
              </Show>
            </Show>

            <Show when={currentState().phase === 'cubeOffered'}>
              <button class="btn btn-primary" onClick={handleAcceptDouble}>Accept</button>
              <button class="btn btn-danger" onClick={handleDropDouble}>Drop</button>
            </Show>

            <Show when={currentState().phase === 'moving'}>
              <Show when={canUndo()}>
                <button class="btn btn-small" onClick={handleUndo}>Undo</button>
              </Show>
              <Show when={canConfirmTurn()}>
                <button class="btn btn-primary btn-small" onClick={handleConfirm}>Confirm</button>
              </Show>
            </Show>
          </div>
        </div>

        {/* Move history */}
        <div class="panel-section" style={{ flex: 1, "min-height": 0 }}>
          <div class="panel-title">Moves</div>
          <div class="move-list">
            {history().map(h => (
              <div class="move-entry">
                <span class="ply">{h.ply + 1}.</span>
                <span class="dice-label">{formatDice(h.dice)}</span>
                <span>{formatTurn(h.moves, h.player)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Misc controls */}
        <div class="controls">
          <button class="btn btn-small" onClick={() => setFlipped(f => !f)}>Flip</button>
          <button class="btn btn-small" onClick={handleNewGame}>New</button>
          <button class="btn btn-small" onClick={props.onExit}>Exit</button>
        </div>
      </div>

      {/* Game over modal */}
      <Show when={gameResult()}>
        {(result) => (
          <div class="game-over-overlay" onClick={handleNewGame}>
            <div class="game-over-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{result().winner === 'w' ? 'White' : 'Black'} Wins!</h2>
              <div class="result-type">
                {result().type === 'backgammon' ? 'Backgammon!' :
                  result().type === 'gammon' ? 'Gammon!' : 'Single game'}
              </div>
              <div class="points">{result().points} pts</div>
              <button class="btn btn-primary" onClick={handleNewGame}>New Game</button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default GameView;
