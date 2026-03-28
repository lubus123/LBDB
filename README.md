# LibreGammon

Lichess-inspired backgammon. Fast, free, open-source.

## Play

Visit the deployed site or run locally:

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and click **Play vs AI** or **Local 2-Player**.

## Features

- Full backgammon rules: hitting, bar re-entry, bearing off, doubling cube
- Heuristic AI opponent with position evaluation
- **Bunny hop animation** — checkers hop pip-by-pip with a vertical arc
- **Dice roll animation** — tumble, spin, settle with a satisfying thump
- **Sound effects** — dice roll, capture clack, jail escape chime, victory fanfare
- **Luck meter** — per-turn luck score with cumulative sparkline chart
- **AI move arrows** — gold path traces showing opponent moves (toggleable)
- **Drag and drop** or click-to-move with legal move highlighting
- **Dice swap** — control which die is used first
- **Board direction** — choose escape direction (default: bottom-right)
- **Move history replay** — arrow keys step through past positions
- **Developer mode** — preset positions for testing (bear-off race, mid-game)
- Pip count, undo, doubling cube, gammon/backgammon detection
- Dark, minimal UI inspired by lichess.org
- ~20KB gzipped — zero audio files, zero backend, all procedural

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

## Build

```bash
npm run build    # Production build -> dist/
npm test         # 53 tests covering all rule edge cases
npx playwright test  # Visual regression tests (3 viewports)
```

Deploys to Netlify automatically.

## Tech

- [Solid.js](https://www.solidjs.com/) — reactive UI, no virtual DOM
- TypeScript — full type safety
- SVG board — resolution-independent, native DOM events
- Web Audio API — procedural sound synthesis (no audio files)
- Vite — instant dev server, optimized builds
- Playwright — screenshot tests across desktop + mobile viewports

## Rules Implemented

- Standard backgammon starting position
- Must use both dice if possible; if only one, must use the higher
- Doubles = 4 moves
- Bearing off requires all checkers in home board
- Over-bearing only when no higher point has checkers
- Doubling cube with ownership tracking
- Gammon and backgammon detection

## Design Philosophy

**Feel is the feature.** Nothing teleports — checkers hop, dice tumble, sounds reinforce every action. The opponent's moves are legible (sequential animation + optional path arrows). Controls are discoverable but never noisy. The board is the star.

See [CLAUDE.md](./CLAUDE.md) for the full design document and animation inventory.

## Roadmap

- [x] Full rules engine + AI opponent
- [x] Tactile animations + sound effects
- [x] Luck meter + move history replay
- [ ] Online multiplayer (WebSocket)
- [ ] User accounts + Glicko-2 ratings
- [ ] Match play with Crawford rule
- [ ] Post-game analysis board
- [ ] Mobile apps (Android/iOS)

## License

AGPL-3.0 — same as lichess.
