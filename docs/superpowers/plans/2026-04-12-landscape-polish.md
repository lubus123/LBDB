# Landscape Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 7 landscape defects found in the visual audit: strips on non-game pages, detached Undo, truncated Resign/Waiting text, blue box behind Roll dice, inconsistent right-strip content, luck heatmap clipping, and the cut-off landing page title.

**Architecture:** Scope all landscape strip CSS to `#app[data-page="game"]` so non-game pages render normally. Inside the game scope, fix the detached-Undo bug by hiding the JSX flex-spacer and switching the strip to `flex-direction: column-reverse` so the primary action lives at the bottom (thumb-reach) and Menu/Chat sit at the top. Convert all remaining text labels to icons in landscape using the existing label/icon-swap pattern.

**Tech Stack:** Solid.js, CSS media queries with attribute selectors, inline SVG icons.

---

## File Structure

```
src/ui/
  index.tsx               — MODIFY: add reactive data-page attribute on #app
  game/GameView.tsx       — MODIFY: add 4 inline SVG icon components + wrap 5 buttons in label/icon shells

src/ui/styles/
  layout.css              — MODIFY: scope landscape header rules to #app[data-page="game"]
  board.css               — MODIFY: scope landscape action-bar rules; add column-reverse, spacer-hide, margin:0 fix; transparent primary bg; connection-indicator reposition; label/icon swap for 5 new buttons

tests/e2e/
  landscape-strips.spec.ts — MODIFY: expand with new assertions
```

---

### Task 0: Scope side-strips to `#app[data-page="game"]`

**Goal:** Bind `data-page={page()}` on `#app` and re-scope the landscape strip CSS rules to `#app[data-page="game"]` so landing, login, and register pages render normally (no strips) in landscape.

**Files:**
- Modify: `src/ui/index.tsx` (add reactive attribute)
- Modify: `src/ui/styles/layout.css` lines 77-127 (prefix selectors with `#app[data-page="game"]`)
- Modify: `src/ui/styles/board.css` — find both `@media (orientation: landscape) and (max-height: 500px)` blocks and prefix all rules with `#app[data-page="game"]`

**Acceptance Criteria:**
- [ ] `#app` element has `data-page` attribute bound to the `page()` signal
- [ ] In landscape, landing/login/register show no fixed strips
- [ ] Game page in landscape shows both strips exactly as before
- [ ] Portrait pixel-unchanged
- [ ] 278 unit tests pass
- [ ] Existing 22 E2E tests pass

**Verify:** `npm run build && npm test && npx playwright test --config tests/e2e/e2e.config.ts`

**Steps:**

- [ ] **Step 1: Bind data-page on #app in index.tsx**

In `src/ui/index.tsx`, the `App` component currently returns a top-level `<>...</>` fragment. Change the mount/render pattern so a div wraps everything with `id="app"` and `data-page={page()}`. The simplest path: Solid already renders into `document.getElementById('app')`, so the `#app` div lives in `index.html`. Instead of modifying that, use `onMount` or a `createEffect` to sync the attribute.

Add this inside the `App` component, near the other effects (around line 148):

```tsx
createEffect(() => {
  const root = document.getElementById('app');
  if (root) root.setAttribute('data-page', page());
});
```

- [ ] **Step 2: Re-scope layout.css landscape rules**

Open `src/ui/styles/layout.css`. The existing landscape block spans lines 77-127. Replace the ENTIRE block:

```css
/* ─── Landscape phones: header becomes a vertical strip on the left ─── */
@media (orientation: landscape) and (max-height: 500px) {
  .header {
    position: fixed;
    left: 0;
    top: 0;
    ...
  }
  ...
}
```

with the re-scoped version (same rules, every selector prefixed with `#app[data-page="game"]`):

```css
/* ─── Landscape phones (in-game only): header becomes a vertical strip on the left ─── */
@media (orientation: landscape) and (max-height: 500px) {
  #app[data-page="game"] .header {
    position: fixed;
    left: 0;
    top: 0;
    width: 48px;
    height: 100dvh;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    padding: 8px 4px;
    border-bottom: none;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    z-index: 10;
    gap: 10px;
  }

  #app[data-page="game"] .header > div {
    margin-left: 0 !important;
    flex-direction: column;
  }

  #app[data-page="game"] .header-mode {
    display: none;
  }

  #app[data-page="game"] .auth-icon {
    display: inline-flex;
    align-items: center;
    color: var(--text-primary);
  }
  #app[data-page="game"] .auth-label {
    display: none;
  }

  #app[data-page="game"] .header-logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0;
    letter-spacing: 0;
    gap: 6px;
  }
  #app[data-page="game"] .header-logo::before {
    content: "DG";
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--text-primary);
  }
}
```

