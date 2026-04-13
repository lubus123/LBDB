# Landscape Side-Strips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `#app`-rotation landscape implementation with a head-upright side-strips layout: fixed 48px header strip on the left, fixed 60px action-bar strip on the right, board rotated portrait-style in the middle, Login becomes a user icon, Roll becomes a dice+arrow Amazon-Prime-style button with a pulsing green glow.

**Architecture:** No DOM-level or `#app`-level rotation. Landscape-only CSS changes reposition `.header` and `.mobile-action-bar` as `position: fixed` vertical strips with `flex-direction: column`. The board-container is offset by both strip widths via margins so the existing portrait board-wrapper rotation continues to render the board portrait-shaped in the middle. Login icon and Roll dice icon are inline SVGs in the existing components, toggled visible/hidden per orientation by CSS.

**Tech Stack:** Solid.js (existing), CSS media queries (`orientation: landscape` + `max-height: 500px`), inline SVG.

---

## File Structure

```
src/ui/styles/
  layout.css              — MODIFY: remove orientation-lock block; add landscape .header strip rule
  board.css               — MODIFY: remove trailing orientation-lock block; add landscape .mobile-action-bar strip rule + dice-pulse @keyframes + icon/label swap rules

src/ui/
  index.tsx               — MODIFY: add <LoginIcon> component; render it alongside "Login" text so CSS can swap
  game/GameView.tsx       — MODIFY: wrap Roll/Double button labels in spans; add dice+arrow SVG icon span

tests/e2e/
  landscape-strips.spec.ts — NEW: permanent regression test for landscape strip layout
```

---

### Task 0: Revert app-rotation changes in CSS

**Goal:** Strip out the `#app` rotation and viewport-unit-swap overrides from the orientation-lock experiment. This is the clean starting point for the new layout.

**Files:**
- Modify: `src/ui/styles/layout.css` lines 73-127 (remove the `@media (orientation: landscape) and (max-height: 500px)` block)
- Modify: `src/ui/styles/board.css` tail (remove the trailing `@media (orientation: landscape) and (max-height: 500px)` block containing `.board-container` and `.board-wrapper` overrides)

**Acceptance Criteria:**
- [ ] `src/ui/styles/layout.css` no longer contains `transform: translate(0, 100dvh) rotate(-90deg)`
- [ ] `src/ui/styles/board.css` no longer has trailing orientation-lock `.board-container { height: calc(100vw - ...) }` rule
- [ ] `npm run build` succeeds
- [ ] All 278 unit + 12 E2E tests pass
- [ ] Landscape screenshot on Pixel 7 shows the "board matches portrait" intermediate state (no rotation, no custom layout yet) — that's fine; this task is only about reverting

**Verify:** `npm run build && npm test` → clean build, 278 tests pass

**Steps:**

- [ ] **Step 1: Remove the orientation-lock block from layout.css**

Edit `src/ui/styles/layout.css` to delete lines 73-127 (everything from `/* ─── Orientation-lock simulation for landscape phones ───` through the closing `}` of the `@media (orientation: landscape) and (max-height: 500px)` block).

After the edit, the file should end at line 72 with the existing `@media (max-width: 768px), (max-height: 500px) { .main-content { align-items: stretch; } }` block. No other changes.

- [ ] **Step 2: Remove the trailing orientation-lock block from board.css**

Edit `src/ui/styles/board.css` to delete the trailing block added at the end of the file:

```css
/* ─── Orientation-lock simulation (landscape phones): swap vw/vh inside
   the rotated #app so board/container sizing refers to the app's
   pre-rotation frame (width = viewport short edge, height = long edge).
   These overrides must come AFTER the mobile block above, and because
   board.css is imported after layout.css, they also override any
   equivalent rules there. */
@media (orientation: landscape) and (max-height: 500px) {
  .board-container {
    height: calc(100vw - var(--header-height));
  }
  .board-wrapper {
    width: calc(100vw - var(--header-height) - 90px);
    height: 100dvh;
    max-width: calc(100dvh * 780 / 640);
  }
}
```

The file should now end at `.game-card-action { ... }`.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: ✓ built in <1s, no errors.

Run: `npm test`
Expected: 15 test files, 278 tests passed.

