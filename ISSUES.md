# duckGammon — Issue Tracker

Comprehensive codebase review (2026-03-29). Issues ordered by severity.

---

## Critical

### C1. `undoMove()` corrupts game state
**File:** `src/engine/game.ts:134-182`
**Problem:** The hit-reversal logic is inverted. When white captures a black blot at point 15 and then undoes:
- `opponentBar` is set to 25 (should be B_BAR=25, OK) but the sign arithmetic is wrong
- `newBoard[25] -= -1` adds to white's index instead of removing from black's bar
- The function doesn't store the turn-start board, so it can't correctly reconstruct state after multiple undo operations

**Fix:** Add `boardAtTurnStart` to `GameState`. On undo, replay from turn start minus last move. Alternatively, fix the sign logic for single-undo correctness.

### C2. `doMove()` has no move validation
**File:** `src/engine/game.ts:91-131`
**Problem:** `doMove()` blindly applies any `CheckerMove` without checking if it's legal. The server's `GameRoom.handleMove()` validates via `legalDestinations()`, but the engine function itself is unprotected. Any code path that calls `doMove()` directly (e.g., timeout auto-play, AI, local mode) can corrupt the board.

**Fix:** Add legality check inside `doMove()` using `legalDestinations()`.

### C3. Socket listener memory leak in GameView
**File:** `src/ui/game/GameView.tsx:151-152`
**Problem:** `socket.onMessage()` and `socket.onStatus()` return unsubscribe functions, but GameView never captures or calls them. When the component unmounts and remounts (e.g., playing multiple games), stale handlers accumulate. After 10 games, 10 message handlers fire on every WebSocket message.

**Fix:** Capture unsubscribe functions and call them in `onCleanup()`.

### C4. Zero UI test coverage
**Files:** `src/ui/` (all files)
**Problem:** No unit, integration, or component tests for the entire UI layer. GameView.tsx alone is 1000+ lines with 23+ reactive signals and complex state transitions. Regressions caught only by users.

**Impact:** Cannot safely refactor GameView, socket.ts, or any UI component.

---

## High

### H1. No WebSocket message validation
**File:** `src/server/index.ts:182-184`
**Problem:** Client messages are parsed as JSON then cast to `ClientMessage` without runtime type checking. Missing fields (e.g., `msg.text` on a chat message without `text`) will crash the server. No message size limit — a 1GB payload crashes the process.

**Fix:** Add a `validateClientMessage()` type guard. Add 100KB message size limit before JSON.parse.

### H2. Race condition in join/reconnect
**File:** `src/server/index.ts:299-324`
**Problem:** If two WebSocket connections with the same userId send `join` simultaneously (one as reconnect, one as new join), `room.players` can be corrupted — both connections added or neither properly replaced.

**Fix:** Add a guard in `addPlayer()` that checks for existing userId, or add a reconnection lock.

### H3. `saveGame` lacks transaction
**File:** `src/server/index.ts:131-174`
**Problem:** White and black user stats are updated in separate queries. If the first succeeds and the second fails (DB error, constraint violation), stats are inconsistent.

**Fix:** Wrap the entire save operation in `db.transaction()`.

### H4. Auth message ordering on reconnect
**File:** `src/ui/net/socket.ts:44-51`
**Problem:** After reconnect, queued messages are flushed immediately upon receiving `authenticated`. But the queued moves may reference stale board state (from before disconnect). The server may reject them, causing UI desync.

**Fix:** Clear the queue on reconnect instead of flushing. Let the server's `game_start` resync state, then let the user re-issue moves.

### H5. Missing database indexes
**File:** `src/server/db/schema.ts`
**Problem:** No indexes on `friends(userId)`, `friends(friendId)`, `games(whiteId)`, `games(blackId)`, `games(createdAt)`. Every friend lookup and game history query is a full table scan.

**Fix:** Add indexes on these columns.

### H6. ~~Vite proxy port mismatch~~ (NOT A BUG)
**File:** `vite.config.ts:13-18`
**Status:** `.env` sets `PORT=8080`, vite proxy correctly targets 8080. CLAUDE.md and README.md references to port 3001 are the stale docs. The proxy was always correct.

---

## Medium

### M1. Over-bearing rule logic is confusing
**File:** `src/engine/moves.ts:57-70`
**Problem:** The over-bearing conditions have redundant/contradictory checks with a comment saying "Actually we need..." suggesting the author second-guessed the logic. The final `return null` on line 69 appears unreachable. While tests pass, the code is hard to verify correct.

**Fix:** Simplify to a single clear condition per color.

### M2. Silent phase transition errors
**File:** `src/engine/game.ts` (all state functions)
**Problem:** Every state function (`doRoll`, `doMove`, `doDouble`, etc.) silently returns the unchanged state when called in the wrong phase. This hides bugs — double-clicks, race conditions, and logic errors are swallowed.

**Fix:** At minimum, log invalid transitions. Consider throwing in dev mode.

### M3. NN evaluator silent failure
**File:** `src/engine/nn.ts`
**Problem:** `evaluatePositionNN()` returns 0 (neutral position) when the model isn't loaded. The AI silently plays as if every position is equal, making terrible moves with no error indication.