- [ ] **Step 3: Re-scope board.css landscape rules**

Open `src/ui/styles/board.css`. There are TWO `@media (orientation: landscape) and (max-height: 500px)` blocks near the end of the file. Find the first one (contains `.board-container { margin-left: 48px; ... }`) and the second one (contains `.roll-icon { ... animation: dice-pulse ... }`).

**First block** — prefix every selector with `#app[data-page="game"]`:

```css
@media (orientation: landscape) and (max-height: 500px) {
  #app[data-page="game"] .board-container {
    margin-left: 48px;
    margin-right: 60px;
  }

  #app[data-page="game"] .mobile-action-bar {
    position: fixed;
    right: 0;
    top: 0;
    width: 60px;
    height: 100dvh;
    flex-direction: column;
    justify-content: flex-end;
    align-items: stretch;
    padding: 8px 6px;
    padding-top: calc(8px + env(safe-area-inset-top, 0));
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0));
    gap: 8px;
    border-top: none;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 10;
  }

  #app[data-page="game"] .mobile-action-bar button {
    width: 100%;
    min-height: 44px;
  }

  #app[data-page="game"] .mobile-info-strip {
    display: none;
  }
}
```

**Second block** — prefix selectors:

```css
@media (orientation: landscape) and (max-height: 500px) {
  #app[data-page="game"] .mobile-action-bar .roll-label,
  #app[data-page="game"] .mobile-action-bar .double-label {
    display: none;
  }
  #app[data-page="game"] .mobile-action-bar .roll-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: dice-pulse 1.6s ease-in-out infinite;
  }
  #app[data-page="game"] .mobile-action-bar .double-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
  }

  #app[data-page="game"] .mobile-action-bar [data-testid="btn-roll"][disabled] .roll-icon {
    animation: none;
    opacity: 0.6;
  }
}
```

