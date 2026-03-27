import { render } from 'solid-js/web';
import { createSignal, Show } from 'solid-js';
import GameView from './game/GameView';
import type { GameMode } from './game/GameView';
import './styles/variables.css';
import './styles/layout.css';
import './styles/board.css';

type Page = 'landing' | 'game';

function App() {
  const [page, setPage] = createSignal<Page>('landing');
  const [gameMode, setGameMode] = createSignal<GameMode>('ai');

  function startGame(mode: GameMode) {
    setGameMode(mode);
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
          Libre<span>Gammon</span>
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
            <h1>Libre<span>Gammon</span></h1>
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
          </div>
        </Show>

        <Show when={page() === 'game'}>
          <GameView onExit={() => setPage('landing')} mode={gameMode()} />
        </Show>
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('app')!);
