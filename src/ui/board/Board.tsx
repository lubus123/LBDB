import { Component, For, Show, createMemo } from 'solid-js';
import type { BoardArray, Color } from '../../shared/types';
import { W_BAR, B_BAR } from '../../shared/constants';
import { checkersAt } from '../../engine/board';

// Board layout — taller aspect ratio to fill viewport
const BOARD_W = 780;
const BOARD_H = 640;
const MARGIN = 16;
const BAR_W = 56;
const POINT_W = 52;
const CHECKER_R = 22;
const CHECKER_SPACING = 40;
const BEAR_OFF_W = 32;
const HALF_POINTS = 6;

// Jail constants
const JAIL_BAR_W = 3;
const JAIL_BAR_GAP = 8;
const JAIL_BARS = 5;
const JAIL_COLOR = '#8b0000';
const JAIL_GLOW = 'rgba(139, 0, 0, 0.4)';

const COLORS = {
  boardBg: '#1e120c',
  boardFrame: '#3d2817',
  pointDark: '#8b4513',
  pointLight: '#d4a76a',
  bar: '#2a1a10',
  barDark: '#1a0e06',
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

function colToPoint(col: number, top: boolean, flipped: boolean): number {
  if (flipped) {
    return top ? col + 1 : 24 - col;
  }
  return top ? 24 - col : col + 1;
}

function pointX(col: number): number {
  const halfCol = col < HALF_POINTS ? col : col + 1;
  const leftEdge = MARGIN + BEAR_OFF_W + 6;
  return leftEdge + halfCol * POINT_W + POINT_W / 2 + (col >= HALF_POINTS ? BAR_W : 0);
}

function checkerY(index: number, top: boolean): number {
  const edge = top ? MARGIN + 6 : BOARD_H - MARGIN - 6;
  const dir = top ? 1 : -1;
  const maxNormal = 5;
  const spacing = index < maxNormal ? CHECKER_SPACING : CHECKER_SPACING * 0.6;
  return edge + dir * (CHECKER_R + index * spacing);
}

/** Render prison bars around a jailed checker */
function JailBars(props: { cx: number; cy: number; r: number; animClass: string }) {
  const totalW = (JAIL_BARS - 1) * JAIL_BAR_GAP;
  const startX = props.cx - totalW / 2;
  const topY = props.cy - props.r - 6;
  const botY = props.cy + props.r + 6;
  const barH = botY - topY;

  return (
    <g class={`jail-bars ${props.animClass}`}>
      {/* Red glow behind bars */}
      <circle
        cx={props.cx} cy={props.cy} r={props.r + 4}
        fill="none" stroke={JAIL_GLOW} stroke-width={6}
        class="jail-glow"
      />
      {/* Vertical bars */}
      <For each={Array.from({ length: JAIL_BARS }, (_, i) => i)}>
        {(i) => (
          <rect
            x={startX + i * JAIL_BAR_GAP - JAIL_BAR_W / 2}
            y={topY}
            width={JAIL_BAR_W}
            height={barH}
            rx={1}
            fill={JAIL_COLOR}
            class="jail-bar"
          />
        )}
      </For>
      {/* Horizontal crossbars */}
      <rect x={startX - 2} y={topY} width={totalW + 4} height={2.5} rx={1} fill={JAIL_COLOR} />
      <rect x={startX - 2} y={botY - 2.5} width={totalW + 4} height={2.5} rx={1} fill={JAIL_COLOR} />
    </g>
  );
}

const Board: Component<BoardProps> = (props) => {
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
          point, col, top, x, checkers, color,
          isMoveable: props.moveablePoints.includes(point),
          isSelected: props.selectedPoint === point,
          isDest: props.legalDests.includes(point),
        });
      }
    }
    return data;
  });

  const barX = MARGIN + BEAR_OFF_W + 6 + HALF_POINTS * POINT_W + BAR_W / 2;
  const midY = BOARD_H / 2;

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
        {/* Bar area gradient — darker, prison-like */}
        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#1a0e06" />
          <stop offset="50%" stop-color="#241408" />
          <stop offset="100%" stop-color="#1a0e06" />
        </linearGradient>
      </defs>

      {/* Board frame */}
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={6} fill={COLORS.boardFrame} />
      <rect x={MARGIN} y={MARGIN} width={BOARD_W - MARGIN * 2} height={BOARD_H - MARGIN * 2} fill={COLORS.boardBg} />

      {/* Bar area — wider, darker */}
      <rect
        x={barX - BAR_W / 2}
        y={MARGIN}
        width={BAR_W}
        height={BOARD_H - MARGIN * 2}
        fill="url(#barGrad)"
      />
      {/* Bar label */}
      <text
        x={barX} y={midY + 4}
        text-anchor="middle"
        font-size="10"
        fill="#443322"
        font-weight="600"
        letter-spacing="2"
        style={{ "pointer-events": "none" }}
      >
        BAR
      </text>

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
                        onClick={isClickable ? () => props.onPointClick(pd.point) : undefined}
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

      {/* ═══ BAR / JAIL — White checkers (bottom half) ═══ */}
      <Show when={whiteBarCount() > 0}>
        <For each={Array.from({ length: whiteBarCount() }, (_, i) => i)}>
          {(i) => {
            const cy = midY + CHECKER_R + 16 + i * (CHECKER_SPACING * 0.8);
            return (
              <g class="jail-entry">
                <circle
                  cx={barX} cy={cy} r={CHECKER_R}
                  fill={COLORS.checkerWhite}
                  stroke={isBarSelected() && props.turn === 'w' ? COLORS.highlightStroke : COLORS.checkerWhiteBorder}
                  stroke-width={isBarSelected() && props.turn === 'w' ? 3 : 1.5}
                  class={`checker ${isBarMoveable() && props.turn === 'w' ? 'movable' : ''}`}
                  onClick={isBarMoveable() && props.turn === 'w' ? () => props.onPointClick(W_BAR) : undefined}
                />
                <JailBars cx={barX} cy={cy} r={CHECKER_R} animClass="jail-active" />
              </g>
            );
          }}
        </For>
      </Show>

      {/* ═══ BAR / JAIL — Black checkers (top half) ═══ */}
      <Show when={blackBarCount() > 0}>
        <For each={Array.from({ length: blackBarCount() }, (_, i) => i)}>
          {(i) => {
            const cy = midY - CHECKER_R - 16 - i * (CHECKER_SPACING * 0.8);
            return (
              <g class="jail-entry">
                <circle
                  cx={barX} cy={cy} r={CHECKER_R}
                  fill={COLORS.checkerBlack}
                  stroke={isBarSelected() && props.turn === 'b' ? COLORS.highlightStroke : COLORS.checkerBlackBorder}
                  stroke-width={isBarSelected() && props.turn === 'b' ? 3 : 1.5}
                  class={`checker ${isBarMoveable() && props.turn === 'b' ? 'movable' : ''}`}
                  onClick={isBarMoveable() && props.turn === 'b' ? () => props.onPointClick(B_BAR) : undefined}
                />
                <JailBars cx={barX} cy={cy} r={CHECKER_R} animClass="jail-active" />
              </g>
            );
          }}
        </For>
      </Show>

      {/* Bear off tray — Right (White) */}
      <g>
        <rect
          x={BOARD_W - MARGIN - BEAR_OFF_W} y={MARGIN}
          width={BEAR_OFF_W} height={BOARD_H - MARGIN * 2}
          fill={COLORS.bearOff} rx={3}
          stroke={isBearOffDest() ? COLORS.highlightStroke : 'none'}
          stroke-width={2}
          onClick={isBearOffDest() ? () => props.onBearOffClick() : undefined}
          style={{ cursor: isBearOffDest() ? 'pointer' : 'default' }}
        />
        <Show when={props.whiteOff > 0}>
          <text
            x={BOARD_W - MARGIN - BEAR_OFF_W / 2} y={BOARD_H / 2 + 40}
            text-anchor="middle" font-size="15" font-weight="700"
            fill={COLORS.checkerWhite}
            style={{ "pointer-events": "none" }}
          >{props.whiteOff}</text>
          <For each={Array.from({ length: Math.min(props.whiteOff, 15) }, (_, i) => i)}>
            {(i) => (
              <rect
                x={BOARD_W - MARGIN - BEAR_OFF_W + 3}
                y={BOARD_H - MARGIN - 6 - i * 13}
                width={BEAR_OFF_W - 6} height={9} rx={2}
                fill={COLORS.checkerWhite} opacity={0.8}
                style={{ "pointer-events": "none" }}
              />
            )}
          </For>
        </Show>
      </g>

      {/* Bear off tray — Left (Black) */}
      <g>
        <rect
          x={MARGIN} y={MARGIN}
          width={BEAR_OFF_W} height={BOARD_H - MARGIN * 2}
          fill={COLORS.bearOff} rx={3}
        />
        <Show when={props.blackOff > 0}>
          <text
            x={MARGIN + BEAR_OFF_W / 2} y={BOARD_H / 2 - 30}
            text-anchor="middle" font-size="15" font-weight="700"
            fill="#888"
            style={{ "pointer-events": "none" }}
          >{props.blackOff}</text>
          <For each={Array.from({ length: Math.min(props.blackOff, 15) }, (_, i) => i)}>
            {(i) => (
              <rect
                x={MARGIN + 3}
                y={MARGIN + 6 + i * 13}
                width={BEAR_OFF_W - 6} height={9} rx={2}
                fill={COLORS.checkerBlack} opacity={0.8}
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
