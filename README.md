# duckGammon

Lichess-inspired backgammon. Fast, free, open-source. Play online or vs AI.

## Play

**Online**: Visit the deployed site and click **Play Online** — share the invite link with a friend.

**Local development (full stack with Postgres)**:
```bash
npm install

# 1. Start Postgres (first time setup)
sudo pg_ctlcluster 15 main start           # Linux
# Or: brew services start postgresql        # macOS
# Or: docker run -p 5432:5432 -e POSTGRES_PASSWORD=duck123 postgres:15

# 2. Create DB (first time only)
sudo -u postgres psql -c "CREATE USER duckgammon WITH PASSWORD 'duck123';"
sudo -u postgres psql -c "CREATE DATABASE duckgammon OWNER duckgammon;"

# 3. Build + run (kills old server, builds frontend, starts fresh)
DATABASE_URL="postgresql://duckgammon:duck123@localhost:5432/duckgammon" npm run dev:full
```

Open `http://localhost:3001` — serves frontend, API, and WebSocket on one port.
Tables are auto-created on first boot. Re-run `npm run dev:full` after changes — it kills the old process automatically.

**Without Postgres** (games work, auth/friends/history disabled):
```bash
npm run dev:full
```

**Vite hot-reload dev** (for frontend changes, needs separate server):
```bash
DATABASE_URL="..." npm run dev:server   # Game server on port 3001
npm run dev                             # Vite on port 5173 (proxies /api + /ws to 3001)
```

## Features

### Gameplay
- Full backgammon rules: hitting, bar re-entry, bearing off, doubling cube
- **Online multiplayer** — invite-link based, server-authoritative, crypto-secure dice
- **Heuristic AI opponent** with position evaluation
- Resign, rematch (colors swap), disconnect grace period
- Gammon and backgammon detection

### Feel
- **Bunny hop animation** — checkers hop pip-by-pip with vertical arc
- **Dice roll animation** — tumble, spin, settle with satisfying thump
- **Sound effects** — dice, capture clack, jail escape chime, victory fanfare
- **Green triangle outlines** on moveable points, blue circles on destinations
- **AI move arrows** — gold path traces showing opponent moves

### Tools
- **Luck meter** — per-turn luck score with cumulative sparkline
- **Analogue countdown clock** — UK Countdown style, configurable time control
- **Move history replay** — arrow keys step through past board positions
- **Drag and drop** or click-to-move
- **Dice swap** — control which die is used first
- **Board direction** — escape left or right (default: bottom-right)

### Technical
- ~23KB gzipped frontend — zero audio files, all procedural
- Single Node.js process serves frontend + WebSocket on same port
- 63 tests covering engine rules and neural network
- Playwright visual regression tests across 3 viewports
- Dark theme, mallard duck logo

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Roll / Confirm |
| Z | Undo |
| S | Swap dice |
| D | Double |
| F | Flip board |
| B | Toggle hop animation |
| R | Toggle direction |
| A | Toggle AI arrows |
| Left/Right | Browse move history |

## Build & Deploy

```bash
npm run build    # Frontend -> dist/
npm start        # Production server (serves dist/ + WebSocket)
npm test         # 63 tests
```

Deployed on Railway. Single service, auto-deploys from git.

## Tech

- [Solid.js](https://www.solidjs.com/) — reactive UI, no virtual DOM
- TypeScript — full type safety (engine, server, UI)
- SVG board — resolution-independent, native DOM events
- Web Audio API — procedural sound synthesis
- Node.js + [ws](https://github.com/websockets/ws) — WebSocket game server
- Vite — instant dev server, optimized builds
- Playwright — screenshot regression tests

## Architecture

```
Client ←── WebSocket ──→ Server
  │                        │
  ├─ Solid.js UI           ├─ Node.js + ws
  ├─ SVG board             ├─ Authoritative game state
  ├─ Web Audio             ├─ crypto.randomInt dice
  └─ shared/engine/        └─ shared/engine/ (same code)
```

The engine (`src/engine/`) is pure TypeScript with zero DOM dependencies. Used by both the client (for instant move validation, legal highlights, AI) and the server (for authoritative validation). Server rolls dice, validates moves, broadcasts state.

## Roadmap

- [x] Full rules engine + AI opponent
- [x] Tactile animations + sound effects
- [x] Luck meter + move history replay
- [x] Online multiplayer (WebSocket)
- [x] Railway deployment
- [ ] User accounts + Glicko-2 ratings
- [ ] Friends list + challenges
- [ ] Game history + stats
- [ ] Match play with Crawford rule
- [ ] Post-game analysis board
- [ ] Mobile apps (Android/iOS)

## License

AGPL-3.0 — same as lichess.
