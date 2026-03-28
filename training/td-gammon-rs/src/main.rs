//! TD-Gammon trainer in Rust.
//!
//! Trains a 198->80->1 MLP via TD(lambda) self-play, then exports weights as JSON.
//! Port of the Python training code, but ~50x faster.

use rand::Rng;
use serde::Serialize;
use std::env;
use std::fs;
use std::io::{self, Write};
use std::time::Instant;

// ── Constants ──────────────────────────────────────────────────────

const W_BAR: usize = 0;
const B_BAR: usize = 25;
const CHECKERS_PER_PLAYER: i32 = 15;
const INPUT_SIZE: usize = 198;

const INITIAL_BOARD: [i32; 26] = [
    0,   // 0: white bar
    -2,  // 1
    0, 0, 0, 0,
    5,   // 6
    0,
    3,   // 8
    0, 0, 0,
    -5,  // 12
    5,   // 13
    0, 0, 0,
    -3,  // 17
    0,
    -5,  // 19
    0, 0, 0, 0,
    2,   // 24
    0,   // 25: black bar
];

// ── Board / Game Engine ────────────────────────────────────────────

type Board = [i32; 26];

#[derive(Clone, Copy)]
struct CheckerMove {
    from: usize,
    to: usize,
    die: u8,
    hit: bool,
}

fn checkers_at(board: &Board, point: usize, white: bool) -> i32 {
    let val = board[point];
    if white { if val > 0 { val } else { 0 } }
    else { if val < 0 { -val } else { 0 } }
}

fn is_blocked(board: &Board, point: usize, white: bool) -> bool {
    if white { board[point] <= -2 } else { board[point] >= 2 }
}

fn is_blot(board: &Board, point: usize, white: bool) -> bool {
    if white { board[point] == -1 } else { board[point] == 1 }
}

fn has_bar_checkers(board: &Board, white: bool) -> bool {
    if white { board[W_BAR] > 0 } else { board[B_BAR] < 0 }
}

fn all_in_home(board: &Board, white: bool) -> bool {
    if white {
        if board[W_BAR] > 0 { return false; }
        for i in 7..=24 { if board[i] > 0 { return false; } }
    } else {
        if board[B_BAR] < 0 { return false; }
        for i in 1..=18 { if board[i] < 0 { return false; } }
    }
    true
}

fn furthest_checker(board: &Board, white: bool) -> usize {
    if white {
        if board[W_BAR] > 0 { return 25; }
        for i in (1..=24).rev() { if board[i] > 0 { return i; } }
        0
    } else {
        if board[B_BAR] < 0 { return 0; }
        for i in 1..=24 { if board[i] < 0 { return i; } }
        25
    }
}

fn apply_move(board: &mut Board, m: &CheckerMove, white: bool) {
    let sign: i32 = if white { 1 } else { -1 };
    board[m.from] -= sign;

    if m.to == 0 || m.to >= 25 {
        return;
    }

    if m.hit {
        board[m.to] = 0;
        let opp_bar = if white { B_BAR } else { W_BAR };
        board[opp_bar] += if white { -1 } else { 1 };
    }

    board[m.to] += sign;
}

fn try_move(board: &Board, from: usize, die: u8, white: bool) -> Option<CheckerMove> {
    if checkers_at(board, from, white) == 0 { return None; }

    let die_i = die as i32;
    let to_i: i32 = if white {
        if from == W_BAR { 25 - die_i } else { from as i32 - die_i }
    } else {
        if from == B_BAR { die_i } else { from as i32 + die_i }
    };

    // Bearing off
    if (white && to_i <= 0) || (!white && to_i >= 25) {
        if !all_in_home(board, white) { return None; }
        let dist = if white { from as i32 } else { 25 - from as i32 };
        if die_i == dist {
            let bear_off = if white { 0 } else { 25 };
            return Some(CheckerMove { from, to: bear_off, die, hit: false });
        }
        if die_i > dist {
            let highest = furthest_checker(board, white);
            if white && from < highest { return None; }
            if !white && from > highest { return None; }
            if white && highest <= from { return Some(CheckerMove { from, to: 0, die, hit: false }); }
            if !white && highest >= from { return Some(CheckerMove { from, to: 25, die, hit: false }); }
            return None;
        }
        return None;
    }

    let to = to_i as usize;
    if is_blocked(board, to, white) { return None; }
    let hit = is_blot(board, to, white);
    Some(CheckerMove { from, to, die, hit })
}

