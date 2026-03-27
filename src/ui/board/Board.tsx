import { Component, For, Show, createMemo } from 'solid-js';
import type { BoardArray, Color, CheckerMove } from '../../shared/types';
import { W_BAR, B_BAR } from '../../shared/constants';
import { checkersAt } from '../../engine/board';

// Board layout constants
const BOARD_W = 920;
const BOARD_H = 560;
const MARGIN = 20;
const BAR_W = 40;
const POINT_W = 60;
const CHECKER_R = 24;
const CHECKER_SPACING = 42;
const BEAR_OFF_W = 36;
const HALF_POINTS = 6;

// Colors (matching CSS variables for SVG)
const COLORS = {
  boardBg: '#1e120c',
  boardFrame: '#3d2817',
  pointDark: '#8b4513',
  pointLight: '#d4a76a',
  bar: '#3d2817',
  checkerWhite: '#e8dcc8',
  checkerWhiteBorder: '#c4b8a4',
  checkerBlack: '#2c2c2c',
  checkerBlackBorder: '#1a1a1a',
  highlight: 'rgba(74, 158, 255, 0.35)',
  highlightStroke: '#4a9eff',
  moveableGlow: 'rgba(74, 158, 255, 0.15)',
  bearOff: '#2a1810',
};

interface BoardProps {
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
}

/** Map visual column index (0-11) to point number based on flip state */
function colToPoint(col: number, top: boolean, flipped: boolean): number {
  if (flipped) {
    return top ? col + 1 : 24 - col;
  }
  return top ? 24 - col : col + 1;
}

/** Get x coordinate for a point column */
function pointX(col: number): number {
  const halfCol = col < HALF_POINTS ? col : col + 1; // skip bar gap
  const leftEdge = MARGIN + BEAR_OFF_W + 8;
  return leftEdge + halfCol * POINT_W + POINT_W / 2 + (col >= HALF_POINTS ? BAR_W : 0);
}

/** Get checker y coordinate for stacking */
function checkerY(index: number, top: boolean): number {
  const edge = top ? MARGIN + 8 : BOARD_H - MARGIN - 8;
  const dir = top ? 1 : -1;
  const maxNormal = 5;
  const spacing = index < maxNormal ? CHECKER_SPACING : CHECKER_SPACING * 0.65;
  return edge + dir * (CHECKER_R + index * spacing);
}

