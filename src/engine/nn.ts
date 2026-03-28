/**
 * Neural network position evaluator for backgammon.
 *
 * Architecture: 198 -> 80 -> 1 (sigmoid activations)
 * Input: TD-Gammon encoding (board + bar + off + turn + bias)
 * Output: P(white wins) in [0, 1]
 *
 * No ML framework needed - this is pure matrix math.
 * Forward pass: ~16K multiply-adds, <0.1ms per position.
 */

import type { BoardArray, Color } from '../shared/types';
import { W_BAR, B_BAR } from '../shared/constants';

export interface NNWeights {
  W1: number[][];  // [198][80]
  b1: number[];    // [80]
  W2: number[][];  // [80][1]
  b2: number[];    // [1]
}

let loadedWeights: NNWeights | null = null;

function sigmoid(x: number): number {
  return 1.0 / (1.0 + Math.exp(-x));
}

/**
 * Encode a board position into a 198-element vector.
 * Must exactly match training/encode.py.
 *
 * Layout: For each point 1-24, for each color (white, black):
 *   4 features: [n>=1, n>=2, n>=3, max(0, (n-3)/2)]
 * Then: white_bar/2, black_bar/2, white_off/15, black_off/15, turn, bias
 */
export function encodeBoard(
  board: BoardArray,
  whiteOff: number,
  blackOff: number,
  turn: Color,
): Float32Array {
  const x = new Float32Array(198);
  let idx = 0;

  for (let point = 1; point <= 24; point++) {
    const val = board[point];

    // White checkers on this point
    const w = val > 0 ? val : 0;
    x[idx]     = w >= 1 ? 1.0 : 0.0;
    x[idx + 1] = w >= 2 ? 1.0 : 0.0;
    x[idx + 2] = w >= 3 ? 1.0 : 0.0;
    x[idx + 3] = w >= 3 ? (w - 3) / 2.0 : 0.0;
    idx += 4;

    // Black checkers on this point
    const b = val < 0 ? -val : 0;
    x[idx]     = b >= 1 ? 1.0 : 0.0;
    x[idx + 1] = b >= 2 ? 1.0 : 0.0;
    x[idx + 2] = b >= 3 ? 1.0 : 0.0;
    x[idx + 3] = b >= 3 ? (b - 3) / 2.0 : 0.0;
    idx += 4;
  }

  // Extra features (idx = 192)
  const wBar = board[W_BAR] > 0 ? board[W_BAR] : 0;
  const bBar = board[B_BAR] < 0 ? -board[B_BAR] : 0;

  x[idx]     = wBar / 2.0;
  x[idx + 1] = bBar / 2.0;
  x[idx + 2] = whiteOff / 15.0;
  x[idx + 3] = blackOff / 15.0;
  x[idx + 4] = turn === 'w' ? 1.0 : 0.0;
  x[idx + 5] = 1.0;  // bias

  return x;
}

/**
 * Forward pass through the neural network.
 * Returns P(white wins) in [0, 1].
 */
export function nnForward(input: Float32Array, weights: NNWeights): number {
  const hiddenSize = weights.b1.length;

  // Hidden layer: h = sigmoid(input * W1 + b1)
  const hidden = new Float32Array(hiddenSize);
  for (let j = 0; j < hiddenSize; j++) {
    let sum = weights.b1[j];
    for (let i = 0; i < 198; i++) {
      sum += input[i] * weights.W1[i][j];
    }
    hidden[j] = sigmoid(sum);
  }

  // Output layer: out = sigmoid(hidden * W2 + b2)
  let out = weights.b2[0];
  for (let j = 0; j < hiddenSize; j++) {
    out += hidden[j] * weights.W2[j][0];
  }
  return sigmoid(out);
}

/**
 * Evaluate a board position using the neural network.
 * Returns a score from the perspective of `color` (higher = better).
 * Designed as a drop-in replacement for evaluatePosition().
 */
export function evaluatePositionNN(
  board: BoardArray,
  color: Color,
  colorOff: number,
  opponentOff: number,
): number {
  if (!loadedWeights) return 0;

  const whiteOff = color === 'w' ? colorOff : opponentOff;
  const blackOff = color === 'w' ? opponentOff : colorOff;
  const input = encodeBoard(board, whiteOff, blackOff, color);
  const pWhite = nnForward(input, loadedWeights);

  // Return from color's perspective: higher = better
  // Scale to a score range similar to heuristic for compatibility
  const pWin = color === 'w' ? pWhite : 1.0 - pWhite;
  return pWin * 200 - 100;  // maps [0,1] -> [-100, 100]
}

/**
 * Get raw P(white wins) for a position (for luck calculator).
 */
export function pWhiteWin(
  board: BoardArray,
  whiteOff: number,
  blackOff: number,
  turn: Color,
): number {
  if (!loadedWeights) return 0.5;
  const input = encodeBoard(board, whiteOff, blackOff, turn);
  return nnForward(input, loadedWeights);
}

/** Load model weights from a URL. */
export async function loadModel(url: string): Promise<NNWeights> {
  const resp = await fetch(url);
  const weights: NNWeights = await resp.json();
  loadedWeights = weights;
  return weights;
}

/** Check if model is loaded. */
export function isModelLoaded(): boolean {
  return loadedWeights !== null;
}

/** Get the loaded weights (for direct use). */
export function getWeights(): NNWeights | null {
  return loadedWeights;
}

/** Set weights directly (for programmatic use, e.g. different difficulty models). */
export function setWeights(weights: NNWeights): void {
  loadedWeights = weights;
}
