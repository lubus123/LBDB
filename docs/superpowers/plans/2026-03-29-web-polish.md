# Web Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the web interface — friends panel, challenge popup, header ducks, chat/panel alignment — so users trust and rely on duckGammon.

**Architecture:** All changes are CSS + JSX in the UI layer, plus a small protocol addition for color preference in challenges. No new components — restructure existing ones.

**Tech Stack:** Solid.js, CSS, TypeScript, WebSocket protocol

**User Verification:** NO — no user verification required

---

### Task 1: Ethos update + vertical alignment + chat width

**Goal:** Update CLAUDE.md with ethos principles. Fix the board container so chat, board, and side panel are top-aligned. Widen chat to 220px.

**Files:**
- Modify: `CLAUDE.md:45-50` (design philosophy section)
- Modify: `src/ui/styles/board.css:1-20` (board-container, board-and-jail alignment)
- Modify: `src/ui/styles/board.css:1024-1025` (chat-panel width)

**Acceptance Criteria:**
- [ ] CLAUDE.md includes robust/durable/lightweight principles
- [ ] Chat panel, board, and side panel all share the same top edge
- [ ] Chat panel is 220px wide (matching side panel)

**Verify:** `npm run build` → success. Visual check: open http://localhost:8080, start an online game, confirm alignment.

**Steps:**

- [ ] **Step 1: Update CLAUDE.md ethos**

Add after the "Feel is the Feature" section heading and before "Core Principles":

```markdown
### Robust, Durable, Lightweight

Three engineering principles that complement the feel:

- **Robust** — handles edge cases gracefully, never shows broken state
- **Durable** — connections recover, state persists, the app is always ready
- **Lightweight** — minimal dependencies, fast loads, no bloat
```

- [ ] **Step 2: Fix vertical alignment in board.css**

Replace `.board-and-jail` styles (lines 11-19):

```css
.board-and-jail {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
```

Remove `justify-content: center` — this was pushing the board down and misaligning it with the chat and side panel.

- [ ] **Step 3: Widen chat panel**

In `.chat-panel` (line 1025), change:

```css
.chat-panel {
  width: 220px;
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: success, no errors

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md src/ui/styles/board.css
git commit -m "polish: add ethos, fix vertical alignment, widen chat to 220px"
```

---

### Task 2: Friends panel redesign

**Goal:** Replace the horizontal friends bar with a vertical card layout that has clear sections: header, friend list, pending requests, add-friend footer.

**Files:**
- Modify: `src/ui/index.tsx:369-408` (friends panel JSX)
- Modify: `src/ui/styles/board.css:716-768` (friends CSS — full rewrite of section)

**Acceptance Criteria:**
- [ ] Friends panel is a vertical card with max-width 400px
- [ ] Header shows "FRIENDS" label and online count
- [ ] Online friends show green dot + name + challenge sword
- [ ] Offline friends show grey dot + name, dimmed, no challenge button
- [ ] Pending requests are in their own section with a top border
- [ ] Add-friend input is at the bottom, separated by a border
- [ ] Error message shows below the input

**Verify:** `npm run build` → success. Visual check: log in with a user that has friends.

**Steps:**

- [ ] **Step 1: Replace friends JSX in index.tsx**

Replace the `<div class="friends-bar">` block (lines 371-408) with:

```tsx
<div class="friends-panel">
  <div class="friends-header">
    <span class="friends-label">Friends</span>
    <span class="friends-count">{acceptedFriends().filter(f => onlineFriends().has(f.friendUsername)).length} online</span>
  </div>
  <div class="friends-list">
    <For each={acceptedFriends()}>
      {(f) => {
        const isOnline = () => onlineFriends().has(f.friendUsername);
        return (
          <div class={`friend-row ${isOnline() ? '' : 'offline'}`}>
            <div class={`online-dot ${isOnline() ? 'on' : 'off'}`} />
            <span class="friend-name">{f.friendUsername}</span>
            <Show when={isOnline()}>
              <Show when={challengeSent()?.username === f.friendUsername} fallback={
                <button class="btn btn-small friend-challenge" onClick={() => handleChallenge(f.friendUsername)}>⚔</button>
              }>
                <button class="btn btn-small challenge-pending" disabled>⚔ {challengeCountdown()}s</button>
              </Show>
            </Show>
          </div>
        );
      }}
    </For>
  </div>
  <Show when={pendingIncoming().length > 0}>
    <div class="friends-pending">
      <For each={pendingIncoming()}>
        {(f) => (
          <div class="friend-row pending">
            <span class="friend-name"><span class="pending-name">{f.friendUsername}</span> wants to be friends</span>
            <button class="btn btn-small friend-accept" onClick={() => handleAcceptFriend(f.id)}>Accept</button>
          </div>
        )}
      </For>
    </div>
  </Show>
  <div class="friends-add">
    <input type="text" placeholder="Add friend..." value={addFriendInput()}
      onInput={(e) => setAddFriendInput(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') handleAddFriend(); }} />
    <button class="btn btn-small" onClick={handleAddFriend}>+</button>
  </div>
  <Show when={friendError()}><span class="friend-error">{friendError()}</span></Show>
</div>
```