Run: `pkill -f 'tsx.*server' 2>/dev/null; PORT=8080 DATABASE_URL= LOG_LEVEL=error npx tsx src/server/index.ts &` (background), then `sleep 2 && curl -s http://localhost:8080/health` → `{"ok":true,"rooms":0,"users":0}`

Run: `npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts --reporter=list`
Expected: 12 passed.

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles/layout.css src/ui/styles/board.css
git commit -m "revert: remove #app rotation and viewport-unit swaps

The orientation-lock simulation made all text appear sideways on
real landscape phones. Reverting to start fresh with a head-upright
side-strips layout."
```

---

### Task 1: Landscape layout — header and action bar as fixed vertical strips

**Goal:** With Task 0's clean slate, add the new landscape-only CSS that fixes the header to the left edge (48px wide, full height), fixes the mobile action bar to the right edge (60px wide, full height), and offsets the board-container via margins so the board renders in the middle channel.

**Files:**
- Modify: `src/ui/styles/layout.css` (append landscape `.header` rule)
- Modify: `src/ui/styles/board.css` (append landscape `.mobile-action-bar` + `.board-container` rule)

**Acceptance Criteria:**
- [ ] In landscape (412-tall or less), `.header` is `position: fixed; left: 0; top: 0; width: 48px; height: 100dvh`, `flex-direction: column`
- [ ] In landscape, `.mobile-action-bar` is `position: fixed; right: 0; top: 0; width: 60px; height: 100dvh`, `flex-direction: column`, `justify-content: flex-end`
- [ ] In landscape, `.board-container` has `margin-left: 48px; margin-right: 60px`
- [ ] Board-wrapper still has its portrait 90° rotation — board appears portrait-shaped in the middle
- [ ] Portrait layout unchanged
- [ ] All 278 unit + 12 E2E tests pass

**Verify:** `npm run build && npm test && npx playwright test --config tests/e2e/e2e.config.ts` → all pass

**Steps:**

- [ ] **Step 1: Append landscape header rule to layout.css**

Add at the end of `src/ui/styles/layout.css`:

```css
/* ─── Landscape phones: header becomes a vertical strip on the left ─── */
@media (orientation: landscape) and (max-height: 500px) {
  .header {
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

  /* The auth link ("Login" in portrait) gets CSS-switched to an icon in Task 2 */
  .header > div {
    margin-left: 0 !important;
    flex-direction: column;
  }

  /* Hide the "vs AI" / "Local" / "Online" text badge — the mode icons
     inside HeaderLogo already convey the mode */
  .header-mode {
    display: none;
  }
}
```

- [ ] **Step 2: Append landscape action-bar + board-container rule to board.css**

Add at the end of `src/ui/styles/board.css`:

```css
/* ─── Landscape phones: mobile action bar becomes a vertical strip
   on the right, board-container offsets by both strip widths ─── */
@media (orientation: landscape) and (max-height: 500px) {
  .board-container {
    margin-left: 48px;
    margin-right: 60px;
  }

  .mobile-action-bar {
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

  .mobile-action-bar button {
    width: 100%;
    min-height: 44px;
  }

  /* Info strip hidden in landscape — pip counts shown in the strip if needed */
  .mobile-info-strip {
    display: none;
  }
}
```

- [ ] **Step 3: Rebuild**

Run: `npm run build`
Expected: ✓ built, CSS now includes the new landscape rules.

- [ ] **Step 4: Verify unit tests**

Run: `npm test`
Expected: 278 passed.

- [ ] **Step 5: Start server and run E2E regression**

Run in background: `pkill -f 'tsx.*server' 2>/dev/null; PORT=8080 DATABASE_URL= LOG_LEVEL=error npx tsx src/server/index.ts &`
Wait 2s, then: `curl -s http://localhost:8080/health`
Expected: `{"ok":true,"rooms":0,"users":0}`

Run: `npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts --reporter=list`
Expected: 12 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/styles/layout.css src/ui/styles/board.css
git commit -m "feat(mobile): landscape side-strips layout (header left, action right)

Header fixed 48px on the left, mobile action bar fixed 60px on the
right, board-container margin-offset by both so the board renders
in the middle channel with its existing portrait rotation intact."
```

---

### Task 2: Login user icon + landscape header content

**Goal:** Replace the "Login" text link with a compact user-icon SVG in landscape. Portrait keeps the text. Header children (duck mascot, mode icon, DG wordmark, login icon) stack vertically in the 48-px strip.

**Files:**
- Modify: `src/ui/index.tsx` around the "Login" link (line ~305-307 in the header JSX)
- Modify: `src/ui/styles/layout.css` (extend the landscape header rule with visibility toggles)

**Acceptance Criteria:**
- [ ] A `<LoginIcon />` inline SVG component is defined alongside the existing `HeaderLogo` component
- [ ] The header-auth anchor contains both a `<span class="auth-label">Login</span>` and the `<LoginIcon class="auth-icon" />`
- [ ] In portrait, `.auth-label` is visible and `.auth-icon` is hidden
- [ ] In landscape, `.auth-label` is hidden and `.auth-icon` is visible
- [ ] The `.header-logo` in landscape uses `flex-direction: column` so the "duck" text / Gammon span / HeaderLogo SVGs stack vertically
- [ ] DG wordmark text stays on one line (never splits letter-by-letter vertically) — use `writing-mode: horizontal-tb` (default) and ensure the parent has enough width
- [ ] Portrait pixel-unchanged (verified by existing flows.spec.ts `Mobile login form renders`)

**Verify:** `npm run build && npm test` → pass; visual: landscape Pixel 7 screenshot shows LoginIcon (not "Login" text)

**Steps:**

- [ ] **Step 1: Add LoginIcon component in index.tsx**

In `src/ui/index.tsx`, near the existing `HeaderLogo` definition, add:

```tsx
const LoginIcon = (props: { class?: string }) => (
  <svg class={props.class} viewBox="0 0 24 24" width="18" height="18"
       style={{ "flex-shrink": "0" }}>
    <circle cx="12" cy="8" r="4" fill="none"
            stroke="currentColor" stroke-width="1.8"/>
    <path d="M4 20 C4 15, 8 14, 12 14 S20 15, 20 20"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round"/>
  </svg>
);
```

- [ ] **Step 2: Update the Login anchor to render both label and icon**

Find the existing "Login" anchor in the header (around line 305 in `index.tsx`). It currently looks like:

```tsx
<a href="#" class="header-auth" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>Login</a>
```

Replace with:

```tsx
<a href="#" class="header-auth" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>
  <span class="auth-label">Login</span>
  <LoginIcon class="auth-icon" />
</a>
```

- [ ] **Step 3: Add CSS visibility toggle**

At the end of the landscape header rule in `src/ui/styles/layout.css` (added in Task 1), add:

```css
  .auth-icon { display: inline-flex; align-items: center; color: var(--text-primary); }
  .auth-label { display: none; }

  /* Stack header-logo children vertically */
  .header-logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0;         /* hide "duck" and <span>Gammon</span> text */
    letter-spacing: 0;
    gap: 6px;
  }
  .header-logo::before {
    content: "DG";
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--text-primary);
  }