fn single_die_moves(board: &Board, die: u8, white: bool, out: &mut Vec<CheckerMove>) {
    out.clear();
    let bar = if white { W_BAR } else { B_BAR };

    if has_bar_checkers(board, white) {
        if let Some(m) = try_move(board, bar, die, white) {
            out.push(m);
        }
        return;
    }

    for i in 1..=24 {
        if checkers_at(board, i, white) > 0 {
            if let Some(m) = try_move(board, i, die, white) {
                out.push(m);
            }
        }
    }
}

/// Generate all legal turn sequences.
fn generate_all_turns(board: &Board, dice: (u8, u8), white: bool) -> Vec<(Vec<CheckerMove>, Board)> {
    let is_doubles = dice.0 == dice.1;
    let dice_values: Vec<u8> = if is_doubles {
        vec![dice.0; 4]
    } else {
        vec![dice.0, dice.1]
    };

    let mut results: Vec<(Vec<CheckerMove>, Board, usize)> = Vec::new();
    let mut moves_buf = Vec::with_capacity(4);
    let mut single_moves = Vec::with_capacity(20);

    fn search(
        board: &Board,
        remaining: &[u8],
        moves_so_far: &mut Vec<CheckerMove>,
        dice_used: usize,
        results: &mut Vec<(Vec<CheckerMove>, Board, usize)>,
        white: bool,
        single_moves: &mut Vec<CheckerMove>,
    ) {
        if remaining.is_empty() {
            results.push((moves_so_far.clone(), *board, dice_used));
            return;
        }

        let mut any_move = false;
        let mut tried: u8 = 0;

        for di in 0..remaining.len() {
            let die = remaining[di];
            let bit = 1u8 << die;
            if tried & bit != 0 { continue; }
            tried |= bit;

            single_die_moves(board, die, white, single_moves);
            let possible: Vec<CheckerMove> = single_moves.clone();

            for m in &possible {
                any_move = true;
                let mut new_board = *board;
                apply_move(&mut new_board, m, white);

                let mut new_remaining: Vec<u8> = Vec::with_capacity(remaining.len() - 1);
                for (i, &d) in remaining.iter().enumerate() {
                    if i != di { new_remaining.push(d); }
                }

                moves_so_far.push(*m);
                search(&new_board, &new_remaining, moves_so_far, dice_used + 1, results, white, single_moves);
                moves_so_far.pop();
            }
        }

        if !any_move {
            results.push((moves_so_far.clone(), *board, dice_used));
        }
    }

    search(board, &dice_values, &mut moves_buf, 0, &mut results, white, &mut single_moves);

    if results.is_empty() {
        return vec![(vec![], *board)];
    }

    let max_used = results.iter().map(|r| r.2).max().unwrap_or(0);
    let mut filtered: Vec<_> = results.into_iter().filter(|r| r.2 == max_used).collect();

    if !is_doubles && max_used == 1 {
        let higher = dice.0.max(dice.1);
        let uses_higher: Vec<_> = filtered.iter()
            .filter(|r| !r.0.is_empty() && r.0[0].die == higher)
            .cloned()
            .collect();
        if !uses_higher.is_empty() {
            filtered = uses_higher;
        }
    }

    // Deduplicate by board state + move sequence
    let mut seen = std::collections::HashSet::new();
    let mut unique = Vec::new();
    for (moves, brd, _) in filtered {
        let mut key = Vec::with_capacity(26 + moves.len() * 2);
        for &v in brd.iter() { key.push(v as i64); }
        for m in &moves { key.push(m.from as i64); key.push(m.to as i64); }
        if seen.insert(key) {
            unique.push((moves, brd));
        }
    }

    if unique.is_empty() { vec![(vec![], *board)] } else { unique }
}

