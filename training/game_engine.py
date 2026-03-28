"""
Python port of duckGammon's backgammon engine.

Board representation: 26-element list
  Index 0  = White bar
  Index 1-24 = Points 1-24
  Index 25 = Black bar
  Positive = white checkers, negative = black checkers

White moves 24->1 (bears off past 0), Black moves 1->24 (bears off past 25).
"""

from typing import List, Tuple, Optional, Set
from dataclasses import dataclass
import random

# Constants
W_BAR = 0
B_BAR = 25
CHECKERS_PER_PLAYER = 15

INITIAL_BOARD = [
    0,    # index 0: white bar
    -2,   # point 1:  2 black
    0, 0, 0, 0,
    5,    # point 6:  5 white
    0,
    3,    # point 8:  3 white
    0, 0, 0,
    -5,   # point 12: 5 black
    5,    # point 13: 5 white
    0, 0, 0,
    -3,   # point 17: 3 black
    0,
    -5,   # point 19: 5 black
    0, 0, 0, 0,
    2,    # point 24: 2 white
    0,    # index 25: black bar
]

Board = List[int]
Color = str  # 'w' or 'b'


@dataclass
class CheckerMove:
    frm: int    # from point (0=white bar, 25=black bar, 1-24=point)
    to: int     # to point (0=bear off white, 25=bear off black, 1-24=point)
    die: int    # which die value used
    hit: bool   # did this hit an opponent?


def clone_board(board: Board) -> Board:
    return board[:]


def checkers_at(board: Board, point: int, color: Color) -> int:
    val = board[point]
    if color == 'w':
        return val if val > 0 else 0
    return -val if val < 0 else 0


def is_blot(board: Board, point: int, color: Color) -> bool:
    opp = 'b' if color == 'w' else 'w'
    return checkers_at(board, point, opp) == 1


def is_blocked(board: Board, point: int, color: Color) -> bool:
    opp = 'b' if color == 'w' else 'w'
    return checkers_at(board, point, opp) >= 2


def has_bar_checkers(board: Board, color: Color) -> bool:
    bar = W_BAR if color == 'w' else B_BAR
    return checkers_at(board, bar, color) > 0


def all_in_home(board: Board, color: Color) -> bool:
    bar = W_BAR if color == 'w' else B_BAR
    if checkers_at(board, bar, color) > 0:
        return False
    if color == 'w':
        for i in range(7, 25):
            if board[i] > 0:
                return False
    else:
        for i in range(1, 19):
            if board[i] < 0:
                return False
    return True


def furthest_checker(board: Board, color: Color) -> int:
    if color == 'w':
        if board[W_BAR] > 0:
            return 25
        for i in range(24, 0, -1):
            if board[i] > 0:
                return i
        return 0
    else:
        if board[B_BAR] < 0:
            return 0
        for i in range(1, 25):
            if board[i] < 0:
                return i
        return 25


def apply_move(board: Board, move: CheckerMove, color: Color) -> None:
    """Apply a single checker move to the board. Mutates board."""
    sign = 1 if color == 'w' else -1
    opp_bar = B_BAR if color == 'w' else W_BAR

    board[move.frm] -= sign

    if move.to <= 0 or move.to >= 25:
        return

    if move.hit:
        board[move.to] = 0
        board[opp_bar] += (-1 if color == 'w' else 1)

    board[move.to] += sign


def destination(frm: int, die: int, color: Color) -> int:
    if color == 'w':
        if frm == W_BAR:
            return 25 - die
        return frm - die
    else:
        if frm == B_BAR:
            return die
        return frm + die


def try_move(board: Board, frm: int, die: int, color: Color) -> Optional[CheckerMove]:
    if checkers_at(board, frm, color) == 0:
        return None

    to = destination(frm, die, color)

    # Bearing off
    if (color == 'w' and to <= 0) or (color == 'b' and to >= 25):
        if not all_in_home(board, color):
            return None
        dist = frm if color == 'w' else 25 - frm
        if die == dist:
            bear_off_to = 0 if color == 'w' else 25
            return CheckerMove(frm, bear_off_to, die, False)
        if die > dist:
            highest = furthest_checker(board, color)
            if color == 'w' and frm < highest:
                return None
            if color == 'b' and frm > highest:
                return None
            if color == 'w' and highest <= frm:
                return CheckerMove(frm, 0, die, False)
            if color == 'b' and highest >= frm:
                return CheckerMove(frm, 25, die, False)
            return None
        return None

    if is_blocked(board, to, color):
        return None

    hit = is_blot(board, to, color)
    return CheckerMove(frm, to, die, hit)


def single_die_moves(board: Board, die: int, color: Color) -> List[CheckerMove]:
    moves = []
    bar = W_BAR if color == 'w' else B_BAR

    if has_bar_checkers(board, color):
        move = try_move(board, bar, die, color)
        if move:
            moves.append(move)
        return moves

    for i in range(1, 25):
        if checkers_at(board, i, color) > 0:
            move = try_move(board, i, die, color)
            if move:
                moves.append(move)
    return moves


