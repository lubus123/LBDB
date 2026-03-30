# Web Polish Pass — Design Spec

**Date:** 2026-03-29
**Goal:** Bring the web interface to a polished, trustworthy state before mobile work. Add "robust, durable, lightweight" to the project ethos. Users should rely on duckGammon when they want to play backgammon.

---

## 1. Ethos Update

Add three principles to the design philosophy in CLAUDE.md alongside "Feel is the feature":

- **Robust** — handles edge cases gracefully, never shows broken state
- **Durable** — connections recover, state persists, the app is always ready
- **Lightweight** — minimal dependencies, fast loads, no bloat

---

## 2. Friends Panel Redesign

**Current:** Horizontal `flex-wrap` row where friend items and add-friend input sit side by side. Add-friend looks like part of the friend list.

**New:** Vertical card layout with clear sections.

**Structure:**
```
┌─────────────────────────────┐
│ FRIENDS                   3 │  ← header with online count
├─────────────────────────────┤
│ ● alice                 [⚔] │  ← online friends with challenge button
│ ● bob                   [⚔] │
│ ● charlie               [⚔] │
│ ○ dave                      │  ← offline friends (dimmed, no challenge)
├─────────────────────────────┤
│ eve wants to be friends [✓] │  ← pending requests (if any)
├─────────────────────────────┤
│ [Add friend...        ] [+] │  ← add-friend input, clearly separated
└─────────────────────────────┘
```

**Details:**
- `.friends-panel` replaces `.friends-bar`: vertical flex column, `max-width: 400px`
- Header: "FRIENDS" label (11px uppercase) + online count right-aligned
- Friend items: full-width rows, 7px online dot (green/grey), name, challenge sword button on hover/always for online
- Offline friends: 50% opacity, no challenge button
- Pending section: separated by top border, blue-tinted name, green Accept button
- Add-friend footer: separated by top border, input + "+" button
- Border-radius 8px, background `var(--bg-secondary)`, 1px border `rgba(255,255,255,0.06)`

---

## 3. Challenge Popup

**Current:** Clicking the sword button immediately sends a challenge with hardcoded `timeLimit: 30`.

**New:** Centered modal overlay with color pick and time control.

**Structure:**
```
┌───────────────────────────┐
│        Challenge          │
│          alice            │
│                           │
│        PLAY AS            │
│   (○W)   (◑R)   (●B)    │  ← 3 checker circles: white, random, black
│  White  Random  Black     │
│                           │
│      TIME PER TURN        │
│  [15s] [30s] [60s] [∞]  │  ← preset buttons, 30s selected by default
│     [custom___] seconds   │  ← optional custom input
│                           │
│    [Cancel]  [Challenge⚔] │
└───────────────────────────┘
```

**Details:**
- Fixed overlay with `rgba(0,0,0,0.7)` backdrop
- Modal: `var(--bg-secondary)`, 8px border-radius, 24px padding, centered
- Color picker: three 40px checker circles with actual checker styling (shadows, borders matching `var(--checker-white)` / `var(--checker-black)`). Random = half-white/half-black diagonal gradient with blue border. Selected state: blue border + subtle glow.
- Default selection: Random color, 30s time
- Time presets: pill buttons in a row. Selected = blue filled. Custom input below (number, "seconds" label).
- Cancel: ghost button. Challenge: blue filled button.
- Sends challenge with `{ username, timeLimit, colorPreference }` — server handles color assignment. New `colorPreference` field: `'w' | 'b' | 'random'`.

**Protocol change:** Add `colorPreference?: 'w' | 'b' | 'random'` to the `challenge` client message. Server assigns colors based on preference (if both want same color, random decides).

---

## 4. Header Duck Easter Egg

**Current:** One duck always. Second mirrored duck in online/local mode. Binary block in AI mode.

**Changes:**
- Keep the one duck always present (landing + all modes)
- **vs Human (online or local):** Second duck slides in mirrored, with a small white checker (12px circle, `var(--checker-white)` fill + border) between the two ducks. Gap between duck1, checker, duck2 is tight (~3px). 300ms fade/slide-in transition.
- **vs AI:** Binary `010/101` block next to duck (existing behavior, keep as-is)
- The checker between ducks uses actual checker styling: fill, border, subtle shadow

---

## 5. Chat Panel Width

**Current:** 180px fixed width.

**New:** 220px fixed width, matching the side panel. No other changes to chat internals.

---

## 6. Vertical Alignment

**Current:** Chat and side panel use `align-items: start` on the board container, but the board centers vertically, causing misalignment.

**Fix:** Set `.board-container` to `align-items: flex-start` and remove vertical centering from `.board-and-jail`. All three columns (chat, board+jail, side panel) start from the same top edge. The board's natural height fills the space; chat and side panel grow to match or stay at their content height.

---

## 7. Remove In-Game Time Picker

**Current:** Options panel in the side panel has a "Turn time" dropdown during all game modes.

**Change:** Hide the "Turn time" option row when in online mode (`isOnline()`). Time is already set in the challenge popup. Keep it visible for AI and local modes (where it's useful).

---

## Files to Modify

| File | Changes |
|------|---------|
| `CLAUDE.md` | Add robust/durable/lightweight ethos |
| `src/ui/index.tsx` | Friends panel restructure, challenge popup modal, header checker |
| `src/ui/styles/board.css` | Friends panel CSS rewrite, challenge modal styles, chat width, vertical alignment |
| `src/ui/styles/layout.css` | Header duck spacing adjustments |
| `src/ui/game/GameView.tsx` | Hide time picker in online mode |
| `src/server/protocol.ts` | Add `colorPreference` to challenge message |
| `src/server/index.ts` | Handle `colorPreference` in challenge/accept flow |

---

## Out of Scope

- Mobile layout changes (separate pass)
- GameView.tsx refactor (M8, deferred)
- Accessibility (B1, separate initiative)
- New features — this is polish only