- [ ] **Step 2: Replace friends CSS in board.css**

Replace the entire friends section (lines 716-768) with:

```css
/* Friends panel — vertical card */
.friends-panel {
  display: flex;
  flex-direction: column;
  margin-top: 20px;
  max-width: 400px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  font-size: 13px;
  overflow: hidden;
}

.friends-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.friends-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
}
.friends-count {
  font-size: 10px;
  color: var(--text-muted);
}

.friends-list {
  padding: 4px 0;
}

.friend-row {
  display: flex;
  align-items: center;
  padding: 7px 14px;
  gap: 8px;
  transition: background 0.15s;
}
.friend-row:hover {
  background: rgba(255,255,255,0.02);
}
.friend-row.offline {
  opacity: 0.5;
}
.friend-row .online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.friend-row .online-dot.on { background: #4caf50; }
.friend-row .online-dot.off { background: #555; }
.friend-row .friend-name {
  flex: 1;
  color: var(--text-primary);
}
.friend-row.offline .friend-name {
  color: var(--text-secondary);
}
.friend-row .friend-challenge {
  padding: 3px 10px !important;
  font-size: 11px !important;
  background: var(--highlight) !important;
  color: #fff !important;
  border: none;
  border-radius: 3px;
}

.challenge-pending {
  padding: 3px 10px !important;
  font-size: 10px !important;
  background: #e53935 !important;
  color: #fff !important;
  border: 2px solid transparent !important;
  animation: challenge-snake 2s linear infinite;
}
@keyframes challenge-snake {
  0% { border-color: rgba(229,57,53,0.8); }
  50% { border-color: rgba(229,57,53,0.2); }
  100% { border-color: rgba(229,57,53,0.8); }
}

.friends-pending {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 4px 0;
}
.pending-name { color: var(--highlight); }
.friend-accept {
  padding: 3px 8px !important;
  font-size: 11px !important;
  background: var(--success) !important;
  color: #fff !important;
  border: none;
  border-radius: 3px;
}

.friends-add {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 8px 14px;
  display: flex;
  gap: 6px;
}
.friends-add input {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 5px 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-main);
  outline: none;
}
.friends-add input::placeholder { color: var(--text-muted); }
.friends-add button {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}

.friend-error {
  color: #e53935;
  font-size: 11px;
  padding: 0 14px 8px;
}
```

Also remove the duplicate `.friend-item` styles near lines 1138-1157 in the same file (they were for the old layout).

- [ ] **Step 3: Remove mobile override for old class**

Find `.friends-bar` in the mobile media query (line 119) and replace with `.friends-panel { max-width: 100%; }`.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: success

- [ ] **Step 5: Commit**

```bash
git add src/ui/index.tsx src/ui/styles/board.css
git commit -m "polish: redesign friends panel as vertical card"
```

---

### Task 3: Challenge popup modal

**Goal:** Replace the instant-challenge behavior with a centered modal that lets the user pick color (white/random/black) and time control before sending.

**Files:**
- Modify: `src/ui/index.tsx:160-170` (handleChallenge function + new state + modal JSX)
- Modify: `src/ui/styles/board.css` (add challenge modal styles)
- Modify: `src/server/protocol.ts:24` (add colorPreference to challenge message)
- Modify: `src/server/index.ts:338-341` (store colorPreference in PendingChallenge)
- Modify: `src/server/index.ts:376-377` (use colorPreference when adding players)