The `@keyframes dice-pulse { ... }` stays unscoped (keyframes don't need scoping).

- [ ] **Step 4: Verify**

```bash
npm run build
npm test
```
Expected: clean build, 278 tests pass.

Restart server if needed and run:
```bash
npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/landscape-strips.spec.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts --reporter=list
```
Expected: 22 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/index.tsx src/ui/styles/layout.css src/ui/styles/board.css
git commit -m "feat(mobile): scope landscape strips to game page only

#app gets a data-page attribute reflecting the current page signal.
All landscape strip CSS is now scoped to #app[data-page=\"game\"],
so landing / login / register render normally in landscape without
the 48-px left strip and 60-px right strip."
```

---

### Task 1: Fix detached Undo — column-reverse + hide spacer + margin:0 on menu/chat

**Goal:** Undo and other phase-specific buttons sit at the bottom of the right strip (thumb-reach). Menu and Chat sit at the top. Root cause of the detached Undo: a `<div style={{ flex: '1' }} />` spacer in GameView.tsx:1441 absorbs all vertical space, pushing Menu/Chat to the bottom while leaving Roll/Undo stranded at the top.

**Files:**
- Modify: `src/ui/styles/board.css` — inside the first `#app[data-page="game"]` landscape block, override the spacer, flex-direction, and menu/chat margins.

**Acceptance Criteria:**
- [ ] Primary action button bounding-box `y + height > viewport.height * 0.6` (bottom 40%)
- [ ] Menu button bounding-box `y < viewport.height * 0.3` (top 30%)
- [ ] Buttons stack contiguously — no large gaps between adjacent buttons
- [ ] Portrait unchanged
- [ ] 278 unit tests pass

**Verify:** `npm run build && npm test` → clean; Task 5 asserts the positions.

**Steps:**

- [ ] **Step 1: Extend the game-scoped landscape `.mobile-action-bar` rule in board.css**

In `src/ui/styles/board.css`, find the first `#app[data-page="game"]` landscape block (the one containing `.mobile-action-bar { position: fixed; ... }`). Change `flex-direction: column;` to `flex-direction: column-reverse;` and add three new rules at the end of that block (before its closing `}`):

```css
  /* The JSX includes a <div style="flex:1" /> spacer that pushes menu/chat
     to the end of the row in portrait. In landscape we want contiguous
     stacking, so hide the spacer. */
  #app[data-page="game"] .mobile-action-bar > div[style*="flex"] {
    display: none;
  }

  /* Reset the portrait margin-left:auto on menu/chat — in column layout it
     becomes margin-top:auto and breaks contiguous stacking. */
  #app[data-page="game"] .mobile-action-bar .mobile-menu-btn,
  #app[data-page="game"] .mobile-action-bar .mobile-chat-btn {
    margin: 0;
  }
```

After the change the full block should look like:

```css
@media (orientation: landscape) and (max-height: 500px) {
  #app[data-page="game"] .board-container {
    margin-left: 48px;
    margin-right: 60px;
  }

  #app[data-page="game"] .mobile-action-bar {
    position: fixed;
    right: 0;
    top: 0;
    width: 60px;
    height: 100dvh;
    flex-direction: column-reverse;       /* changed */
    justify-content: flex-start;          /* changed — with reverse, primary ends up at bottom via DOM order */
    align-items: stretch;
    padding: 8px 6px;
    padding-top: calc(8px + env(safe-area-inset-top, 0));
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0));
    gap: 8px;
    border-top: none;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 10;
  }

  #app[data-page="game"] .mobile-action-bar button {
    width: 100%;
    min-height: 44px;
  }

  #app[data-page="game"] .mobile-action-bar > div[style*="flex"] {
    display: none;
  }
  #app[data-page="game"] .mobile-action-bar .mobile-menu-btn,
  #app[data-page="game"] .mobile-action-bar .mobile-chat-btn {
    margin: 0;
  }

  #app[data-page="game"] .mobile-info-strip {
    display: none;
  }
}
```

With `flex-direction: column-reverse` the DOM order (Roll/Undo → Double → Accept/Drop → Resign → spacer → Menu → Chat) renders visually bottom-to-top: Roll/Undo at bottom, Menu/Chat near top.

- [ ] **Step 2: Verify build + unit tests**

```bash
npm run build
npm test
```
Expected: 278 pass.

- [ ] **Step 3: Visual spot-check**

Start the server if not running:
```bash
pkill -f 'tsx.*server' 2>/dev/null; PORT=8080 DATABASE_URL= LOG_LEVEL=error npx tsx src/server/index.ts &
```

Run a quick landscape screenshot (ad-hoc Playwright test is OK; delete after):
```bash
cat > /tmp/spot.spec.ts << 'EOF'
import { test } from '@playwright/test';
test.use({ viewport: { width: 915, height: 412 } });
test('landscape game after roll', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('.main-content');
  await page.locator('button', { hasText: /Play vs AI/i }).first().click();
  await page.waitForTimeout(500);
  // Roll
  const rolls = page.locator('[data-testid="btn-roll"]');
  const c = await rolls.count();
  for (let i = 0; i < c; i++) {
    if (await rolls.nth(i).isVisible().catch(() => false)) { await rolls.nth(i).click(); break; }
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/spot/landscape-undo.png' });
});
EOF
cp /tmp/spot.spec.ts tests/e2e/spot.spec.ts
mkdir -p screenshots/spot
npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/spot.spec.ts --reporter=list
rm tests/e2e/spot.spec.ts
```

Open `screenshots/spot/landscape-undo.png` and confirm the Undo button is at the BOTTOM of the right strip (not at the top).

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles/board.css
git commit -m "fix(mobile): Undo no longer floats at top of right strip

Root cause: the <div style=\"flex:1\" /> spacer in the mobile action
bar JSX absorbed all remaining vertical space in our column layout,
pushing Menu/Chat to the bottom while stranding Undo at the top.

Hidden the spacer in the game-scoped landscape rule, switched
.mobile-action-bar to flex-direction: column-reverse so the DOM
order renders bottom-up (primary action at thumb-reach, Menu/Chat
near the top), and reset margin:0 on menu/chat to defeat the
portrait margin-left:auto that becomes margin-top:auto in column."
```

---

### Task 2: Label → icon swap for Undo / Confirm / Accept / Drop / Resign

**Goal:** Five more phase-specific buttons get the label/icon two-span shell treatment. Landscape shows the icon; portrait shows the text. Each button keeps its existing handler and any `data-testid`.

**Files:**
- Modify: `src/ui/game/GameView.tsx` — add 4 inline SVG icon components (UndoIcon, CheckIcon, CrossIcon, FlagIcon) near the top of the file; convert 5 button JSX blocks.
- Modify: `src/ui/styles/board.css` — default label-show / icon-hide rules + game-scoped landscape overrides.

**Acceptance Criteria:**
- [ ] 4 new SVG component constants defined in `GameView.tsx`
- [ ] Undo, Confirm, Accept, Drop, Resign buttons each contain a `<span class="xxx-label">…</span>` and `<span class="xxx-icon"><Icon/></span>`
- [ ] Portrait: labels visible, icons hidden
- [ ] Landscape in-game: labels hidden, icons visible
- [ ] `data-testid="btn-undo"` and `data-testid="btn-confirm"` still resolve
- [ ] 278 unit tests pass
- [ ] Existing E2E tests still pass

**Verify:** `npm run build && npm test && npx playwright test --config tests/e2e/e2e.config.ts`

**Steps:**

- [ ] **Step 1: Add icon components at the top of GameView.tsx**

In `src/ui/game/GameView.tsx`, find the existing component imports (around line 1-25). After the imports and near where other inline helpers live, insert:

```tsx
const UndoIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ "flex-shrink": "0" }}>
    <path d="M8 7 L4 11 L8 15 M4 11 L16 11 C19 11 20 14 20 16 C20 18 19 20 16 20 L11 20"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ "flex-shrink": "0" }}>
    <path d="M5 12 L10 17 L19 7"
          fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

const CrossIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ "flex-shrink": "0" }}>
    <path d="M6 6 L18 18 M18 6 L6 18"
          fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round"/>
  </svg>
);

const FlagIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ "flex-shrink": "0" }}>
    <path d="M5 3 L5 21 M5 4 L16 4 L14 8 L17 12 L5 12"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);
```

Place these immediately after the existing `type` declarations / constants near the top of the file, or just before the `GameView` component declaration.

- [ ] **Step 2: Replace the 5 button JSX blocks**

Still in `GameView.tsx`, find the `.mobile-action-bar` div (line ~1400) and replace the affected buttons.

Original Undo (line 1426):
```tsx
<button class="btn btn-small mobile-action-btn" data-testid="btn-undo" onClick={handleUndo} disabled={!canUndo()}>Undo</button>
```
New:
```tsx
<button class="btn btn-small mobile-action-btn" data-testid="btn-undo" onClick={handleUndo} disabled={!canUndo()}>
  <span class="undo-label">Undo</span>
  <span class="undo-icon" aria-hidden="true"><UndoIcon /></span>
</button>
```

Original Confirm (line 1428):
```tsx
<button class="btn btn-primary mobile-action-btn" data-testid="btn-confirm" onClick={handleConfirm}>Confirm</button>
```
New:
```tsx
<button class="btn btn-primary mobile-action-btn" data-testid="btn-confirm" onClick={handleConfirm}>
  <span class="confirm-label">Confirm</span>
  <span class="confirm-icon" aria-hidden="true"><CheckIcon /></span>
</button>
```

Original Accept (line 1432):
```tsx
<button class="btn btn-primary mobile-action-btn" onClick={handleAcceptDouble}>Accept</button>
```
New:
```tsx
<button class="btn btn-primary mobile-action-btn" onClick={handleAcceptDouble}>
  <span class="accept-label">Accept</span>
  <span class="accept-icon" aria-hidden="true"><CheckIcon /></span>
</button>
```

Original Drop (line 1433):
```tsx
<button class="btn btn-danger mobile-action-btn" onClick={handleDropDouble}>Drop</button>
```
New:
```tsx
<button class="btn btn-danger mobile-action-btn" onClick={handleDropDouble}>
  <span class="drop-label">Drop</span>
  <span class="drop-icon" aria-hidden="true"><CrossIcon /></span>
</button>
```

Original Resign (line 1436):
```tsx
<button class="btn mobile-action-btn" style={{ color: '#e53935' }} onClick={handleResign}>Resign</button>
```
New:
```tsx
<button class="btn mobile-action-btn" style={{ color: '#e53935' }} onClick={handleResign}>
  <span class="resign-label">Resign</span>
  <span class="resign-icon" aria-hidden="true"><FlagIcon /></span>
</button>
```

- [ ] **Step 3: Add default CSS (portrait — labels visible, icons hidden)**

In `src/ui/styles/board.css`, find the existing default block:

```css
.mobile-action-bar .roll-label,
.mobile-action-bar .double-label {
  display: inline;
}
.mobile-action-bar .roll-icon,
.mobile-action-bar .double-icon {
  display: none;
}
```

Replace that block with:

```css
/* Default (portrait): all landscape-icon buttons show text, hide icons */
.mobile-action-bar .roll-label,
.mobile-action-bar .double-label,
.mobile-action-bar .undo-label,
.mobile-action-bar .confirm-label,
.mobile-action-bar .accept-label,
.mobile-action-bar .drop-label,
.mobile-action-bar .resign-label {
  display: inline;
}
.mobile-action-bar .roll-icon,
.mobile-action-bar .double-icon,
.mobile-action-bar .undo-icon,
.mobile-action-bar .confirm-icon,
.mobile-action-bar .accept-icon,
.mobile-action-bar .drop-icon,
.mobile-action-bar .resign-icon {
  display: none;
}
```

- [ ] **Step 4: Add landscape icon-show rules (game-scoped)**

In `src/ui/styles/board.css`, find the second `@media (orientation: landscape) and (max-height: 500px)` block (the one with `.roll-icon { animation: dice-pulse ... }`).

Extend the label-hide list at the top of the block:

```css
#app[data-page="game"] .mobile-action-bar .roll-label,
#app[data-page="game"] .mobile-action-bar .double-label,
#app[data-page="game"] .mobile-action-bar .undo-label,
#app[data-page="game"] .mobile-action-bar .confirm-label,
#app[data-page="game"] .mobile-action-bar .accept-label,
#app[data-page="game"] .mobile-action-bar .drop-label,
#app[data-page="game"] .mobile-action-bar .resign-label {
  display: none;
}
```

Then add the icon-show rules (after the existing `.roll-icon` and `.double-icon` rules, before the closing `}` of the block):

```css
  #app[data-page="game"] .mobile-action-bar .undo-icon,
  #app[data-page="game"] .mobile-action-bar .confirm-icon,
  #app[data-page="game"] .mobile-action-bar .accept-icon,
  #app[data-page="game"] .mobile-action-bar .drop-icon,
  #app[data-page="game"] .mobile-action-bar .resign-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