fn apply_turn_moves(board: &Board, moves: &[CheckerMove], white: bool, w_off: i32, b_off: i32) -> (Board, i32, i32) {
    let mut new_board = *board;
    let mut wo = w_off;
    let mut bo = b_off;
    for m in moves {
        apply_move(&mut new_board, m, white);
        if m.to == 0 || m.to >= 25 {
            if white { wo += 1; } else { bo += 1; }
        }
    }
    (new_board, wo, bo)
}

// ── Encoding ───────────────────────────────────────────────────────

fn encode_board(board: &Board, white_off: i32, black_off: i32, white_turn: bool, out: &mut [f32; INPUT_SIZE]) {
    *out = [0.0; INPUT_SIZE];
    let mut idx = 0;

    for point in 1..=24 {
        let val = board[point];
        let w = if val > 0 { val } else { 0 };
        if w >= 1 { out[idx] = 1.0; }
        if w >= 2 { out[idx + 1] = 1.0; }
        if w >= 3 { out[idx + 2] = 1.0; out[idx + 3] = (w - 3) as f32 * 0.5; }
        idx += 4;

        let b = if val < 0 { -val } else { 0 };
        if b >= 1 { out[idx] = 1.0; }
        if b >= 2 { out[idx + 1] = 1.0; }
        if b >= 3 { out[idx + 2] = 1.0; out[idx + 3] = (b - 3) as f32 * 0.5; }
        idx += 4;
    }

    let w_bar = if board[W_BAR] > 0 { board[W_BAR] } else { 0 };
    let b_bar = if board[B_BAR] < 0 { -board[B_BAR] } else { 0 };
    out[192] = w_bar as f32 * 0.5;
    out[193] = b_bar as f32 * 0.5;
    out[194] = white_off as f32 / 15.0;
    out[195] = black_off as f32 / 15.0;
    out[196] = if white_turn { 1.0 } else { 0.0 };
    out[197] = 1.0;
}

// ── Neural Network ─────────────────────────────────────────────────

#[derive(Clone)]
struct Network {
    input_size: usize,
    hidden_size: usize,
    w1: Vec<f32>,   // [input_size * hidden_size] row-major
    b1: Vec<f32>,   // [hidden_size]
    w2: Vec<f32>,   // [hidden_size]
    b2: f32,
    // Cached activations
    input_cache: Vec<f32>,
    hidden_cache: Vec<f32>,
    output_cache: f32,
}

#[inline(always)]
fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

impl Network {
    fn new(input_size: usize, hidden_size: usize) -> Self {
        let mut rng = rand::thread_rng();
        let scale1 = (2.0 / (input_size + hidden_size) as f32).sqrt();
        let scale2 = (2.0 / (hidden_size + 1) as f32).sqrt();

        let w1: Vec<f32> = (0..input_size * hidden_size)
            .map(|_| rng.gen_range(-1.0..1.0) * scale1)
            .collect();
        let b1 = vec![0.0f32; hidden_size];
        let w2: Vec<f32> = (0..hidden_size)
            .map(|_| rng.gen_range(-1.0..1.0) * scale2)
            .collect();

        Network {
            input_size,
            hidden_size,
            w1, b1, w2, b2: 0.0,
            input_cache: vec![0.0; input_size],
            hidden_cache: vec![0.0; hidden_size],
            output_cache: 0.0,
        }
    }

    fn forward(&mut self, input: &[f32; INPUT_SIZE]) -> f32 {
        self.input_cache.copy_from_slice(input);

        for j in 0..self.hidden_size {
            let mut sum = self.b1[j];
            for i in 0..self.input_size {
                sum += input[i] * self.w1[i * self.hidden_size + j];
            }
            self.hidden_cache[j] = sigmoid(sum);
        }

        let mut out = self.b2;
        for j in 0..self.hidden_size {
            out += self.hidden_cache[j] * self.w2[j];
        }
        self.output_cache = sigmoid(out);
        self.output_cache
    }