const Board: Component<BoardProps> = (props) => {
  // Build point rendering data
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
        const point = colToPoint(col, top, props.flipped);
        const val = props.board[point];
        const color: Color | null = val > 0 ? 'w' : val < 0 ? 'b' : null;
        const checkers = Math.abs(val);
        const x = pointX(col);

        data.push({
          point,
          col,
          top,
          x,
          checkers,
          color,
          isMoveable: props.moveablePoints.includes(point),
          isSelected: props.selectedPoint === point,
          isDest: props.legalDests.includes(point),
        });
      }
    }
    return data;
  });

  // Bar data
  const barX = MARGIN + BEAR_OFF_W + 8 + HALF_POINTS * POINT_W + BAR_W / 2;

  const whiteBarCount = createMemo(() => checkersAt(props.board, W_BAR, 'w'));
  const blackBarCount = createMemo(() => checkersAt(props.board, B_BAR, 'b'));

  const isBarMoveable = createMemo(() => {
    if (props.turn === 'w') return props.moveablePoints.includes(W_BAR);
    return props.moveablePoints.includes(B_BAR);
  });

  const isBarSelected = createMemo(() => {
    if (props.turn === 'w') return props.selectedPoint === W_BAR;
    return props.selectedPoint === B_BAR;
  });

  // Bear off destination check
  const isBearOffDest = createMemo(() => {
    return props.legalDests.includes(0) || props.legalDests.includes(25);
  });

  return (
    <svg
      class="board-svg"
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Board frame */}
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={6} fill={COLORS.boardFrame} />
      <rect x={MARGIN} y={MARGIN} width={BOARD_W - MARGIN * 2} height={BOARD_H - MARGIN * 2} fill={COLORS.boardBg} />

      {/* Bar */}
      <rect
        x={barX - BAR_W / 2}
        y={MARGIN}
        width={BAR_W}
        height={BOARD_H - MARGIN * 2}
        fill={COLORS.bar}
      />

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
              <polygon
                points={triPoints}
                fill={fillColor}
                opacity={0.85}
              />

              {/* Destination highlight */}
              <Show when={pd.isDest}>
                <circle
                  cx={x}
                  cy={pd.top ? MARGIN + CHECKER_R + 8 : BOARD_H - MARGIN - CHECKER_R - 8}
                  r={CHECKER_R + 2}
                  fill={COLORS.highlight}
                  stroke={COLORS.highlightStroke}
                  stroke-width={2}
                  class="move-dest visible"
                  onClick={() => props.onPointClick(pd.point)}
                  style={{ cursor: 'pointer' }}
                />
              </Show>

              {/* Moveable glow */}
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

              {/* Checkers */}
              <For each={Array.from({ length: pd.checkers }, (_, i) => i)}>
                {(i) => {
                  const cy = checkerY(i, pd.top);
                  const fill = pd.color === 'w' ? COLORS.checkerWhite : COLORS.checkerBlack;
                  const stroke = pd.color === 'w' ? COLORS.checkerWhiteBorder : COLORS.checkerBlackBorder;
                  const isClickable = pd.isMoveable && i === pd.checkers - 1;

                  return (
                    <g>
                      <circle
                        cx={x}
                        cy={cy}
                        r={CHECKER_R}
                        fill={fill}
                        stroke={pd.isSelected && i === pd.checkers - 1 ? COLORS.highlightStroke : stroke}
                        stroke-width={pd.isSelected && i === pd.checkers - 1 ? 3 : 1.5}
                        class={`checker ${isClickable ? 'movable' : ''} ${pd.isSelected && i === pd.checkers - 1 ? 'selected' : ''}`}
                        onClick={isClickable ? () => props.onPointClick(pd.point) : undefined}
                      />
                      {/* Count badge for 6+ checkers */}
                      <Show when={pd.checkers > 5 && i === pd.checkers - 1}>
                        <text
                          x={x}
                          y={cy + 5}
                          text-anchor="middle"
                          font-size="14"
                          font-weight="700"
                          fill={pd.color === 'w' ? '#333' : '#ddd'}
                          style={{ "pointer-events": "none" }}
                        >
                          {pd.checkers}
                        </text>
                      </Show>
                    </g>
                  );
                }}
              </For>

              {/* Click area for destination */}
              <Show when={pd.isDest}>
                <rect
                  x={x - POINT_W / 2}
                  y={pd.top ? MARGIN : BOARD_H / 2}
                  width={POINT_W}
                  height={(BOARD_H - MARGIN * 2) / 2}
                  fill="transparent"
                  onClick={() => props.onPointClick(pd.point)}
                  style={{ cursor: 'pointer' }}
                />
              </Show>
            </g>
          );
        }}
      </For>

      {/* Bar checkers - White (bottom bar area) */}
      <Show when={whiteBarCount() > 0}>
        <For each={Array.from({ length: whiteBarCount() }, (_, i) => i)}>
          {(i) => (
            <circle
              cx={barX}
              cy={BOARD_H / 2 + CHECKER_R + 8 + i * CHECKER_SPACING * 0.7}
              r={CHECKER_R}
              fill={COLORS.checkerWhite}
              stroke={isBarSelected() && props.turn === 'w' ? COLORS.highlightStroke : COLORS.checkerWhiteBorder}
              stroke-width={isBarSelected() && props.turn === 'w' ? 3 : 1.5}
              class={`checker ${isBarMoveable() && props.turn === 'w' ? 'movable' : ''}`}
              onClick={isBarMoveable() && props.turn === 'w' ? () => props.onPointClick(W_BAR) : undefined}
            />
          )}
        </For>
      </Show>

      {/* Bar checkers - Black (top bar area) */}
      <Show when={blackBarCount() > 0}>
        <For each={Array.from({ length: blackBarCount() }, (_, i) => i)}>
          {(i) => (
            <circle
              cx={barX}
              cy={BOARD_H / 2 - CHECKER_R - 8 - i * CHECKER_SPACING * 0.7}
              r={CHECKER_R}
              fill={COLORS.checkerBlack}
              stroke={isBarSelected() && props.turn === 'b' ? COLORS.highlightStroke : COLORS.checkerBlackBorder}
              stroke-width={isBarSelected() && props.turn === 'b' ? 3 : 1.5}
              class={`checker ${isBarMoveable() && props.turn === 'b' ? 'movable' : ''}`}
              onClick={isBarMoveable() && props.turn === 'b' ? () => props.onPointClick(B_BAR) : undefined}
            />
          )}
        </For>
      </Show>

      {/* Bear off tray - Right (White) */}
      <g>
        <rect
          x={BOARD_W - MARGIN - BEAR_OFF_W}
          y={MARGIN}
          width={BEAR_OFF_W}
          height={BOARD_H - MARGIN * 2}
          fill={COLORS.bearOff}
          rx={3}
          stroke={isBearOffDest() ? COLORS.highlightStroke : 'none'}
          stroke-width={2}
          onClick={isBearOffDest() ? () => props.onBearOffClick() : undefined}
          style={{ cursor: isBearOffDest() ? 'pointer' : 'default' }}
        />
        <Show when={props.whiteOff > 0}>
          <text
            x={BOARD_W - MARGIN - BEAR_OFF_W / 2}
            y={BOARD_H / 2 + 40}
            text-anchor="middle"
            font-size="16"
            font-weight="700"
            fill={COLORS.checkerWhite}
            style={{ "pointer-events": "none" }}
          >
            {props.whiteOff}
          </text>
          <For each={Array.from({ length: Math.min(props.whiteOff, 15) }, (_, i) => i)}>
            {(i) => (
              <rect
                x={BOARD_W - MARGIN - BEAR_OFF_W + 4}
                y={BOARD_H - MARGIN - 6 - i * 14}
                width={BEAR_OFF_W - 8}
                height={10}
                rx={2}
                fill={COLORS.checkerWhite}
                opacity={0.8}
                style={{ "pointer-events": "none" }}
              />
            )}
          </For>
        </Show>
      </g>

      {/* Bear off tray - Left (Black) */}
      <g>
        <rect
          x={MARGIN}
          y={MARGIN}
          width={BEAR_OFF_W}
          height={BOARD_H - MARGIN * 2}
          fill={COLORS.bearOff}
          rx={3}
        />
        <Show when={props.blackOff > 0}>
          <text
            x={MARGIN + BEAR_OFF_W / 2}
            y={BOARD_H / 2 - 30}
            text-anchor="middle"
            font-size="16"
            font-weight="700"
            fill="#888"
            style={{ "pointer-events": "none" }}
          >
            {props.blackOff}
          </text>
          <For each={Array.from({ length: Math.min(props.blackOff, 15) }, (_, i) => i)}>
            {(i) => (
              <rect
                x={MARGIN + 4}
                y={MARGIN + 6 + i * 14}
                width={BEAR_OFF_W - 8}
                height={10}
                rx={2}
                fill={COLORS.checkerBlack}
                opacity={0.8}
                style={{ "pointer-events": "none" }}
              />
            )}
          </For>
        </Show>
      </g>

      {/* Point numbers */}
      <For each={Array.from({ length: 12 }, (_, i) => i)}>
        {(col) => {
          const x = pointX(col);
          const topPt = colToPoint(col, true, props.flipped);
          const botPt = colToPoint(col, false, props.flipped);
          return (
            <g>
              <text x={x} y={MARGIN - 4} text-anchor="middle" font-size="10" fill="#555" style={{ "pointer-events": "none" }}>
                {topPt}
              </text>
              <text x={x} y={BOARD_H - MARGIN + 14} text-anchor="middle" font-size="10" fill="#555" style={{ "pointer-events": "none" }}>
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