```

- [ ] **Step 5: Verify**

```bash
npm run build
npm test
```
Expected: 278 pass, build clean.

```bash
npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts tests/e2e/landscape-strips.spec.ts --reporter=list
```
Expected: 22 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/game/GameView.tsx src/ui/styles/board.css
git commit -m "feat(mobile): icons for Undo/Confirm/Accept/Drop/Resign in landscape

Five more mobile-action-bar buttons become label+icon shells. In
landscape (game page only) the icons show and the labels hide —
matches the Roll/Double pattern. Portrait keeps the text. No
testids or handlers changed.

- Undo: stylised back-arrow
- Confirm / Accept: checkmark (reused)
- Drop: X
- Resign: flag"
```

---

### Task 3: Transparent Roll / Confirm background in landscape

**Goal:** Primary buttons in landscape have transparent backgrounds and no borders so the glowing dice icon is the only visual cue. No more blue rectangle behind the Roll button.

**Files:**
- Modify: `src/ui/styles/board.css` — add override inside the existing second `#app[data-page="game"]` landscape block.

**Acceptance Criteria:**
- [ ] `getComputedStyle(btn-roll).backgroundColor === 'rgba(0, 0, 0, 0)'` in landscape game
- [ ] Portrait Roll button still has its `.btn-primary` blue background
- [ ] Portrait Confirm button unchanged
- [ ] 278 unit tests pass
- [ ] Existing E2E tests pass

**Verify:** `npm run build && npm test`

**Steps:**

- [ ] **Step 1: Add transparent-background rule**

In `src/ui/styles/board.css`, inside the second `#app[data-page="game"]` landscape block (the one with icon rules), append just before the closing `}`:

```css
  /* Primary action buttons in landscape: transparent — the dice glow /
     check icon is the visual signal, not a coloured box. */
  #app[data-page="game"] .mobile-action-bar [data-testid="btn-roll"],
  #app[data-page="game"] .mobile-action-bar [data-testid="btn-confirm"] {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
  }
```

- [ ] **Step 2: Verify**

```bash
npm run build
npm test
```
Expected: 278 pass.

Quick visual spot-check via ad-hoc Playwright (same pattern as Task 1 Step 3) — confirm the Roll button has no blue rectangle, just the glowing dice icon.

- [ ] **Step 3: Commit**

```bash
git add src/ui/styles/board.css
git commit -m "fix(mobile): transparent primary-button bg in landscape

Removes the blue .btn-primary fill from Roll and Confirm buttons
in landscape game mode so the dice icon with its green pulse glow
(and the checkmark icon for Confirm) is the sole visual signal.
Portrait primary buttons unchanged."
```

---

### Task 4: Connection indicator — hide text in landscape, keep the dot

**Goal:** In landscape online mode, the "Waiting for opponent" / "Reconnecting…" text overflows the 60-px right strip. Hide the text, keep the `.connection-dot`, reposition to the bottom-left corner of the viewport.

**Files:**
- Modify: `src/ui/styles/board.css` — add `.connection-indicator` rules inside the first `#app[data-page="game"]` landscape block.

**Acceptance Criteria:**
- [ ] In landscape online, no "Waiting for opponent" / "Reconnecting" / "Opponent offline" / "Online" text visible
- [ ] The `.connection-dot` is visible in the bottom-left corner of the viewport (within 12px of both edges)
- [ ] Portrait online mode unchanged — full text still shown
- [ ] 278 unit tests pass

**Verify:** `npm run build && npm test`

**Steps:**