```

Also add at the top level of `layout.css` (outside any media query — portrait defaults):

```css
.auth-icon { display: none; }
.auth-label { display: inline; }
```

Place these just after the existing `.header-logo span` rule so the cascade is clean.

- [ ] **Step 4: Build, test**

Run: `npm run build && npm test`
Expected: build clean, 278 tests pass.

- [ ] **Step 5: Visual verify via Playwright screenshot**

(The landscape E2E test in Task 4 will assert this programmatically. For now, take a manual screenshot.)

Run (in background server context):
```bash
cat > /tmp/verify.spec.ts << 'EOF'
import { test } from '@playwright/test';
test('landscape login icon', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/verify-login-icon.png' });
});
EOF
cp /tmp/verify.spec.ts tests/e2e/verify-login-icon.spec.ts
npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/verify-login-icon.spec.ts
rm tests/e2e/verify-login-icon.spec.ts
```

Inspect `screenshots/verify-login-icon.png` and confirm: left strip shows icons stacked + "DG" text + a small user-icon glyph at the top-right of the strip. No literal "Login" word visible.

- [ ] **Step 6: Commit**

```bash
git add src/ui/index.tsx src/ui/styles/layout.css
git commit -m "feat(mobile): LoginIcon SVG + landscape header stacking

Login text replaced by an 18px stroke-based user icon in landscape
while staying as text in portrait. Header-logo children stack
vertically in the 48-px left strip; DG wordmark remains on one line."
```

---

### Task 3: Roll button dice+arrow icon with green pulse glow

**Goal:** In landscape, the Roll button displays a dice SVG with a pulsing green drop-shadow glow and a small green down-arrow beneath (Amazon-Prime-style affordance). The Double button shows `×2` instead of "Double". Portrait keeps the text labels. Both buttons keep their existing `data-testid` attributes, handlers, and disabled logic.

**Files:**
- Modify: `src/ui/game/GameView.tsx` around the Roll + Double buttons (lines 1401-1406)
- Modify: `src/ui/styles/board.css` (append landscape icon/label swap + `@keyframes dice-pulse`)

**Acceptance Criteria:**
- [ ] Roll button JSX contains `<span class="roll-label">Roll</span>` AND `<span class="roll-icon">` (the SVG)
- [ ] Double button JSX contains `<span class="double-label">Double</span>` AND `<span class="double-icon">×2</span>`
- [ ] Portrait: only labels visible. Landscape: only icons visible.
- [ ] Dice SVG: 36×36 rounded-rect face (`#f5f0e8` fill, `#c4b8a4` stroke), three dark dots arranged diagonally, and a 12×12 green down-arrow below the face
- [ ] `@keyframes dice-pulse` animates `filter: drop-shadow(0 0 [low/high]px rgba(76,175,80,[low/high]))` on `.roll-icon` for 1.6s ease-in-out infinite
- [ ] Animation runs only when the button is not disabled (use `.btn-primary:not([disabled]) .roll-icon`)
- [ ] `[data-testid="btn-roll"]` still resolves; existing full-game E2E test still passes
- [ ] Portrait unchanged

