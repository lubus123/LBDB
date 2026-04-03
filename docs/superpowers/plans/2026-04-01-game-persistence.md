# Game Persistence & History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continuously save all authenticated users' games move-by-move. Enable resuming AI games and reviewing any game from the profile.

**Architecture:** Extend the existing `games` table with status/mode/turn tracking columns. Add REST endpoints for game CRUD. Client saves after each turn via REST API for AI/local games; server saves automatically for online games. Profile page gets tabs (Stats/My Games) with game cards supporting resume and review.

**Tech Stack:** PostgreSQL + Drizzle ORM, Node.js REST API, Solid.js UI, existing Vitest + Playwright test infrastructure

**User Verification:** NO — no user verification required

---

### Task 1: Schema changes + migration

**Goal:** Add new columns to the `games` table for tracking game status, mode, and progress.

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/index.ts`
- Modify: `src/server/test/helpers/db.ts`

**Acceptance Criteria:**
- [ ] `games` table has new columns: `status`, `mode`, `ai_difficulty`, `current_turn`, `move_count`, `updated_at`
- [ ] Migration SQL adds columns with `IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- [ ] Test DB setup creates the columns
- [ ] Existing tests still pass (backward compatible — new columns have defaults)

**Verify:** `npm test` → all 220 tests pass

**Steps:**

- [ ] **Step 1: Update schema.ts**

Add new columns to the `games` table definition:

```typescript
// In pgTable('games', { ... })
  status: varchar('status', { length: 15 }).default('completed').notNull(),
  mode: varchar('mode', { length: 10 }),
  aiDifficulty: varchar('ai_difficulty', { length: 10 }),
  currentTurn: varchar('current_turn', { length: 1 }).default('w'),
  moveCount: integer('move_count').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
```

- [ ] **Step 2: Update migration SQL in db/index.ts**

Add after existing CREATE TABLE games statement:

```sql
    ALTER TABLE games ADD COLUMN IF NOT EXISTS status VARCHAR(15) DEFAULT 'completed' NOT NULL;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS mode VARCHAR(10);
    ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_difficulty VARCHAR(10);
    ALTER TABLE games ADD COLUMN IF NOT EXISTS current_turn VARCHAR(1) DEFAULT 'w';
    ALTER TABLE games ADD COLUMN IF NOT EXISTS move_count INTEGER DEFAULT 0 NOT NULL;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at DESC);
```

- [ ] **Step 3: Update test DB setup in helpers/db.ts**