    fn save_json(&self, path: &str) {
        let mut w1_2d: Vec<Vec<f32>> = Vec::with_capacity(self.input_size);
        for i in 0..self.input_size {
            let row: Vec<f32> = (0..self.hidden_size)
                .map(|j| self.w1[i * self.hidden_size + j])
                .collect();
            w1_2d.push(row);
        }
        let w2_2d: Vec<Vec<f32>> = self.w2.iter().map(|&v| vec![v]).collect();

        #[derive(Serialize)]
        struct Weights {
            #[serde(rename = "W1")]
            w1: Vec<Vec<f32>>,
            b1: Vec<f32>,
            #[serde(rename = "W2")]
            w2: Vec<Vec<f32>>,
            b2: Vec<f32>,
        }

        let w = Weights { w1: w1_2d, b1: self.b1.clone(), w2: w2_2d, b2: vec![self.b2] };
        let json = serde_json::to_string(&w).unwrap();
        fs::write(path, json).unwrap();
    }
}

// ── TD(lambda) Trainer ─────────────────────────────────────────────

struct TDTrainer {
    alpha: f32,
    lambda: f32,
    trace_w1: Vec<f32>,
    trace_b1: Vec<f32>,
    trace_w2: Vec<f32>,
    trace_b2: f32,
    /// Indices of non-zero inputs (reused across calls to avoid allocation)
    nonzero_inputs: Vec<usize>,
}

impl TDTrainer {
    fn new(net: &Network, alpha: f32, lambda: f32) -> Self {
        TDTrainer {
            alpha, lambda,
            trace_w1: vec![0.0; net.w1.len()],
            trace_b1: vec![0.0; net.b1.len()],
            trace_w2: vec![0.0; net.w2.len()],
            trace_b2: 0.0,
            nonzero_inputs: Vec::with_capacity(64),
        }
    }

    fn reset_traces(&mut self) {
        self.trace_w1.fill(0.0);
        self.trace_b1.fill(0.0);
        self.trace_w2.fill(0.0);
        self.trace_b2 = 0.0;
    }

    /// TD(0) update: no eligibility traces, just direct gradient step.
    /// Much faster because we only touch non-zero input weights.
    fn update_td0(&mut self, net: &mut Network, v_current: f32, v_next: f32) {
        let delta = v_next - v_current;
        let d_out = net.output_cache * (1.0 - net.output_cache);
        let alpha_delta = self.alpha * delta;

        let hs = net.hidden_size;

        // Output layer: w2 += alpha * delta * hidden * d_out
        for j in 0..hs {
            net.w2[j] += alpha_delta * net.hidden_cache[j] * d_out;
        }
        net.b2 += alpha_delta * d_out;

        // Find non-zero inputs (typically ~30-40 out of 198)
        self.nonzero_inputs.clear();
        for i in 0..net.input_size {
            if net.input_cache[i] != 0.0 {
                self.nonzero_inputs.push(i);
            }
        }

        // Hidden layer: only update W1 rows for non-zero inputs
        for j in 0..hs {
            let hj = net.hidden_cache[j];
            let d_hidden_j = d_out * net.w2[j] * hj * (1.0 - hj);

            net.b1[j] += alpha_delta * d_hidden_j;

            // Only update rows where input != 0
            for &i in &self.nonzero_inputs {
                let idx = i * hs + j;
                net.w1[idx] += alpha_delta * net.input_cache[i] * d_hidden_j;
            }
        }
    }