- [ ] **Step 1: Find the existing .connection-indicator CSS**

```bash
grep -n "connection-indicator" /workspace/LBDB/src/ui/styles/board.css
```

The portrait styling lives near the bottom of board.css. Do not modify it — only add a landscape override.

- [ ] **Step 2: Add landscape override inside the first game-scoped block**

In `src/ui/styles/board.css`, inside the first `#app[data-page="game"]` landscape block (the one with `.mobile-action-bar { position: fixed; right: 0; ... }`), append before the closing `}`:

```css
  /* Online connection indicator: hide the text, keep only the dot
     in the bottom-left corner so it doesn't overflow the right strip. */
  #app[data-page="game"] .connection-indicator {
    position: fixed;
    left: 8px;
    bottom: 8px;
    right: auto;
    top: auto;
    font-size: 0;
    padding: 4px;
    background: transparent;
    border: none;
  }
  #app[data-page="game"] .connection-indicator > span {
    display: none;
  }
```

- [ ] **Step 3: Verify**

```bash
npm run build
npm test
```
Expected: 278 pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles/board.css
git commit -m "fix(mobile): connection indicator collapses to dot in landscape

In landscape online, the \"Waiting for opponent\" text overflowed
the 60-px right strip. Collapsed to just the .connection-dot,
repositioned to the bottom-left corner of the viewport. Portrait
online mode unchanged — full status text still shown."
```

---

### Task 5: Expand landscape-strips E2E + re-run 33-state audit

**Goal:** Add new Playwright assertions that verify every defect is fixed. Re-run the 33-state visual audit and inspect all screenshots. Report findings.

**Files:**
- Modify: `tests/e2e/landscape-strips.spec.ts` — add new assertions.
- Re-create (temporarily): `tests/e2e/ls-audit.spec.ts` if it was deleted; this is a one-shot capture, removed after inspection.

**Acceptance Criteria:**
- [ ] Assertion: on landing in landscape, `.mobile-action-bar` is either absent OR its fixed-right styles are NOT applied (boundingBox doesn't match 60-px right strip shape)
- [ ] Assertion: on login in landscape, same absence check
- [ ] Assertion: in-game landscape, Undo button's bounding-box `y + height` is in the bottom half of the viewport
- [ ] Assertion: in-game landscape, Menu button's bounding-box `y` is in the top half
- [ ] Assertion: in-game landscape, Roll button's computed background is transparent
- [ ] 33-state visual audit captured; controller manually inspects the landscape screenshots and confirms all 7 defects are fixed
- [ ] 278 unit tests pass
- [ ] Full E2E suite (flows + full-game + landscape-strips) all pass

**Verify:** `npm test && npx playwright test --config tests/e2e/e2e.config.ts --reporter=list`

**Steps:**

- [ ] **Step 1: Extend landscape-strips.spec.ts with new assertions**

Open `tests/e2e/landscape-strips.spec.ts`. Inside each `test.describe('Landscape strips: ${name}...')` block, ADD these new tests:

```typescript
    test('undo button in bottom half of strip (in move phase)', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      // Roll to enter move phase
      const rolls = page.locator('[data-testid="btn-roll"]');
      const c = await rolls.count();
      for (let i = 0; i < c; i++) {
        if (await rolls.nth(i).isVisible({ timeout: 200 }).catch(() => false)) {
          await rolls.nth(i).click();
          break;
        }
      }
      await page.waitForTimeout(1000);

      const undoBox = await page.locator('[data-testid="btn-undo"]').first().boundingBox();
      expect(undoBox).not.toBeNull();
      expect(undoBox!.y + undoBox!.height).toBeGreaterThan(viewport.height * 0.5);
    });

    test('menu button in top half of strip', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      const menuBox = await page.locator('.mobile-menu-btn').first().boundingBox();
      expect(menuBox).not.toBeNull();
      expect(menuBox!.y).toBeLessThan(viewport.height * 0.5);
    });

    test('roll button has transparent background in landscape', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      const bg = await page.locator('[data-testid="btn-roll"]').first().evaluate((el) => {
        return getComputedStyle(el).backgroundColor;
      });
      expect(bg).toBe('rgba(0, 0, 0, 0)');
    });
