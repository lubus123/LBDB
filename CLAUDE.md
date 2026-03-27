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
```

## Deployment

Netlify: `netlify.toml` configures `npm ci && npm run build` with `dist/` as publish dir.

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
