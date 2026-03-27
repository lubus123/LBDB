import { Component, For, Show, createSignal, createMemo, onCleanup } from 'solid-js';
import type { Color } from '../../shared/types';

/**
 * Jail strip — sits below the board.
 * Shows captured checkers behind thick grey bars.
 * When the checker can play, bars animate open (slow start, fast finish).
 * Supports click-to-select and drag-to-play.
 */

const CHECKER_SIZE = 36;  // Diameter in pixels
const BAR_THICKNESS = 4;
const BAR_COUNT = 7;
const BAR_GAP = 7;
const BAR_COLOR = '#7a7a7a';
const BAR_COLOR_DARK = '#555';

interface JailProps {
  whiteCount: number;
  blackCount: number;
  turn: Color;
  canMoveFromBar: boolean;
  isSelected: boolean;
  onBarClick: () => void;
  /** Called when drag ends — passes client x,y for hit-testing the board */
  onDragEnd?: (clientX: number, clientY: number) => void;
}

const Jail: Component<JailProps> = (props) => {
  const totalJailed = createMemo(() => props.whiteCount + props.blackCount);

  // Drag state
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragPos, setDragPos] = createSignal({ x: 0, y: 0 });
  const dragColor = createMemo((): Color => props.turn);

  function handlePointerDown(e: PointerEvent) {
    if (!props.canMoveFromBar) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging()) return;
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging()) return;
    setIsDragging(false);
    // If we barely moved, treat as a click
    props.onDragEnd?.(e.clientX, e.clientY);
  }

  return (
    <Show when={totalJailed() > 0}>
      <div class="jail-strip">
        <div class="jail-label">JAIL</div>
        <div class="jail-cells">
          {/* White jailed checkers */}
          <For each={Array.from({ length: props.whiteCount }, (_, i) => i)}>
            {() => (
              <div
                class={`jail-cell ${props.canMoveFromBar && props.turn === 'w' ? 'jail-can-play' : ''} ${props.isSelected && props.turn === 'w' ? 'jail-selected' : ''}`}
                onClick={props.canMoveFromBar && props.turn === 'w' ? () => props.onBarClick() : undefined}
                onPointerDown={props.canMoveFromBar && props.turn === 'w' ? handlePointerDown : undefined}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div class="jail-checker white" />
                <div class={`jail-bars-overlay ${props.canMoveFromBar && props.turn === 'w' ? 'bars-opening' : ''}`}>
                  <For each={Array.from({ length: BAR_COUNT }, (_, i) => i)}>
                    {() => <div class="jail-bar-thick" />}
                  </For>
                </div>
                {/* Crossbars */}
                <div class={`jail-crossbar top ${props.canMoveFromBar && props.turn === 'w' ? 'bars-opening' : ''}`} />
                <div class={`jail-crossbar bottom ${props.canMoveFromBar && props.turn === 'w' ? 'bars-opening' : ''}`} />
              </div>
            )}
          </For>

          {/* Black jailed checkers */}
          <For each={Array.from({ length: props.blackCount }, (_, i) => i)}>
            {() => (
              <div
                class={`jail-cell ${props.canMoveFromBar && props.turn === 'b' ? 'jail-can-play' : ''} ${props.isSelected && props.turn === 'b' ? 'jail-selected' : ''}`}
                onClick={props.canMoveFromBar && props.turn === 'b' ? () => props.onBarClick() : undefined}
                onPointerDown={props.canMoveFromBar && props.turn === 'b' ? handlePointerDown : undefined}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div class="jail-checker black" />
                <div class={`jail-bars-overlay ${props.canMoveFromBar && props.turn === 'b' ? 'bars-opening' : ''}`}>
                  <For each={Array.from({ length: BAR_COUNT }, (_, i) => i)}>
                    {() => <div class="jail-bar-thick" />}
                  </For>
                </div>
                <div class={`jail-crossbar top ${props.canMoveFromBar && props.turn === 'b' ? 'bars-opening' : ''}`} />
                <div class={`jail-crossbar bottom ${props.canMoveFromBar && props.turn === 'b' ? 'bars-opening' : ''}`} />
              </div>
            )}
          </For>
        </div>

        {/* Floating drag ghost */}
        <Show when={isDragging()}>
          <div
            class="drag-ghost"
            style={{
              left: `${dragPos().x}px`,
              top: `${dragPos().y}px`,
            }}
          >
            <div class={`jail-checker ${dragColor() === 'w' ? 'white' : 'black'}`} />
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default Jail;
