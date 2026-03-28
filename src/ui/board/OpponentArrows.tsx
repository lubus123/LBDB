import { Component, For, Show } from 'solid-js';
import type { CheckerMove } from '../../shared/types';
import { pointX, pointToCol } from './Board';

interface OpponentArrowsProps {
  moves: CheckerMove[];
  visible: boolean;
  fading: boolean;
  flipped: boolean;
  direction: 'left' | 'right';
}

const BAR_X = 16 + 6 + 6 * 52 + 20; // approximate bar center x
const BEAR_OFF_RIGHT_X = 780 - 16; // white bear-off edge
const BEAR_OFF_LEFT_X = 16; // black bear-off edge
const TOP_Y = 70;
const BOT_Y = 570;

function rowY(top: boolean): number {
  return top ? TOP_Y : BOT_Y;
}

function buildArrowPath(from: number, to: number, flipped: boolean, direction: 'left' | 'right'): string {
  // Handle bar (from)
  let srcX: number, srcY: number;
  if (from === 0 || from === 25) {
    srcX = BAR_X;
    // Bar checkers enter on the appropriate side
    const enterTop = from === 25 ? !flipped : flipped;
    srcY = rowY(enterTop);
  } else {
    const src = pointToCol(from, flipped, direction);
    srcX = pointX(src.col);
    srcY = rowY(src.top);
  }

  // Handle bear-off (to)
  let dstX: number, dstY: number;
  const whiteRight = direction === 'right';
  if (to === 0) {
    dstX = whiteRight ? BEAR_OFF_RIGHT_X : BEAR_OFF_LEFT_X;
    dstY = BOT_Y;
  } else if (to === 25) {
    dstX = whiteRight ? BEAR_OFF_LEFT_X : BEAR_OFF_RIGHT_X;
    dstY = TOP_Y;
  } else {
    const dst = pointToCol(to, flipped, direction);
    dstX = pointX(dst.col);
    dstY = rowY(dst.top);
  }

  // Same row — simple horizontal with slight curve
  if (Math.abs(srcY - dstY) < 10) {
    const midX = (srcX + dstX) / 2;
    const curveY = srcY + (srcY < 320 ? -20 : 20); // curve away from board center
    return `M ${srcX} ${srcY} Q ${midX} ${curveY} ${dstX} ${dstY}`;
  }

  // Cross-row — go to bar, curve across, continue
  const midY = (srcY + dstY) / 2;
  return `M ${srcX} ${srcY} L ${BAR_X} ${srcY} Q ${BAR_X} ${midY} ${BAR_X} ${dstY} L ${dstX} ${dstY}`;
}

const OpponentArrows: Component<OpponentArrowsProps> = (props) => {
  return (
    <Show when={props.visible}>
      <g class={`opponent-arrows ${props.fading ? 'fading' : ''}`}>
        <defs>
          <marker
            id="arrow-head"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0,0 8,3 0,6" fill="rgba(255, 180, 50, 0.7)" />
          </marker>
        </defs>
        <For each={props.moves}>
          {(move, i) => (
            <path
              d={buildArrowPath(move.from, move.to, props.flipped, props.direction)}
              stroke="rgba(255, 180, 50, 0.45)"
              stroke-width={4}
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
              marker-end="url(#arrow-head)"
              style={{ 'animation-delay': `${i() * 100}ms` }}
            />
          )}
        </For>
      </g>
    </Show>
  );
};

export default OpponentArrows;
