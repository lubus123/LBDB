"""Quick tests to verify the Python game engine port matches TypeScript."""

import sys
sys.path.insert(0, '.')

from game_engine import (
    INITIAL_BOARD, W_BAR, B_BAR, CHECKERS_PER_PLAYER,
    clone_board, checkers_at, is_blot, is_blocked, has_bar_checkers,
    all_in_home, furthest_checker, apply_move, apply_turn_moves,
    generate_all_turns, pip_count, CheckerMove, roll_dice,
)
from encode import encode_board, INPUT_SIZE
import numpy as np


def test_initial_board():
    b = INITIAL_BOARD
    assert checkers_at(b, 6, 'w') == 5
    assert checkers_at(b, 8, 'w') == 3
    assert checkers_at(b, 13, 'w') == 5
    assert checkers_at(b, 24, 'w') == 2
    assert checkers_at(b, 1, 'b') == 2
    assert checkers_at(b, 12, 'b') == 5
    assert checkers_at(b, 17, 'b') == 3
    assert checkers_at(b, 19, 'b') == 5
    assert checkers_at(b, W_BAR, 'w') == 0
    assert checkers_at(b, B_BAR, 'b') == 0
    print("  initial_board: OK")


def test_pip_count():
    b = INITIAL_BOARD
    # White: 2*24 + 5*13 + 3*8 + 5*6 = 48+65+24+30 = 167
    assert pip_count(b, 'w') == 167
    # Black: 2*(25-1) + 5*(25-12) + 3*(25-17) + 5*(25-19) = 48+65+24+30 = 167
    assert pip_count(b, 'b') == 167
    print("  pip_count: OK")


def test_move_generation_opening():
    b = clone_board(INITIAL_BOARD)
    # Opening roll 3-1 for white
    turns = generate_all_turns(b, (3, 1), 'w')
    assert len(turns) > 0
    # All turns should use exactly 2 dice
    for t in turns:
        assert len(t) == 2, f"Expected 2 moves, got {len(t)}"
    print(f"  opening 3-1: {len(turns)} distinct turns, OK")


def test_move_generation_doubles():
    b = clone_board(INITIAL_BOARD)
    # Opening doubles 6-6 for white
    turns = generate_all_turns(b, (6, 6), 'w')
    assert len(turns) > 0
    for t in turns:
        assert len(t) == 4, f"Expected 4 moves for doubles, got {len(t)}"
    print(f"  opening 6-6: {len(turns)} distinct turns, OK")


def test_bearing_off():
    # Set up a bearing off position for white: all in home board
    b = [0] * 26
    b[1] = 3   # 3 white on point 1
    b[2] = 3   # 3 white on point 2
    b[3] = 3   # 3 white on point 3
    b[4] = 3   # 3 white on point 4
    b[5] = 2   # 2 white on point 5
    b[6] = 1   # 1 white on point 6
    # Put black checkers somewhere (already borne off most)
    b[19] = -5
    b[20] = -5
    b[21] = -5

    assert all_in_home(b, 'w')
    turns = generate_all_turns(b, (6, 5), 'w')
    assert len(turns) > 0
    # Should be able to bear off from points 6 and 5
    has_bearoff = any(any(m.to == 0 for m in t) for t in turns)
    assert has_bearoff, "Should have bear-off moves"
    print(f"  bearing off: {len(turns)} turns, OK")


def test_bar_entry():
    b = clone_board(INITIAL_BOARD)
    # Put white on bar
    b[W_BAR] = 1
    b[6] = 4  # reduce from 5

    assert has_bar_checkers(b, 'w')
    turns = generate_all_turns(b, (3, 1), 'w')
    # First move must be from bar
    for t in turns:
        assert t[0].frm == W_BAR, "First move must be from bar"
    print(f"  bar entry: {len(turns)} turns, OK")


def test_encoding():
    b = INITIAL_BOARD
    x = encode_board(b, 0, 0, 'w')
    assert x.shape == (INPUT_SIZE,)
    assert x.dtype == np.float32

    # Check bias is 1.0
    assert x[197] == 1.0
    # Check turn indicator (white)
    assert x[196] == 1.0
    # Check off counts are 0
    assert x[194] == 0.0
    assert x[195] == 0.0

    # Point 6 has 5 white checkers
    # Point 6 is at index (6-1)*8 = 40 (white features for point 6)
    idx = (6 - 1) * 8  # = 40
    assert x[idx] == 1.0      # >= 1
    assert x[idx+1] == 1.0    # >= 2
    assert x[idx+2] == 1.0    # >= 3
    assert x[idx+3] == 1.0    # (5-3)/2 = 1.0

    # Point 1 has 2 black checkers
    # Point 1 is at index (1-1)*8 + 4 = 4 (black features for point 1)
    idx = (1 - 1) * 8 + 4  # = 4
    assert x[idx] == 1.0      # >= 1
    assert x[idx+1] == 1.0    # >= 2
    assert x[idx+2] == 0.0    # not >= 3
    assert x[idx+3] == 0.0

    print("  encoding: OK")


def test_self_play_game():
    """Sanity check: play a full game with random moves."""
    from evaluate import play_game, choose_random_turn

    def random_chooser(board, dice, turn, w_off, b_off):
        return choose_random_turn(board, dice, turn)

    winner = play_game(random_chooser, random_chooser)
    assert winner in ('w', 'b')
    print(f"  self-play (random): winner={winner}, OK")


def test_network_forward():
    from network import Network
    net = Network(198, 80, 1)
    b = INITIAL_BOARD
    x = encode_board(b, 0, 0, 'w')
    v = net.forward(x)
    assert 0.0 <= v <= 1.0, f"Output should be in [0,1], got {v}"
    print(f"  network forward: v={v:.4f}, OK")


def test_td_update():
    from network import Network, TDTrainer
    net = Network(198, 80, 1)
    trainer = TDTrainer(net, alpha=0.1, lambd=0.7)
    trainer.reset_traces()

    b = INITIAL_BOARD
    x = encode_board(b, 0, 0, 'w')
    v1 = net.forward(x)

    # Simulate a TD update toward 1.0 (white winning)
    trainer.update(v1, 1.0)

    # After update, value should move toward 1.0
    v2 = net.forward(x)
    assert v2 > v1, f"Value should increase toward target, but {v2} <= {v1}"
    print(f"  td_update: {v1:.4f} -> {v2:.4f}, OK")


if __name__ == '__main__':
    print("Running engine tests...")
    test_initial_board()
    test_pip_count()
    test_move_generation_opening()
    test_move_generation_doubles()
    test_bearing_off()
    test_bar_entry()
    test_encoding()
    test_self_play_game()
    test_network_forward()
    test_td_update()
    print("\nAll tests passed!")
