# duckGammon - Codebase Summary

## What is this?

duckGammon is a lichess-inspired, minimalist backgammon web app. Browser-first, with plans for Android/iOS. Built for speed: ~20KB gzipped total, zero backend required for single-player.

## Tech Stack

- **Solid.js** - Reactive UI framework (no virtual DOM, lichess-like performance)
- **TypeScript** - Full type safety across engine + UI
- **Vite** - Build tool (instant HMR, optimized production builds)
- **SVG** - Board rendering (native DOM events, CSS transitions, resolution-independent)
- **Web Audio API** - Procedural sound synthesis (no audio files)
- **Vitest** - Test runner
- **Playwright** - Visual regression tests

## Project Structure

```
src/
  shared/           # Shared types, constants, notation formatting
    types.ts        # Core types: BoardArray, GameState, CheckerMove, etc.
    constants.ts    # Board setup, initial state factory
    notation.ts     # Move notation formatting (8/5, bar/20, 6/off)

  engine/           # Pure game logic (zero DOM dependencies)
    board.ts        # Board state: clone, query checkers, apply moves
    moves.ts        # Legal move generation (DFS over full turn sequences)
    dice.ts         # Dice rolling, doubles handling
    game.ts         # Game orchestration: roll, move, undo, confirm, game-over
    cube.ts         # Doubling cube logic
    match.ts        # Match play, Crawford rule, scoring
    pip.ts          # Pip count calculation
    ai.ts           # Heuristic AI opponent (position evaluation + best-turn search)
    luck.ts         # Per-turn luck calculation (actual vs expected equity)
    test/
      engine.test.ts  # 53 test cases covering all rule edge cases

  ui/               # Solid.js client application
    index.tsx       # Entry point, router, landing page, dev mode presets
    audio/
      sounds.ts     # Web Audio API: dice roll, capture, jail escape, victory/defeat
    board/
      Board.tsx     # Main SVG board component (points, checkers, bar)
      Dice.tsx      # Dice display with roll animation, swap button
      MoveAnimation.tsx  # Checker movement: slide mode + bunny hop mode
      OpponentArrows.tsx # AI move path arrows (3s display, toggleable)
      LuckMeter.tsx # Luck display: per-turn bar, cumulative sparkline
      Jail.tsx      # Bar/jail strip with prison bar visuals, drag-to-play
    game/
      GameView.tsx  # Full game view: board + side panel, AI mode, all controls
    styles/
      variables.css # CSS custom properties (dark theme)
      layout.css    # Global layout, header
      board.css     # Board, panel, controls, animations, landing page styles
```

## Design Philosophy: Feel is the Feature

duckGammon's core differentiator is **tactile feel**. Every interaction should have weight, consequence, and personality. The board is not a static UI — it's a living space where pieces have emotions.

### Core Principles

1. **Nothing teleports.** Every state change has a physical animation. Checkers hop, dice tumble, highlights pulse in. If something moved, the user sees it move.

2. **Sound reinforces action.** Dice land with a thump. Captures clack. Jail escapes chime. Victory plays a fanfare. Sounds are synthesized (Web Audio API, zero files) — subtle enough to not annoy, present enough to feel real.

3. **The opponent's moves are legible.** AI moves play sequentially with bunny-hop animation so you can follow each checker. Optional gold path arrows trace moves for 3 seconds. The game is a conversation, not a black box.

4. **Controls are discoverable but not noisy.** Keyboard shortcuts exist for everything (Enter/Z/S/F/B/R/A/D) but the UI never shows more than what's needed. Options live in a panel, not cluttering the board.

5. **The board is the star.** Clean brown frame, no visual clutter. The bear-off zone only appears when relevant. Borne-off counts are subtle numbers in the frame margin. The center bar has defined edges for clear half-separation.

### Animation Inventory

| Event | Animation | Duration | Sound |
|-------|-----------|----------|-------|
| Checker move | Bunny hop (pip-by-pip arc) or slide | 130ms/hop or 550ms | - |
| Dice roll | Face cycling + rotation + settle | 550ms | Low thump |
| Capture/hit | - | - | Percussive clack |
| Jail escape | Prison bars open | 800ms | Rising chime |
| Legal destinations | Pulse fade-in | 400ms | - |
| Game over (win) | Modal overlay | - | Ascending triad |
| Game over (lose) | Modal overlay | - | Descending minor |
| AI move arrows | Gold path traces | 3s + 500ms fade | - |

### Animation Technical Approach

- **CSS transitions** for slide-mode checker movement (`cx`/`cy` on SVG circles)
- **`requestAnimationFrame`** for bunny-hop mode (manual interpolation with sin arc)
- **CSS @keyframes** for dice tumble, prison bars, destination pulse
- **Web Audio API** oscillators + noise buffers for all sounds
- All animations are **non-blocking** — game state updates immediately, visuals catch up
- Exported `HOP_DURATION` (130ms) and `ANIM_DURATION` (550ms) constants drive timing

### The Rule

**If a feature doesn't feel good to use, it's not done.** Correct game logic with no animation is a bug. Every future feature (multiplayer, analysis, spectating) must include animation design as part of the implementation spec.

## Key Architecture Decisions

### Board Representation
26-element number array. Index 0 = white bar, 1-24 = points, 25 = black bar. Positive = white, negative = black. Compact, fast to clone and compare.

### Board Direction
`colToPoint(col, top, flipped, direction)` maps SVG columns to board points. Default direction is `'right'` — white escapes toward bottom-right. Togglable with `R` key, persisted in localStorage.

