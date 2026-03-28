"""
TD-Gammon 198-input board encoding.

For each of 24 points, for each color (white, black):
  4 features: [n>=1, n>=2, n>=3, max(0, (n-3)/2)]

Plus 6 extra features:
  - White bar / 2
  - Black bar / 2
  - White off / 15
  - Black off / 15
  - Turn indicator (1=white, 0=black)
  - Bias (1.0)

Total: 24*2*4 + 6 = 198 inputs
"""

import numpy as np
from game_engine import Board, Color, W_BAR, B_BAR

INPUT_SIZE = 198


def encode_board(board: Board, white_off: int, black_off: int, turn: Color) -> np.ndarray:
    """Encode a board position into a 198-element float vector."""
    x = np.zeros(INPUT_SIZE, dtype=np.float32)
    idx = 0

    # For each point 1-24, encode white then black features
    for point in range(1, 25):
        val = board[point]
        # White checkers on this point
        w = val if val > 0 else 0
        x[idx]     = 1.0 if w >= 1 else 0.0
        x[idx + 1] = 1.0 if w >= 2 else 0.0
        x[idx + 2] = 1.0 if w >= 3 else 0.0
        x[idx + 3] = (w - 3) / 2.0 if w >= 3 else 0.0
        idx += 4

        # Black checkers on this point
        b = -val if val < 0 else 0
        x[idx]     = 1.0 if b >= 1 else 0.0
        x[idx + 1] = 1.0 if b >= 2 else 0.0
        x[idx + 2] = 1.0 if b >= 3 else 0.0
        x[idx + 3] = (b - 3) / 2.0 if b >= 3 else 0.0
        idx += 4

    # Extra features (idx should be 192 here)
    w_bar = board[W_BAR] if board[W_BAR] > 0 else 0
    b_bar = -board[B_BAR] if board[B_BAR] < 0 else 0

    x[idx]     = w_bar / 2.0
    x[idx + 1] = b_bar / 2.0
    x[idx + 2] = white_off / 15.0
    x[idx + 3] = black_off / 15.0
    x[idx + 4] = 1.0 if turn == 'w' else 0.0
    x[idx + 5] = 1.0  # bias

    return x
