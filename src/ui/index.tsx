import { render } from 'solid-js/web';
import { createSignal, createEffect, Show, For, onMount, onCleanup } from 'solid-js';
import GameView from './game/GameView';
import type { GameMode, AiDifficulty } from './game/GameView';
import type { ServerMessage } from '../server/protocol';
import './styles/variables.css';
import './styles/layout.css';
import './styles/board.css';

type Page = 'landing' | 'game' | 'login' | 'register' | 'profile';

interface DevPreset { board: number[]; whiteOff: number; blackOff: number; }
interface UserProfile {
  id: number; username: string;
  gamesPlayed: number; gamesWon: number;
  totalLuck: number; luckStreak: number;
  bestLuckStreak: number; worstLuckStreak: number;
  luckCapitalisation: number;
}
interface Friend { id: number; friendUsername: string; status: string; userId: number; friendId: number; }

const BEAROFF_RACE: DevPreset = {
  board: [1, 3, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -3, 1],
  whiteOff: 5, blackOff: 5,
};
const MID_GAME: DevPreset = {
  board: [0, -2, 0, 0, 0, 3, 2, 0, 3, 0, 0, 0, -4, 4, 0, 0, 0, -3, 0, -3, 0, 0, -1, 0, 2, 0],
  whiteOff: 1, blackOff: 1,
};

const API = '';
const WS_URL = window.location.hostname === 'localhost'
  ? `ws://${window.location.hostname}:${window.location.port || '3001'}`
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('dg-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  return res.json();
}

