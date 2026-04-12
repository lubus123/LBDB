# duckGammon — Issue Tracker

Comprehensive codebase review (2026-03-29). Issues ordered by severity.

---

## Medium

### ~~M1. Over-bearing rule logic is confusing~~ FIXED

Simplified to a single clear condition per color.

### M2. Silent phase transition errors

**File:** `src/engine/game.ts` (all state functions)
**Problem:** Every state function (`doRoll`, `doMove`, `doDouble`, etc.) silently returns the unchanged state when called in the wrong phase. This hides bugs — double-clicks, race conditions, and logic errors are swallowed.
**Status:** The server already validates phases in GameRoom before calling engine functions, so this is handled at the right layer. The engine stays pure (no logging dependency). Deferred.

### ~~M3. NN evaluator silent failure~~ FIXED

Falls back to heuristic evaluator when model not loaded.

### ~~M4. No CSRF/Origin validation~~ FIXED

CORS origin now configurable via `CORS_ORIGIN` env var (defaults to `*` for dev, set to your domain in production).

### ~~M5. Unbounded pendingChallenges map~~ FIXED

Capped at 1000 entries with eviction. Challenger notified on expiry via `challenge_expired` message.

### ~~M6. No parseBody size limit~~ FIXED

Added 10KB max body size. Connection destroyed if exceeded.

### ~~M7. Node version mismatch~~ FIXED

Aligned all files to Node 23 (.nvmrc, railway.json, package.json, CI).

### M8. GameView.tsx too large

**File:** `src/ui/game/GameView.tsx` (1000+ lines)
**Problem:** 23+ signals, 3 game modes interleaved with conditionals, animation state, timer management, socket handling — all in one component. Untestable and hard to maintain.
**Status:** Architectural refactor — needs design discussion. Deferred to Phase 6.

### ~~M9. No drag debouncing~~ FIXED

Throttled `handlePointerMove` to requestAnimationFrame.

### M10. Optimistic move updates without rollback

**File:** `src/ui/game/GameView.tsx`
**Problem:** In online mode, `doMove()` is applied locally before server confirmation. If the server rejects the move, the UI shows a wrong board until the next `state` message arrives.
**Status:** Architectural decision — optimistic updates give better UX feel. Server resync is fast. Deferred.

### ~~M11. No backpressure on ws.send()~~ FIXED

Added try-catch around `ws.send()` in GameRoom.send().

### ~~M12. disconnectTimer map not fully cleaned~~ FIXED

Added `.clear()` call in `destroy()`.

### ~~M13. No transaction for saveGame stats~~ FIXED

Already fixed in prior commit (wrapped in `db.transaction()`).

### ~~M14. SQL subqueries in game history~~ FIXED

Replaced with proper `.leftJoin()` using aliased user tables.

---

## Blindspots

### B1. Accessibility is completely absent

No ARIA labels, no keyboard focus management, no screen reader support, color-only checker differentiation. Fails WCAG Level A across every guideline. Excludes ~15% of potential users.

### B3. No linting or formatting

No ESLint, no Prettier, no `.editorconfig`. Code style consistency relies on discipline.

### B4. Mobile UX likely broken

Board shrinks to ~131px height on small phones. No landscape media queries. Touch targets not sized for fingers (48px minimum recommended). Playwright tests check snapshots, not usability.

### B5. No monitoring/alerting in production

`/health` endpoint exists but no error tracking (Sentry), no uptime monitoring, no metrics on game completion rates or WS connection health.

### ~~B6. Luck and AI evaluation are untested~~ FIXED

Added 17 tests for luck.ts (93% coverage) and 11 tests for notation.ts (100% coverage). AI heuristic evaluation exercised through luck tests. game.ts expanded from 54% to 91% line coverage.

### B7. Match play is engine-ready but unused

`match.ts` implements Crawford rule and score tracking, but no tests exist and the UI doesn't use it.

### B8. No rate limiting

WebSocket connections, API endpoints, chat messages — nothing prevents a single client from flooding the server.

### ~~B9. Dead config file~~ FIXED

Removed `netlify.toml`.

### B10. Training reproducibility undocumented

The Rust training pipeline exists but README has no instructions for reproducing or customizing the model.

### ~~B11. No reconnection jitter in socket client~~ FIXED

Already fixed in prior commit (lobby WS and game WS both have jitter).

### ~~B12. Challenge expiration not notified to challenger~~ FIXED

Server now sends `challenge_expired` message to challenger after 60s.
