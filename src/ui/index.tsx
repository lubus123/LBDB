import { render } from 'solid-js/web';
import { createSignal, Show } from 'solid-js';
import GameView from './game/GameView';
import './styles/variables.css';
import './styles/layout.css';
import './styles/board.css';

type Page = 'landing' | 'game';

function App() {
  const [page, setPage] = createSignal<Page>('landing');

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
      </header>

      <div class="main-content">
        <Show when={page() === 'landing'}>
          <div class="landing">
            <h1>Libre<span>Gammon</span></h1>
            <p class="tagline">Fast, free, open-source backgammon</p>
            <button
              class="btn btn-primary play-btn"
              onClick={() => setPage('game')}
            >
              Play Locally
            </button>
          </div>
        </Show>

        <Show when={page() === 'game'}>
          <GameView onExit={() => setPage('landing')} />
        </Show>
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('app')!);