### Move Generation
Full-sequence DFS in `moves.ts`. Backgammon requires considering all move orderings because legality of move B depends on whether move A was made first. Filters by: max dice usage, higher-die-first rule, and deduplicates by final board state.

### AI
`ai.ts` uses heuristic position evaluation (pip count, point control, blot exposure, prime detection, home board coverage). Evaluates all legal turns and picks the best. Small random noise for variety.

### Luck Meter
`luck.ts` computes per-turn luck: equity of actual roll vs average equity across all 21 possible rolls. Uses the same `evaluatePosition` function as the AI. Displayed as a bar + cumulative sparkline.

### Game Flow
Three-phase turns: (1) doubling offer, (2) dice roll, (3) checker moves. GameView manages this via Solid.js signals. In AI mode, `createEffect` watches for black's turn and auto-plays with dynamically-timed delays (based on hop animation duration).

### Move History Replay
Arrow keys or clicking move entries reconstructs the board state at that point by replaying moves from the initial position. Board displays the historical state; game actions snap back to live.

### Shared Engine
The engine module (`src/engine/`) is pure TypeScript with zero DOM dependencies. Used by both the UI (for instant move validation, legal highlights) and future server (authoritative validation).

## Commands

```bash
npm run dev        # Start dev server (hot reload)
npm run build      # Production build -> dist/
npm test           # Run all tests (53 tests)
npm run test:watch # Watch mode
npm run screenshots # Build + run Playwright screenshot tests
npx playwright test # Run visual tests (expects build + preview running)
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Roll dice / Confirm turn |
| Z | Undo last move |
| S | Swap dice order |
| D | Offer double |
| F | Flip board perspective |
| B | Toggle bunny hop animation |
| R | Toggle board direction (left/right) |
| A | Toggle AI move arrows |
| Left/Right | Navigate move history |
| Escape | Deselect |

## Deployment Pipeline

### Build & Deploy

1. **Netlify** auto-deploys from the active branch
2. `netlify.toml` configures: `npm ci && npm run build`, publish dir `dist/`
3. Node 20 is specified in `[build.environment]`

### Development Workflow (MANDATORY)

Every change that touches UI or game logic MUST follow this pipeline:

```
1. Make changes
2. npm test                    # Unit tests must pass (53+ tests)
3. npm run build               # Production build must succeed
4. npm run screenshots         # Playwright screenshot tests must pass
5. Review screenshots in screenshots/ directory
6. git commit + push
```

### Screenshot Validation (REQUIRED for all UI changes)

**Playwright visual tests** run against 3 viewports and capture screenshots at key game states.

**Viewports tested:**
- `desktop-chrome` — 1280x720
- `android-portrait` — Pixel 7 (412x915)
- `android-small` — Pixel 5 (393x851)

**Key states captured (screenshots/ directory):**
- `01-landing` — Landing page
- `02-game-initial` — Game board, initial position, Roll button visible
- `03-after-roll` — After rolling dice, board + dice visible
- `04-after-ai-turn` — After AI completes its turn
- `05-board-flipped` — Board flipped with F key
- `06-local-mode` — Local 2-player mode
- `07-ai-move-arrows` — AI move arrows visible after turn

**What the tests assert:**
- **Zero scroll** — the entire game fits in viewport, no scrollbar
- **Board visible** — SVG board has meaningful width/height, not clipped by header
- **Controls accessible** — Roll, Flip, New, Exit buttons are visible and clickable
- **Board below header** — board top edge >= header bottom edge

### Config files

- `playwright.config.ts` — Viewport definitions, web server config
- `tests/visual/layout.spec.ts` — All screenshot test cases
- `screenshots/` — Output directory (per-viewport subdirectories)

## Implementation Phases

### Phase 1: Engine + Local Play (DONE)
- Full backgammon rules engine with 48 tests
- SVG board with click-to-move and legal move highlighting
- Doubling cube, pip count, move history, undo
- Dark theme inspired by lichess

### Phase 2: AI + Netlify Deploy (DONE)
- Heuristic AI opponent (evaluates all legal turns)
- Play vs AI mode with animated AI moves
- Landing page with game mode selection
- Keyboard shortcuts (Enter/Z/D/F/Esc)
- Netlify deployment configuration

### Phase 3: Feel + Polish (DONE)
- Bunny hop animation (pip-by-pip checker movement with arc)
- Dice roll animation (tumble + settle)
- Dice order swap (S key)
- Drag and drop on board checkers
- Sound effects (Web Audio API: dice, capture, jail escape, victory/defeat)
- Luck meter (per-turn + cumulative sparkline)
- AI move arrows (gold path traces, toggleable)
- Board direction control (escape left/right, persisted)
- Move history replay (arrow keys + click)
- Options panel (hop, arrows, direction toggles)
- Developer mode (bear-off race + mid-game presets)
- Legal destination pulse animation
- Clean board frame (no bear-off tray clutter)
- Center bar definition lines

### Phase 4: WebSocket Multiplayer (NEXT)
- Node.js backend with `ws` library
- Game rooms, server-side validation, crypto dice
- Lobby with seek/challenge system
- Server-enforced clocks
- Reconnection handling

### Phase 5: Users + Persistence
- PostgreSQL with Drizzle ORM
- Registration, login, JWT auth
- Glicko-2 rating system
- Game history, profiles

### Phase 6: Analysis + Polish
- Post-game replay/analysis board (board state reconstruction exists)
- Match play with Crawford rule (engine ready)
- Spectator support
- Mobile-responsive board
- Direct challenges

### Phase 7: Mobile Apps
- Capacitor or React Native wrapper
- Native-feel touch interactions
- Push notifications for game invites
