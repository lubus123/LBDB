import { Component, Show, createSignal, createMemo } from 'solid-js';
import type { Color } from '../../shared/types';
import type { RollEquity } from '../../engine/luck';

export interface LuckEntry {
  ply: number;
  player: Color;
  luck: number;
  rolls?: RollEquity[];       // equity for all 21 dice rolls
  actualDice?: [number, number];
  rank?: number;              // 1 = best, 21 = worst
}

interface LuckMeterProps {
  history: LuckEntry[];
  isAiMode: boolean;
}

const LuckMeter: Component<LuckMeterProps> = (props) => {
  const [showHeatmap, setShowHeatmap] = createSignal(false);

  const lastEntry = () => {
    const h = props.history;
    return h.length > 0 ? h[h.length - 1] : null;
  };

  const totals = createMemo(() => {
    let w = 0, b = 0;
    for (const e of props.history) {
      if (e.player === 'w') w += e.luck;
      else b += e.luck;
    }
    return { w, b };
  });

  // Build cumulative series for sparkline
  const sparklineData = createMemo(() => {
    const wPoints: number[] = [];
    const bPoints: number[] = [];
    let wSum = 0, bSum = 0;
    for (const e of props.history) {
      if (e.player === 'w') wSum += e.luck;
      else bSum += e.luck;
      wPoints.push(wSum);
      bPoints.push(bSum);
    }
    return { wPoints, bPoints };
  });

  const sparklinePath = (points: number[]): string => {
    if (points.length < 2) return '';
    const w = 196;
    const h = 46;
    const allPts = [...sparklineData().wPoints, ...sparklineData().bPoints];
    const maxAbs = Math.max(1, ...allPts.map(Math.abs));
    const xStep = w / Math.max(1, points.length - 1);

    return points.map((v, i) => {
      const x = 2 + i * xStep;
      const y = h / 2 - (v / maxAbs) * (h / 2 - 2);
      return `${x},${y}`;
    }).join(' ');
  };

  const formatLuck = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1);

  /** Build a 6x6 heatmap grid from the 21 roll equities. */
  const heatmapGrid = createMemo(() => {
    const entry = lastEntry();
    if (!entry?.rolls) return null;
    const rolls = entry.rolls;
    const equities = rolls.map(r => r.equity);
    const minEq = Math.min(...equities);
    const maxEq = Math.max(...equities);
    const range = maxEq - minEq || 1;

    // Build lookup: key "d1,d2" (d1<=d2) -> equity
    const lookup = new Map<string, number>();
    for (const r of rolls) lookup.set(`${r.dice[0]},${r.dice[1]}`, r.equity);

    const cells: { d1: number; d2: number; equity: number; norm: number; isActual: boolean }[] = [];
    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = 1; d2 <= 6; d2++) {
        const key = d1 <= d2 ? `${d1},${d2}` : `${d2},${d1}`;
        const eq = lookup.get(key) ?? 0;
        const norm = (eq - minEq) / range; // 0..1
        const actual = entry.actualDice;
        const isActual = actual
          ? (d1 === actual[0] && d2 === actual[1]) || (d1 === actual[1] && d2 === actual[0])
          : false;
        cells.push({ d1, d2, equity: eq, norm, isActual });
      }
    }
    return cells;
  });

  const heatColor = (norm: number) => {
    // Red (bad) -> Yellow (mid) -> Green (good)
    const r = norm < 0.5 ? 200 : Math.round(200 - (norm - 0.5) * 2 * 150);
    const g = norm > 0.5 ? 180 : Math.round(norm * 2 * 180);
    return `rgb(${r},${g},40)`;
  };

  return (
    <div class="luck-meter">
      <Show when={lastEntry()}>
        {(entry) => (
          <div class="luck-current" onClick={() => entry().rolls && setShowHeatmap(v => !v)} style={{ cursor: entry().rolls ? 'pointer' : 'default' }}>
            <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>
              Roll luck {entry().rank ? `(#${entry().rank}/21)` : ''}
            </span>
            <div class="luck-bar-track">
              <div
                class={`luck-bar-fill ${entry().luck >= 0 ? 'positive' : 'negative'}`}
                style={{ width: `${Math.min(50, Math.abs(entry().luck) * 2)}%` }}
              />
            </div>
            <span class={`luck-value ${entry().luck >= 0 ? 'positive' : 'negative'}`}>
              {formatLuck(entry().luck)}
            </span>
          </div>
        )}
      </Show>

      <Show when={showHeatmap() && heatmapGrid()}>
        <div class="dice-heatmap">
          <div class="heatmap-grid">
            {/* Column headers */}
            <div class="heatmap-cell heatmap-header" />
            {[1,2,3,4,5,6].map(d => <div class="heatmap-cell heatmap-header">{d}</div>)}
            {/* Rows */}
            {[1,2,3,4,5,6].map(row => (
              <>
                <div class="heatmap-cell heatmap-header">{row}</div>
                {heatmapGrid()!.filter(c => c.d1 === row).map(cell => (
                  <div
                    class={`heatmap-cell ${cell.isActual ? 'actual' : ''}`}
                    style={{ background: heatColor(cell.norm) }}
                    title={`${cell.d1}-${cell.d2}: ${cell.equity.toFixed(1)}`}
                  >
                    {cell.isActual ? '\u2605' : ''}
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>
      </Show>

      <div class="luck-totals">
        <div class="luck-player">
          <div class="color-dot white" style={{ width: '8px', height: '8px', 'border-radius': '50%', background: 'var(--checker-white)' }} />
          <span>{props.isAiMode ? 'You' : 'White'}</span>
          <span class={`luck-value ${totals().w >= 0 ? 'positive' : 'negative'}`}>
            {formatLuck(totals().w)}
          </span>
        </div>
        <div class="luck-player">
          <div class="color-dot black" style={{ width: '8px', height: '8px', 'border-radius': '50%', background: 'var(--checker-black)', border: '1px solid var(--text-muted)' }} />
          <span>{props.isAiMode ? 'AI' : 'Black'}</span>
          <span class={`luck-value ${totals().b >= 0 ? 'positive' : 'negative'}`}>
            {formatLuck(totals().b)}
          </span>
        </div>
      </div>

      <Show when={props.history.length >= 2}>
        <svg class="luck-sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
          {/* Zero line */}
          <line x1="0" y1="25" x2="200" y2="25" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" />
          <polyline class="luck-line-black" points={sparklinePath(sparklineData().bPoints)} />
          <polyline class="luck-line-white" points={sparklinePath(sparklineData().wPoints)} />
        </svg>
      </Show>
    </div>
  );
};

export default LuckMeter;
