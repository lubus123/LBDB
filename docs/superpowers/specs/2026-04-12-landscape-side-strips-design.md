# Landscape side-strips layout — design

**Topic:** Mobile landscape redesign — vertical side strips with icon-first content

**Problem:** The previous orientation-lock simulation (CSS `transform: rotate(-90deg)` on `#app`) made all text appear sideways in the physical viewport. When the user holds a phone in landscape and looks at it with their head upright, they see rotated text that requires head-tilting to read. The overlay panels (side panel, game-over modal) also inherit the rotation and appear broken.

**Goal:** In landscape, keep the phone's natural head-upright viewing. Header and action bar become vertical strips on the left and right respectively, holding icon-first content with all text running horizontally (never split letter-by-letter into lines). The board sits in the middle, rotated portrait-style so its proportions match the portrait experience. Portrait remains unchanged.

## Architecture

**Trigger:** `@media (orientation: landscape) and (max-height: 500px)` — the existing breakpoint for landscape phones.

**Layout:** Two fixed-position vertical strips (header on the left, mobile action bar on the right) with the `.board-container` offset by both strip widths. No `#app`-level rotation. All existing portrait CSS for the board (`.board-wrapper` 90° rotation, dice counter-rotation, jail overlay) continues to apply, so the board keeps its portrait-shaped proportions.

**Key revert:** The previous change that rotated `#app` and swapped viewport units inside it is reverted. That approach broke everything except the board. The correct approach is to leave the content in its natural orientation and re-lay-out the chrome around it.

## Components

### Header (left strip)

- Position: `fixed; left: 0; top: 0; width: 48px; height: 100dvh`
- Flex layout: `flex-direction: column; justify-content: space-between; align-items: center; padding: 8px 4px`
- Content (top → bottom):
  - Menu/hamburger area (if present) or blank top pad
  - Duck mascot SVG (existing, already sized 26×21 — fits in 48px)
  - Mode icon — duo-duck (local), robot (AI), or nothing (online) — existing SVGs
  - "DG" wordmark — font-size 16px, `writing-mode: horizontal-tb` so letters read left-to-right in the 48-px strip; letters "D" and "G" are short enough to fit on one line
  - Login link → **user icon SVG** (18×18 person glyph) instead of the word "Login"

### Mobile action bar (right strip)

- Position: `fixed; right: 0; top: 0; width: 60px; height: 100dvh`
- Flex layout: `flex-direction: column; justify-content: flex-end; align-items: center; padding: 8px 6px 8px 6px; gap: 8px`
- Bottom-aligned so primary action (Roll) sits near the thumb-rest zone
- Content (top → bottom):
  - Menu button (`···`) — existing, kept
  - Turn/dice-remaining indicator: compact color-dot + number stack. No "Your turn" text; a small coloured circle communicates whose turn, and "4, 2 left" dice-remaining count stays as-is in tiny numeric form
  - **Roll button** (waiting phase): dice SVG (22×22) with a pulsing green drop-shadow + a 12-px down-arrow glyph underneath. The whole control is pill-shaped, ~52×60px. Amazon-Prime-style: dominant icon + action arrow. Replaced by **Undo** (a back-arrow icon) when in move phase
  - Double button: compact `×2` pill, ~36×30, text-only, reused across phases

### Main content (board)

- `.board-container` in landscape: `margin-left: 48px; margin-right: 60px` so the grid area is the viewport minus both strips
- `.board-wrapper` keeps the portrait 90° rotation: board appears portrait-shaped, centred in the middle channel
- `.board-wrapper` dimensions: height = `calc(100dvh - 16px)` (leave 8px top/bottom padding); width computed from aspect ratio (`780/640`)
- Jail overlay, dice counter-rotation, move animations: all inherit from the existing `@media (max-width: 768px), (max-height: 500px)` block — no change needed

### Overlay panels (side panel + game-over modal)

- `.side-panel` already uses `position: fixed` and spans the viewport height. In landscape, leave its dimensions alone; it slides in on top of everything as before. Because the app is no longer CSS-rotated, the side panel renders upright — no additional fix needed.
- `.game-over-overlay` is full-screen and centred; also fine once the `#app` rotation is gone.

## New SVG assets

Lives inline in the components (matches existing pattern in `src/ui/index.tsx`):

**Login user icon** (18×18, stroke-based, matches duck logo visual weight):

```
<svg viewBox="0 0 24 24" width="18" height="18">
  <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>
  <path d="M4 20 C4 15, 8 14, 12 14 S20 15, 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>
```

**Roll dice+arrow icon** (composite, ~52×60):

