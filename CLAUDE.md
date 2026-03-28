# LibreGammon - Codebase Summary

## What is this?

LibreGammon is a lichess-inspired, minimalist backgammon web app. Browser-first, with plans for Android/iOS. Built for speed: ~14KB gzipped total, zero backend required for single-player.

## Tech Stack

- **Solid.js** - Reactive UI framework (no virtual DOM, lichess-like performance)
- **TypeScript** - Full type safety across engine + UI
- **Vite** - Build tool (instant HMR, optimized production builds)
- **SVG** - Board rendering (native DOM events, CSS transitions, resolution-independent)
- **Vitest** - Test runner

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
    test/
      engine.test.ts  # 48 test cases covering all rule edge cases

  ui/               # Solid.js client application
    index.tsx       # Entry point, router, landing page
    board/
      Board.tsx     # Main SVG board component (points, checkers, bar, bear-off)
      Dice.tsx      # Dice display with dot patterns + used-die dimming
    game/
      GameView.tsx  # Full game view: board + side panel, AI mode, keyboard shortcuts
    styles/
      variables.css # CSS custom properties (dark theme)
      layout.css    # Global layout, header
      board.css     # Board, panel, controls, landing page styles
```

## Design Philosophy: Feel is the Feature

LibreGammon's core differentiator is **tactile feel**. Every interaction should have weight, consequence, and personality. The board is not a static UI — it's a living space where pieces have emotions. This is what separates us from every other backgammon app.

### Animation Principles (MUST follow for all features)

1. **Every state change has a physical animation.** No teleporting. Checkers slide, dice tumble, the cube rotates. If something moved, the user sees it move.

2. **Captures ("hits") are dramatic.** When a checker is sent to the bar:
   - The hitting checker lands with impact (slight overshoot + settle)
   - The hit checker animates to the bar with a "knocked away" trajectory
   - Prison bars visually close/appear around the captured checker on the bar
   - Sound: a satisfying *clack* of checker hitting checker

3. **Bar entry ("jail escape") is celebratory.** When a checker re-enters from the bar:
   - Prison bars animate open (swing outward or fade)
   - The checker slides out onto the board with momentum
   - Subtle flash/glow on the destination point
   - The feel is: freedom, relief, re-joining the fight

4. **Dice have physics.** Rolling dice should feel like rolling real dice:
   - Tumble animation with rotation and bounce
   - Brief randomized spin before settling on final values
   - Dice land with weight — slight shadow expansion on impact
   - Doubles get a special visual emphasis (glow, pulse)

5. **Bearing off is satisfying.** Each checker borne off:
   - Slides smoothly into the bear-off tray
   - Tray fills up visually (stacked checker bars)
   - Final checker (game-winning) gets a special flourish

6. **Micro-interactions everywhere:**
   - Hovering a movable checker: subtle lift/glow
   - Selecting a checker: pulse on legal destinations
   - Invalid move attempt: shake feedback
   - Turn transition: subtle board-wide fade/pulse

### Animation Technical Approach

- **CSS transitions** for checker movement (`transform`, `cx`/`cy` on SVG)
- **CSS @keyframes** for dice tumble, prison bars, celebration effects
- **Solid.js `createEffect`** to trigger animations on state changes
- **`requestAnimationFrame`** for physics-based animations (dice bounce)
- Keep all animations GPU-accelerated (`transform`, `opacity` only)
- Animation durations: moves 200ms, dice 500ms, hits 400ms, bar entry 350ms
- All animations must be non-blocking — game state updates immediately, visuals catch up

### The Rule

**If a feature doesn't feel good to use, it's not done.** Correct game logic with no animation is a bug. Every future feature (multiplayer, analysis, spectating) must include animation design as part of the implementation spec.

## Key Architecture Decisions

### Board Representation
26-element number array. Index 0 = white bar, 1-24 = points, 25 = black bar. Positive = white, negative = black. Compact, fast to clone and compare.

### Move Generation
Full-sequence DFS in `moves.ts`. Backgammon requires considering all move orderings because legality of move B depends on whether move A was made first. Filters by: max dice usage, higher-die-first rule, and deduplicates by final board state.

### AI
`ai.ts` uses heuristic position evaluation (pip count, point control, blot exposure, prime detection, home board coverage). Evaluates all legal turns and picks the best. Small random noise for variety.

### Game Flow
Three-phase turns: (1) doubling offer, (2) dice roll, (3) checker moves. GameView manages this via Solid.js signals. In AI mode, `createEffect` watches for black's turn and auto-plays with staggered delays.

### Shared Engine
The engine module (`src/engine/`) is pure TypeScript with zero DOM dependencies. Used by both the UI (for instant move validation, legal highlights) and future server (authoritative validation).

## Commands

```bash
npm run dev        # Start dev server (hot reload)
npm run build      # Production build -> dist/
npm test           # Run all tests
npm run test:watch # Watch mode
npm run screenshots # Build + run Playwright screenshot tests
npx playwright test # Run visual tests (expects build + preview running)
```

## Deployment Pipeline

### Build & Deploy

1. **Netlify** auto-deploys from the active branch
2. `netlify.toml` configures: `npm ci && npm run build`, publish dir `dist/`
3. Node 20 is specified in `[build.environment]`

### Development Workflow (MANDATORY)

Every change that touches UI or game logic MUST follow this pipeline:

```
1. Make changes
2. npm test                    # Unit tests must pass (48+ tests)
3. npm run build               # Production build must succeed
4. npm run screenshots         # Playwright screenshot tests must pass
5. Review screenshots in screenshots/ directory
6. git commit + push
```

### Screenshot Validation (REQUIRED for all UI changes)

**Playwright visual tests** run against 3 viewports and capture screenshots at key game states. These tests are NOT optional — they are a gate before pushing.

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

**What the tests assert:**
- **Zero scroll** — the entire game fits in viewport, no scrollbar
- **Board visible** — SVG board has meaningful width/height, not clipped by header
- **Controls accessible** — Roll, Flip, New, Exit buttons are visible and clickable
- **Board below header** — board top edge >= header bottom edge

**When to run:** After ANY change to CSS, layout, board rendering, game controls, or component structure. When in doubt, run them.

**Updating baselines:** `npx playwright test --update-snapshots`

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

### Phase 3: WebSocket Multiplayer (NEXT)
- Node.js backend with `ws` library
- Game rooms, server-side validation, crypto dice
- Lobby with seek/challenge system
- Server-enforced clocks
- Reconnection handling

### Phase 4: Users + Persistence
- PostgreSQL with Drizzle ORM
- Registration, login, JWT auth
- Glicko-2 rating system
- Game history, profiles

### Phase 5: Analysis + Polish
- Post-game replay/analysis board
- Match play with Crawford rule (engine ready)
- Sound effects
- Spectator support
- Mobile-responsive board
- Direct challenges

### Phase 6: Mobile Apps
- Capacitor or React Native wrapper
- Native-feel touch interactions
- Push notifications for game invites
