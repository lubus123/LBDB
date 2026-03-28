import { Component, Show, createMemo } from 'solid-js';
import type { Color } from '../../shared/types';

export interface LuckEntry {
  ply: number;
  player: Color;
  luck: number;
}

interface LuckMeterProps {
  history: LuckEntry[];
  isAiMode: boolean;
}

const LuckMeter: Component<LuckMeterProps> = (props) => {
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

  return (
    <div class="luck-meter">
      <Show when={lastEntry()}>
        {(entry) => (
          <div class="luck-current">
            <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>Roll luck</span>
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