**Acceptance Criteria:**
- [ ] Clicking sword opens a modal (doesn't immediately send challenge)
- [ ] Modal shows 3 checker circles for color pick (white/random/black)
- [ ] Random selected by default, 30s selected by default
- [ ] Time presets: 15s, 30s, 60s, ∞, plus custom input
- [ ] Cancel closes modal, Challenge sends with selected options
- [ ] Server respects colorPreference when assigning colors
- [ ] Protocol type updated

**Verify:** `npm test` → all pass. `npm run build` → success.

**Steps:**

- [ ] **Step 1: Add colorPreference to protocol**

In `src/server/protocol.ts`, update the challenge message type:

```typescript
  | { type: 'challenge'; username: string; timeLimit?: number; colorPreference?: 'w' | 'b' | 'random' }
```

- [ ] **Step 2: Update server message validation**

In `src/server/index.ts`, update `isValidClientMessage` case for 'challenge':

```typescript
      case 'challenge': return typeof msg.username === 'string';
```

(Already correct — `colorPreference` and `timeLimit` are optional.)

- [ ] **Step 3: Store colorPreference in PendingChallenge**

In `src/server/index.ts`, update the `PendingChallenge` interface to add:

```typescript
  colorPreference: 'w' | 'b' | 'random';
```

Update where the challenge is created (line ~339):

```typescript
        pendingChallenges.set(id, {
          id, fromUser, toUsername: msg.username.toLowerCase(),
          timeLimit: msg.timeLimit ?? 30, createdAt: Date.now(),
          colorPreference: msg.colorPreference ?? 'random',
        });
```

- [ ] **Step 4: Use colorPreference when accepting challenge**

In the `accept_challenge` handler (around line 376), replace:

```typescript
        room.addPlayer(challengerConn.ws, challenge.fromUser.id, challenge.fromUser.username);
        room.addPlayer(ws, acceptUser.id, acceptUser.username);
```

With:

```typescript
        // Assign colors based on challenger's preference
        const challengerFirst = challenge.colorPreference === 'w' ||
          (challenge.colorPreference === 'random' && Math.random() < 0.5);
        if (challengerFirst) {
          room.addPlayer(challengerConn.ws, challenge.fromUser.id, challenge.fromUser.username);
          room.addPlayer(ws, acceptUser.id, acceptUser.username);
        } else {
          room.addPlayer(ws, acceptUser.id, acceptUser.username);
          room.addPlayer(challengerConn.ws, challenge.fromUser.id, challenge.fromUser.username);
        }
```

- [ ] **Step 5: Add challenge modal state and UI in index.tsx**

Add new signals near the other challenge signals (around line 63):

```typescript
  const [challengeTarget, setChallengeTarget] = createSignal<string | null>(null);
  const [challengeColor, setChallengeColor] = createSignal<'w' | 'b' | 'random'>('random');
  const [challengeTime, setChallengeTime] = createSignal<number | null>(30);
  const [challengeCustomTime, setChallengeCustomTime] = createSignal('');
```

Replace `handleChallenge` function:

```typescript
  function openChallengeModal(username: string) {
    setChallengeTarget(username);
    setChallengeColor('random');
    setChallengeTime(30);
    setChallengeCustomTime('');
  }
  function closeChallengeModal() { setChallengeTarget(null); }
  function sendChallenge() {
    const target = challengeTarget();
    if (!target) return;
    const time = challengeTime() ?? (parseInt(challengeCustomTime()) || 30);
    sendLobbyMsg({ type: 'challenge', username: target, timeLimit: time, colorPreference: challengeColor() });
    const expiresAt = Date.now() + 60000;
    setChallengeSent({ username: target, expiresAt });
    setChallengeCountdown(60);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setChallengeCountdown(remaining);
      if (remaining <= 0) { clearInterval(interval); setChallengeSent(null); }
    }, 1000);
    closeChallengeModal();
  }
```

Update the sword button `onClick` in the friends panel (from Task 2) to call `openChallengeModal(f.friendUsername)` instead of `handleChallenge(f.friendUsername)`.

Add the challenge modal JSX right before the closing `</Show>` of the landing section (before line 408):

```tsx
<Show when={challengeTarget()}>
  <div class="challenge-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeChallengeModal(); }}>
    <div class="challenge-modal">
      <div class="challenge-title-label">Challenge</div>
      <div class="challenge-title-name">{challengeTarget()}</div>

      <div class="challenge-section-label">Play as</div>
      <div class="challenge-color-picker">
        <div class={`challenge-color-opt ${challengeColor() === 'w' ? 'selected' : ''}`} onClick={() => setChallengeColor('w')}>
          <div class="checker-circle white" />
          <span>White</span>
        </div>
        <div class={`challenge-color-opt ${challengeColor() === 'random' ? 'selected' : ''}`} onClick={() => setChallengeColor('random')}>
          <div class="checker-circle random" />
          <span>Random</span>
        </div>
        <div class={`challenge-color-opt ${challengeColor() === 'b' ? 'selected' : ''}`} onClick={() => setChallengeColor('b')}>
          <div class="checker-circle black" />
          <span>Black</span>
        </div>
      </div>

      <div class="challenge-section-label">Time per turn</div>
      <div class="challenge-time-presets">
        {[15, 30, 60].map(t => (
          <button class={`challenge-time-btn ${challengeTime() === t ? 'selected' : ''}`}
            onClick={() => { setChallengeTime(t); setChallengeCustomTime(''); }}>{t}s</button>
        ))}
        <button class={`challenge-time-btn ${challengeTime() === null ? 'selected' : ''}`}
          onClick={() => { setChallengeTime(null); setChallengeCustomTime(''); }}>∞</button>
      </div>
      <div class="challenge-time-custom">
        <input type="number" placeholder="custom" value={challengeCustomTime()}
          onInput={(e) => { setChallengeCustomTime(e.currentTarget.value); setChallengeTime(parseInt(e.currentTarget.value) || null); }} />
        <span>seconds</span>
      </div>

      <div class="challenge-actions">
        <button class="btn challenge-cancel" onClick={closeChallengeModal}>Cancel</button>
        <button class="btn btn-primary challenge-send" onClick={sendChallenge}>Challenge ⚔</button>
      </div>
    </div>
  </div>
</Show>
```

- [ ] **Step 6: Add challenge modal CSS**

Add to `board.css`:

```css
/* Challenge modal */
.challenge-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.challenge-modal {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.08);
  min-width: 280px;
}
.challenge-title-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.challenge-title-name {
  font-size: 18px;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 20px;
}
.challenge-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.challenge-color-picker {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 22px;
}
.challenge-color-opt {
  cursor: pointer;
  text-align: center;
}
.challenge-color-opt span {
  display: block;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
}
.challenge-color-opt.selected span {
  color: var(--highlight);
}
.checker-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  transition: all 0.15s;
  margin: 0 auto;
}
.checker-circle.white {
  background: var(--checker-white);
  border: 2px solid var(--checker-white-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.3);
}
.checker-circle.black {
  background: var(--checker-black);
  border: 2px solid var(--checker-black-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.08);
}
.checker-circle.random {
  background: linear-gradient(135deg, var(--checker-white) 50%, var(--checker-black) 50%);
  border: 2px solid var(--checker-white-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.challenge-color-opt.selected .checker-circle {
  border-color: var(--highlight);
  box-shadow: 0 0 12px rgba(74,158,255,0.3);
}
.challenge-time-presets {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
}
.challenge-time-btn {
  background: var(--bg-tertiary);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--text-secondary);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-main);
}
.challenge-time-btn.selected {
  background: var(--highlight);
  border-color: var(--highlight);
  color: #fff;
  font-weight: 600;
}
.challenge-time-custom {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-bottom: 22px;
}
.challenge-time-custom input {
  width: 64px;
  background: var(--bg-tertiary);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 5px 8px;
  color: var(--text-primary);
  font-size: 12px;
  text-align: center;
  font-family: var(--font-main);
  outline: none;
}
.challenge-time-custom span {
  font-size: 11px;
  color: var(--text-muted);
}
.challenge-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.challenge-cancel {
  background: transparent !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  color: var(--text-secondary) !important;
  padding: 8px 20px;
  font-size: 13px;
}
.challenge-send {
  padding: 8px 24px !important;
  font-size: 13px !important;
  font-weight: 600;
}
```

- [ ] **Step 7: Run tests and build**

Run: `npm test` → 168 pass
Run: `npm run build` → success

- [ ] **Step 8: Commit**

```bash
git add src/ui/index.tsx src/ui/styles/board.css src/server/protocol.ts src/server/index.ts
git commit -m "polish: add challenge popup with color/time picker"
```

---

### Task 4: Header duck checker + hide time picker in online

**Goal:** Add a small white checker between the two ducks in the header when playing vs human. Hide the turn time option in the side panel during online games.

**Files:**
- Modify: `src/ui/index.tsx:198-221` (HeaderLogo component)
- Modify: `src/ui/game/GameView.tsx:1275-1290` (wrap time picker in Show)

**Acceptance Criteria:**
- [ ] A 12px white checker circle appears between the two ducks in human mode
- [ ] The checker has actual checker styling (fill, border, shadow)
- [ ] The second duck + checker fade in with 300ms transition
- [ ] Turn time option row is hidden when `isOnline()` is true
- [ ] Turn time option still visible in AI and local modes

**Verify:** `npm run build` → success. Visual check in header across modes.

**Steps:**

- [ ] **Step 1: Update HeaderLogo with checker between ducks**

Replace the `HeaderLogo` component (lines 198-221) with:

```tsx
  const HeaderLogo = () => {
    const mode = page() === 'game' ? gameMode() : null;
    const showSecond = mode === 'online' || mode === 'local';
    const showBinary = mode === 'ai';

    return (<>
      {/* Main duck — always present */}
      <svg viewBox="0 0 80 64" width="26" height="21" style={{ "vertical-align": "middle", "margin-left": "7px", "margin-top": "-1px" }}>
        {duckPaths}
      </svg>
      {/* Checker + second duck — vs human */}
      <Show when={showSecond}>
        <span class="header-duo" style={{ display: "inline-flex", "align-items": "center", opacity: "0", animation: "fade-in 300ms ease forwards" }}>
          <svg viewBox="0 0 20 20" width="12" height="12" style={{ "vertical-align": "middle", "margin": "0 1px" }}>
            <circle cx="10" cy="10" r="8" fill="#e8dcc8" stroke="#c4b8a4" stroke-width="1.5"/>
          </svg>
          <svg viewBox="0 0 80 64" width="26" height="21" style={{ "vertical-align": "middle", "margin-top": "-1px", transform: "scaleX(-1)" }}>
            {duckPaths}
          </svg>
        </span>
      </Show>
      {/* Binary block — AI mode */}
      <Show when={showBinary}>
        <span style={{ "font-family": "var(--font-mono)", "font-size": "8px", color: "#4a9eff", opacity: "0.5", "margin-left": "4px", "line-height": "1", "vertical-align": "middle" }}>
          010<br/>101
        </span>
      </Show>
    </>);
  };
```

- [ ] **Step 2: Add fade-in keyframe**

Add to `layout.css`:

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}
```

- [ ] **Step 3: Hide time picker in online mode**

In `src/ui/game/GameView.tsx`, wrap the turn time option row (lines 1275-1290) with:

```tsx
          <Show when={!isOnline()}>
            <label class="option-row">
              <span>Turn time</span>
              <select
                value={timePerMove() === null ? 'none' : String(timePerMove())}
                disabled={timeLocked()}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setTimePerMove(v === 'none' ? null : Number(v));
                }}
              >
                <option value="15">15s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
                <option value="none">Untimed</option>
              </select>
            </label>
          </Show>
