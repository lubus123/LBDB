import { render } from 'solid-js/web';
import { createSignal, Show } from 'solid-js';
import GameView from './game/GameView';
import type { GameMode } from './game/GameView';
import './styles/variables.css';
import './styles/layout.css';
import './styles/board.css';

type Page = 'landing' | 'game';

/** Dev preset: board array + off counts */
interface DevPreset {
  board: number[];
  whiteOff: number;
  blackOff: number;
}

// White: bar=1, pts1-4=3+2+2+2=9, off=5 → 15
// Black: bar=1, pts21-24=2+2+2+3=9, off=5 → 15
const BEAROFF_RACE: DevPreset = {
  board: [
    1,    // W bar
    3, 2, 2, 2, 0, 0,  // pts 1-6
    0, 0, 0, 0, 0, 0,  // pts 7-12
    0, 0, 0, 0, 0, 0,  // pts 13-18
    0, 0, -2, -2, -2, -3, // pts 19-24
    1,    // B bar
  ],
  whiteOff: 5, blackOff: 5,
};

const MID_GAME: DevPreset = {
  board: [
    0,    // W bar
    -2, 0, 0, 0, 3, 2, // pts 1-6
    0, 3, 0, 0, 0, -4, // pts 7-12
    4, 0, 0, 0, -3, 0, // pts 13-18
    -3, 0, 0, -1, 0, 2, // pts 19-24
    0,    // B bar
  ],
  whiteOff: 1, blackOff: 1,
};

function App() {
  const [page, setPage] = createSignal<Page>('landing');
  const [gameMode, setGameMode] = createSignal<GameMode>('ai');
  const [devPreset, setDevPreset] = createSignal<DevPreset | undefined>(undefined);
  const [showDev, setShowDev] = createSignal(false);

  function startGame(mode: GameMode, preset?: DevPreset) {
    setGameMode(mode);
    setDevPreset(preset);
    setPage('game');
  }

  return (
    <>
      <header class="header">
        <a
          class="header-logo"
          href="#"
          onClick={(e) => { e.preventDefault(); setPage('landing'); }}
        >
          duck<span>Gammon</span>
        </a>
        <Show when={page() === 'game'}>
          <span class="header-mode">
            {gameMode() === 'ai' ? 'vs AI' : 'Local'}
          </span>
        </Show>
      </header>

      <div class="main-content">
        <Show when={page() === 'landing'}>
          <div class="landing">
            <h1>duck<span>Gammon</span></h1>
            <p class="tagline">Fast, free, open-source backgammon</p>
            <div class="landing-buttons">
              <button
                class="btn btn-primary play-btn"
                onClick={() => startGame('ai')}
              >
                Play vs AI
              </button>
              <button
                class="btn play-btn play-btn-secondary"
                onClick={() => startGame('local')}
              >
                Local 2-Player
              </button>
            </div>
            <div class="landing-shortcuts">
              <span>Enter</span> roll &middot;
              <span>Z</span> undo &middot;
              <span>D</span> double &middot;
              <span>F</span> flip
            </div>

            <div style={{ "margin-top": "16px" }}>
              <a
                href="#"
                style={{ color: 'var(--text-muted)', "font-size": '11px', "text-decoration": 'none' }}
                onClick={(e) => { e.preventDefault(); setShowDev(d => !d); }}
              >
                {showDev() ? 'Hide dev' : 'Dev'}
              </a>
            </div>

            <Show when={showDev()}>
              <div class="landing-buttons" style={{ "margin-top": "8px" }}>
                <button
                  class="btn btn-small play-btn-secondary"
                  onClick={() => startGame('ai', BEAROFF_RACE)}
                >
                  Bear-off Race
                </button>
                <button
                  class="btn btn-small play-btn-secondary"
                  onClick={() => startGame('ai', MID_GAME)}
                >
                  Mid-game
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={page() === 'game'}>
          <GameView
            onExit={() => setPage('landing')}
            mode={gameMode()}
            devPreset={devPreset()}
          />
        </Show>
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('app')!);