```
<svg viewBox="0 0 52 60" width="52" height="60">
  <!-- Dice face with pulsing green glow -->
  <g filter="url(#diceGlow)">
    <rect x="8" y="6" width="36" height="36" rx="6"
          fill="#f5f0e8" stroke="#c4b8a4" stroke-width="1.5"/>
    <circle cx="18" cy="16" r="2.5" fill="#1a1a1a"/>
    <circle cx="26" cy="24" r="2.5" fill="#1a1a1a"/>
    <circle cx="34" cy="32" r="2.5" fill="#1a1a1a"/>
  </g>
  <!-- Down arrow beneath -->
  <path d="M26 48 L26 56 M20 52 L26 58 L32 52"
        stroke="#4caf50" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <defs>
    <filter id="diceGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2"/>
      <feFlood flood-color="#4caf50" flood-opacity="0.5"/>
      <feComposite in2="SourceAlpha" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
</svg>
```

The pulse is CSS `@keyframes` animating the filter's flood-opacity or a separate glow layer (standard CSS animation, no JS).

## File changes

- **src/ui/styles/layout.css** — remove all `#app` rotation rules added in the previous iteration. Add a new landscape rule that:
  - Sets `.header` as a 48px fixed-left vertical strip with `flex-direction: column`
  - Replaces the `::before` "DG" content approach with the existing `.header-logo` children where possible; keep the `font-size: 0` trick on the wordmark text children
- **src/ui/styles/board.css** — remove the landscape viewport-unit swap overrides (no longer needed). Add `.mobile-action-bar` landscape rule: `position: fixed; right: 0; width: 60px; height: 100dvh; flex-direction: column`. Add `.board-container` offset (`margin-left: 48px; margin-right: 60px`). Define `.dice-glow` keyframes for the pulsing dice icon.
- **src/ui/index.tsx** — add a landscape-only login icon element inside `.header-logo` (controlled by a CSS `@media` visibility toggle, not JS). Keep the text "Login" visible in portrait, hide in landscape.
- **src/ui/game/GameView.tsx** — in the Roll button, conditionally render the dice+arrow SVG when on landscape (detect via `window.matchMedia('(orientation: landscape) and (max-height: 500px)')` at mount + on resize, or just render both and toggle via CSS visibility). Change "Double" text to "×2" glyph in the same conditional.

## Behaviour & animation

- **Roll glow pulse:** green drop-shadow on the dice SVG, `animation: dice-pulse 1.6s ease-in-out infinite` when it's the player's turn and no roll yet. Pause on roll/disabled state. No new sound effects.
- **Undo icon** (back-arrow) replaces the dice icon when `phase === 'moving'` and `turnMoves.length > 0`.
- **Arrow under dice** is a purely decorative "press me" affordance — matches Amazon Prime logo's arrow directionality.

## Testing plan

- **Unit tests:** no new logic, so no new unit tests. Existing 278 tests must continue to pass.
- **E2E Playwright:** add a landscape-layout test that asserts:
  - `.header` is at `x=0, width=48` and fills height
  - `.mobile-action-bar` is at `x=viewport.width - 60, width=60` and fills height
  - The dice-icon inside the Roll button is visible and its SVG bounding box is non-zero
  - The Login icon (not "Login" text) is visible in the header
  - The Double button shows "×2" or similar compact glyph, not "Double" text
  - Board is in the middle, portrait-shaped (width < height by ~780:640)
- **Visual regression:** portrait screenshots unchanged; landscape screenshots show the three-strip layout with icons.
- **Manual test on real phone:** user verifies the Roll button is reachable by thumb without awkward hand position.

## Non-goals

- No icon changes in portrait (surgical landscape-only change, per earlier confirmation).
- No new keyboard shortcuts — existing shortcuts still work.
- No change to online multiplayer, auth, or game logic.
- No rework of the side-panel internal contents — the panel stays as-is; it just renders upright now that `#app` is no longer rotated.

## Success criteria

1. On a real landscape phone (Pixel 7 915×412 or similar), the user sees:
   - A 48-px vertical strip on the left with the duck logo, mode icon, DG wordmark, and a compact login icon
   - The board in the middle, portrait-shaped, sized to fit the available height
   - A 60-px vertical strip on the right with a glowing dice icon + arrow for Roll, a compact ×2 for Double, and the menu dots
2. All text in the strips reads horizontally (never broken into single-letter columns).
3. The overlay panels (menu drawer, game-over modal) render in the normal upright orientation.
4. Portrait experience is byte-for-byte identical to today.
5. All 278 unit tests and 12 E2E tests continue to pass; the new landscape-layout E2E test also passes.