```

- [ ] **Step 4: Build and verify**

Run: `npm run build` → success
Run: `npm test` → all pass

- [ ] **Step 5: Commit**

```bash
git add src/ui/index.tsx src/ui/styles/layout.css src/ui/game/GameView.tsx
git commit -m "polish: header checker between ducks, hide time picker in online"
```

---

### Task 5: Final verification

**Goal:** Run full test suite, type check, build, and verify all polish changes work together.

**Files:** None (verification only)

**Acceptance Criteria:**
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm test` passes (168+ tests)
- [ ] `npm run build` succeeds
- [ ] Visual spot-check: friends panel, challenge popup, header ducks, chat alignment

**Verify:** All three commands pass.

**Steps:**

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Test**

Run: `npm test`
Expected: 168+ tests pass

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Spot-check**

Start server: `npm run dev:full`
Open http://localhost:8080 and verify:
- Friends panel is vertical card layout
- Challenge sword opens modal with color/time picker
- Header shows checker between ducks in online/local mode
- Chat panel is wider and top-aligned with board
- Turn time option hidden in online game side panel

```json:metadata
{"files": [], "verifyCommand": "npm test && npx tsc --noEmit && npm run build", "acceptanceCriteria": ["all tests pass", "zero TS errors", "build succeeds", "visual verification"], "requiresUserVerification": false}
```
