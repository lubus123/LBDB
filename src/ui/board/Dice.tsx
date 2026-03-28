import { Component, Show, For } from 'solid-js';

interface DiceProps {
  dice: [number, number] | null;
  movesLeft: number[];
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

const SingleDie: Component<{ value: number; x: number; y: number; used: boolean }> = (props) => {
  const dots = () => DOT_POSITIONS[props.value] || [];

  return (
    <g class={props.used ? 'die-used' : ''}>
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
  // Count how many of each die value have been used
  const dieUsed = (dieIndex: number): boolean => {
    if (!props.dice) return false;
    const dieVal = props.dice[dieIndex];
    // Count how many of this value remain in movesLeft
    const remaining = props.movesLeft.filter(d => d === dieVal).length;
    // For doubles: die 0 and 1 are same value, need to track total remaining
    if (props.dice[0] === props.dice[1]) {
      // Doubles: 4 total, check how many used
      const totalUsed = 4 - props.movesLeft.length;
      return dieIndex < totalUsed;
    }
    // Non-doubles: check if this specific die value is in movesLeft
    return !props.movesLeft.includes(dieVal);
  };

  return (
    <Show when={props.dice}>
      <g class="dice-group">
        <SingleDie
          value={props.dice![0]}
          x={350}
          y={320}
          used={dieUsed(0)}
        />
        <SingleDie
          value={props.dice![1]}
          x={430}
          y={320}
          used={dieUsed(1)}
        />
      </g>
    </Show>
  );
};

export default Dice;
