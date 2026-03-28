import { Component, Show, For, createSignal, createEffect, onCleanup } from 'solid-js';

interface DiceProps {
  dice: [number, number] | null;
  movesLeft: number[];
  rolling?: boolean;
  diceOrder?: [number, number];
  onSwap?: () => void;
}

/** Dot positions for a die face (relative to center, normalized 0-1) */
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.3, -0.3], [0.3, 0.3]],
  3: [[-0.3, -0.3], [0, 0], [0.3, 0.3]],
  4: [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]],
  5: [[-0.3, -0.3], [0.3, -0.3], [0, 0], [-0.3, 0.3], [0.3, 0.3]],
  6: [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0], [0.3, 0], [-0.3, 0.3], [0.3, 0.3]],
};

const DIE_SIZE = 44;
const DOT_R = 4;

const SingleDie: Component<{
  value: number;
  x: number;
  y: number;
  used: boolean;
  rolling: boolean;
  rotation: number;
}> = (props) => {
  const dots = () => DOT_POSITIONS[props.value] || [];

  return (
    <g
      class={`${props.used ? 'die-used' : ''} ${props.rolling ? 'die-rolling' : ''}`}
      style={{
        'transform-origin': `${props.x}px ${props.y}px`,
        transform: props.rolling ? `rotate(${props.rotation}deg)` : undefined,
      }}
    >
      <rect
        x={props.x - DIE_SIZE / 2}
        y={props.y - DIE_SIZE / 2}
        width={DIE_SIZE}
        height={DIE_SIZE}
        rx={6}
        fill="#f5f0e8"
        stroke="#c4b8a4"
        stroke-width={1.5}
      />
      <For each={dots()}>
        {([dx, dy]) => (
          <circle
            cx={props.x + dx * DIE_SIZE * 0.7}
            cy={props.y + dy * DIE_SIZE * 0.7}
            r={DOT_R}
            fill="#1a1a1a"
          />
        )}
      </For>
    </g>
  );
};

const Dice: Component<DiceProps> = (props) => {
  const [displayValues, setDisplayValues] = createSignal<[number, number]>([1, 1]);
  const [rotations, setRotations] = createSignal<[number, number]>([0, 0]);
  let intervalId: number | undefined;

  const order = () => props.diceOrder || [0, 1] as [number, number];

  // Face cycling during roll animation
  createEffect(() => {
    if (props.rolling && props.dice) {
      const target = props.dice;
      let elapsed = 0;
      const step = 50;

      intervalId = window.setInterval(() => {
        elapsed += step;
        if (elapsed >= 500) {
          // Settle on final values
          setDisplayValues([target[0], target[1]]);
          setRotations([720, 720]);
          clearInterval(intervalId);
          return;
        }
        // Random faces during tumble
        setDisplayValues([
          Math.ceil(Math.random() * 6),
          Math.ceil(Math.random() * 6),
        ]);
        setRotations([
          Math.random() * 720,
          Math.random() * 720,
        ]);
      }, step);
    } else if (props.dice) {
      setDisplayValues([props.dice[0], props.dice[1]]);
      setRotations([0, 0]);
    }
  });

  onCleanup(() => clearInterval(intervalId));

  const dieUsed = (dieIndex: number): boolean => {
    if (!props.dice) return false;
    const dieVal = props.dice[dieIndex];
    const remaining = props.movesLeft.filter(d => d === dieVal).length;
    if (props.dice[0] === props.dice[1]) {
      const totalUsed = 4 - props.movesLeft.length;
      return dieIndex < totalUsed;
    }
    return !props.movesLeft.includes(dieVal);
  };

  const die1X = 350;
  const die2X = 430;
  const dieY = 320;

  return (
    <Show when={props.dice}>
      <g class="dice-group">
        <SingleDie
          value={displayValues()[order()[0]]}
          x={die1X}
          y={dieY}
          used={dieUsed(order()[0])}
          rolling={!!props.rolling}
          rotation={rotations()[0]}
        />
        <SingleDie
          value={displayValues()[order()[1]]}
          x={die2X}
          y={dieY}
          used={dieUsed(order()[1])}
          rolling={!!props.rolling}
          rotation={rotations()[1]}
        />
        {/* Swap button between dice */}
        <Show when={props.onSwap && !props.rolling && props.movesLeft.length === 2 && props.dice![0] !== props.dice![1]}>
          <g
            class="dice-swap-btn"
            onClick={() => props.onSwap?.()}
            style={{ 'pointer-events': 'all' }}
          >
            <circle cx={390} cy={dieY} r={12} fill="rgba(255,255,255,0.08)" />
            {/* Swap arrows icon */}
            <path
              d="M385,316 L395,316 M392,313 L395,316 L392,319 M395,324 L385,324 M388,321 L385,324 L388,327"
              stroke="rgba(255,255,255,0.6)"
              stroke-width={1.5}
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>
        </Show>
      </g>
    </Show>
  );
};

export default Dice;