    /// TD(lambda) update with eligibility traces.
    fn update_tdlambda(&mut self, net: &mut Network, v_current: f32, v_next: f32) {
        let delta = v_next - v_current;
        let d_out = net.output_cache * (1.0 - net.output_cache);
        let alpha_delta = self.alpha * delta;
        let lam = self.lambda;

        let hs = net.hidden_size;
        let is = net.input_size;

        // Output layer
        for j in 0..hs {
            let grad = net.hidden_cache[j] * d_out;
            self.trace_w2[j] = lam * self.trace_w2[j] + grad;
            net.w2[j] += alpha_delta * self.trace_w2[j];
        }
        self.trace_b2 = lam * self.trace_b2 + d_out;
        net.b2 += alpha_delta * self.trace_b2;

        // Hidden layer
        for j in 0..hs {
            let hj = net.hidden_cache[j];
            let d_hidden_j = d_out * net.w2[j] * hj * (1.0 - hj);

            self.trace_b1[j] = lam * self.trace_b1[j] + d_hidden_j;
            net.b1[j] += alpha_delta * self.trace_b1[j];

            for i in 0..is {
                let idx = i * hs + j;
                let input_i = net.input_cache[i];
                if input_i != 0.0 {
                    self.trace_w1[idx] = lam * self.trace_w1[idx] + input_i * d_hidden_j;
                } else {
                    self.trace_w1[idx] *= lam;
                }
                net.w1[idx] += alpha_delta * self.trace_w1[idx];
            }
        }
    }

    fn update(&mut self, net: &mut Network, v_current: f32, v_next: f32) {
        if self.lambda == 0.0 {
            self.update_td0(net, v_current, v_next);
        } else {
            self.update_tdlambda(net, v_current, v_next);
        }
    }
}

// ── Heuristic AI (for benchmarking) ────────────────────────────────

fn pip_count(board: &Board, white: bool) -> i32 {
    let mut total = 0;
    if white {
        total += checkers_at(board, W_BAR, true) * 25;
        for i in 1..=24 { total += checkers_at(board, i, true) * i as i32; }
    } else {
        total += checkers_at(board, B_BAR, false) * 25;
        for i in 1..=24 { total += checkers_at(board, i, false) * (25 - i as i32); }
    }
    total
}

fn evaluate_heuristic(board: &Board, white: bool, color_off: i32, opp_off: i32) -> f32 {
    let mut score: f32 = 0.0;

    let my_pips = pip_count(board, white);
    let opp_pips = pip_count(board, !white);
    score += (opp_pips - my_pips) as f32 * 0.5;
    score += color_off as f32 * 15.0;
    score -= opp_off as f32 * 15.0;

    let my_bar = if white { W_BAR } else { B_BAR };
    let opp_bar = if white { B_BAR } else { W_BAR };
    score -= checkers_at(board, my_bar, white) as f32 * 30.0;
    score += checkers_at(board, opp_bar, !white) as f32 * 25.0;

    let (home_start, home_end) = if white { (1, 6) } else { (19, 24) };
    let (outer_start, outer_end) = if white { (7, 12) } else { (13, 18) };

    for i in 1..=24usize {
        let my_count = checkers_at(board, i, white);
        if my_count >= 2 {
            if i >= home_start && i <= home_end { score += 8.0 + my_count as f32; }
            else if i >= outer_start && i <= outer_end { score += 5.0; }
            else { score += 4.0; }
        } else if my_count == 1 {
            let dist = if white { i as f32 } else { 25.0 - i as f32 };
            if dist > 6.0 { score -= 6.0 + dist * 0.5; } else { score -= 3.0; }
        }
    }

    let mut consecutive = 0i32;
    let mut max_prime = 0i32;
    for i in 1..=24 {
        if checkers_at(board, i, white) >= 2 { consecutive += 1; if consecutive > max_prime { max_prime = consecutive; } }
        else { consecutive = 0; }
    }
    if max_prime >= 3 { score += max_prime as f32 * 8.0; }
    if max_prime >= 6 { score += 30.0; }

    let mut home_points = 0;
    for i in home_start..=home_end {
        if checkers_at(board, i, white) >= 2 { home_points += 1; }
    }
    score += home_points as f32 * 5.0;

    for i in 1..=24 {
        let c = checkers_at(board, i, white);
        if c > 3 { score -= (c - 3) as f32 * 2.0; }
    }

    score
}

