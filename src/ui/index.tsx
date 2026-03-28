import { render } from 'solid-js/web';
import { createSignal, Show, onMount } from 'solid-js';
import GameView from './game/GameView';
import type { GameMode, AiDifficulty } from './game/GameView';
import './styles/variables.css';
import './styles/layout.css';
import './styles/board.css';

type Page = 'landing' | 'game';

interface DevPreset {
  board: number[];
  whiteOff: number;
  blackOff: number;
}

const BEAROFF_RACE: DevPreset = {
  board: [
    1, 3, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -3, 1,
  ],
  whiteOff: 5, blackOff: 5,
};

const MID_GAME: DevPreset = {
  board: [
    0, -2, 0, 0, 0, 3, 2, 0, 3, 0, 0, 0, -4,
    4, 0, 0, 0, -3, 0, -3, 0, 0, -1, 0, 2, 0,
  ],
  whiteOff: 1, blackOff: 1,
};

function App() {
  const [page, setPage] = createSignal<Page>('landing');
  const [gameMode, setGameMode] = createSignal<GameMode>('ai');
  const [devPreset, setDevPreset] = createSignal<DevPreset | undefined>(undefined);
  const [showDev, setShowDev] = createSignal(false);
  const [onlineGameId, setOnlineGameId] = createSignal<string | undefined>(undefined);
  const [aiDifficulty, setAiDifficulty] = createSignal<AiDifficulty>('expert');

  // Check URL for ?game=XXXX (join invite link)
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (gameId) {
      setOnlineGameId(gameId);
      setGameMode('online');
      setPage('game');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  });

  function startGame(mode: GameMode, preset?: DevPreset) {
    setGameMode(mode);
    setDevPreset(preset);
    setOnlineGameId(undefined);
    setPage('game');
  }

  function handleExit() {
    setOnlineGameId(undefined);
    setPage('landing');
  }

  return (
    <>
      <header class="header">
        <a
          class="header-logo"
          href="#"
          onClick={(e) => { e.preventDefault(); handleExit(); }}
        >
          duck<span>Gammon</span>
          <svg viewBox="0 0 80 64" width="26" height="21" style={{ "vertical-align": "middle", "margin-left": "7px", "margin-top": "-1px" }}>
            <path d="M12 38 C12 32 16 26 24 24 L36 22 C42 22 48 26 50 32 C52 38 48 44 42 44 L20 44 C16 44 12 42 12 38 Z" fill="#555"/>
            <path d="M34 22 C34 16 36 11 40 9 C43 7 47 8 49 11 C51 14 50 19 48 22" fill="#2d6a2d"/>
            <path d="M49 12 L55 11 C57 10.5 58 12.5 58 14.5 C58 16 57 17 55 16.5 L49 16" fill="#c49a3c"/>
            <path d="M46 21.5 L49 21.5" stroke="#e8dcc8" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="47" cy="12" r="1.3" fill="#1a1a2e"/>
            <path d="M18 34 C24 30 34 28 42 31" fill="none" stroke="#666" stroke-width="1.2" stroke-linecap="round"/>
            <path d="M30 44 L30 49 M30 49 L26 51 M30 49 L30 52 M30 49 L34 51" stroke="#c49a3c" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <Show when={page() === 'game'}>
          <span class="header-mode">
            {gameMode() === 'online' ? 'Online' : gameMode() === 'ai' ? `vs AI (${aiDifficulty() === 'expert' ? 'Expert' : 'Strong'})` : 'Local'}
          </span>
        </Show>
      </header>

      <div class="main-content">
        <Show when={page() === 'landing'}>
          <div class="landing">
            <h1>duck<span>Gammon</span></h1>
            <p class="tagline">Fast, free, open-source backgammon</p>
            <div class="landing-buttons">
              <button class="btn btn-primary play-btn" onClick={() => startGame('online')}>
                Play Online
              </button>
              <div class="ai-play-group">
                <button class="btn play-btn play-btn-secondary" onClick={() => startGame('ai')}>
                  Play vs AI
                </button>
                <div class="difficulty-selector">
                  <button
                    class={`diff-btn ${aiDifficulty() === 'strong' ? 'active' : ''}`}
                    onClick={() => setAiDifficulty('strong')}
                  >Strong</button>
                  <button
                    class={`diff-btn ${aiDifficulty() === 'expert' ? 'active' : ''}`}
                    onClick={() => setAiDifficulty('expert')}
                  >Expert</button>
                </div>
              </div>
              <button class="btn play-btn play-btn-secondary" onClick={() => startGame('local')}>
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
                <button class="btn btn-small play-btn-secondary" onClick={() => startGame('ai', BEAROFF_RACE)}>
                  Bear-off Race
                </button>
                <button class="btn btn-small play-btn-secondary" onClick={() => startGame('ai', MID_GAME)}>
                  Mid-game
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={page() === 'game'}>
          <GameView
            onExit={handleExit}
            mode={gameMode()}
            devPreset={devPreset()}
            onlineGameId={onlineGameId()}
            aiDifficulty={aiDifficulty()}
          />
        </Show>
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('app')!);
