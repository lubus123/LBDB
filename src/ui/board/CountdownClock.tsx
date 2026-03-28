import { Component, For } from 'solid-js';

interface CountdownClockProps {
  remaining: number;
  total: number;
}

const SIZE = 64;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 26;

const CountdownClock: Component<CountdownClockProps> = (props) => {
  const elapsed = () => props.total - props.remaining;
  const angle = () => (elapsed() / props.total) * 360;
  const danger = () => props.remaining <= 10;

  // Hand endpoint
  const handAngle = () => (angle() - 90) * (Math.PI / 180);
  const handX = () => CX + Math.cos(handAngle()) * (R - 4);
  const handY = () => CY + Math.sin(handAngle()) * (R - 4);

  // Danger arc (swept region when <=10s left)
  const dangerStartAngle = () => {
    const dangerStart = Math.max(0, props.total - 10);
    return ((dangerStart / props.total) * 360 - 90) * (Math.PI / 180);
  };
  const dangerEndAngle = () => (angle() - 90) * (Math.PI / 180);

  function arcPath(startA: number, endA: number, r: number): string {
    const x1 = CX + Math.cos(startA) * r;
    const y1 = CY + Math.sin(startA) * r;
    const x2 = CX + Math.cos(endA) * r;
    const y2 = CY + Math.sin(endA) * r;
    const large = (endA - startA) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} style={{ display: 'block', margin: '0 auto' }}>
      {/* Dial background */}
      <circle cx={CX} cy={CY} r={R + 2} fill="#1a1a2e" stroke="#333" stroke-width={1.5} />

      {/* Tick marks */}
      <For each={Array.from({ length: 60 }, (_, i) => i)}>
        {(i) => {
          const a = ((i / 60) * 360 - 90) * (Math.PI / 180);
          const tickSec = (i / 60) * props.total;
          const isInDanger = danger() && tickSec >= (props.total - 10) && tickSec <= elapsed();
          const isMajor = i % 5 === 0;
          const outerR = R;
          const innerR = isMajor ? R - 5 : R - 3;
          return (
            <line
              x1={CX + Math.cos(a) * innerR}
              y1={CY + Math.sin(a) * innerR}
              x2={CX + Math.cos(a) * outerR}
              y2={CY + Math.sin(a) * outerR}
              stroke={isInDanger ? '#e53935' : '#555'}
              stroke-width={isMajor ? 1.5 : 0.8}
              stroke-linecap="round"
            />
          );
        }}
      </For>

      {/* Danger arc */}
      {danger() && elapsed() > (props.total - 10) && (
        <path
          d={arcPath(dangerStartAngle(), dangerEndAngle(), R - 1)}
          fill="none"
          stroke="#e53935"
          stroke-width={3}
          stroke-linecap="round"
          opacity={0.4}
        />
      )}

      {/* "duck" text */}
      <text
        x={CX} y={CY + 1}
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="6"
        font-weight="600"
        fill="#555"
        style={{ "pointer-events": "none", "letter-spacing": "0.5px" }}
      >duck</text>

      {/* Hand */}
      <line
        x1={CX} y1={CY}
        x2={handX()} y2={handY()}
        stroke={danger() ? '#e53935' : '#e8dcc8'}
        stroke-width={2}
        stroke-linecap="round"
        style={{ transition: 'x2 1s linear, y2 1s linear' }}
      />

      {/* Center dot */}
      <circle cx={CX} cy={CY} r={2} fill={danger() ? '#e53935' : '#e8dcc8'} />
    </svg>
  );
};

export default CountdownClock;
