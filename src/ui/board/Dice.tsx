import { Component, Show, For, createSignal, createEffect, onCleanup } from 'solid-js';

interface DiceProps {
  dice: [number, number] | null;
  movesLeft: number[];
  rolling?: boolean;
  diceOrder?: [number, number];
  onSwap?: () => void;
  forcedPass?: boolean;
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
  hidden?: boolean;
  flash?: boolean;
}> = (props) => {
  const dots = () => DOT_POSITIONS[props.value] || [];

  return (
    <g
      class={`${props.used ? 'die-used' : ''} ${props.rolling ? 'die-rolling' : ''} ${props.flash ? 'die-flash' : ''}`}
      style={{
        'transform-origin': `${props.x}px ${props.y}px`,
        transform: props.rolling ? `rotate(${props.rotation}deg)` : undefined,
        opacity: props.hidden ? '0' : undefined,
        transition: 'opacity 0.15s ease',
      }}
    >
      <rect
        x={props.x - DIE_SIZE / 2}
        y={props.y - DIE_SIZE / 2}
        width={DIE_SIZE}
        height={DIE_SIZE}
        rx={6}
        fill={props.flash ? '#e53935' : '#f5f0e8'}
        stroke={props.flash ? '#b71c1c' : '#c4b8a4'}
        stroke-width={1.5}
        style={{ transition: 'fill 0.2s ease, stroke 0.2s ease' }}
      />
      <For each={dots()}>
        {([dx, dy]) => (
          <circle
            cx={props.x + dx * DIE_SIZE * 0.7}
            cy={props.y + dy * DIE_SIZE * 0.7}
            r={DOT_R}
            fill={props.flash ? '#fff' : '#1a1a1a'}
            style={{ transition: 'fill 0.2s ease' }}
          />
        )}
      </For>
    </g>
  );
};

const Dice: Component<DiceProps> = (props) => {
  const [displayValues, setDisplayValues] = createSignal<[number, number]>([1, 1]);
  const [rotations, setRotations] = createSignal<[number, number]>([0, 0]);
  const [die2Visible, setDie2Visible] = createSignal(true);
  let intervalId: number | undefined;

  const order = () => props.diceOrder || [0, 1] as [number, number];

  // Face cycling during roll animation — sequential: die1 settles first, die2 after
  createEffect(() => {
    if (props.rolling && props.dice) {
      const target = props.dice;
      let elapsed = 0;
      const step = 50;
      const die1SettleAt = 350;
      // Random delay for die2: 100-250ms after die1
      const die2Delay = 100 + Math.floor(Math.random() * 150);
      const die2SettleAt = die1SettleAt + die2Delay;

      setDie2Visible(false);

      intervalId = window.setInterval(() => {
        elapsed += step;

        // Die 1: tumble then settle
        if (elapsed < die1SettleAt) {
          setDisplayValues(prev => [Math.ceil(Math.random() * 6), prev[1]]);
          setRotations(prev => [Math.random() * 720, prev[1]]);
        } else if (elapsed >= die1SettleAt && elapsed < die1SettleAt + step) {
          // Die 1 settles
          setDisplayValues(prev => [target[0], prev[1]]);
          setRotations(prev => [720, prev[1]]);
        }

        // Die 2: start tumbling after die1 settles
        if (elapsed >= die1SettleAt && !die2Visible()) {
          setDie2Visible(true);
        }
        if (elapsed >= die1SettleAt && elapsed < die2SettleAt) {
          setDisplayValues(prev => [prev[0], Math.ceil(Math.random() * 6)]);
          setRotations(prev => [prev[0], Math.random() * 720]);
        } else if (elapsed >= die2SettleAt && elapsed < die2SettleAt + step) {
          // Die 2 settles
          setDisplayValues([target[0], target[1]]);
          setRotations([720, 720]);
        }

        // All done
        if (elapsed >= die2SettleAt + step) {
          setDisplayValues([target[0], target[1]]);
          setRotations([720, 720]);
          setDie2Visible(true);
          clearInterval(intervalId);
        }
      }, step);
    } else if (props.dice) {
      setDisplayValues([props.dice[0], props.dice[1]]);
      setRotations([0, 0]);
      setDie2Visible(true);
    }
  });

  onCleanup(() => clearInterval(intervalId));

  const dieUsed = (dieIndex: number): boolean => {
    if (!props.dice) return false;
    const dieVal = props.dice[dieIndex];
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
          flash={!!props.forcedPass}
        />
        <SingleDie
          value={displayValues()[order()[1]]}
          x={die2X}
          y={dieY}
          used={dieUsed(order()[1])}
          rolling={!!props.rolling}
          rotation={rotations()[1]}
          hidden={!die2Visible()}
          flash={!!props.forcedPass}
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