**Verify:** `npm run build && npm test && npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/full-game.spec.ts` → all pass

**Steps:**

- [ ] **Step 1: Wrap the Roll and Double buttons in GameView.tsx**

Find the mobile-action-bar Roll + Double buttons (line ~1403-1405):

```tsx
<button class="btn btn-primary mobile-action-btn" data-testid="btn-roll" onClick={handleRoll} disabled={isRolling()}>Roll</button>
<Show when={canDouble(currentState().cube, currentState().turn)}>
  <button class="btn mobile-action-btn" onClick={handleDouble}>Double</button>
</Show>
```

Replace with:

```tsx
<button class="btn btn-primary mobile-action-btn" data-testid="btn-roll" onClick={handleRoll} disabled={isRolling()}>
  <span class="roll-label">Roll</span>
  <span class="roll-icon" aria-hidden="true">
    <svg viewBox="0 0 52 60" width="40" height="46">
      <rect x="8" y="6" width="36" height="36" rx="6"
            fill="#f5f0e8" stroke="#c4b8a4" stroke-width="1.5"/>
      <circle cx="18" cy="16" r="2.5" fill="#1a1a1a"/>
      <circle cx="26" cy="24" r="2.5" fill="#1a1a1a"/>
      <circle cx="34" cy="32" r="2.5" fill="#1a1a1a"/>
      <path d="M26 48 L26 56 M20 52 L26 58 L32 52"
            stroke="#4caf50" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </span>
</button>
<Show when={canDouble(currentState().cube, currentState().turn)}>
  <button class="btn mobile-action-btn" onClick={handleDouble}>
    <span class="double-label">Double</span>
    <span class="double-icon">×2</span>
  </button>
</Show>
```

Also update the desktop-side Roll button (line ~1512-1514 — the one inside `.side-panel .controls`):

```tsx
<button class="btn btn-primary" data-testid="btn-roll" onClick={handleRoll} disabled={isRolling()}>
  Roll <kbd>Enter</kbd>
</button>
```

Leave the desktop Roll button untouched — it stays text-only and handled by the `.roll-label`/`.roll-icon` CSS swap which only activates in landscape mobile.

(Note: if the desktop Roll button's existing JSX text is literal "Roll", the portrait landscape swap won't touch it since the swap rules are scoped inside the mobile action bar via the `.mobile-action-bar .roll-label` / `.mobile-action-bar .roll-icon` selector pattern. Use that scope in Step 2 below.)

- [ ] **Step 2: Add CSS swap + pulse keyframes to board.css**

Append to `src/ui/styles/board.css`:

