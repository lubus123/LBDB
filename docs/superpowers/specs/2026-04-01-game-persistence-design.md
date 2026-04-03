# Game Persistence & History — Design Spec

**Date:** 2026-04-01
**Goal:** Authenticated users' games are continuously saved move-by-move. Users can resume AI games and review any completed game from their profile.

---

## 1. Continuous Save

Every move is persisted as it happens. No "save on exit" — the DB always has the current state.

**For online games:** Already partially implemented — `room.moveHistory` is saved on game over. Change: save after every confirmed turn, not just on game over.

**For AI games:** Currently not saved at all. Change: when an authenticated user starts an AI game, create a DB record immediately. After each turn (human or AI), POST the updated move list to the server.

**For local 2P games:** Also save if authenticated. Same mechanism as AI.

### New API endpoints

- `POST /api/games` — Create a new game record. Body: `{ mode: 'ai' | 'local' | 'online', aiDifficulty?: string }`. Returns `{ gameId: number }`.
- `PATCH /api/games/:id/moves` — Append moves for a completed turn. Body: `{ ply: number, player: 'w' | 'b', dice: [number, number], moves: CheckerMove[] }`. Server appends to the moves JSONB array.
- `PATCH /api/games/:id/complete` — Mark game as finished. Body: `{ winner: 'w' | 'b', resultType: string }`. Updates winner, resultType, and user stats.
- `GET /api/games/:id` — Get full game data including moves (for resume/review).

### Schema changes

Add columns to `games` table:
- `status`: `'in_progress' | 'completed'` (varchar, default `'in_progress'`)
- `mode`: `'ai' | 'local' | 'online'` (varchar)
- `ai_difficulty`: `'strong' | 'expert'` (varchar, nullable)
- `current_turn`: `'w' | 'b'` (varchar, default `'w'`)
- `move_count`: integer (default 0)
- `updated_at`: timestamp (updated on every move save)

The existing `winner` column being null indicates in-progress. The new `status` column makes queries cleaner.

---

## 2. Game History UI

### Header change

Replace the username text link in the top-right with a hamburger menu (☰). Dropdown contains:
- **username** (bold, not clickable)
- **My Games** → navigates to profile page, games tab
- **Logout**

### Profile page redesign

Two tabs on the profile page: **Stats** (existing content) and **My Games** (new).

**My Games tab** has two sections:

**In Progress:**
- Card per game: opponent icon (robot for AI, duck for human), opponent name/type, move count, whose turn, time since last move, resume/review button
- **[→] Resume** button on AI/local games — opens GameView with saved state
- In-progress online games where opponent disconnected — show as reviewable only
- Sorted by most recently updated

**Completed:**
- Card per game: opponent icon, opponent name, result (Won/Lost + type), move count, date
- **[👁] Review** button — opens read-only replay mode
- Sorted by most recent, paginated (load more)

### Game cards

```
┌──────────────────────────────────────┐
│ 🤖 vs AI (Expert)         12 moves  │
│ Your turn · 3 min ago          [→]  │
└──────────────────────────────────────┘
```

- Left: icon (🤖 or 🦆) + opponent name/type
- Right: move count
- Bottom-left: status text (whose turn, result)
- Bottom-right: action button

---

## 3. Resume Flow (AI/Local)

1. User clicks [→] on an in-progress game
2. Client fetches `GET /api/games/:id` — gets full move history + metadata
3. Client reconstructs board state by replaying all moves from initial position (same as existing `reviewState` memo)
4. Opens GameView with the reconstructed state, mode, and AI difficulty
5. Game continues normally — new moves saved via `PATCH /api/games/:id/moves`
6. On game over, `PATCH /api/games/:id/complete` updates the record

### GameView changes

- Accept optional `resumeGameId` prop + initial state from saved game
- When resuming, skip the "create" step and use the provided state
- Continue saving moves to the same game ID

---

## 4. Review Flow (Read-Only)

1. User clicks [👁] on any game (completed or in-progress online)
2. Client fetches `GET /api/games/:id` — gets full move history
3. Opens GameView in a new `review` mode:
   - Board renders the position at the selected move
   - Left/Right arrow keys step through moves (existing history replay mechanism)
   - No Roll/Double/Move buttons — read-only
   - "Exit" button returns to profile
   - Info strip shows: move notation, player, dice for each turn

### GameView changes

- New mode: `'review'` (alongside `'ai' | 'local' | 'online'`)
- In review mode: all action buttons hidden, history index starts at -1 (initial position), arrow keys navigate
- Display all moves in the side panel move history

---

## 5. Client-Side Save Mechanism

For AI and local games, the client manages the game (no server GameRoom). Saves happen via REST API:

1. **On game start:** `POST /api/games` → get `gameId`
2. **After each confirmed turn:** `PATCH /api/games/:id/moves` with the turn data
3. **On game over:** `PATCH /api/games/:id/complete` with result

For online games, the server already manages state. Changes:
- Server saves moves after each confirmed turn (not just on game over)
- On game over, updates status to completed + saves result

### Offline resilience

If a move save fails (network blip), queue it and retry. The move list is append-only, so retries are idempotent if we include the ply number and the server checks for duplicates.

---

## 6. Files to Modify

| File | Changes |
|------|---------|
| `src/server/db/schema.ts` | Add status, mode, aiDifficulty, currentTurn, moveCount, updatedAt columns |
| `src/server/db/index.ts` | Migration SQL for new columns |
| `src/server/api.ts` | New endpoints: POST /api/games, PATCH moves, PATCH complete, GET game |
| `src/server/index.ts` | Save moves after each turn in online GameRoom |
| `src/server/protocol.ts` | No changes needed |
| `src/ui/index.tsx` | Hamburger menu, profile page tabs, game cards UI, resume/review navigation |
| `src/ui/game/GameView.tsx` | Accept resumeGameId + resume state, review mode, save moves via API |
| `src/ui/styles/board.css` | Game card styles, hamburger menu styles, tab styles |

---

## 7. Out of Scope

- Spectating live online games (Phase 6)
- Sharing game links for review
- Game annotations/comments
- Export to BGN format
- Matchmaking / ranked — separate feature
