"""
Benchmark: NN vs heuristic AI and NN vs random.
Plays N games and reports win rates.
"""

import sys
import random
from typing import List, Tuple

import numpy as np

from game_engine import (
    Board, Color, CheckerMove, INITIAL_BOARD, CHECKERS_PER_PLAYER,
    clone_board, generate_all_turns, apply_turn_moves, roll_dice,
    evaluate_position_heuristic, choose_best_turn_heuristic,
)
from encode import encode_board
from network import Network


def choose_best_turn_nn(network: Network, board: Board, dice: Tuple[int, int],
                         turn: Color, white_off: int, black_off: int) -> List[CheckerMove]:
    """Choose best turn using neural network evaluation (batch)."""
    all_turns = generate_all_turns(board, dice, turn)
    if not all_turns or (len(all_turns) == 1 and len(all_turns[0]) == 0):
        return []

    results = []
    encodings = []
    for turn_moves in all_turns:
        result_board, w_off, b_off = apply_turn_moves(board, turn_moves, turn, white_off, black_off)

        if turn == 'w' and w_off == CHECKERS_PER_PLAYER:
            return turn_moves
        if turn == 'b' and b_off == CHECKERS_PER_PLAYER:
            return turn_moves

        results.append(turn_moves)
        encodings.append(encode_board(result_board, w_off, b_off, turn))

    X = np.array(encodings, dtype=np.float32)
    p_whites = network.forward_batch(X)
    scores = p_whites if turn == 'w' else 1.0 - p_whites
    best_idx = int(np.argmax(scores))
    return results[best_idx]


def choose_random_turn(board: Board, dice: Tuple[int, int],
                       turn: Color) -> List[CheckerMove]:
    """Choose a random legal turn."""
    all_turns = generate_all_turns(board, dice, turn)
    if not all_turns or (len(all_turns) == 1 and len(all_turns[0]) == 0):
        return []
    return random.choice(all_turns)


def play_game(white_chooser, black_chooser, max_moves: int = 500) -> str:
    """
    Play a single game. Returns winner ('w' or 'b').
    white_chooser(board, dice, 'w', w_off, b_off) -> moves
    black_chooser(board, dice, 'b', w_off, b_off) -> moves
    """
    board = clone_board(INITIAL_BOARD)
    w_off = 0
    b_off = 0
    turn = 'w'

    for _ in range(max_moves):
        dice = roll_dice()
        if turn == 'w':
            moves = white_chooser(board, dice, 'w', w_off, b_off)
        else:
            moves = black_chooser(board, dice, 'b', w_off, b_off)

        board, w_off, b_off = apply_turn_moves(board, moves, turn, w_off, b_off)

        if w_off == CHECKERS_PER_PLAYER:
            return 'w'
        if b_off == CHECKERS_PER_PLAYER:
            return 'b'

        turn = 'b' if turn == 'w' else 'w'

    # If game doesn't end in max_moves, call it a draw (shouldn't happen)
    return 'w' if w_off > b_off else 'b'


def benchmark_vs_heuristic(network: Network, n_games: int = 200) -> float:
    """Play NN vs heuristic. NN plays half as white, half as black. Returns NN win rate."""
    nn_wins = 0
    half = n_games // 2

    def nn_chooser(board, dice, turn, w_off, b_off):
        return choose_best_turn_nn(network, board, dice, turn, w_off, b_off)

    def heuristic_chooser(board, dice, turn, w_off, b_off):
        return choose_best_turn_heuristic(board, dice, turn, w_off, b_off)

    # NN as white
    for _ in range(half):
        winner = play_game(nn_chooser, heuristic_chooser)
        if winner == 'w':
            nn_wins += 1

    # NN as black
    for _ in range(n_games - half):
        winner = play_game(heuristic_chooser, nn_chooser)
        if winner == 'b':
            nn_wins += 1

    return nn_wins / n_games


def benchmark_vs_random(network: Network, n_games: int = 200) -> float:
    """Play NN vs random. Returns NN win rate."""
    nn_wins = 0
    half = n_games // 2

    def nn_chooser(board, dice, turn, w_off, b_off):
        return choose_best_turn_nn(network, board, dice, turn, w_off, b_off)

    def random_chooser(board, dice, turn, w_off, b_off):
        return choose_random_turn(board, dice, turn)

    for _ in range(half):
        winner = play_game(nn_chooser, random_chooser)
        if winner == 'w':
            nn_wins += 1

    for _ in range(n_games - half):
        winner = play_game(random_chooser, nn_chooser)
        if winner == 'b':
            nn_wins += 1

    return nn_wins / n_games


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python evaluate.py <model.npz> [n_games]")
        sys.exit(1)

    model_path = sys.argv[1]
    n_games = int(sys.argv[2]) if len(sys.argv) > 2 else 200

    net = Network()
    net.load(model_path)

    print(f"Evaluating {model_path} over {n_games} games...")
    wr_h = benchmark_vs_heuristic(net, n_games)
    wr_r = benchmark_vs_random(net, n_games)
    print(f"  vs Heuristic: {wr_h:.1%}")
    print(f"  vs Random:    {wr_r:.1%}")