Add the same columns to the CREATE TABLE games statement in `setupTestDb()`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 220 tests pass (new columns have defaults, backward compatible)

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts src/server/test/helpers/db.ts
git commit -m "schema: add game persistence columns (status, mode, turn, move_count)"
```

---

### Task 2: Game CRUD API endpoints with TDD

**Goal:** REST API endpoints for creating games, saving moves, completing games, and fetching individual games.

**Files:**
- Modify: `src/server/api.ts`
- Create: `src/server/test/integration/games-api.test.ts`

**Acceptance Criteria:**
- [ ] `POST /api/games` creates a game record, returns `{ gameId }`
- [ ] `PATCH /api/games/:id/moves` appends a turn to the moves array
- [ ] `PATCH /api/games/:id/complete` marks game finished, updates stats
- [ ] `GET /api/games/:id` returns full game data including moves
- [ ] `GET /api/history` now includes status, mode, moveCount, updatedAt
- [ ] All endpoints require auth, reject unauthorized
- [ ] All endpoints validate game ownership
- [ ] Integration tests cover all endpoints

**Verify:** `npm test` → all tests pass including new ones

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/server/test/integration/games-api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanDb, teardownTestDb, seedUser } from '../helpers/db';
import { setupGameServer } from '../helpers/fixtures';
import { api } from '../helpers/http';

describe('Games API', () => {
  let port: number;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    await setupTestDb();
    const server = await setupGameServer();
    port = server.port;
    cleanup = server.cleanup;
  });

  afterAll(async () => {
    await cleanup();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  describe('POST /api/games', () => {
    it('creates an AI game', async () => {
      const user = await seedUser('alice');
      const res = await api(port, 'POST', '/api/games', { mode: 'ai', aiDifficulty: 'expert' }, user.token);
      expect(res.status).toBe(200);
      expect(res.data.gameId).toBeTruthy();
    });

    it('rejects unauthenticated', async () => {
      const res = await api(port, 'POST', '/api/games', { mode: 'ai' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/games/:id/moves', () => {
    it('appends a turn', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);
      const gameId = create.data.gameId;

      const turn = { ply: 0, player: 'w', dice: [3, 1], moves: [{ from: 8, to: 5, die: 3, hit: false }] };
      const res = await api(port, 'PATCH', `/api/games/${gameId}/moves`, turn, user.token);
      expect(res.status).toBe(200);
      expect(res.data.moveCount).toBe(1);
    });

    it('rejects moves from non-owner', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, alice.token);
      const gameId = create.data.gameId;

      const turn = { ply: 0, player: 'w', dice: [3, 1], moves: [] };
      const res = await api(port, 'PATCH', `/api/games/${gameId}/moves`, turn, bob.token);
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/games/:id/complete', () => {
    it('marks game completed', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);
      const gameId = create.data.gameId;

      const res = await api(port, 'PATCH', `/api/games/${gameId}/complete`, { winner: 'w', resultType: 'single' }, user.token);
      expect(res.status).toBe(200);

      // Verify it's marked completed
      const game = await api(port, 'GET', `/api/games/${gameId}`, undefined, user.token);
      expect(game.data.status).toBe('completed');
      expect(game.data.winner).toBe('w');
    });
  });

  describe('GET /api/games/:id', () => {
    it('returns full game with moves', async () => {
      const user = await seedUser('alice');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai', aiDifficulty: 'expert' }, user.token);
      const gameId = create.data.gameId;

      // Add a turn
      const turn = { ply: 0, player: 'w', dice: [6, 5], moves: [{ from: 13, to: 7, die: 6, hit: false }] };
      await api(port, 'PATCH', `/api/games/${gameId}/moves`, turn, user.token);

      const res = await api(port, 'GET', `/api/games/${gameId}`, undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data.mode).toBe('ai');
      expect(res.data.aiDifficulty).toBe('expert');
      expect(res.data.moves).toHaveLength(1);
      expect(res.data.status).toBe('in_progress');
    });

    it('rejects non-owner', async () => {
      const alice = await seedUser('alice');
      const bob = await seedUser('bob');
      const create = await api(port, 'POST', '/api/games', { mode: 'ai' }, alice.token);
      const res = await api(port, 'GET', `/api/games/${create.data.gameId}`, undefined, bob.token);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/history', () => {
    it('includes status and mode', async () => {
      const user = await seedUser('alice');
      await api(port, 'POST', '/api/games', { mode: 'ai' }, user.token);

      const res = await api(port, 'GET', '/api/history', undefined, user.token);
      expect(res.status).toBe(200);
      expect(res.data[0].status).toBe('in_progress');
      expect(res.data[0].mode).toBe('ai');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/test/integration/games-api.test.ts`
Expected: FAIL — endpoints don't exist

- [ ] **Step 3: Implement API endpoints in api.ts**

Add before the `json(res, 404, ...)` line:

```typescript
    // ─── Game CRUD ───
    if (method === 'POST' && url === '/api/games') {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }
      const { mode, aiDifficulty } = await parseBody(req);

      const [game] = await db.insert(games).values({
        whiteId: user.id,
        blackId: null,
        status: 'in_progress',
        mode: mode || 'ai',
        aiDifficulty: aiDifficulty || null,
        moves: [],
        currentTurn: 'w',
        moveCount: 0,
      }).returning({ id: games.id });

      json(res, 200, { gameId: game.id });
      return true;
    }

    // PATCH /api/games/:id/moves
    const movesMatch = url.match(/^\/api\/games\/(\d+)\/moves$/);
    if (method === 'PATCH' && movesMatch) {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }
      const gameId = parseInt(movesMatch[1]);

      // Verify ownership
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game) { json(res, 404, { error: 'Game not found' }); return true; }
      if (game.whiteId !== user.id && game.blackId !== user.id) {
        json(res, 403, { error: 'Not your game' }); return true;
      }

      const turn = await parseBody(req);
      const currentMoves = (game.moves as any[]) || [];
      currentMoves.push(turn);

      await db.update(games).set({
        moves: currentMoves,
        moveCount: currentMoves.length,
        currentTurn: turn.player === 'w' ? 'b' : 'w',
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      json(res, 200, { ok: true, moveCount: currentMoves.length });
      return true;
    }

    // PATCH /api/games/:id/complete
    const completeMatch = url.match(/^\/api\/games\/(\d+)\/complete$/);
    if (method === 'PATCH' && completeMatch) {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }
      const gameId = parseInt(completeMatch[1]);

      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game) { json(res, 404, { error: 'Game not found' }); return true; }
      if (game.whiteId !== user.id && game.blackId !== user.id) {
        json(res, 403, { error: 'Not your game' }); return true;
      }

      const { winner, resultType } = await parseBody(req);
      await db.update(games).set({
        status: 'completed',
        winner,
        resultType: resultType || 'single',
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      json(res, 200, { ok: true });
      return true;
    }

    // GET /api/games/:id
    const gameMatch = url.match(/^\/api\/games\/(\d+)$/);
    if (method === 'GET' && gameMatch) {
      const user = await requireAuth(req, res);
      if (!user) return true;
      const db = getDb();
      if (!db) { json(res, 500, { error: 'DB unavailable' }); return true; }
      const gameId = parseInt(gameMatch[1]);

      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game) { json(res, 404, { error: 'Game not found' }); return true; }
      if (game.whiteId !== user.id && game.blackId !== user.id) {
        json(res, 403, { error: 'Not your game' }); return true;
      }

      json(res, 200, game);
      return true;
    }
```

Also update the `/api/history` endpoint to include the new columns:

