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
- Click-to-move with legal move highlighting
- Pip count, move history, undo
- Keyboard shortcuts: `Enter` roll, `Z` undo, `D` double, `F` flip board
- Dark, minimal UI inspired by lichess.org
- ~14KB gzipped — no frameworks, no bloat

## Build

```bash
npm run build    # Production build -> dist/
npm test         # 48 tests covering all rule edge cases
```

Deploys to Netlify automatically from the `dist/` directory.

## Tech

- [Solid.js](https://www.solidjs.com/) — reactive UI, no virtual DOM
- TypeScript — full type safety
- SVG board — resolution-independent, native DOM events
- Vite — instant dev server, optimized builds

## Rules Implemented

- Standard backgammon starting position
- Must use both dice if possible; if only one, must use the higher
- Doubles = 4 moves
- Bearing off requires all checkers in home board
- Over-bearing only when no higher point has checkers
- Doubling cube with ownership tracking
- Gammon and backgammon detection

## Roadmap

- [ ] Online multiplayer (WebSocket)
- [ ] User accounts + Glicko-2 ratings
- [ ] Match play with Crawford rule
- [ ] Post-game analysis board
- [ ] Mobile apps (Android/iOS)

## License

AGPL-3.0 — same as lichess.