fn choose_best_heuristic(board: &Board, dice: (u8, u8), white: bool, w_off: i32, b_off: i32) -> Vec<CheckerMove> {
    let all_turns = generate_all_turns(board, dice, white);
    if all_turns.len() == 1 && all_turns[0].0.is_empty() { return vec![]; }

    let mut best_score = f32::NEG_INFINITY;
    let mut best_idx = 0;

    for (i, (moves, result_board)) in all_turns.iter().enumerate() {
        let (_, wo, bo) = apply_turn_moves(board, moves, white, w_off, b_off);
        if white && wo == CHECKERS_PER_PLAYER { return moves.clone(); }
        if !white && bo == CHECKERS_PER_PLAYER { return moves.clone(); }

        let (my_off, opp_off) = if white { (wo, bo) } else { (bo, wo) };
        let mut score = evaluate_heuristic(result_board, white, my_off, opp_off);
        let hits = moves.iter().filter(|m| m.hit).count();
        score += hits as f32 * 12.0;

        if score > best_score { best_score = score; best_idx = i; }
    }

    all_turns[best_idx].0.clone()
}

// ── Training & Evaluation ──────────────────────────────────────────

fn roll_dice(rng: &mut impl Rng) -> (u8, u8) {
    (rng.gen_range(1..=6), rng.gen_range(1..=6))
}

fn choose_best_nn(net: &mut Network, board: &Board, dice: (u8, u8), white: bool, w_off: i32, b_off: i32) -> (Vec<CheckerMove>, Board, i32, i32) {
    let all_turns = generate_all_turns(board, dice, white);
    if all_turns.len() == 1 && all_turns[0].0.is_empty() {
        return (vec![], *board, w_off, b_off);
    }

    let mut enc = [0.0f32; INPUT_SIZE];
    let mut best_score = f32::NEG_INFINITY;
    let mut best_idx = 0;

    // Store results for the winner
    let mut all_results: Vec<(Board, i32, i32)> = Vec::with_capacity(all_turns.len());

    for (i, (moves, result_board)) in all_turns.iter().enumerate() {
        let (_, wo, bo) = apply_turn_moves(board, moves, white, w_off, b_off);

        if white && wo == CHECKERS_PER_PLAYER {
            return (moves.clone(), *result_board, wo, bo);
        }
        if !white && bo == CHECKERS_PER_PLAYER {
            return (moves.clone(), *result_board, wo, bo);
        }

        all_results.push((*result_board, wo, bo));

        // After current player moves, it's the opponent's turn
        encode_board(result_board, wo, bo, !white, &mut enc);
        let p_white = net.forward(&enc);
        let score = if white { p_white } else { 1.0 - p_white };

        if score > best_score { best_score = score; best_idx = i; }
    }

    let (brd, wo, bo) = all_results[best_idx];
    (all_turns[best_idx].0.clone(), brd, wo, bo)
}

fn play_training_game(net: &mut Network, trainer: &mut TDTrainer, rng: &mut impl Rng) -> (bool, f32, u32) {
    let mut board = INITIAL_BOARD;
    let mut w_off = 0i32;
    let mut b_off = 0i32;
    let mut white_turn = true;
    let mut total_td_error = 0.0f32;
    let mut num_moves = 0u32;

    trainer.reset_traces();

    let mut enc = [0.0f32; INPUT_SIZE];
    encode_board(&board, w_off, b_off, white_turn, &mut enc);
    let mut v_prev = net.forward(&enc);

    for _ in 0..500 {
        let dice = roll_dice(rng);
        let (_, new_board, new_wo, new_bo) = choose_best_nn(net, &board, dice, white_turn, w_off, b_off);

        board = new_board;
        w_off = new_wo;
        b_off = new_bo;
        num_moves += 1;

        if w_off == CHECKERS_PER_PLAYER {
            trainer.update(net, v_prev, 1.0);
            total_td_error += (1.0 - v_prev).abs();
            return (true, total_td_error, num_moves);
        }
        if b_off == CHECKERS_PER_PLAYER {
            trainer.update(net, v_prev, 0.0);
            total_td_error += v_prev.abs();
            return (false, total_td_error, num_moves);
        }

        white_turn = !white_turn;
        encode_board(&board, w_off, b_off, white_turn, &mut enc);
        let v_next = net.forward(&enc);

        trainer.update(net, v_prev, v_next);
        total_td_error += (v_next - v_prev).abs();
        v_prev = v_next;
    }

    let winner_white = w_off > b_off;
    let final_v = if winner_white { 1.0 } else { 0.0 };
    trainer.update(net, v_prev, final_v);
    (winner_white, total_td_error, num_moves)
}