**Fix:** Throw an error, or fall back to heuristic evaluator explicitly.

### M4. No CSRF/Origin validation
**File:** `src/server/api.ts:51-58`
**Problem:** CORS is `Access-Control-Allow-Origin: *`. State-changing POST endpoints have no Origin header validation. Any website can make requests to the API on behalf of authenticated users (if using cookies — currently uses Bearer tokens, which mitigates this).

**Fix:** Restrict CORS origin in production. Validate Origin header on state-changing requests.

### M5. Unbounded pendingChallenges map
**File:** `src/server/index.ts:46,254`
**Problem:** Challenges are only cleaned up by a 60s setTimeout. Under load or if timers don't fire (e.g., event loop blocked), the map grows without bound.

**Fix:** Add periodic sweep or cap the map size.

### M6. No parseBody size limit
**File:** `src/server/api.ts:11-20`
**Problem:** HTTP request body parsing has no size limit. A client can send a multi-GB POST body and exhaust server memory.

**Fix:** Add `MAX_BODY_SIZE` check in the `data` handler.

### M7. Node version mismatch
**Files:** `.nvmrc` (22), `railway.json` (23), `package.json` (>=22)
**Problem:** Dev environment targets Node 22, production deploys on Node 23. Subtle version differences could cause hard-to-debug issues.

**Fix:** Align all files to the same version.

### M8. GameView.tsx too large
**File:** `src/ui/game/GameView.tsx` (1000+ lines)
**Problem:** 23+ signals, 3 game modes interleaved with conditionals, animation state, timer management, socket handling — all in one component. Untestable and hard to maintain.

**Fix:** Extract game mode strategies, state machine, and animation controller into separate modules.

### M9. No drag debouncing
**File:** `src/ui/board/Board.tsx`
**Problem:** `handleDragMove()` fires on every `pointermove` event (100+/sec) without RAF throttling. Can cause stutter on mobile.

**Fix:** Throttle to requestAnimationFrame.

### M10. Optimistic move updates without rollback
**File:** `src/ui/game/GameView.tsx`
**Problem:** In online mode, `doMove()` is applied locally before server confirmation. If the server rejects the move, the UI shows a wrong board until the next `state` message arrives.

**Fix:** Either don't apply optimistic moves, or add rollback on rejection.

### M11. No backpressure on ws.send()
**File:** `src/server/GameRoom.ts:85-89`
**Problem:** `ws.send()` can throw if the connection enters an error state. The exception is uncaught.

**Fix:** Add try-catch around `ws.send()` in the `send()` method.

### M12. disconnectTimer map not fully cleaned
**File:** `src/server/GameRoom.ts:399-402`
**Problem:** `destroy()` clears timeout callbacks but doesn't call `this.disconnectTimer.clear()`.

**Fix:** Add `.clear()` call.

### M13. No transaction for saveGame stats
**File:** `src/server/index.ts:131-174`
**Problem:** (Duplicate of H3 — the stats update loop has no transaction boundary.)

### M14. SQL subqueries in game history
**File:** `src/server/api.ts:203-204`
**Problem:** Uses `sql<string>` template for username subqueries instead of proper JOINs. While Drizzle parameterizes these, it's less type-safe and harder to maintain.

**Fix:** Use `.leftJoin()` with the users table.

---

## Blindspots

### B1. Accessibility is completely absent
No ARIA labels, no keyboard focus management, no screen reader support, color-only checker differentiation. Fails WCAG Level A across every guideline. Excludes ~15% of potential users.

### B2. No CI/CD pipeline
No GitHub Actions, no pre-commit hooks, no automated test runs on PR. Tests exist but nothing enforces running them before deploy.

### B3. No linting or formatting
No ESLint, no Prettier, no `.editorconfig`. Code style consistency relies on discipline.

### B4. Mobile UX likely broken
Board shrinks to ~131px height on small phones. No landscape media queries. Touch targets not sized for fingers (48px minimum recommended). Playwright tests check snapshots, not usability.

### B5. No monitoring/alerting in production
`/health` endpoint exists but no error tracking (Sentry), no uptime monitoring, no metrics on game completion rates or WS connection health.

### B6. Luck and AI evaluation are untested
`luck.ts` has zero tests. AI heuristic evaluation has zero tests. Only NN matrix math is verified.

### B7. Match play is engine-ready but unused
`match.ts` implements Crawford rule and score tracking, but no tests exist and the UI doesn't use it.

### B8. No rate limiting
WebSocket connections, API endpoints, chat messages — nothing prevents a single client from flooding the server.

### B9. Dead config file
`netlify.toml` exists but deployment is on Railway. Confusing for contributors.

### B10. Training reproducibility undocumented
The Rust training pipeline exists but README has no instructions for reproducing or customizing the model.

### B11. No reconnection jitter in socket client
`src/ui/net/socket.ts:66-71` — All disconnected clients retry at the same exponential intervals. 100 clients all hit the server simultaneously on retry. Missing random jitter.

### B12. Challenge expiration not notified to challenger
`src/server/index.ts:254` — When a challenge expires after 60s, the target gets "Challenge expired" on accept attempt, but the challenger is never notified their challenge silently died.