function App() {
  const [page, setPage] = createSignal<Page>('landing');
  const [gameMode, setGameMode] = createSignal<GameMode>('ai');
  const [devPreset, setDevPreset] = createSignal<DevPreset | undefined>(undefined);
  const [showDev, setShowDev] = createSignal(false);
  const [onlineGameId, setOnlineGameId] = createSignal<string | undefined>(undefined);
  const [aiDifficulty, setAiDifficulty] = createSignal<AiDifficulty>('expert');

  // Auth
  const [user, setUser] = createSignal<UserProfile | null>(null);
  const [authError, setAuthError] = createSignal('');
  const [gameHistory, setGameHistory] = createSignal<any[]>([]);

  // Friends
  const [friends, setFriends] = createSignal<Friend[]>([]);
  const [onlineFriends, setOnlineFriends] = createSignal<Set<string>>(new Set());
  const [addFriendInput, setAddFriendInput] = createSignal('');
  const [friendError, setFriendError] = createSignal('');

  // Challenges
  const [incomingChallenge, setIncomingChallenge] = createSignal<{ from: string; challengeId: string; timeLimit: number } | null>(null);

  // Persistent WS for friends/challenges (when logged in, not in game)
  let lobbyWs: WebSocket | null = null;

  function connectLobbyWs() {
    if (lobbyWs) return;
    const token = localStorage.getItem('dg-token');
    if (!token) return;

    lobbyWs = new WebSocket(WS_URL);
    lobbyWs.onopen = () => {
      lobbyWs!.send(JSON.stringify({ type: 'auth', token }));
    };
    lobbyWs.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'friend_online':
          setOnlineFriends(prev => new Set([...prev, msg.username]));
          break;
        case 'friend_offline':
          setOnlineFriends(prev => { const s = new Set(prev); s.delete(msg.username); return s; });
          break;
        case 'challenge_received':
          setIncomingChallenge({ from: msg.from, challengeId: msg.challengeId, timeLimit: msg.timeLimit });
          break;
        case 'challenge_accepted':
          // Challenger gets game ID — start game
          setOnlineGameId(msg.gameId);
          setGameMode('online');
          disconnectLobbyWs();
          setPage('game');
          break;
      }
    };
    lobbyWs.onclose = () => { lobbyWs = null; };
  }

  function disconnectLobbyWs() {
    if (lobbyWs) { lobbyWs.close(); lobbyWs = null; }
  }

  function sendLobbyMsg(msg: any) {
    if (lobbyWs?.readyState === WebSocket.OPEN) {
      lobbyWs.send(JSON.stringify(msg));
    }
  }

  // Connect lobby WS when user logs in
  createEffect(() => {
    if (user() && page() !== 'game') {
      connectLobbyWs();
      loadFriends();
    }
  });

  onCleanup(() => disconnectLobbyWs());

  // Check token on mount
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (gameId) {
      setOnlineGameId(gameId);
      setGameMode('online');
      setPage('game');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (localStorage.getItem('dg-token')) {
      const data = await apiFetch('/api/me');
      if (data && !data.error) setUser(data);
      else localStorage.removeItem('dg-token');
    }
  });

  async function loadFriends() {
    const data = await apiFetch('/api/friends');
    if (Array.isArray(data)) setFriends(data);
  }

  async function handleRegister(username: string, password: string) {
    setAuthError('');
    const data = await apiFetch('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.error) { setAuthError(data.error); return; }
    localStorage.setItem('dg-token', data.token);
    setUser(data.user);
    setPage('landing');
  }

  async function handleLogin(username: string, password: string) {
    setAuthError('');
    const data = await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.error) { setAuthError(data.error); return; }
    localStorage.setItem('dg-token', data.token);
    setUser(data.user);
    setPage('landing');
  }

  async function handleLogout() {
    await apiFetch('/api/logout', { method: 'POST' });
    localStorage.removeItem('dg-token');
    disconnectLobbyWs();
    setUser(null);
    setFriends([]);
    setOnlineFriends(new Set());
  }

  async function handleAddFriend() {
    setFriendError('');
    const username = addFriendInput().trim();
    if (!username) return;
    const data = await apiFetch('/api/friends', { method: 'POST', body: JSON.stringify({ username }) });
    if (data.error) { setFriendError(data.error); return; }
    setAddFriendInput('');
    loadFriends();
  }

  async function handleAcceptFriend(id: number) {
    await apiFetch(`/api/friends/${id}/accept`, { method: 'POST' });
    loadFriends();
  }

  function handleChallenge(username: string) {
    sendLobbyMsg({ type: 'challenge', username, timeLimit: 30 });
  }

  function handleAcceptChallenge() {
    const c = incomingChallenge();
    if (!c) return;
    sendLobbyMsg({ type: 'accept_challenge', challengeId: c.challengeId });
    setIncomingChallenge(null);
    // Game will start via 'game_start' message in GameView's WS
    // We need to wait for the server to create the room — it sends challenge_accepted to the challenger
    // For the accepter, the game_start comes through the lobby WS... but we're about to enter GameView which has its own WS
    // Actually: the accepter's lobby WS is in the GameRoom now. We need to transition to game mode.
    // Let's just start online mode — the server added us to a room, the GameView WS will reconnect and get game_start
    disconnectLobbyWs();
    setGameMode('online');
    setPage('game');
  }

  async function loadProfile() {
    const data = await apiFetch('/api/me');
    if (data && !data.error) setUser(data);
    const history = await apiFetch('/api/history');
    if (Array.isArray(history)) setGameHistory(history);
    setPage('profile');
  }

  function startGame(mode: GameMode, preset?: DevPreset) {
    setGameMode(mode);
    setDevPreset(preset);
    setOnlineGameId(undefined);
    if (mode === 'online') disconnectLobbyWs();
    setPage('game');
  }

  function handleExit() {
    setOnlineGameId(undefined);
    setPage('landing');
    // Reconnect lobby WS if logged in
    if (user()) connectLobbyWs();
  }

  const DuckLogo = () => (
    <svg viewBox="0 0 80 64" width="26" height="21" style={{ "vertical-align": "middle", "margin-left": "7px", "margin-top": "-1px" }}>
      <path d="M12 38 C12 32 16 26 24 24 L36 22 C42 22 48 26 50 32 C52 38 48 44 42 44 L20 44 C16 44 12 42 12 38 Z" fill="#555"/>
      <path d="M34 22 C34 16 36 11 40 9 C43 7 47 8 49 11 C51 14 50 19 48 22" fill="#2d6a2d"/>
      <path d="M49 12 L55 11 C57 10.5 58 12.5 58 14.5 C58 16 57 17 55 16.5 L49 16" fill="#c49a3c"/>
      <path d="M46 21.5 L49 21.5" stroke="#e8dcc8" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="47" cy="12" r="1.3" fill="#1a1a2e"/>
      <path d="M18 34 C24 30 34 28 42 31" fill="none" stroke="#666" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M30 44 L30 49 M30 49 L26 51 M30 49 L30 52 M30 49 L34 51" stroke="#c49a3c" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );

  const acceptedFriends = () => friends().filter(f => f.status === 'accepted');
  const pendingIncoming = () => friends().filter(f => f.status === 'pending' && f.friendId === user()?.id);

  return (
    <>
      <header class="header">
        <a class="header-logo" href="#" onClick={(e) => { e.preventDefault(); handleExit(); }}>
          duck<span>Gammon</span>
          <DuckLogo />
        </a>
        <Show when={page() === 'game'}>
          <span class="header-mode">
            {gameMode() === 'online' ? 'Online' : gameMode() === 'ai' ? 'vs AI' : 'Local'}
          </span>
        </Show>
        <div style={{ "margin-left": "auto", display: "flex", "align-items": "center", gap: "10px" }}>
          <Show when={user()} fallback={
            <a href="#" style={{ color: 'var(--text-muted)', "font-size": '12px', "text-decoration": 'none' }}
              onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>
              Login
            </a>
          }>
            {(u) => (
              <>
                <a href="#" style={{ color: 'var(--text-primary)', "font-size": '12px', "text-decoration": 'none' }}
                  onClick={(e) => { e.preventDefault(); loadProfile(); }}>
                  {u().username}
                </a>
                <a href="#" style={{ color: 'var(--text-muted)', "font-size": '11px', "text-decoration": 'none' }}
                  onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                  logout
                </a>
              </>
            )}
          </Show>
        </div>
      </header>

      {/* ─── Incoming Challenge Popup ─── */}
      <Show when={incomingChallenge()}>
        {(c) => (
          <div class="game-over-overlay">
            <div class="game-over-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Challenge!</h2>
              <p style={{ color: 'var(--text-secondary)', "margin-bottom": "16px" }}>
                <strong>{c().from}</strong> wants to play ({c().timeLimit}s per turn)
              </p>
              <div style={{ display: 'flex', gap: '8px', "justify-content": 'center' }}>
                <button class="btn btn-primary" onClick={handleAcceptChallenge}>Accept</button>
                <button class="btn" onClick={() => setIncomingChallenge(null)}>Decline</button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <div class="main-content">
        {/* ─── Login ─── */}
        <Show when={page() === 'login'}>
          <div class="auth-page">
            <h2>Login</h2>
            <Show when={authError()}><div class="auth-error">{authError()}</div></Show>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleLogin(fd.get('username') as string, fd.get('password') as string);
            }}>
              <input name="username" placeholder="Username" autocomplete="username" required />
              <input name="password" type="password" placeholder="Password" autocomplete="current-password" required />
              <button class="btn btn-primary" type="submit" style={{ width: '100%' }}>Login</button>
            </form>
            <div class="auth-link">
              Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('register'); }}>Register</a>
            </div>
            <div class="auth-link"><a href="#" onClick={(e) => { e.preventDefault(); setPage('landing'); }}>Back</a></div>
          </div>
        </Show>

        {/* ─── Register ─── */}
        <Show when={page() === 'register'}>
          <div class="auth-page">
            <h2>Register</h2>
            <Show when={authError()}><div class="auth-error">{authError()}</div></Show>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleRegister(fd.get('username') as string, fd.get('password') as string);
            }}>
              <input name="username" placeholder="Username (2-20 chars)" autocomplete="username" required />
              <input name="password" type="password" placeholder="Password (4+ chars)" autocomplete="new-password" required />
              <button class="btn btn-primary" type="submit" style={{ width: '100%' }}>Register</button>
            </form>
            <div class="auth-link">
              Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>Login</a>
            </div>
            <div class="auth-link"><a href="#" onClick={(e) => { e.preventDefault(); setPage('landing'); }}>Back</a></div>
          </div>
        </Show>

        {/* ─── Profile ─── */}
        <Show when={page() === 'profile' && user()}>
          {(u) => {
            const winRate = () => u().gamesPlayed > 0 ? Math.round(u().gamesWon / u().gamesPlayed * 100) : 0;
            const capLabel = () => {
              const c = u().luckCapitalisation;
              if (c >= 10) return 'Opportunist'; if (c >= 3) return 'Resilient';
              if (c <= -10) return 'Wasteful'; if (c <= -3) return 'Unlucky';
              return 'Average';
            };
            return (
              <div class="profile-page">
                <h2>{u().username}</h2>
                <div class="stat-grid">
                  <div class="stat-card"><div class="stat-value">{u().gamesPlayed}</div><div class="stat-label">Games</div></div>
                  <div class="stat-card"><div class="stat-value">{winRate()}%</div><div class="stat-label">Win rate</div></div>
                  <div class="stat-card">
                    <div class="stat-value" style={{ color: u().totalLuck >= 0 ? '#4caf50' : '#e53935' }}>
                      {u().totalLuck >= 0 ? '+' : ''}{u().totalLuck.toFixed(1)}
                    </div>
                    <div class="stat-label">Lifetime luck</div>
                  </div>
                  <div class="stat-card"><div class="stat-value">{u().luckCapitalisation.toFixed(0)}</div><div class="stat-label">Capitalisation ({capLabel()})</div></div>
                </div>
                <h3 style={{ "font-size": "14px", "margin-bottom": "8px" }}>Recent Games</h3>
                <Show when={gameHistory().length > 0} fallback={<p style={{ color: 'var(--text-muted)', "font-size": "12px" }}>No games yet</p>}>
                  <table class="game-history-table">
                    <thead><tr><th>Date</th><th>White</th><th>Black</th><th>Result</th><th>Luck</th></tr></thead>
                    <tbody>
                      <For each={gameHistory()}>
                        {(g) => (
                          <tr>
                            <td>{new Date(g.createdAt).toLocaleDateString()}</td>
                            <td>{g.whiteUsername || '?'}</td><td>{g.blackUsername || '?'}</td>
                            <td>{g.winner === 'w' ? 'White' : 'Black'} ({g.resultType})</td>
                            <td style={{ color: 'var(--text-muted)' }}>{g.luckWhite != null ? `${Number(g.luckWhite).toFixed(1)}` : ''}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
                <button class="btn btn-small" style={{ "margin-top": "16px" }} onClick={() => setPage('landing')}>Back</button>
              </div>
            );
          }}
        </Show>

        {/* ─── Landing ─── */}
        <Show when={page() === 'landing'}>
          <div class="landing">
            <h1>duck<span>Gammon</span></h1>
            <p class="tagline">Fast, free, open-source backgammon</p>
            <div class="landing-buttons">
              <button class="btn btn-primary play-btn" onClick={() => startGame('online')}>Play Online</button>
              <div class="ai-play-group">
                <button class="btn play-btn play-btn-secondary" onClick={() => startGame('ai')}>Play vs AI</button>
                <div class="difficulty-selector">
                  <button class={`diff-btn ${aiDifficulty() === 'strong' ? 'active' : ''}`} onClick={() => setAiDifficulty('strong')}>Strong</button>
                  <button class={`diff-btn ${aiDifficulty() === 'expert' ? 'active' : ''}`} onClick={() => setAiDifficulty('expert')}>Expert</button>
                </div>
              </div>
              <button class="btn play-btn play-btn-secondary" onClick={() => startGame('local')}>Local 2-Player</button>
            </div>

            {/* ─── Friends Section (logged in only) ─── */}
            <Show when={user()}>
              <div class="friends-section">
                <h3 style={{ "font-size": "14px", "margin-bottom": "8px", color: "var(--text-secondary)" }}>Friends</h3>

                {/* Add friend */}
                <div style={{ display: "flex", gap: "6px", "margin-bottom": "8px" }}>
                  <input
                    type="text"
                    placeholder="Add by username"
                    value={addFriendInput()}
                    onInput={(e) => setAddFriendInput(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddFriend(); }}
                    style={{
                      flex: "1", padding: "6px 8px", background: "var(--bg-secondary)",
                      border: "1px solid rgba(255,255,255,0.1)", "border-radius": "4px",
                      color: "var(--text-primary)", "font-size": "12px",
                    }}
                  />
                  <button class="btn btn-small" onClick={handleAddFriend}>Add</button>
                </div>
                <Show when={friendError()}><div style={{ color: "#e53935", "font-size": "11px", "margin-bottom": "4px" }}>{friendError()}</div></Show>

                {/* Pending incoming requests */}
                <For each={pendingIncoming()}>
                  {(f) => (
                    <div class="friend-item">
                      <div class="online-dot off" />
                      <span class="friend-name">{f.friendUsername}</span>
                      <button class="btn btn-small" style={{ "font-size": "10px", padding: "2px 6px" }} onClick={() => handleAcceptFriend(f.id)}>Accept</button>
                    </div>
                  )}
                </For>

                {/* Accepted friends */}
                <For each={acceptedFriends()}>
                  {(f) => {
                    const isOnline = () => onlineFriends().has(f.friendUsername);
                    return (
                      <div class="friend-item">
                        <div class={`online-dot ${isOnline() ? 'on' : 'off'}`} />
                        <span class="friend-name">{f.friendUsername}</span>
                        <Show when={isOnline()}>
                          <button class="btn btn-small" style={{ "font-size": "10px", padding: "2px 6px", background: "var(--highlight)", color: "#fff" }}
                            onClick={() => handleChallenge(f.friendUsername)}>
                            Challenge
                          </button>
                        </Show>
                      </div>
                    );
                  }}
                </For>

                <Show when={acceptedFriends().length === 0 && pendingIncoming().length === 0}>
                  <p style={{ color: "var(--text-muted)", "font-size": "11px" }}>No friends yet — add someone by username</p>
                </Show>
              </div>
            </Show>

            <div class="landing-shortcuts">
              <span>Enter</span> roll &middot; <span>Z</span> undo &middot; <span>D</span> double &middot; <span>F</span> flip
            </div>

            <div style={{ "margin-top": "16px" }}>
              <a href="#" style={{ color: 'var(--text-muted)', "font-size": '11px', "text-decoration": 'none' }}
                onClick={(e) => { e.preventDefault(); setShowDev(d => !d); }}>
                {showDev() ? 'Hide dev' : 'Dev'}
              </a>
            </div>
            <Show when={showDev()}>
              <div class="landing-buttons" style={{ "margin-top": "8px" }}>
                <button class="btn btn-small play-btn-secondary" onClick={() => startGame('ai', BEAROFF_RACE)}>Bear-off Race</button>
                <button class="btn btn-small play-btn-secondary" onClick={() => startGame('ai', MID_GAME)}>Mid-game</button>
              </div>
            </Show>
          </div>
        </Show>

        {/* ─── Game ─── */}
        <Show when={page() === 'game'}>
          <GameView onExit={handleExit} mode={gameMode()} devPreset={devPreset()} onlineGameId={onlineGameId()} aiDifficulty={aiDifficulty()} />
        </Show>
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('app')!);