fn benchmark_vs_heuristic(net: &mut Network, n_games: u32, rng: &mut impl Rng) -> f32 {
    let half = n_games / 2;
    let mut nn_wins = 0u32;

    for game in 0..n_games {
        let nn_is_white = game < half;
        let mut board = INITIAL_BOARD;
        let (mut w_off, mut b_off) = (0, 0);
        let mut white_turn = true;

        for _ in 0..500 {
            let dice = roll_dice(rng);
            let is_nn = white_turn == nn_is_white;

            if is_nn {
                let (_, b, wo, bo) = choose_best_nn(net, &board, dice, white_turn, w_off, b_off);
                board = b; w_off = wo; b_off = bo;
            } else {
                let m = choose_best_heuristic(&board, dice, white_turn, w_off, b_off);
                let (b, wo, bo) = apply_turn_moves(&board, &m, white_turn, w_off, b_off);
                board = b; w_off = wo; b_off = bo;
            }

            if w_off == CHECKERS_PER_PLAYER {
                if nn_is_white { nn_wins += 1; }
                break;
            }
            if b_off == CHECKERS_PER_PLAYER {
                if !nn_is_white { nn_wins += 1; }
                break;
            }
            white_turn = !white_turn;
        }
    }

    nn_wins as f32 / n_games as f32
}

fn benchmark_vs_random(net: &mut Network, n_games: u32, rng: &mut impl Rng) -> f32 {
    let half = n_games / 2;
    let mut nn_wins = 0u32;

    for game in 0..n_games {
        let nn_is_white = game < half;
        let mut board = INITIAL_BOARD;
        let (mut w_off, mut b_off) = (0, 0);
        let mut white_turn = true;

        for _ in 0..500 {
            let dice = roll_dice(rng);
            let is_nn = white_turn == nn_is_white;

            if is_nn {
                let (_, b, wo, bo) = choose_best_nn(net, &board, dice, white_turn, w_off, b_off);
                board = b; w_off = wo; b_off = bo;
            } else {
                let all = generate_all_turns(&board, dice, white_turn);
                let idx = rng.gen_range(0..all.len());
                let (b, wo, bo) = apply_turn_moves(&board, &all[idx].0, white_turn, w_off, b_off);
                board = b; w_off = wo; b_off = bo;
            }

            if w_off == CHECKERS_PER_PLAYER {
                if nn_is_white { nn_wins += 1; }
                break;
            }
            if b_off == CHECKERS_PER_PLAYER {
                if !nn_is_white { nn_wins += 1; }
                break;
            }
            white_turn = !white_turn;
        }
    }

    nn_wins as f32 / n_games as f32
}

// ── Main ───────────────────────────────────────────────────────────

