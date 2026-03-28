# duckGammon - Codebase Summary

## What is this?

duckGammon is a lichess-inspired backgammon web app. Free forever, open-source. Plays locally vs AI, local 2-player, or online via WebSocket. Deployed on Railway as a single Node.js process serving both the frontend and game server.

## Tech Stack

- **Solid.js** - Reactive UI framework (no virtual DOM, lichess-like performance)
- **TypeScript** - Full type safety across engine, server, and UI
- **Vite** - Build tool (instant HMR, optimized production builds)
- **SVG** - Board rendering (native DOM events, CSS transitions, resolution-independent)
- **Web Audio API** - Procedural sound synthesis (no audio files)
- **Node.js + ws** - WebSocket game server (authoritative, crypto-secure dice)
- **Vitest** - Test runner (63 tests)
- **Playwright** - Visual regression tests (3 viewports)

## Project Structure

```
src/
  shared/           # Shared types, constants (used by server + client)
    types.ts        # Core types: BoardArray, GameState, CheckerMove, etc.
    constants.ts    # Board setup, initial state factory
    notation.ts     # Move notation formatting (8/5, bar/20, 6/off)

  engine/           # Pure game logic (zero DOM deps, used by server + client)
    board.ts        # Board state: clone, query checkers, apply moves
    moves.ts        # Legal move generation (DFS over full turn sequences)
    dice.ts         # Dice rolling, doubles handling
    game.ts         # Game orchestration: roll, move, undo, confirm, game-over
    cube.ts         # Doubling cube logic
    match.ts        # Match play, Crawford rule, scoring
    pip.ts          # Pip count calculation
    ai.ts           # Heuristic AI opponent (position evaluation + best-turn search)
    luck.ts         # Per-turn luck calculation (actual vs expected equity)
    nn.ts           # Neural network position evaluator (TD-Gammon style)
    test/
      engine.test.ts  # 53 engine test cases
      nn.test.ts      # 10 neural network tests

  server/           # Node.js WebSocket game server
    index.ts        # HTTP + WS server, static file serving, room management
    GameRoom.ts     # Game room: state, players, timer, validation, rematch
    protocol.ts     # Typed JSON messages (client ↔ server)

  ui/               # Solid.js client application
    index.tsx       # Entry point, routing, landing page, dev mode presets
    net/
      socket.ts     # WebSocket client with auto-reconnect
    audio/
      sounds.ts     # Procedural sounds: dice, capture, jail, victory, defeat, timeout
    board/
      Board.tsx     # Main SVG board component (points, checkers, direction)
      Dice.tsx      # Dice display with roll animation, swap button
      MoveAnimation.tsx  # Checker movement: slide + bunny hop modes
      OpponentArrows.tsx # AI move path arrows (3s display, toggleable)
      LuckMeter.tsx # Luck display: per-turn bar, cumulative sparkline
      CountdownClock.tsx # Analogue countdown clock (UK Countdown style)
      Jail.tsx      # Bar/jail strip with prison bar visuals, drag-to-play
    game/
      GameView.tsx  # Full game view: board + side panel, all modes
    styles/
      variables.css # CSS custom properties (dark theme)
      layout.css    # Global layout, header
      board.css     # Board, panel, controls, animations, styles
```

## Game Modes

| Mode | Description |
|------|-------------|
| **Play Online** | WebSocket multiplayer. Creates game room, share invite link. Server-authoritative with crypto-secure dice. |
| **Play vs AI** | Local AI opponent. Heuristic position evaluation, all legal turns explored. |
| **Local 2-Player** | Hot-seat mode, same device. |
| **Dev: Bear-off Race** | Both players bearing off with checkers on bar. |
| **Dev: Mid-game** | Contested mid-game position for testing. |

## Design Philosophy: Feel is the Feature

duckGammon's core differentiator is **tactile feel**. Every interaction has weight, consequence, and personality. The board is not a static UI — it's a living space where pieces have emotions.

### Core Principles

1. **Nothing teleports.** Every state change has a physical animation. Checkers hop pip-by-pip, dice tumble, highlights appear instantly without distracting animation.

2. **Sound reinforces action.** Dice thump. Captures clack. Jail escapes chime. Victory plays a fanfare, defeat a descending minor. All synthesized via Web Audio API — zero audio files.

3. **The opponent's moves are legible.** AI moves play sequentially with bunny-hop animation. Optional gold path arrows trace moves for 3 seconds.

4. **Controls are discoverable but not noisy.** Keyboard shortcuts for everything. Options live in a panel. The board is the star.

5. **Green outlines on moveable points.** When it's your turn after rolling, triangles with moveable checkers get a green outline and glowing point numbers. Destinations shown as blue circles.

### Animation Inventory

| Event | Animation | Duration | Sound |
|-------|-----------|----------|-------|
| Checker move | Bunny hop (pip-by-pip arc) or slide | 130ms/hop or 550ms | - |
| Dice roll | Face cycling + rotation + settle | 550ms | Low thump |
| Capture/hit | - | - | Percussive clack |
| Jail escape | Prison bars open | 800ms | Rising chime |
| Moveable points | Green triangle outlines (instant) | - | - |
| Legal destinations | Blue circles (instant) | - | - |
| Game over (win) | Modal overlay | - | Ascending triad |
| Game over (lose) | Modal overlay | - | Descending minor |
| AI move arrows | Gold path traces | 3s + 500ms fade | - |
| Time expired | Auto-play random moves | - | Descending buzz |

