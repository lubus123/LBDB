"""
TD-Gammon self-play training loop.

The network plays against itself using TD(lambda) learning:
1. At each position, evaluate V(s) = P(white wins)
2. After each move, compute TD error and update weights via eligibility traces
3. At game end, use actual outcome (1.0 = white won, 0.0 = black won)

Usage:
  python td_train.py [--games N] [--resume model.npz] [--hidden H]

Progress is logged to training_log.csv and checkpoints saved every 5000 games.
"""

import argparse
import csv
import os
import sys
import time
import random
from pathlib import Path
from typing import List, Tuple

import numpy as np

from game_engine import (
    Board, Color, CheckerMove, INITIAL_BOARD, CHECKERS_PER_PLAYER,
    clone_board, generate_all_turns, apply_turn_moves, roll_dice,
)
from encode import encode_board
from network import Network, TDTrainer
from evaluate import benchmark_vs_heuristic, benchmark_vs_random


def choose_best_turn_nn(network: Network, board: Board, dice: Tuple[int, int],
                         turn: Color, white_off: int, black_off: int) -> Tuple[List[CheckerMove], Board, int, int]:
    """Choose best turn using NN with batch evaluation. Returns (moves, result_board, w_off, b_off)."""
    all_turns = generate_all_turns(board, dice, turn)
    if not all_turns or (len(all_turns) == 1 and len(all_turns[0]) == 0):
        return [], clone_board(board), white_off, black_off

    # Pre-compute all resulting positions
    results = []
    encodings = []
    for turn_moves in all_turns:
        result_board, w_off, b_off = apply_turn_moves(board, turn_moves, turn, white_off, black_off)

        # Instant win
        if turn == 'w' and w_off == CHECKERS_PER_PLAYER:
            return turn_moves, result_board, w_off, b_off
        if turn == 'b' and b_off == CHECKERS_PER_PLAYER:
            return turn_moves, result_board, w_off, b_off

        results.append((turn_moves, result_board, w_off, b_off))
        encodings.append(encode_board(result_board, w_off, b_off, turn))

    # Batch evaluate all positions at once
    X = np.array(encodings, dtype=np.float32)
    p_whites = network.forward_batch(X)

    # Pick best from current player's perspective
    if turn == 'w':
        scores = p_whites
    else:
        scores = 1.0 - p_whites

    best_idx = int(np.argmax(scores))
    moves, result_board, w_off, b_off = results[best_idx]
    return moves, result_board, w_off, b_off


def play_training_game(network: Network, trainer: TDTrainer, max_moves: int = 500) -> Tuple[str, float, int]:
    """
    Play one self-play game with TD learning.
    Returns (winner, total_td_error, num_moves).
    """
    board = clone_board(INITIAL_BOARD)
    w_off = 0
    b_off = 0
    turn: Color = 'w'
    total_td_error = 0.0
    num_moves = 0

    trainer.reset_traces()

    # Get initial value
    x = encode_board(board, w_off, b_off, turn)
    v_prev = network.forward(x)

    for _ in range(max_moves):
        dice = roll_dice()
        moves, new_board, new_w_off, new_b_off = choose_best_turn_nn(
            network, board, dice, turn, w_off, b_off
        )

        board = new_board
        w_off = new_w_off
        b_off = new_b_off
        num_moves += 1

        # Check for game over
        if w_off == CHECKERS_PER_PLAYER:
            # White wins - terminal reward
            trainer.update(v_prev, 1.0)
            total_td_error += abs(1.0 - v_prev)
            return 'w', total_td_error, num_moves

        if b_off == CHECKERS_PER_PLAYER:
            # Black wins - terminal reward
            trainer.update(v_prev, 0.0)
            total_td_error += abs(0.0 - v_prev)
            return 'b', total_td_error, num_moves

        # Switch turns
        turn = 'b' if turn == 'w' else 'w'

        # Evaluate new position
        x = encode_board(board, w_off, b_off, turn)
        v_next = network.forward(x)

        # TD update
        trainer.update(v_prev, v_next)
        total_td_error += abs(v_next - v_prev)
        v_prev = v_next

    # Game didn't end - force a result
    winner = 'w' if w_off > b_off else 'b'
    final = 1.0 if winner == 'w' else 0.0
    trainer.update(v_prev, final)
    return winner, total_td_error, num_moves