def generate_all_turns(board: Board, dice: Tuple[int, int], color: Color) -> List[List[CheckerMove]]:
    """Generate all legal turn sequences for given board, dice, and color."""
    is_doubles = dice[0] == dice[1]
    dice_values = [dice[0]] * 4 if is_doubles else [dice[0], dice[1]]

    results = []  # list of (moves, board, dice_used)

    def search(current_board: Board, remaining: List[int], moves_so_far: List[CheckerMove], dice_used: int):
        if not remaining:
            results.append((list(moves_so_far), clone_board(current_board), dice_used))
            return

        any_move = False
        tried = set()

        for di in range(len(remaining)):
            die = remaining[di]
            if die in tried:
                continue
            tried.add(die)

            possible = single_die_moves(current_board, die, color)
            for move in possible:
                any_move = True
                new_board = clone_board(current_board)
                apply_move(new_board, move, color)

                new_remaining = remaining[:di] + remaining[di+1:]
                moves_so_far.append(move)
                search(new_board, new_remaining, moves_so_far, dice_used + 1)
                moves_so_far.pop()

        if not any_move:
            results.append((list(moves_so_far), clone_board(current_board), dice_used))

    search(clone_board(board), dice_values, [], 0)

    if not results:
        return [[]]

    max_used = max(r[2] for r in results)
    filtered = [r for r in results if r[2] == max_used]

    if not is_doubles and max_used == 1:
        higher = max(dice[0], dice[1])
        uses_higher = [r for r in filtered if r[0] and r[0][0].die == higher]
        if uses_higher:
            filtered = uses_higher

    # Deduplicate by final board state + move sequence
    seen = set()
    unique = []
    for moves, brd, _ in filtered:
        key = tuple(brd) + tuple((m.frm, m.to) for m in moves)
        if key not in seen:
            seen.add(key)
            unique.append(moves)

    return unique if unique else [[]]


def apply_turn_moves(board: Board, moves: List[CheckerMove], color: Color,
                     white_off: int, black_off: int) -> Tuple[Board, int, int]:
    """Apply a full turn and return (new_board, white_off, black_off)."""
    new_board = clone_board(board)
    w_off = white_off
    b_off = black_off
    for move in moves:
        apply_move(new_board, move, color)
        if move.to <= 0 or move.to >= 25:
            if color == 'w':
                w_off += 1
            else:
                b_off += 1
    return new_board, w_off, b_off


def pip_count(board: Board, color: Color) -> int:
    """Calculate pip count for a color."""
    total = 0
    if color == 'w':
        # White bears off past 0, so pip count = sum of point * checkers
        total += checkers_at(board, W_BAR, 'w') * 25
        for i in range(1, 25):
            total += checkers_at(board, i, 'w') * i
    else:
        total += checkers_at(board, B_BAR, 'b') * 25
        for i in range(1, 25):
            total += checkers_at(board, i, 'b') * (25 - i)
    return total


def roll_dice() -> Tuple[int, int]:
    return (random.randint(1, 6), random.randint(1, 6))


def count_checkers(board: Board, color: Color) -> int:
    total = 0
    for i in range(26):
        total += checkers_at(board, i, color)
    return total


# --- Heuristic AI (port of ai.ts for benchmarking) ---

def evaluate_position_heuristic(board: Board, color: Color, color_off: int, opp_off: int) -> float:
    """Heuristic position evaluation (port of ai.ts evaluatePosition)."""
    opp = 'b' if color == 'w' else 'w'
    score = 0.0

    my_pips = pip_count(board, color)
    opp_pips = pip_count(board, opp)
    score += (opp_pips - my_pips) * 0.5

    score += color_off * 15
    score -= opp_off * 15

    my_bar = W_BAR if color == 'w' else B_BAR
    opp_bar = B_BAR if color == 'w' else W_BAR
    score -= checkers_at(board, my_bar, color) * 30
    score += checkers_at(board, opp_bar, opp) * 25

    home_start = 1 if color == 'w' else 19
    home_end = 6 if color == 'w' else 24
    outer_start = 7 if color == 'w' else 13
    outer_end = 12 if color == 'w' else 18

    for i in range(1, 25):
        my_count = checkers_at(board, i, color)
        if my_count >= 2:
            if home_start <= i <= home_end:
                score += 8 + my_count
            elif outer_start <= i <= outer_end:
                score += 5
            else:
                score += 4
        elif my_count == 1:
            dist = i if color == 'w' else 25 - i
            if dist > 6:
                score -= 6 + dist * 0.5
            else:
                score -= 3

    consecutive = 0
    max_prime = 0
    for i in range(1, 25):
        if checkers_at(board, i, color) >= 2:
            consecutive += 1
            if consecutive > max_prime:
                max_prime = consecutive
        else:
            consecutive = 0
    if max_prime >= 3:
        score += max_prime * 8
    if max_prime >= 6:
        score += 30

    home_points = 0
    for i in range(home_start, home_end + 1):
        if checkers_at(board, i, color) >= 2:
            home_points += 1
    score += home_points * 5

    for i in range(1, 25):
        c = checkers_at(board, i, color)
        if c > 3:
            score -= (c - 3) * 2

    return score


def choose_best_turn_heuristic(board: Board, dice: Tuple[int, int], turn: Color,
                                white_off: int, black_off: int) -> List[CheckerMove]:
    """Choose best turn using heuristic evaluation (port of ai.ts)."""
    all_turns = generate_all_turns(board, dice, turn)
    if not all_turns or (len(all_turns) == 1 and len(all_turns[0]) == 0):
        return []

    best_score = float('-inf')
    best_turn = all_turns[0]

    for turn_moves in all_turns:
        result_board, w_off, b_off = apply_turn_moves(board, turn_moves, turn, white_off, black_off)
        my_off = w_off if turn == 'w' else b_off
        opp_off = b_off if turn == 'w' else w_off
        score = evaluate_position_heuristic(result_board, turn, my_off, opp_off)
        hits = sum(1 for m in turn_moves if m.hit)
        score += hits * 12

        if turn == 'w' and w_off == CHECKERS_PER_PLAYER:
            return turn_moves
        if turn == 'b' and b_off == CHECKERS_PER_PLAYER:
            return turn_moves

        if score > best_score:
            best_score = score
            best_turn = turn_moves

    return best_turn