fn main() {
    let args: Vec<String> = env::args().collect();

    let mut num_games: u32 = 200_000;
    let mut hidden_size: usize = 80;
    let mut alpha_start: f32 = 0.1;
    let mut alpha_end: f32 = 0.01;
    let mut lambda: f32 = 0.7;
    let mut eval_interval: u32 = 5_000;
    let mut eval_games: u32 = 200;
    let mut output_path = String::from("model.json");

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--games" => { num_games = args[i+1].parse().unwrap(); i += 2; }
            "--hidden" => { hidden_size = args[i+1].parse().unwrap(); i += 2; }
            "--alpha" => { alpha_start = args[i+1].parse().unwrap(); i += 2; }
            "--alpha-end" => { alpha_end = args[i+1].parse().unwrap(); i += 2; }
            "--lambda" => { lambda = args[i+1].parse().unwrap(); i += 2; }
            "--eval-interval" => { eval_interval = args[i+1].parse().unwrap(); i += 2; }
            "--eval-games" => { eval_games = args[i+1].parse().unwrap(); i += 2; }
            "--output" | "-o" => { output_path = args[i+1].clone(); i += 2; }
            _ => { eprintln!("Unknown arg: {}", args[i]); i += 1; }
        }
    }

    println!("TD-Gammon Trainer (Rust)");
    println!("  Games: {num_games}, Hidden: {hidden_size}, Alpha: {alpha_start}->{alpha_end}, Lambda: {lambda}");
    println!("  Eval every {eval_interval} games ({eval_games} games per eval)");
    println!("  Output: {output_path}");
    println!();

    let mut net = Network::new(INPUT_SIZE, hidden_size);
    let mut trainer = TDTrainer::new(&net, alpha_start, lambda);
    let mut rng = rand::thread_rng();

    // CSV log
    let mut csv = fs::File::create("training_log.csv").unwrap();
    writeln!(csv, "game,elapsed_sec,alpha,avg_td_error,avg_game_length,white_win_pct,wr_vs_heuristic,wr_vs_random").unwrap();

    let t_start = Instant::now();
    let mut batch_td = 0.0f32;
    let mut batch_len = 0u64;
    let mut batch_white = 0u32;
    let mut batch_count = 0u32;

    for game in 0..num_games {
        let progress = game as f32 / (num_games - 1).max(1) as f32;
        trainer.alpha = alpha_start + (alpha_end - alpha_start) * progress;

        let (white_won, td_error, n_moves) = play_training_game(&mut net, &mut trainer, &mut rng);
        batch_td += td_error / n_moves.max(1) as f32;
        batch_len += n_moves as u64;
        batch_white += if white_won { 1 } else { 0 };
        batch_count += 1;

        if (game + 1) % eval_interval == 0 {
            let elapsed = t_start.elapsed().as_secs_f64();
            let avg_td = batch_td / batch_count as f32;
            let avg_len = batch_len as f64 / batch_count as f64;
            let w_pct = batch_white as f32 / batch_count as f32;

            print!("Game {:>7} | Evaluating... ", game + 1);
            io::stdout().flush().unwrap();

            let wr_h = benchmark_vs_heuristic(&mut net, eval_games, &mut rng);
            let wr_r = benchmark_vs_random(&mut net, eval_games, &mut rng);

            println!("done");
            println!("  alpha={:.4} | td_err={:.4} | game_len={:.0} | white={:.1}%",
                     trainer.alpha, avg_td, avg_len, w_pct * 100.0);
            println!("  vs Heuristic: {:.1}% | vs Random: {:.1}%",
                     wr_h * 100.0, wr_r * 100.0);
            println!("  Elapsed: {:.0}s ({:.0} games/s)",
                     elapsed, (game + 1) as f64 / elapsed);
            println!();

            writeln!(csv, "{},{:.1},{:.4},{:.4},{:.1},{:.3},{:.3},{:.3}",
                     game + 1, elapsed, trainer.alpha, avg_td, avg_len, w_pct, wr_h, wr_r).unwrap();
            csv.flush().unwrap();

            net.save_json(&format!("checkpoint_{}.json", game + 1));

            batch_td = 0.0;
            batch_len = 0;
            batch_white = 0;
            batch_count = 0;
        }
    }

    let elapsed = t_start.elapsed().as_secs_f64();
    net.save_json(&output_path);
    println!("Training complete. {} games in {:.0}s ({:.0} games/s)",
             num_games, elapsed, num_games as f64 / elapsed);
    println!("Model saved to {output_path}");
}