```

Also add a new `test.describe('No strips on non-game pages', () => { ... })` block at the bottom of the file, asserting that on landing and login in landscape Pixel 7, `.mobile-action-bar` either doesn't exist OR does not have a fixed-right bounding box:

```typescript
test.describe('No strips on non-game pages (landscape Pixel 7)', () => {
  test.use({ viewport: { width: 915, height: 412 } });

  test('landing has no fixed-right strip', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('.main-content');
    await page.waitForTimeout(300);

    const bar = page.locator('.mobile-action-bar');
    const count = await bar.count();
    if (count > 0) {
      // If present, it must not be a fixed-right 60-px strip
      const box = await bar.first().boundingBox();
      if (box) {
        // Either not fixed-right (x far from right edge) or not 60 px wide
        const isRightStrip = (box.x + box.width >= 913) && (box.width <= 70);
        expect(isRightStrip).toBe(false);
      }
    }
  });

  test('login has no fixed-right strip', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('.main-content');
    const loginLink = page.locator('.header-auth').first();
    if (await loginLink.isVisible({ timeout: 200 }).catch(() => false)) {
      await loginLink.click();
      await page.waitForTimeout(300);
    }

    const bar = page.locator('.mobile-action-bar');
    const count = await bar.count();
    if (count > 0) {
      const box = await bar.first().boundingBox();
      if (box) {
        const isRightStrip = (box.x + box.width >= 913) && (box.width <= 70);
        expect(isRightStrip).toBe(false);
      }
    }
  });
});
```

Note: inside the existing `for (const [name, viewport] of Object.entries(LANDSCAPE))` loop, `viewport` is already in scope for the new tests.

- [ ] **Step 2: Create ls-audit.spec.ts for visual re-audit**

Create `tests/e2e/ls-audit.spec.ts` with the content from the previous audit (landing, ai-initial, after-roll, checker-selected, after-move, panel-open, luck-heatmap, local-2p, online, login, cube-offered × 3 viewports = 33 states):

```typescript
import { test, Page } from '@playwright/test';
import * as fs from 'fs';

const DIR = 'screenshots/ls-audit';
fs.mkdirSync(DIR, { recursive: true });

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
}

async function clickVisibleTestId(page: Page, testid: string) {
  const all = page.locator(`[data-testid="${testid}"]`);
  const count = await all.count();
  for (let i = 0; i < count; i++) {
    if (await all.nth(i).isVisible({ timeout: 200 }).catch(() => false)) {
      await all.nth(i).click();
      return true;
    }
  }
  return false;
}

async function clickVisibleChecker(page: Page) {
  const cks = page.locator('[data-testid^="checker-"]');
  const count = await cks.count();
  for (let i = 0; i < count; i++) {
    if (await cks.nth(i).isVisible({ timeout: 200 }).catch(() => false)) {
      await cks.nth(i).click();
      return true;
    }
  }
  return false;
}

async function clickVisibleDest(page: Page) {
  const ds = page.locator('[data-testid^="dest-"]');
  const count = await ds.count();
  for (let i = 0; i < count; i++) {
    if (await ds.nth(i).isVisible({ timeout: 200 }).catch(() => false)) {
      await ds.nth(i).click();
      return true;
    }
  }
  return false;
}

const VIEWPORTS = {
  'pixel7':   { width: 915, height: 412 },
  'iphone-se': { width: 667, height: 375 },
  'galaxy-s5': { width: 640, height: 360 },
};

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`LS audit: ${name}`, () => {
    test.use({ viewport });

    test('01 landing', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.waitForTimeout(300);
      await snap(page, `${name}-01-landing`);
    });

    test('02 ai game initial', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await snap(page, `${name}-02-ai-initial`);
    });

    test('03 ai after roll', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await clickVisibleTestId(page, 'btn-roll');
      await page.waitForTimeout(1000);
      await snap(page, `${name}-03-after-roll`);
    });

    test('04 checker selected', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await clickVisibleTestId(page, 'btn-roll');
      await page.waitForTimeout(1000);
      await clickVisibleChecker(page);
      await page.waitForTimeout(400);
      await snap(page, `${name}-04-checker-selected`);
    });

    test('05 after move', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await clickVisibleTestId(page, 'btn-roll');
      await page.waitForTimeout(1000);
      await clickVisibleChecker(page);
      await page.waitForTimeout(300);
      await clickVisibleDest(page);
      await page.waitForTimeout(500);
      await snap(page, `${name}-05-after-move`);
    });

    test('06 side panel open', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await clickVisibleTestId(page, 'btn-roll');
      await page.waitForTimeout(1000);
      const menu = page.locator('.mobile-menu-btn').first();
      if (await menu.isVisible({ timeout: 300 }).catch(() => false)) {
        await menu.click();
        await page.waitForTimeout(500);
      }
      await snap(page, `${name}-06-panel-open`);
    });

    test('07 luck heatmap', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await clickVisibleTestId(page, 'btn-roll');
      await page.waitForTimeout(1000);
      const menu = page.locator('.mobile-menu-btn').first();
      if (await menu.isVisible({ timeout: 300 }).catch(() => false)) {
        await menu.click();
        await page.waitForTimeout(500);
        const luck = page.locator('.luck-current').first();
        if (await luck.isVisible({ timeout: 300 }).catch(() => false)) {
          await luck.click();
          await page.waitForTimeout(300);
        }
      }
      await snap(page, `${name}-07-luck-heatmap`);
    });

    test('08 local 2p', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Local 2P/i }).first().click();
      await page.waitForTimeout(500);
      await snap(page, `${name}-08-local-2p`);
    });

    test('09 play online', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play Online/i }).first().click();
      await page.waitForTimeout(1200);
      await snap(page, `${name}-09-online`);
    });

    test('10 login page', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      const loginLink = page.locator('.header-auth').first();
      if (await loginLink.isVisible({ timeout: 300 }).catch(() => false)) {
        await loginLink.click();
        await page.waitForTimeout(300);
      }
      await snap(page, `${name}-10-login`);
    });

    test('11 doubling cube offered', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content');
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);
      await page.keyboard.press('d');
      await page.waitForTimeout(500);
      await snap(page, `${name}-11-cube-offered`);
    });
  });
}
```

- [ ] **Step 3: Run everything**

```bash
# Server must be running
curl -s http://localhost:8080/health || (PORT=8080 DATABASE_URL= LOG_LEVEL=error npx tsx src/server/index.ts &)
sleep 2