### The Rule

**If a feature doesn't feel good to use, it's not done.** Correct game logic with no animation is a bug.

## Key Architecture Decisions

### Board Representation
26-element number array. Index 0 = white bar, 1-24 = points, 25 = black bar. Positive = white, negative = black.

### Board Direction
`colToPoint(col, top, flipped, direction)` maps SVG columns to board points. Default direction `'right'` — white escapes toward bottom-right. Togglable with `R` key, persisted in localStorage.

### Move Generation
Full-sequence DFS in `moves.ts`. Considers all move orderings. Filters by: max dice usage, higher-die-first rule. Deduplicates by final board state.

### AI
Two AI engines, selectable via difficulty picker on landing page:

- **Expert (default)**: TD-Gammon neural network (198→80→1 MLP, sigmoid activations). Trained via TD(lambda=0.7) self-play for 200K games in Rust. Outputs P(white wins). Beats the heuristic ~85% of the time. Model weights in `public/model.json` (188KB), loaded lazily on first AI game. Inference is pure TypeScript matrix math in `nn.ts` (~0.03ms per position).

- **Strong**: Heuristic position evaluation — pip count, point control, blot exposure, prime detection, home board coverage. Small random noise for variety.

Both conform to `PositionEvaluator` type in `ai.ts`. `chooseBestTurn(state, evaluator?)` accepts either. Training infrastructure lives in `training/td-gammon-rs/` (Rust).

### Server Architecture
Single Node.js process serves both static frontend (from `dist/`) and WebSocket game server on the same port. Server is authoritative — rolls dice with `crypto.randomInt`, validates all moves with shared engine functions.

### Online Protocol
Typed JSON messages over WebSocket. Client sends actions (`roll`, `move`, `confirm`, `resign`, `rematch`). Server broadcasts authoritative state to both players. 60-second disconnect grace period with auto-resign.

### Time Control
Per-turn countdown (default 30s, configurable). Doubles get +50% time bonus. Analogue Countdown clock in UI. On timeout: random legal moves played for remaining dice. Server enforces time in online mode.

### Luck Meter
`luck.ts` computes per-turn luck: equity of actual roll vs average equity across all 21 possible rolls. Uses the same evaluator as the AI (NN when available, heuristic fallback). Click the luck bar to reveal a 6x6 dice heatmap showing equity for every possible roll (red=bad, green=good, star=your roll). Displayed as a bar + rank + cumulative sparkline.

### Move History Replay
Arrow keys or clicking move entries reconstructs the board state at that point by replaying moves from the initial position. Index -1 shows starting position.

## Commands

```bash
npm run dev          # Vite dev server (hot reload)
npm run dev:server   # WebSocket server (port 3001)
npm start            # Production: serves frontend + WS on same port
npm run build        # Production build -> dist/
npm test             # Run all tests (63 tests)
npm run screenshots  # Build + Playwright screenshot tests
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

## Deployment

### Production: Railway
- Single service: Node.js process serves `dist/` + WebSocket on same port
- `railway.json` configures Nixpacks build with Node 23
- `npm run build` builds frontend, `npm start` runs server
- Health check at `/health`
- WebSocket auto-detects `wss://` in production, `ws://localhost:3001` in dev

### Development
- Frontend: `npm run dev` (Vite on port 5173, proxies WS to 3001)
- Server: `npm run dev:server` (port 3001)
- Both needed for online play testing

## Implementation Phases

### Phase 1: Engine + Local Play (DONE)
- Full backgammon rules engine with 53+ tests
- SVG board with click-to-move and legal move highlighting
- Doubling cube, pip count, move history, undo
- Dark theme inspired by lichess

### Phase 2: AI + Deploy (DONE)
- Heuristic AI opponent
- Play vs AI mode with animated AI moves
- Landing page with game mode selection
- Keyboard shortcuts

### Phase 3: Feel + Polish (DONE)
- Bunny hop animation, dice roll animation, dice swap
- Drag and drop, sound effects, luck meter
- AI move arrows, board direction control
- Move history replay, options panel, developer mode
- Countdown clock with time control
- Green triangle outlines for moveable points
- Mallard duck logo and branding (duckGammon)

### Phase 4: WebSocket Multiplayer (DONE)
- Node.js + ws server, authoritative game logic
- Invite-link based matchmaking (?game=XXXX)
- Resign, rematch (colors swap), disconnect grace period
- Server-side time control with random move timeout
- Connection indicator (green/yellow dot)
- Single-port deployment (frontend + WS on Railway)

### Phase 5: User Accounts + Persistence (NEXT)
- PostgreSQL + Drizzle ORM
- Registration, login, session tokens
- Glicko-2 rating system
- Friends list + friend challenges
- Game history + stats
- Hosted on Railway (~$5-10/month)

### Phase 6: Analysis + Polish
- Post-game replay/analysis board
- Match play with Crawford rule (engine ready)
- Spectator support
- Leaderboard
- Matchmaking queue (ranked)

### Phase 7: Mobile Apps
- Capacitor or React Native wrapper
- Native-feel touch interactions
- Push notifications for game invites