```css
/* ─── Icon/label swap inside the mobile action bar ───
   Default (portrait): labels visible, icons hidden. */
.mobile-action-bar .roll-label,
.mobile-action-bar .double-label {
  display: inline;
}
.mobile-action-bar .roll-icon,
.mobile-action-bar .double-icon {
  display: none;
}

/* ─── Landscape: icons visible, labels hidden ─── */
@media (orientation: landscape) and (max-height: 500px) {
  .mobile-action-bar .roll-label,
  .mobile-action-bar .double-label {
    display: none;
  }
  .mobile-action-bar .roll-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: dice-pulse 1.6s ease-in-out infinite;
  }
  .mobile-action-bar .double-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
  }

  /* Stop pulsing when disabled */
  .mobile-action-bar [data-testid="btn-roll"][disabled] .roll-icon {
    animation: none;
    opacity: 0.6;
  }
}

@keyframes dice-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(76, 175, 80, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 10px rgba(76, 175, 80, 0.85));
  }
}
```

- [ ] **Step 3: Build + unit tests**

Run: `npm run build && npm test`
Expected: build clean, 278 tests pass.

- [ ] **Step 4: E2E regression**

Run (server should still be up from earlier):
```bash
npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts --reporter=list
```
Expected: 12 passed (the `data-testid="btn-roll"` selector still works because testid is on the button).

- [ ] **Step 5: Commit**

```bash
git add src/ui/game/GameView.tsx src/ui/styles/board.css
git commit -m "feat(mobile): landscape Roll dice-icon with green pulse + ×2 Double

Mobile action bar swaps text labels for icons in landscape:
- Roll: 36×36 dice face with three diagonal pips + green down-arrow,
  pulsing green drop-shadow glow (1.6s ease-in-out)
- Double: compact ×2 glyph
Portrait unchanged. Data-testids preserved — E2E tests unaffected."
```

---

### Task 4: E2E landscape layout test + visual verification

**Goal:** Add a permanent Playwright test that asserts the landscape side-strips layout (strip positions, icon visibility, portrait non-regression). Capture final verification screenshots.

**Files:**
- Create: `tests/e2e/landscape-strips.spec.ts`

**Acceptance Criteria:**
- [ ] Test runs on 3 landscape viewports (Pixel 7 915×412, iPhone SE 667×375, Galaxy S5 640×360)
- [ ] Asserts `.header` bounding box starts at (0, 0) with width ≈ 48
- [ ] Asserts `.mobile-action-bar` bounding box right-edge touches viewport right (`box.x + box.width ≈ viewport.width`) with width ≈ 60
- [ ] Asserts `.roll-icon svg` is visible; `.roll-label` is hidden in landscape
- [ ] Asserts `.auth-icon` is visible; `.auth-label` is hidden in landscape
- [ ] One portrait regression test (Pixel 7 412×915) asserts `.header` is a horizontal bar (width ≈ viewport.width), `.mobile-action-bar` is at the bottom (width ≈ viewport.width), and `.auth-label` is visible (`.auth-icon` hidden)
- [ ] All tests pass

**Verify:** `npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/landscape-strips.spec.ts --reporter=list` → all pass, and full regression `tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts` also passes

**Steps:**

- [ ] **Step 1: Create the test file**

Create `tests/e2e/landscape-strips.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const DIR = 'screenshots/landscape-strips';
fs.mkdirSync(DIR, { recursive: true });

const LANDSCAPE = {
  'pixel7':   { width: 915, height: 412 },
  'iphone-se': { width: 667, height: 375 },
  'galaxy-s5': { width: 640, height: 360 },
};

for (const [name, viewport] of Object.entries(LANDSCAPE)) {
  test.describe(`Landscape strips: ${name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test('header fixed-left strip, action bar fixed-right strip', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content', { timeout: 5000 });
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      const headerBox = await page.locator('.header').boundingBox();
      expect(headerBox).not.toBeNull();
      expect(headerBox!.x).toBe(0);
      expect(headerBox!.y).toBe(0);
      expect(headerBox!.width).toBeLessThanOrEqual(56);
      expect(headerBox!.width).toBeGreaterThanOrEqual(40);
      expect(headerBox!.height).toBeGreaterThanOrEqual(viewport.height - 10);

      const barBox = await page.locator('.mobile-action-bar').boundingBox();
      expect(barBox).not.toBeNull();
      expect(barBox!.width).toBeLessThanOrEqual(70);
      expect(barBox!.width).toBeGreaterThanOrEqual(50);
      expect(barBox!.x + barBox!.width).toBeGreaterThanOrEqual(viewport.width - 2);

      await page.screenshot({ path: `${DIR}/${name}-game.png` });
    });

    test('roll icon visible, label hidden', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content', { timeout: 5000 });
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      const icon = page.locator('.mobile-action-bar .roll-icon svg').first();
      await expect(icon).toBeVisible();

      const label = page.locator('.mobile-action-bar .roll-label').first();
      await expect(label).toBeHidden();
    });

    test('login icon visible, text hidden', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content', { timeout: 5000 });
      await page.waitForTimeout(300);

      const icon = page.locator('.auth-icon').first();
      await expect(icon).toBeVisible();

      const label = page.locator('.auth-label').first();
      await expect(label).toBeHidden();
    });
  });
}

