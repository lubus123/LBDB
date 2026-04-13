# Landscape polish — design

**Topic:** Mobile landscape polish — scope strips to game-only, unify right-strip content across phases, replace truncated text with icons, fix the detached Undo, de-box the Roll dice icon, keep the luck heatmap within the side panel.

**Problem:** Screenshot audit of the current landscape implementation (Pixel 7 915×412, iPhone SE 667×375, Galaxy S5 640×360) found seven real defects:

1. Landing page title "duckGammon" clips off the top on Pixel 7 and is entirely off-screen on Galaxy S5 — the portrait-centred landing layout doesn't fit a short viewport when the 48-px left strip is eating width.
2. In move phase, the **Undo** button floats detached at the top-right of the viewport instead of sitting inside the right strip. Root cause: `.mobile-menu-btn` has `margin-left: auto` in the base CSS, which becomes `margin-top: auto` in the landscape `flex-direction: column` override. Menu gets pushed to the bottom and the earlier `Undo` child is stranded at the top.
3. "Resign" is truncated to "Resig" and the "Waiting for opponent" status line overflows the strip width in online mode.
4. Side strips render on landing / login / register even though those pages have no game controls. The login-page person icon is especially nonsensical (it points the user to the page they're already on).
5. Right-strip content is inconsistent across game phases: waiting shows Roll + ×2 + ⋯, move shows only ⋯, online shows Resign + chat + ⋯ + status text stacked together. No predictable vertical ordering.
6. The luck heatmap is capped to 200×210 px already but on Pixel 7 landscape (412-px viewport height) only rows 1-3 are visible above the fold.
7. The Roll button's blue `.btn-primary` fill paints a solid rectangle behind the dice SVG, making the icon look like a sticker on a box instead of an icon with a glow.

**Goal:** Close all seven defects with scoped CSS overrides, a small icon set, and one attribute binding in the router. Portrait is untouched.

## Architecture

One new scoping mechanism: `#app` gets a `data-page` attribute reflecting the current page signal (`landing`, `login`, `register`, `game`, `profile`). The existing `@media (orientation: landscape) and (max-height: 500px)` block is split into rules that apply **always in landscape** (baseline: no strips, normal layout) and rules that apply **only when** `#app[data-page="game"]` (strips, icons, overrides). No JavaScript logic changes beyond the attribute binding.

A handful of tiny inline SVG components (back-arrow for Undo, checkmark for Confirm/Accept, X for Drop, flag for Resign) replace text labels in the landscape scope. Label spans remain in the JSX so portrait keeps its text; CSS swaps visibility via the same `.xxx-label` / `.xxx-icon` pattern established for Roll/Double.

## Components

### 1. Page-scoped strips

- Add `data-page={page()}` (reactive) to the `<div id="app">` root in `src/ui/index.tsx`.
- Move the existing landscape `.header` and `.mobile-action-bar` fixed-position rules from `@media (... landscape ...)` into `@media (...) #app[data-page="game"] .header` / `.mobile-action-bar` selectors.
- Outside of game, landscape falls back to the standard mobile block (`@media (max-width: 768px), (max-height: 500px)`) — header on top, no action bar, content centred. Landing / login / register render normally.

### 2. Undo / Confirm / Accept / Drop / Resign icons in landscape

For each button, JSX becomes a two-span shell (label + icon) matching the Roll/Double pattern. CSS in the game-scoped landscape block hides `.xxx-label`, shows `.xxx-icon`.

Icon SVG definitions (inline in `GameView.tsx`, near the top):

```tsx
const UndoIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M8 7 L4 11 L8 15 M4 11 L16 11 C19 11 20 14 20 16 C20 18 19 20 16 20 L11 20"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M5 12 L10 17 L19 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

const CrossIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  </svg>
);

const FlagIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M5 3 L5 21 M5 4 L16 4 L14 8 L17 12 L5 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);
```

Each affected button gets the same `<span class="xxx-label">Text</span><span class="xxx-icon"><Icon/></span>` structure. Label spans remain the single source of truth for a11y / testing — the icon is `aria-hidden`.

### 3. Fix detached Undo: override `margin-left: auto` in landscape

Inside the game-scoped landscape block:

```css
.mobile-action-bar .mobile-menu-btn,
.mobile-action-bar .mobile-chat-btn {
  margin: 0;  /* kill the margin-left: auto from portrait CSS */
}
```

Then use explicit DOM-order stacking with `justify-content: flex-end`. The JSX order inside `.mobile-action-bar` is already: Roll/Undo → Double → Accept/Drop → Resign → Menu → Chat. With `flex-direction: column-reverse`, that reads (bottom → top): Roll/Undo at bottom, then Double, Accept/Drop, Resign, Menu, Chat at top.

`column-reverse` is cleaner than re-ordering the DOM. It puts the primary action at the bottom (thumb-reachable) and menu/chat at the top.

### 4. Transparent Roll button background in landscape

```css
#app[data-page="game"] .mobile-action-bar .btn-primary[data-testid="btn-roll"] {
  background: transparent;
  border: none;
  box-shadow: none;
}
```

The green glow on the dice SVG becomes the sole visual signal. Same treatment for the Confirm button when it acts as primary (`[data-testid="btn-confirm"]`).

### 5. Online status line → dot-only in landscape

The `.connection-status` element in the lower-right corner (currently shows "🟢 Waiting for opponent…") overflows the strip. In landscape:

```css
#app[data-page="game"] .connection-status {
  position: fixed;
  left: 8px;
  bottom: 8px;
  /* hide the text, keep the status dot */
  font-size: 0;
}
#app[data-page="game"] .connection-status::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  /* colour inherited from the existing dot logic */
}
```

Alternatively — simpler — just give it `text-overflow: ellipsis; white-space: nowrap; max-width: 40px` and tuck it in the lower-left corner outside the strips. Picking the second approach as less risky (no pseudo-element colour gymnastics).

### 6. Luck heatmap — keep current 200-px cap

The existing `@media (max-height: 500px) .heatmap-grid { max-width: 200px; margin: 0 auto }` rule is fine. Verify with a fresh screenshot after the strips-only-on-game change.

### 7. Landing / login page

Once strips are scoped to `#app[data-page="game"]`, landing and login render as standard mobile pages — no changes needed. Verify with screenshots.

## File changes

- **src/ui/index.tsx** — add reactive `data-page={page()}` attribute to the `<div id="app">` element. Keep the `LoginIcon` definition but the anchor continues to render both spans (text shown in portrait, icon in landscape is game-scoped; on login page in landscape the icon is hidden since strips are gone).
- **src/ui/game/GameView.tsx** — add new inline SVG components (`UndoIcon`, `CheckIcon`, `CrossIcon`, `FlagIcon`). Convert the Undo, Confirm, Accept, Drop, and Resign buttons to the two-span shell pattern.
- **src/ui/styles/layout.css** — re-scope the existing landscape `.header` rule to `#app[data-page="game"] .header`. Remove the landscape-only `.header-logo` vertical-stack rule from the non-scoped path (it stays but only activates in-game).
- **src/ui/styles/board.css** — re-scope the existing landscape `.mobile-action-bar`, `.board-container`, label/icon-swap rules to `#app[data-page="game"]`. Add the `margin: 0` override for menu/chat buttons. Add `flex-direction: column-reverse`. Add transparent-background override for primary buttons. Add new `.undo-label` / `.undo-icon`, `.confirm-label` / `.confirm-icon`, `.accept-label` / `.accept-icon`, `.drop-label` / `.drop-icon`, `.resign-label` / `.resign-icon` swap rules. Handle the `.connection-status` ellipsis.

## Testing plan

**Visual regression (Playwright):** a new `tests/e2e/landscape-polish.spec.ts` captures screenshots of every state already audited (landing, ai-initial, after-roll, checker-selected, after-move, panel-open, luck-heatmap, local-2p, online, login, cube-offered) on three landscape viewports (Pixel 7, iPhone SE, Galaxy S5) and runs assertions:

- Landing (both portrait and landscape): no `.mobile-action-bar` in DOM.
- Login / register (landscape): no `.mobile-action-bar`, `duckGammon` heading fully visible within viewport bounds.
- Game (landscape): both strips visible; Undo button's `boundingBox().y` is in the **bottom half** of the viewport (not floating at top).
- Game (landscape, online): no text overflowing strip width (all button bounding boxes inside `[viewport.width - 60, viewport.width]` horizontal range when on the right strip).
- Roll button in landscape: `getComputedStyle(btn).backgroundColor === 'rgba(0, 0, 0, 0)'`.

**Unit tests:** no new logic, no new unit tests. Existing 278 must continue to pass.

**Full regression:** `npm test && npx playwright test --config tests/e2e/e2e.config.ts` → 278 unit + 34+ E2E (22 existing + 12 new landscape-polish states) all pass.

**Manual visual verification:** after implementation, capture the exact same 33-state audit (`tests/e2e/ls-audit.spec.ts` — already written, kept out of tree) and inspect each screenshot. Report findings back to the user before claiming done.

## Non-goals

- No changes to portrait experience.
- No redesign of the side panel's internal content — existing side panel stays.
- No changes to online networking, game logic, or auth flows.
- No keyboard-shortcut changes.
- No new animations beyond the existing Roll pulse.

## Success criteria

1. Landing in landscape on all three viewports shows "duckGammon" title fully within viewport bounds, all three game-mode buttons visible.
2. Login and register pages in landscape show no strips on the sides — same centred form as portrait.
3. In-game landscape on all three viewports: Undo button sits inside the right strip near the bottom (not floating at top), Resign renders as a flag icon (not truncated "Resig"), all buttons are inside the 60-px strip bounds.
4. Roll button in landscape has no visible blue rectangular background — only the dice icon with its green pulse glow.
5. Every state from the original 33-screenshot audit passes a fresh visual inspection.
6. All existing 278 unit tests + 22 E2E tests pass; the new landscape-polish test passes.