def main():
    parser = argparse.ArgumentParser(description='TD-Gammon self-play training')
    parser.add_argument('--games', type=int, default=200000, help='Number of training games')
    parser.add_argument('--hidden', type=int, default=80, help='Hidden layer size')
    parser.add_argument('--alpha', type=float, default=0.1, help='Initial learning rate')
    parser.add_argument('--alpha-end', type=float, default=0.01, help='Final learning rate')
    parser.add_argument('--lambd', type=float, default=0.7, help='TD lambda (trace decay)')
    parser.add_argument('--resume', type=str, default=None, help='Resume from checkpoint')
    parser.add_argument('--eval-interval', type=int, default=5000, help='Games between evaluations')
    parser.add_argument('--eval-games', type=int, default=200, help='Games per evaluation')
    parser.add_argument('--checkpoint-dir', type=str, default='checkpoints', help='Checkpoint directory')
    parser.add_argument('--log-file', type=str, default='training_log.csv', help='CSV log file')
    args = parser.parse_args()

    # Create checkpoint dir
    os.makedirs(args.checkpoint_dir, exist_ok=True)

    # Initialize network
    network = Network(input_size=198, hidden_size=args.hidden, output_size=1)
    start_game = 0

    if args.resume:
        network.load(args.resume)
        # Try to infer game number from filename
        base = Path(args.resume).stem
        if '_' in base:
            try:
                start_game = int(base.split('_')[-1])
            except ValueError:
                pass
        print(f"Resumed from {args.resume} at game {start_game}")

    trainer = TDTrainer(network, alpha=args.alpha, lambd=args.lambd)

    # Open CSV log
    log_exists = os.path.exists(args.log_file)
    log_file = open(args.log_file, 'a', newline='')
    log_writer = csv.writer(log_file)
    if not log_exists:
        log_writer.writerow([
            'game', 'elapsed_sec', 'alpha',
            'avg_td_error', 'avg_game_length', 'white_win_pct',
            'wr_vs_heuristic', 'wr_vs_random',
        ])
        log_file.flush()

    print(f"Training TD-Gammon: {args.games} games, hidden={args.hidden}, "
          f"alpha={args.alpha}->{args.alpha_end}, lambda={args.lambd}")
    print(f"Eval every {args.eval_interval} games ({args.eval_games} games per eval)")
    print()

    # Training loop
    t_start = time.time()
    batch_td_error = 0.0
    batch_game_length = 0
    batch_white_wins = 0
    batch_size = 0

    for game_num in range(start_game, start_game + args.games):
        # Decay learning rate linearly
        progress = (game_num - start_game) / max(args.games - 1, 1)
        trainer.alpha = args.alpha + (args.alpha_end - args.alpha) * progress

        # Play one training game
        winner, td_error, n_moves = play_training_game(network, trainer)

        batch_td_error += td_error / max(n_moves, 1)
        batch_game_length += n_moves
        batch_white_wins += (1 if winner == 'w' else 0)
        batch_size += 1

        # Evaluation checkpoint
        if (game_num + 1) % args.eval_interval == 0:
            elapsed = time.time() - t_start
            avg_td = batch_td_error / batch_size
            avg_len = batch_game_length / batch_size
            w_pct = batch_white_wins / batch_size

            # Benchmark
            print(f"Game {game_num + 1:>7d} | Evaluating vs heuristic and random...", end=' ', flush=True)
            wr_h = benchmark_vs_heuristic(network, args.eval_games)
            wr_r = benchmark_vs_random(network, args.eval_games)

            print(f"done")
            print(f"  alpha={trainer.alpha:.4f} | td_err={avg_td:.4f} | "
                  f"game_len={avg_len:.0f} | white={w_pct:.1%}")
            print(f"  vs Heuristic: {wr_h:.1%} | vs Random: {wr_r:.1%}")
            print(f"  Elapsed: {elapsed:.0f}s ({(game_num + 1 - start_game) / elapsed:.0f} games/s)")
            print()

            # Log to CSV
            log_writer.writerow([
                game_num + 1, f'{elapsed:.1f}', f'{trainer.alpha:.4f}',
                f'{avg_td:.4f}', f'{avg_len:.1f}', f'{w_pct:.3f}',
                f'{wr_h:.3f}', f'{wr_r:.3f}',
            ])
            log_file.flush()

            # Save checkpoint
            ckpt_path = os.path.join(args.checkpoint_dir, f'model_{game_num + 1}.npz')
            network.save(ckpt_path)

            # Reset batch stats
            batch_td_error = 0.0
            batch_game_length = 0
            batch_white_wins = 0
            batch_size = 0

    # Final save
    elapsed = time.time() - t_start
    final_game = start_game + args.games
    final_path = os.path.join(args.checkpoint_dir, f'model_final_{final_game}.npz')
    network.save(final_path)
    print(f"\nTraining complete. {args.games} games in {elapsed:.0f}s "
          f"({args.games / elapsed:.0f} games/s)")
    print(f"Final model saved to {final_path}")

    log_file.close()


if __name__ == '__main__':
    main()