test.describe('Portrait regression (Pixel 7 412×915)', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('header horizontal, action bar bottom, Login text visible', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('.main-content', { timeout: 5000 });
    await page.locator('button', { hasText: /Play vs AI/i }).first().click();
    await page.waitForTimeout(500);

    const headerBox = await page.locator('.header').boundingBox();
    expect(headerBox!.width).toBeGreaterThanOrEqual(400);
    expect(headerBox!.height).toBeLessThanOrEqual(80);

    const barBox = await page.locator('.mobile-action-bar').boundingBox();
    expect(barBox!.width).toBeGreaterThanOrEqual(400);
    expect(barBox!.y + barBox!.height).toBeGreaterThanOrEqual(900);

    const label = page.locator('.auth-label').first();
    await expect(label).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the new test**

Run: `npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/landscape-strips.spec.ts --reporter=list`
Expected: 10 tests passed (3 landscape viewports × 3 tests + 1 portrait regression).

- [ ] **Step 3: Run full regression**

Run: `npx playwright test --config tests/e2e/e2e.config.ts tests/e2e/full-game.spec.ts tests/e2e/flows.spec.ts tests/e2e/landscape-strips.spec.ts --reporter=list`
Expected: 22 passed.

- [ ] **Step 4: Visual inspection**

Inspect `screenshots/landscape-strips/*-game.png` (3 files). Each should show:
- Left strip (~48px wide) with vertically-stacked icons: duck logo, mode icon, DG wordmark, LoginIcon
- Board portrait-shaped in the middle channel
- Right strip (~60px wide) with vertically-stacked action buttons: Roll (with glowing dice icon), ×2 Double, menu ⋯

- [ ] **Step 5: Update gitignore + commit**

Add `screenshots/landscape-strips` to `.gitignore` if not already ignored. Then:

```bash
git add tests/e2e/landscape-strips.spec.ts .gitignore
git commit -m "test(e2e): landscape side-strips layout regression

Tests assert header-left / action-bar-right strip positions, icon
visibility in landscape, text visibility in portrait. 10 tests
across 3 landscape viewports + 1 portrait regression. All pass."
```

---

## Self-Review

**1. Spec coverage:**
- Spec section "Architecture: No DOM-level or `#app`-level rotation" → Task 0 (revert).
- Spec section "Header (left strip)" → Tasks 1 + 2.
- Spec section "Mobile action bar (right strip)" → Task 1 + 3.
- Spec section "Main content (board)" (`margin-left: 48px; margin-right: 60px`) → Task 1.
- Spec section "New SVG assets" (LoginIcon, Roll dice+arrow) → Tasks 2 + 3.
- Spec section "Testing plan" (E2E assertions) → Task 4.
- Non-goals respected: no portrait changes, no new shortcuts, no game logic changes. ✓

**2. Placeholder scan:**
- No "TBD" / "TODO" / "similar to Task N" / vague error-handling language. ✓
- Every CSS/JSX edit shows the full code block. ✓

**3. Type consistency:**
- `.roll-label` / `.roll-icon` / `.double-label` / `.double-icon` / `.auth-label` / `.auth-icon` — used consistently across Tasks 2, 3, 4.
- `LoginIcon` — name consistent in Tasks 2 and 4.
- `.mobile-action-bar` / `.header` — matches existing CSS selectors. ✓

No gaps found.
