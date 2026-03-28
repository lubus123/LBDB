import { Component, For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import type { BoardArray, Color } from '../../shared/types';
import { W_BAR, B_BAR } from '../../shared/constants';
import { checkersAt } from '../../engine/board';

// Board layout
const BOARD_W = 780;
const BOARD_H = 640;
const MARGIN = 16;
const BAR_W = 40;
const POINT_W = 52;
const CHECKER_R = 22;
const CHECKER_SPACING = 40;
const BEAR_OFF_W = 32;
const HALF_POINTS = 6;

const COLORS = {
  boardBg: '#1e120c',
  boardFrame: '#3d2817',
  pointDark: '#8b4513',
  pointLight: '#d4a76a',
  bar: '#2a1a10',
  checkerWhite: '#e8dcc8',
  checkerWhiteBorder: '#c4b8a4',
  checkerBlack: '#2c2c2c',
  checkerBlackBorder: '#1a1a1a',
  highlight: 'rgba(74, 158, 255, 0.35)',
  highlightStroke: '#4a9eff',
  moveableGlow: 'rgba(74, 158, 255, 0.15)',
  bearOff: '#2a1810',
};

/** Reverse lookup: board point number → {col, top} for pixel position calculation */
export function pointToCol(point: number, flipped: boolean, direction: 'left' | 'right' = 'right'): { col: number; top: boolean } {
  for (let col = 0; col < 12; col++) {
    if (colToPoint(col, true, flipped, direction) === point) return { col, top: true };
    if (colToPoint(col, false, flipped, direction) === point) return { col, top: false };
  }
  return { col: 0, top: true };
}

export interface BoardProps {
  board: BoardArray;
  turn: Color;
  whiteOff: number;
  blackOff: number;
  selectedPoint: number | null;
  moveablePoints: number[];
  legalDests: number[];
  onPointClick: (point: number) => void;
  onBearOffClick: () => void;
  flipped: boolean;
  direction: 'left' | 'right';
  onDragStart?: (point: number) => void;
  onDragEnd?: (clientX: number, clientY: number) => void;
  onDragMove?: (clientX: number, clientY: number) => void;
}

// Export these so the Jail component can calculate drop targets
export const BOARD_VIEWBOX = { w: BOARD_W, h: BOARD_H };

export function colToPoint(col: number, top: boolean, flipped: boolean, direction: 'left' | 'right' = 'right'): number {
  if (direction === 'left') {
    if (flipped) return top ? col + 1 : 24 - col;
    return top ? 24 - col : col + 1;
  }
  // direction === 'right': white home (1-6) at bottom-right
  if (flipped) return top ? 12 - col : col + 13;
  return top ? col + 13 : 12 - col;
}

export function pointX(col: number): number {
  const halfCol = col < HALF_POINTS ? col : col + 1;
  const leftEdge = MARGIN + 6;
  return leftEdge + halfCol * POINT_W + POINT_W / 2 + (col >= HALF_POINTS ? BAR_W : 0);
}

export function checkerY(index: number, top: boolean): number {
  const edge = top ? MARGIN + 6 : BOARD_H - MARGIN - 6;
  const dir = top ? 1 : -1;
  const maxNormal = 5;
  const spacing = index < maxNormal ? CHECKER_SPACING : CHECKER_SPACING * 0.6;
  return edge + dir * (CHECKER_R + index * spacing);
}

const DRAG_THRESHOLD = 8;

const Board: Component<BoardProps> = (props) => {
  let dragState: { point: number; startX: number; startY: number; dragging: boolean } | null = null;

  function handlePointerDown(point: number, e: PointerEvent) {
    if (!props.onDragStart) return;
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    dragState = { point, startX: e.clientX, startY: e.clientY, dragging: false };
  }

  function handlePointerMove(e: PointerEvent) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragState.dragging = true;
      props.onDragStart?.(dragState.point);
    }
    if (dragState.dragging) {
      props.onDragMove?.(e.clientX, e.clientY);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (!dragState) return;
    if (dragState.dragging) {
      props.onDragEnd?.(e.clientX, e.clientY);
    } else {
      // Tap — use click handler
      props.onPointClick(dragState.point);
    }
    dragState = null;
  }

  const pointsData = createMemo(() => {
    const data: Array<{
      point: number;
      col: number;
      top: boolean;
      x: number;
      checkers: number;
      color: Color | null;
      isMoveable: boolean;
      isSelected: boolean;
      isDest: boolean;
    }> = [];

    for (let col = 0; col < 12; col++) {
      for (const top of [true, false]) {
        const point = colToPoint(col, top, props.flipped, props.direction);
        const val = props.board[point];
        const color: Color | null = val > 0 ? 'w' : val < 0 ? 'b' : null;
        const checkers = Math.abs(val);
        const x = pointX(col);

        data.push({
          point, col, top, x, checkers, color,
          isMoveable: props.moveablePoints.includes(point),
          isSelected: props.selectedPoint === point,
          isDest: props.legalDests.includes(point),
        });
      }
    }
    return data;
  });

  const barX = MARGIN + 6 + HALF_POINTS * POINT_W + BAR_W / 2;

  const isBearOffDest = createMemo(() => {
    return props.legalDests.includes(0) || props.legalDests.includes(25);
  });

  return (
    <svg
      class="board-svg"
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#2a1a10" />
          <stop offset="15%" stop-color="#3d2817" />
          <stop offset="50%" stop-color="#4a3020" />
          <stop offset="85%" stop-color="#3d2817" />
          <stop offset="100%" stop-color="#2a1a10" />
        </linearGradient>
      </defs>

      {/* Board frame + background */}
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={6} fill={COLORS.boardFrame} />
      <rect x={MARGIN} y={MARGIN} width={BOARD_W - MARGIN * 2} height={BOARD_H - MARGIN * 2} fill={COLORS.boardBg} />

      {/* Bar divider — raised center strip */}
      <rect
        x={barX - BAR_W / 2} y={MARGIN}
        width={BAR_W} height={BOARD_H - MARGIN * 2}
        fill="url(#barGrad)"
      />
      {/* Bar edge lines for definition */}
      <line x1={barX - BAR_W / 2} y1={MARGIN} x2={barX - BAR_W / 2} y2={BOARD_H - MARGIN}
        stroke="#4a3525" stroke-width={1.5} />
      <line x1={barX + BAR_W / 2} y1={MARGIN} x2={barX + BAR_W / 2} y2={BOARD_H - MARGIN}
        stroke="#4a3525" stroke-width={1.5} />

      {/* Points (triangles) */}
      <For each={pointsData()}>
        {(pd) => {
          const triH = (BOARD_H - MARGIN * 2) / 2 - 10;
          const x = pd.x;
          const isEven = pd.col % 2 === 0;
          const fillColor = (isEven !== pd.top) ? COLORS.pointDark : COLORS.pointLight;

          let triPoints: string;
          if (pd.top) {
            const y0 = MARGIN;
            triPoints = `${x - POINT_W / 2 + 2},${y0} ${x + POINT_W / 2 - 2},${y0} ${x},${y0 + triH}`;
          } else {
            const y0 = BOARD_H - MARGIN;
            triPoints = `${x - POINT_W / 2 + 2},${y0} ${x + POINT_W / 2 - 2},${y0} ${x},${y0 - triH}`;
          }

          return (
            <g>
              <polygon points={triPoints} fill={fillColor} opacity={0.85} />

              <Show when={pd.isDest}>
                <circle
                  cx={x}
                  cy={pd.top ? MARGIN + CHECKER_R + 6 : BOARD_H - MARGIN - CHECKER_R - 6}
                  r={CHECKER_R + 2}
                  fill={COLORS.highlight}
                  stroke={COLORS.highlightStroke}
                  stroke-width={2}
                  class="move-dest visible"
                  onClick={() => props.onPointClick(pd.point)}
                  style={{ cursor: 'pointer' }}
                />
              </Show>

              <Show when={pd.isMoveable && !pd.isSelected}>
                <rect
                  x={x - POINT_W / 2 + 2}
                  y={pd.top ? MARGIN : BOARD_H / 2}
                  width={POINT_W - 4}
                  height={(BOARD_H - MARGIN * 2) / 2}
                  fill={COLORS.moveableGlow}
                  rx={2}
                />
              </Show>

              <For each={Array.from({ length: pd.checkers }, (_, i) => i)}>
                {(i) => {
                  const cy = checkerY(i, pd.top);
                  const fill = pd.color === 'w' ? COLORS.checkerWhite : COLORS.checkerBlack;
                  const stroke = pd.color === 'w' ? COLORS.checkerWhiteBorder : COLORS.checkerBlackBorder;
                  const isClickable = pd.isMoveable && i === pd.checkers - 1;

                  return (
                    <g>
                      <circle
                        cx={x} cy={cy} r={CHECKER_R}
                        fill={fill}
                        stroke={pd.isSelected && i === pd.checkers - 1 ? COLORS.highlightStroke : stroke}
                        stroke-width={pd.isSelected && i === pd.checkers - 1 ? 3 : 1.5}
                        class={`checker ${isClickable ? 'movable' : ''} ${pd.isSelected && i === pd.checkers - 1 ? 'selected' : ''}`}
                        onClick={isClickable && !props.onDragStart ? () => props.onPointClick(pd.point) : undefined}
                        onPointerDown={isClickable ? (e: PointerEvent) => handlePointerDown(pd.point, e) : undefined}
                        onPointerMove={isClickable ? handlePointerMove : undefined}
                        onPointerUp={isClickable ? handlePointerUp : undefined}
                      />
                      <Show when={pd.checkers > 5 && i === pd.checkers - 1}>
                        <text
                          x={x} y={cy + 5}
                          text-anchor="middle" font-size="13" font-weight="700"
                          fill={pd.color === 'w' ? '#333' : '#ddd'}
                          style={{ "pointer-events": "none" }}
                        >{pd.checkers}</text>
                      </Show>
                    </g>
                  );
                }}
              </For>

              <Show when={pd.isDest}>
                <rect
                  x={x - POINT_W / 2} y={pd.top ? MARGIN : BOARD_H / 2}
                  width={POINT_W} height={(BOARD_H - MARGIN * 2) / 2}
                  fill="transparent"
                  onClick={() => props.onPointClick(pd.point)}
                  style={{ cursor: 'pointer' }}
                />
              </Show>
            </g>
          );
        }}
      </For>

      {/* Bear-off zone highlight — shows when bear-off is a legal destination */}
      <Show when={isBearOffDest()}>
        {(() => {
          const whiteRight = props.direction === 'right';
          const bearX = (props.turn === 'w' ? whiteRight : !whiteRight)
            ? BOARD_W - MARGIN - 24 : MARGIN;
          return (
            <rect
              x={bearX} y={MARGIN}
              width={24} height={BOARD_H - MARGIN * 2}
              fill={COLORS.highlight} rx={3}
              stroke={COLORS.highlightStroke} stroke-width={2}
              onClick={() => props.onBearOffClick()}
              style={{ cursor: 'pointer' }}
            />
          );
        })()}
      </Show>

      {/* Borne-off counters — small indicators at board edge */}
      {(() => {
        const whiteRight = props.direction === 'right';
        const whiteX = whiteRight ? BOARD_W - MARGIN / 2 : MARGIN / 2;
        const blackX = whiteRight ? MARGIN / 2 : BOARD_W - MARGIN / 2;
        return (<>
          <Show when={props.whiteOff > 0}>
            <text
              x={whiteX} y={BOARD_H / 2 + 5}
              text-anchor="middle" font-size="13" font-weight="700"
              fill={COLORS.checkerWhite} opacity={0.7}
              style={{ "pointer-events": "none" }}
            >{props.whiteOff}</text>
          </Show>
          <Show when={props.blackOff > 0}>
            <text
              x={blackX} y={BOARD_H / 2 + 5}
              text-anchor="middle" font-size="13" font-weight="700"
              fill="#888" opacity={0.7}
              style={{ "pointer-events": "none" }}
            >{props.blackOff}</text>
          </Show>
        </>);
      })()}

      {/* Point numbers */}
      <For each={Array.from({ length: 12 }, (_, i) => i)}>
        {(col) => {
          const x = pointX(col);
          const topPt = colToPoint(col, true, props.flipped, props.direction);
          const botPt = colToPoint(col, false, props.flipped, props.direction);
          return (
            <g>
              <text x={x} y={MARGIN - 3} text-anchor="middle" font-size="9" fill="#555" style={{ "pointer-events": "none" }}>
                {topPt}
              </text>
              <text x={x} y={BOARD_H - MARGIN + 13} text-anchor="middle" font-size="9" fill="#555" style={{ "pointer-events": "none" }}>
                {botPt}
              </text>
            </g>
          );
        }}
      </For>
    </svg>
  );
};

export default Board;