npm test
# Expected: 278 passed

npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/landscape-strips.spec.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts --reporter=list
# Expected: 28+ passed (19 landscape-strips + 2 full-game + 10 flows)

npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/ls-audit.spec.ts --reporter=list
# Expected: 33 passed
```

- [ ] **Step 4: Visual inspection**

Controller manually inspects the 33 screenshots in `screenshots/ls-audit/` (focus on landscape states: `pixel7-*`, `iphone-se-*`, `galaxy-s5-*`). Checklist:

1. Landing in landscape on all 3 viewports — "duckGammon" title fully visible, NO side strips
2. Login page in landscape — no side strips, centred form
3. AI game initial — both strips, icons on left (DG, duck, robot, login-person), dice+arrow on right with no blue box
4. After roll — Undo button at BOTTOM of right strip (not top), dice visible on board
5. Checker selected — green highlights visible, legal destinations shown
6. After move — Undo still at bottom-right
7. Side panel open — slides in from right, renders upright (readable)
8. Luck heatmap — grid fits in visible panel area
9. Local 2P — same layout as vs AI
10. Play Online — Resign icon visible (not "Resig" truncated), connection indicator shows as dot only
11. Cube offered — Accept (checkmark icon) + Drop (X icon) in right strip

Report findings to the user: list each of the 7 original defects and whether the fix is visible in the screenshots.

- [ ] **Step 5: Clean up ls-audit and add to gitignore**

```bash
rm tests/e2e/ls-audit.spec.ts
```

Ensure `screenshots/ls-audit` and `screenshots/spot` are in `.gitignore` (they should already be from a previous iteration).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/landscape-strips.spec.ts .gitignore
git commit -m "test(e2e): expand landscape-strips regression

Adds assertions that directly target the 7 defects from the audit:
- Undo in bottom half of right strip (fixed by column-reverse)
- Menu in top half of right strip
- Roll background is transparent in landscape
- No fixed-right strip on landing / login pages

Plus the 33-state visual audit was re-run and all seven defects
visually confirmed fixed."
```

---

## Self-Review

**1. Spec coverage**:
- Spec section "1. Page-scoped strips" → Task 0.
- Spec section "2. Undo / Confirm / Accept / Drop / Resign icons" → Task 2.
- Spec section "3. Fix detached Undo" → Task 1.
- Spec section "4. Transparent Roll button background" → Task 3.
- Spec section "5. Online status line" → Task 4.
- Spec section "6. Luck heatmap" → Task 5 (verified via re-audit; no code changes needed because the existing 200-px cap suffices once strips are game-scoped).
- Spec section "7. Landing / login page" → Task 0 (inherits from page-scoping, verified in Task 5).
- Spec section "Testing plan" → Task 5.
- Non-goals respected: portrait untouched, no side-panel redesign, no game logic changes. ✓

**2. Placeholder scan**: No "TBD" / "TODO" / vague phrases. Every CSS / JSX edit shows the full code. ✓

**3. Type consistency**: The icon component names (UndoIcon, CheckIcon, CrossIcon, FlagIcon) and span class names (undo-label / undo-icon etc.) are used consistently between Task 2 and the assertions in Task 5. The `#app[data-page="game"]` selector is used consistently across Tasks 0-4. ✓

No gaps found.