```typescript
    // In the history select, add:
    status: games.status,
    mode: games.mode,
    moveCount: games.moveCount,
    updatedAt: games.updatedAt,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass including new games-api tests

- [ ] **Step 5: Commit**

```bash
git add src/server/api.ts src/server/test/integration/games-api.test.ts
git commit -m "feat: game CRUD API endpoints with TDD"
```

---

### Task 3: Server-side online game save per turn

**Goal:** Online games save moves after each confirmed turn, not just on game over.

**Files:**
- Modify: `src/server/index.ts`

**Acceptance Criteria:**
- [ ] Online games create a DB record when the game starts (both players joined)
- [ ] Each confirmed turn is saved to the DB
- [ ] On game over, status is updated to 'completed'
- [ ] Existing saveGame logic still works for stats

**Verify:** `npm test` → all pass

**Steps:**

- [ ] **Step 1: Create game record on startGame in GameRoom flow**

In `src/server/index.ts`, after `room.startGame()` is called (in the `accept_challenge` handler and the `join` handler), insert a game record and store the DB game ID on the room:

```typescript
// After room.startGame():
const db = getDb();
if (db && room.whiteUserId && room.blackUserId) {
  try {
    const [dbGame] = await db.insert(games).values({
      whiteId: room.whiteUserId,
      blackId: room.blackUserId,
      status: 'in_progress',
      mode: 'online',
      moves: [],
      timeControl: room.timeLimit,
    }).returning({ id: games.id });
    room.dbGameId = dbGame.id;
  } catch (err) { log.warn('Failed to create game record:', err); }
}
```

Add `dbGameId?: number` to the GameRoom class.

- [ ] **Step 2: Save moves after each confirmed turn**

In the message handler, after `room.handleConfirm(ws)` or when the turn auto-ends (in handleMove when phase changes to 'waiting'), save the latest turn:

```typescript
// After a turn completes (state.phase changed to 'waiting' or 'gameOver'):
if (room.dbGameId && db) {
  db.update(games).set({
    moves: room.moveHistory,
    moveCount: room.moveHistory.length,
    currentTurn: room.state.turn,
    updatedAt: new Date(),
  }).where(eq(games.id, room.dbGameId)).catch(err => log.warn('Failed to save turn:', err));
}
```

- [ ] **Step 3: Update game record on game over**

In the existing `saveGame` function, also update the status:

```typescript
// Add to the transaction:
if (room.dbGameId) {
  await tx.update(games).set({
    status: 'completed',
    winner: ...,
    resultType: ...,
    updatedAt: new Date(),
  }).where(eq(games.id, room.dbGameId));
} else {
  // Existing insert for games without dbGameId (legacy)
  await tx.insert(games).values({ ... });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts src/server/GameRoom.ts
git commit -m "feat: save online game moves per turn"
```

---

### Task 4: Client-side save for AI/local + resume flow

**Goal:** AI and local games are saved move-by-move via REST API. Users can resume in-progress AI games.

**Files:**
- Modify: `src/ui/game/GameView.tsx`

**Acceptance Criteria:**
- [ ] On AI/local game start, `POST /api/games` creates a DB record (if user authenticated)
- [ ] After each confirmed turn, `PATCH /api/games/:id/moves` saves the turn
- [ ] On game over, `PATCH /api/games/:id/complete` marks it finished
- [ ] GameView accepts `resumeData` prop with saved game state + moves
- [ ] When resuming, board state is reconstructed from moves and game continues

**Verify:** `npm run build` → success. Manual: start AI game, make moves, exit, check profile shows in-progress game.

**Steps:**

- [ ] **Step 1: Add dbGameId signal and save helpers**

In GameView.tsx, add after other signals:

```typescript
const [dbGameId, setDbGameId] = createSignal<number | null>(props.resumeGameId ?? null);

async function saveNewGame() {
  if (!localStorage.getItem('dg-token')) return;
  try {
    const data = await apiFetch('/api/games', {
      method: 'POST',
      body: JSON.stringify({ mode: props.mode, aiDifficulty: aiDifficulty() }),
    });
    if (data.gameId) setDbGameId(data.gameId);
  } catch {}
}

async function saveTurn(turn: { ply: number; player: string; dice: [number, number]; moves: any[] }) {
  const id = dbGameId();
  if (!id) return;
  try {
    await apiFetch(`/api/games/${id}/moves`, {
      method: 'PATCH',
      body: JSON.stringify(turn),
    });
  } catch {}
}

async function saveComplete(winner: string, resultType: string) {
  const id = dbGameId();
  if (!id) return;
  try {
    await apiFetch(`/api/games/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ winner, resultType }),
    });
  } catch {}
}
```

Add `apiFetch` import at the top (same utility from index.tsx — extract to shared module or inline).

- [ ] **Step 2: Create game on start**

In GameView's initialization (after signals are set up, for non-online/non-resume games):

```typescript
if (!isOnline() && !props.resumeGameId) {
  saveNewGame();
}
```

- [ ] **Step 3: Save after each turn**

In the `recordTurn` function, add:

```typescript
function recordTurn(before: GameState, _after: GameState, extraMove?: CheckerMove) {
  if (before.dice) {
    const moves = extraMove ? [...before.turnMoves, extraMove] : before.turnMoves;
    const turnRecord = { ply: before.ply, player: before.turn, dice: before.dice, moves };
    setHistory(prev => [...prev, turnRecord]);
    saveTurn(turnRecord); // <-- ADD THIS
  }
}
```

- [ ] **Step 4: Save on game over**

When a game ends (result detected), call saveComplete:

```typescript
// In the game result detection areas:
const result = getGameResult(state);
if (result) {
  saveComplete(result.winner, result.type);
}
```

- [ ] **Step 5: Accept resume props**

Update GameView component to accept `resumeData`:

```typescript
interface ResumeData {
  gameId: number;
  moves: any[];
  mode: GameMode;
  aiDifficulty?: string;
}
```

When `resumeData` is provided, reconstruct the board from moves:

```typescript
if (props.resumeData) {
  const board = [...INITIAL_BOARD];
  let wOff = 0, bOff = 0;
  for (const turn of props.resumeData.moves) {
    for (const move of turn.moves) {
      applyBoardMove(board, move, turn.player);
      if ((turn.player === 'w' && move.to <= 0) || (turn.player === 'b' && move.to >= 25)) {
        if (turn.player === 'w') wOff++; else bOff++;
      }
    }
  }
  setState({ ...initState, board, whiteOff: wOff, blackOff: bOff, turn: lastTurn, ply: moves.length });
  setHistory(props.resumeData.moves);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/game/GameView.tsx
git commit -m "feat: client-side game save + resume for AI/local"
```

---

### Task 5: Profile UI — hamburger menu, game tabs, cards, review mode

**Goal:** Hamburger menu in header, profile page with Stats/My Games tabs, game cards with resume/review.

**Files:**
- Modify: `src/ui/index.tsx`
- Modify: `src/ui/game/GameView.tsx`
- Modify: `src/ui/styles/board.css`

**Acceptance Criteria:**
- [ ] Hamburger menu (☰) in header replaces username link
- [ ] Dropdown: username (bold), My Games, Logout
- [ ] Profile page has two tabs: Stats, My Games
- [ ] My Games: In Progress section (with [→] resume for AI) and Completed section (with [👁] review)
- [ ] Game cards show: opponent icon (🤖/🦆), name, move count, status, time ago
- [ ] Resume: opens GameView with reconstructed state from saved moves
- [ ] Review: opens GameView in read-only mode with arrow key navigation
- [ ] GameView review mode: no action buttons, history starts at move -1, arrows navigate

**Verify:** `npm run build` → success. `npx playwright test` → all pass.

**Steps:**

- [ ] **Step 1: Add hamburger menu state and JSX**

In index.tsx, add signal:

```typescript
const [menuOpen, setMenuOpen] = createSignal(false);
```

Replace the username/logout links in the header with:

```tsx
<Show when={user()} fallback={
  <a href="#" class="header-auth" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>Login</a>
}>
  <div class="header-menu-wrapper">
    <button class="header-hamburger" onClick={() => setMenuOpen(m => !m)}>☰</button>
    <Show when={menuOpen()}>
      <div class="header-dropdown">
        <div class="header-dropdown-name">{user()!.username}</div>
        <a href="#" onClick={(e) => { e.preventDefault(); setMenuOpen(false); loadProfile(); }}>My Games</a>
        <a href="#" onClick={(e) => { e.preventDefault(); setMenuOpen(false); handleLogout(); }}>Logout</a>
      </div>
    </Show>
  </div>
</Show>
```

- [ ] **Step 2: Add profile tabs (Stats / My Games)**

Add signal: `const [profileTab, setProfileTab] = createSignal<'stats' | 'games'>('stats');`

In the profile page Show block, add tabs above the content:

```tsx
<div class="profile-tabs">
  <button class={`profile-tab ${profileTab() === 'stats' ? 'active' : ''}`} onClick={() => setProfileTab('stats')}>Stats</button>
  <button class={`profile-tab ${profileTab() === 'games' ? 'active' : ''}`} onClick={() => setProfileTab('games')}>My Games</button>
</div>
```

- [ ] **Step 3: Implement My Games tab with game cards**

Fetch games on tab switch. Split into in-progress and completed:

```tsx
<Show when={profileTab() === 'games'}>
  <div class="games-list">
    <Show when={inProgressGames().length > 0}>
      <h3 class="games-section-title">In Progress</h3>
      <For each={inProgressGames()}>
        {(g) => (
          <div class="game-card" onClick={() => handleResumeOrReview(g)}>
            <div class="game-card-left">
              <span class="game-card-icon">{g.mode === 'ai' ? '🤖' : '🦆'}</span>
              <div>
                <div class="game-card-opponent">vs {g.mode === 'ai' ? `AI (${g.aiDifficulty || 'expert'})` : g.opponentName}</div>
                <div class="game-card-meta">{g.moveCount} moves · {timeAgo(g.updatedAt)}</div>
              </div>
            </div>
            <button class="btn btn-small game-card-action">
              {g.mode === 'ai' || g.mode === 'local' ? '→' : '👁'}
            </button>
          </div>
        )}
      </For>
    </Show>
    <h3 class="games-section-title">Completed</h3>
    <For each={completedGames()}>
      {(g) => (
        <div class="game-card" onClick={() => handleResumeOrReview(g)}>
          <div class="game-card-left">
            <span class="game-card-icon">{g.mode === 'ai' ? '🤖' : '🦆'}</span>
            <div>
              <div class="game-card-opponent">vs {g.opponentName || 'AI'}</div>
              <div class="game-card-meta">{g.winner === 'w' ? 'Won' : 'Lost'} ({g.resultType}) · {g.moveCount} moves</div>
            </div>
          </div>
          <button class="btn btn-small game-card-action">👁</button>
        </div>
      )}
    </For>
  </div>
</Show>
```

- [ ] **Step 4: Implement resume handler**

```typescript
async function handleResumeOrReview(game: any) {
  const res = await apiFetch(`/api/games/${game.id}`);
  if (res.error) return;

  if (game.status === 'in_progress' && (game.mode === 'ai' || game.mode === 'local')) {
    // Resume
    setResumeData({ gameId: game.id, moves: res.moves || [], mode: game.mode, aiDifficulty: game.aiDifficulty });
    setGameMode(game.mode);
    setGameKey(k => k + 1);
    setPage('game');
  } else {
    // Review
    setReviewData({ moves: res.moves || [] });
    setGameMode('review' as GameMode);
    setGameKey(k => k + 1);
    setPage('game');
  }
}
```

- [ ] **Step 5: Implement review mode in GameView**

When `props.mode === 'review'`:
- Set `historyIndex` to -1 (starting position)
- Populate history from `props.reviewData.moves`
- Hide all action buttons (Roll, Double, Undo, Confirm)
- Show only navigation arrows and Exit
- Arrow keys step through moves (existing mechanism)

```typescript
const isReview = () => props.mode === 'review';

// In initialization:
if (isReview() && props.reviewData) {
  setHistory(props.reviewData.moves);
  setHistoryIndex(-1); // start at initial position
}
```

In the actions panel, wrap with `<Show when={!isReview()}>`.

- [ ] **Step 6: Add CSS styles**

Add to board.css:

```css
/* Hamburger menu */
.header-menu-wrapper { position: relative; }
.header-hamburger { background: none; border: none; color: var(--text-primary); font-size: 20px; cursor: pointer; padding: 4px 8px; }
.header-dropdown { position: absolute; right: 0; top: 100%; background: var(--bg-secondary); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px 0; min-width: 150px; z-index: 20; }
.header-dropdown-name { padding: 8px 16px; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255,255,255,0.06); }
.header-dropdown a { display: block; padding: 8px 16px; color: var(--text-secondary); text-decoration: none; font-size: 13px; }
.header-dropdown a:hover { background: rgba(255,255,255,0.03); }

/* Profile tabs */
.profile-tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.profile-tab { background: none; border: none; padding: 8px 16px; color: var(--text-muted); font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }
.profile-tab.active { color: var(--text-primary); border-bottom-color: var(--highlight); }

/* Game cards */
.games-list { max-width: 500px; }
.games-section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin: 16px 0 8px; }
.game-card { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-secondary); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px; cursor: pointer; transition: background 0.15s; }
.game-card:hover { background: rgba(255,255,255,0.03); }
.game-card-left { display: flex; align-items: center; gap: 10px; }
.game-card-icon { font-size: 18px; }
.game-card-opponent { font-size: 13px; color: var(--text-primary); }
.game-card-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.game-card-action { font-size: 14px; min-height: 32px; padding: 4px 10px; }
```

- [ ] **Step 7: Build and verify**

Run: `npm run build` → success
Run: `npx playwright test` → all pass

- [ ] **Step 8: Commit**

```bash
git add src/ui/index.tsx src/ui/game/GameView.tsx src/ui/styles/board.css
git commit -m "feat: hamburger menu, profile game tabs, resume/review mode"
```

---
