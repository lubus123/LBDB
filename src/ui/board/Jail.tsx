import { Component, For, Show, createSignal, createMemo } from 'solid-js';
import type { Color } from '../../shared/types';

interface JailProps {
  whiteCount: number;
  blackCount: number;
  turn: Color;
  canMoveFromBar: boolean;
  isSelected: boolean;
  onBarClick: () => void;
  onDragEnd?: (clientX: number, clientY: number) => void;
}

const BAR_COUNT = 7;
const DRAG_THRESHOLD = 8; // px before we consider it a drag vs tap

const Jail: Component<JailProps> = (props) => {
  const totalJailed = createMemo(() => props.whiteCount + props.blackCount);

  const [isDragging, setIsDragging] = createSignal(false);
  const [dragPos, setDragPos] = createSignal({ x: 0, y: 0 });
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [didDrag, setDidDrag] = createSignal(false);
  const dragColor = createMemo((): Color => props.turn);

  let cellRef: HTMLDivElement | undefined;

  function handlePointerDown(e: PointerEvent, el: HTMLDivElement) {
    if (!props.canMoveFromBar) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture on the cell element itself, not e.target (which could be a child)
    el.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDidDrag(false);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging()) return;
    e.preventDefault();
    const pos = { x: e.clientX, y: e.clientY };
    setDragPos(pos);
    // Check if we've moved enough to count as a drag
    const dx = pos.x - dragStart().x;
    const dy = pos.y - dragStart().y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      setDidDrag(true);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging()) return;
    e.preventDefault();
    setIsDragging(false);

    if (didDrag()) {
      // Was a real drag — drop on the board
      props.onDragEnd?.(e.clientX, e.clientY);
    } else {
      // Was a tap — select the bar checker
      props.onBarClick();
    }
  }

  function handlePointerCancel() {
    // Browser cancelled the pointer stream (iOS gesture arbitration, etc.)
    if (!isDragging()) return;
    setIsDragging(false);
    setDidDrag(false);
  }

  function renderCell(color: Color) {
    const isActive = () => props.canMoveFromBar && props.turn === color;
    const isSelected = () => props.isSelected && props.turn === color;

    return (
      <div
        ref={(el) => { cellRef = el; }}
        class={`jail-cell ${isActive() ? 'jail-can-play' : ''} ${isSelected() ? 'jail-selected' : ''}`}
        style={isActive() ? { "touch-action": "none" } : undefined}
        onPointerDown={(e) => isActive() ? handlePointerDown(e, e.currentTarget) : undefined}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div class={`jail-checker ${color === 'w' ? 'white' : 'black'}`} />
        <div class={`jail-bars-overlay ${isActive() ? 'bars-opening' : ''}`}>
          <For each={Array.from({ length: BAR_COUNT }, (_, i) => i)}>
            {() => <div class="jail-bar-thick" />}
          </For>
        </div>
        <div class={`jail-crossbar top ${isActive() ? 'bars-opening' : ''}`} />
        <div class={`jail-crossbar bottom ${isActive() ? 'bars-opening' : ''}`} />
      </div>
    );
  }

  return (
    <Show when={totalJailed() > 0}>
      <div class="jail-strip">
        <div class="jail-label">JAIL</div>
        <div class="jail-cells">
          <For each={Array.from({ length: props.whiteCount }, (_, i) => i)}>
            {() => renderCell('w')}
          </For>
          <For each={Array.from({ length: props.blackCount }, (_, i) => i)}>
            {() => renderCell('b')}
          </For>
        </div>

        <Show when={isDragging() && didDrag()}>
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
