import { render } from 'solid-js/web';
import { createSignal, createEffect, Show, For, onMount, onCleanup } from 'solid-js';
import GameView from './game/GameView';
import type { GameMode } from './game/GameView';
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
// White has 2 on bar, black blocks all entry points (19-24). White can never enter.
const JAIL_BLOCKED: DevPreset = {
  board: [2, 0, 0, 5, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -3, -2, -2, -3, -2, -3, 0],
  whiteOff: 0, blackOff: 0,
};

const API = '';
const WS_URL = window.location.protocol === 'https:'
  ? `wss://${window.location.host}`
  : `ws://${window.location.host}`;

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
  const [incomingChallenge, setIncomingChallenge] = createSignal<{ from: string; challengeId: string; timeLimit: number; expiresAt: number } | null>(null);
  const [challengeSent, setChallengeSent] = createSignal<{ username: string; expiresAt: number } | null>(null);
  const [challengeCountdown, setChallengeCountdown] = createSignal(0);
  const [challengeTarget, setChallengeTarget] = createSignal<string | null>(null);
  const [challengeColor, setChallengeColor] = createSignal<'w' | 'b' | 'random'>('random');
  const [challengeTime, setChallengeTime] = createSignal<number | null>(30);
  const [challengeCustomTime, setChallengeCustomTime] = createSignal('');

  // Lobby WS with auto-reconnect
  let lobbyWs: WebSocket | null = null;
  let lobbyReconnectTimer: number | undefined;
  let lobbyReconnectAttempts = 0;
  let lobbyIntentionalClose = false;

  function connectLobbyWs() {
    if (lobbyWs && (lobbyWs.readyState === WebSocket.OPEN || lobbyWs.readyState === WebSocket.CONNECTING)) return;
    const token = localStorage.getItem('dg-token');
    if (!token) return;
    lobbyIntentionalClose = false;
    lobbyWs = new WebSocket(WS_URL);
    lobbyWs.onopen = () => {
      lobbyReconnectAttempts = 0;
      lobbyWs!.send(JSON.stringify({ type: 'auth', token }));
    };
    lobbyWs.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'authenticated' && msg.onlineFriends) {
          // Seed initial online state — this is the authoritative snapshot
          setOnlineFriends(new Set(msg.onlineFriends));
        }
        if (msg.type === 'friend_online') setOnlineFriends(prev => new Set([...prev, msg.username]));
        if (msg.type === 'friend_offline') setOnlineFriends(prev => { const s = new Set(prev); s.delete(msg.username); return s; });
        if (msg.type === 'challenge_received') setIncomingChallenge({ from: msg.from, challengeId: msg.challengeId, timeLimit: msg.timeLimit, expiresAt: Date.now() + 60000 });
        if (msg.type === 'challenge_accepted') { setChallengeSent(null); setOnlineGameId(msg.gameId); setGameMode('online'); disconnectLobbyWs(); setPage('game'); }
      } catch { /* ignore parse errors */ }
    };
    lobbyWs.onclose = () => {
      lobbyWs = null;
      if (!lobbyIntentionalClose) {
        // Auto-reconnect with backoff
        scheduleLobbyReconnect();
      }
    };
  }

  function scheduleLobbyReconnect() {
    if (lobbyReconnectAttempts >= 20) return;
    const delay = Math.min(2000 * Math.pow(1.5, lobbyReconnectAttempts), 30000);
    const jitter = Math.random() * delay * 0.2; // ±20% jitter
    lobbyReconnectAttempts++;
    lobbyReconnectTimer = window.setTimeout(connectLobbyWs, delay + jitter);
  }

  function disconnectLobbyWs() {
    lobbyIntentionalClose = true;
    clearTimeout(lobbyReconnectTimer);
    if (lobbyWs) { lobbyWs.close(); lobbyWs = null; }
    setOnlineFriends(new Set<string>()); // Clear — we no longer have live data
  }

  function sendLobbyMsg(msg: any) { if (lobbyWs?.readyState === WebSocket.OPEN) lobbyWs.send(JSON.stringify(msg)); }

  createEffect(() => { if (user() && page() !== 'game') { connectLobbyWs(); loadFriends(); } });
  onCleanup(() => disconnectLobbyWs());

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (gameId) { setOnlineGameId(gameId); setGameMode('online'); setPage('game'); window.history.replaceState({}, '', window.location.pathname); }
    if (localStorage.getItem('dg-token')) {
      const data = await apiFetch('/api/me');
      if (data && !data.error) setUser(data); else localStorage.removeItem('dg-token');
    }
  });

  async function loadFriends() { const data = await apiFetch('/api/friends'); if (Array.isArray(data)) setFriends(data); }
  async function handleRegister(username: string, password: string) {
    setAuthError('');
    const data = await apiFetch('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.error) { setAuthError(data.error); return; }
    localStorage.setItem('dg-token', data.token); setUser(data.user); setPage('landing');
  }
  async function handleLogin(username: string, password: string) {
    setAuthError('');
    const data = await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.error) { setAuthError(data.error); return; }
    localStorage.setItem('dg-token', data.token); setUser(data.user); setPage('landing');
  }
  async function handleLogout() {
    if (page() === 'game') handleExit(); // exit active game first
    await apiFetch('/api/logout', { method: 'POST' }); localStorage.removeItem('dg-token');
    disconnectLobbyWs(); setUser(null); setFriends([]); setOnlineFriends(new Set<string>());
    setPage('landing');
  }
  async function handleAddFriend() {
    setFriendError(''); const username = addFriendInput().trim(); if (!username) return;
    const data = await apiFetch('/api/friends', { method: 'POST', body: JSON.stringify({ username }) });
    if (data.error) { setFriendError(data.error); return; } setAddFriendInput(''); loadFriends();
  }
  async function handleAcceptFriend(id: number) { await apiFetch(`/api/friends/${id}/accept`, { method: 'POST' }); loadFriends(); }
  function openChallengeModal(username: string) {
    setChallengeTarget(username);
    setChallengeColor('random');
    setChallengeTime(30);
    setChallengeCustomTime('');
  }
  function closeChallengeModal() { setChallengeTarget(null); }
  function sendChallenge() {
    const target = challengeTarget();
    if (!target) return;
    const time = challengeTime() ?? (parseInt(challengeCustomTime()) || null);
    sendLobbyMsg({ type: 'challenge', username: target, timeLimit: time ?? 30, colorPreference: challengeColor() });
    const expiresAt = Date.now() + 60000;
    setChallengeSent({ username: target, expiresAt });
    setChallengeCountdown(60);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setChallengeCountdown(remaining);
      if (remaining <= 0) { clearInterval(interval); setChallengeSent(null); }
    }, 1000);
    closeChallengeModal();
  }
  function handleAcceptChallenge() {
    const c = incomingChallenge(); if (!c) return;
    sendLobbyMsg({ type: 'accept_challenge', challengeId: c.challengeId });
    setIncomingChallenge(null);
    // Don't navigate yet — wait for challenge_accepted message with gameId
  }
  async function loadProfile() {
    const data = await apiFetch('/api/me'); if (data && !data.error) setUser(data);
    const history = await apiFetch('/api/history'); if (Array.isArray(history)) setGameHistory(history); setPage('profile');
  }
  function startGame(mode: GameMode, preset?: DevPreset) {
    setGameMode(mode); setDevPreset(preset); setOnlineGameId(undefined);
    if (mode === 'online') disconnectLobbyWs(); setPage('game');
  }
  function handleExit() { setOnlineGameId(undefined); setPage('landing'); if (user()) connectLobbyWs(); }

  // The standard mallard duck SVG paths
  const duckPaths = (<>
    <path d="M12 38 C12 32 16 26 24 24 L36 22 C42 22 48 26 50 32 C52 38 48 44 42 44 L20 44 C16 44 12 42 12 38 Z" fill="#555"/>
    <path d="M34 22 C34 16 36 11 40 9 C43 7 47 8 49 11 C51 14 50 19 48 22" fill="#2d6a2d"/>
    <path d="M49 12 L55 11 C57 10.5 58 12.5 58 14.5 C58 16 57 17 55 16.5 L49 16" fill="#c49a3c"/>
    <path d="M46 21.5 L49 21.5" stroke="#e8dcc8" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="47" cy="12" r="1.3" fill="#1a1a2e"/>
    <path d="M18 34 C24 30 34 28 42 31" fill="none" stroke="#666" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M30 44 L30 49 M30 49 L26 51 M30 49 L30 52 M30 49 L34 51" stroke="#c49a3c" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </>);

  const headerMode = () => page() === 'game' ? gameMode() : null;
  const showSecondDuck = () => headerMode() === 'online' || headerMode() === 'local';
  const showBinary = () => headerMode() === 'ai';

  const HeaderLogo = () => (<span style={{ display: "inline-flex", "align-items": "center", "vertical-align": "middle", "margin-top": "-2px" }}>
    {/* Main duck — ALWAYS present, never hidden */}
    <svg viewBox="0 0 80 64" width="26" height="21" style={{ "flex-shrink": "0", "margin-left": "7px" }}>
      {duckPaths}
    </svg>
    {/* Checker + second duck — vs human */}
    <Show when={showSecondDuck()}>
      <span class="header-duo">
        <svg viewBox="0 0 20 20" width="12" height="12" style={{ margin: "0 1px" }}>
          <circle cx="10" cy="10" r="8" fill="#e8dcc8" stroke="#c4b8a4" stroke-width="1.5"/>
        </svg>
        <svg viewBox="0 0 80 64" width="26" height="21" style={{ transform: "scaleX(-1)" }}>
          {duckPaths}
        </svg>
      </span>
    </Show>
    {/* Robot icon — AI mode */}
    <Show when={showBinary()}>
      <svg viewBox="0 0 24 24" width="18" height="18" style={{ "margin-left": "4px", opacity: "0.5" }}>
        <rect x="4" y="8" width="16" height="12" rx="2" fill="none" stroke="#4a9eff" stroke-width="1.5"/>
        <circle cx="9" cy="14" r="1.5" fill="#4a9eff"/>
        <circle cx="15" cy="14" r="1.5" fill="#4a9eff"/>
        <line x1="12" y1="4" x2="12" y2="8" stroke="#4a9eff" stroke-width="1.5"/>
        <circle cx="12" cy="3" r="1.5" fill="#4a9eff"/>
      </svg>
    </Show>
  </span>);

  const acceptedFriends = () => friends().filter(f => f.status === 'accepted');
  const pendingIncoming = () => friends().filter(f => f.status === 'pending' && f.friendId === user()?.id);

  return (
    <>
      <header class="header">
        <a class="header-logo" href="#" onClick={(e) => { e.preventDefault(); handleExit(); }}>
          duck<span>Gammon</span><HeaderLogo />
        </a>
        <Show when={page() === 'game'}>
          <span class="header-mode">
            {gameMode() === 'online' ? 'Online' : gameMode() === 'ai' ? 'vs AI' : 'Local'}
          </span>
        </Show>
        <div style={{ "margin-left": "auto", display: "flex", "align-items": "center", gap: "10px" }}>
          <Show when={user()} fallback={
            <a href="#" class="header-auth" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>Login</a>
          }>
            {(u) => (<>
              <a href="#" class="header-auth" onClick={(e) => { e.preventDefault(); loadProfile(); }}>{u().username}</a>
              <a href="#" class="header-auth muted" onClick={(e) => { e.preventDefault(); handleLogout(); }}>logout</a>
            </>)}
          </Show>
        </div>
      </header>

      {/* Incoming Challenge */}
      <Show when={incomingChallenge()}>
        {(c) => {
          const [remaining, setRemaining] = createSignal(Math.max(0, Math.ceil((c().expiresAt - Date.now()) / 1000)));
          const interval = setInterval(() => {
            const r = Math.max(0, Math.ceil((c().expiresAt - Date.now()) / 1000));
            setRemaining(r);
            if (r <= 0) { clearInterval(interval); setIncomingChallenge(null); }
          }, 1000);
          onCleanup(() => clearInterval(interval));
          return (
            <div class="game-over-overlay">
              <div class="game-over-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Challenge!</h2>
                <p style={{ color: 'var(--text-secondary)', "margin-bottom": "12px" }}>
                  <strong>{c().from}</strong> wants to play
                </p>
                <div class="challenge-timer-ring">
                  <svg viewBox="0 0 40 40" width="40" height="40">
                    <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3" />
                    <circle cx="20" cy="20" r="17" fill="none" stroke={remaining() <= 10 ? '#e53935' : 'var(--highlight)'}
                      stroke-width="3" stroke-linecap="round"
                      stroke-dasharray={`${2 * Math.PI * 17}`}
                      stroke-dashoffset={`${2 * Math.PI * 17 * (1 - remaining() / 60)}`}
                      transform="rotate(-90 20 20)"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                    <text x="20" y="21" text-anchor="middle" dominant-baseline="middle"
                      font-size="11" font-weight="700" fill="var(--text-primary)">{remaining()}</text>
                  </svg>
                </div>
                <div style={{ display: 'flex', gap: '8px', "justify-content": 'center', "margin-top": "12px" }}>
                  <button class="btn btn-primary" onClick={handleAcceptChallenge}>Accept</button>
                  <button class="btn" onClick={() => setIncomingChallenge(null)}>Decline</button>
                </div>
              </div>
            </div>
          );
        }}
      </Show>

      <div class="main-content">
        {/* Login */}
        <Show when={page() === 'login'}>
          <div class="auth-page">
            <h2>Login</h2>
            <Show when={authError()}><div class="auth-error">{authError()}</div></Show>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleLogin(fd.get('username') as string, fd.get('password') as string); }}>
              <input name="username" placeholder="Username" autocomplete="username" required />
              <input name="password" type="password" placeholder="Password" autocomplete="current-password" required />
              <button class="btn btn-primary" type="submit" style={{ width: '100%' }}>Login</button>
            </form>
            <div class="auth-link">No account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('register'); }}>Register</a></div>
            <div class="auth-link"><a href="#" onClick={(e) => { e.preventDefault(); setPage('landing'); }}>Back</a></div>
          </div>
        </Show>

        {/* Register */}
        <Show when={page() === 'register'}>
          <div class="auth-page">
            <h2>Register</h2>
            <Show when={authError()}><div class="auth-error">{authError()}</div></Show>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleRegister(fd.get('username') as string, fd.get('password') as string); }}>
              <input name="username" placeholder="Username" autocomplete="username" required />
              <input name="password" type="password" placeholder="Password" autocomplete="new-password" required />
              <button class="btn btn-primary" type="submit" style={{ width: '100%' }}>Register</button>
            </form>
            <div class="auth-link">Have an account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthError(''); setPage('login'); }}>Login</a></div>
            <div class="auth-link"><a href="#" onClick={(e) => { e.preventDefault(); setPage('landing'); }}>Back</a></div>
          </div>
        </Show>

        {/* Profile */}
        <Show when={page() === 'profile' && user()}>
          {(u) => {
            const winRate = () => u().gamesPlayed > 0 ? Math.round(u().gamesWon / u().gamesPlayed * 100) : 0;
            const capLabel = () => { const c = u().luckCapitalisation; if (c >= 10) return 'Opportunist'; if (c >= 3) return 'Resilient'; if (c <= -10) return 'Wasteful'; if (c <= -3) return 'Unlucky'; return 'Average'; };
            return (
              <div class="profile-page">
                <h2>{u().username}</h2>
                <div class="stat-grid">
                  <div class="stat-card"><div class="stat-value">{u().gamesPlayed}</div><div class="stat-label">Games</div></div>
                  <div class="stat-card"><div class="stat-value">{winRate()}%</div><div class="stat-label">Win rate</div></div>
                  <div class="stat-card"><div class="stat-value" style={{ color: u().totalLuck >= 0 ? '#4caf50' : '#e53935' }}>{u().totalLuck >= 0 ? '+' : ''}{u().totalLuck.toFixed(1)}</div><div class="stat-label">Lifetime luck</div></div>
                  <div class="stat-card"><div class="stat-value">{u().luckCapitalisation.toFixed(0)}</div><div class="stat-label">{capLabel()}</div></div>
                </div>
                <h3 style={{ "font-size": "14px", "margin-bottom": "8px" }}>Recent Games</h3>
                <Show when={gameHistory().length > 0} fallback={<p style={{ color: 'var(--text-muted)', "font-size": "12px" }}>No games yet</p>}>
                  <table class="game-history-table">
                    <thead><tr><th>Date</th><th>White</th><th>Black</th><th>Result</th></tr></thead>
                    <tbody><For each={gameHistory()}>{(g) => (<tr><td>{new Date(g.createdAt).toLocaleDateString()}</td><td>{g.whiteUsername || '?'}</td><td>{g.blackUsername || '?'}</td><td>{g.winner === 'w' ? 'W' : 'B'} ({g.resultType})</td></tr>)}</For></tbody>
                  </table>
                </Show>
                <button class="btn btn-small" style={{ "margin-top": "16px" }} onClick={() => setPage('landing')}>Back</button>
              </div>
            );
          }}
        </Show>

        {/* Landing */}
        <Show when={page() === 'landing'}>
          <div class="landing">
            <h1>duck<span>Gammon</span></h1>
            <p class="tagline">Fast, free, open-source backgammon</p>

            <div class="play-cards">
              <button class="play-card" onClick={() => startGame('ai')}>
                <div class="play-card-title">Play vs AI</div>
                <div class="play-card-desc">Single player</div>
              </button>
              <button class="play-card primary" onClick={() => startGame('online')}>
                <div class="play-card-title">Play Online</div>
                <div class="play-card-desc">Create room</div>
              </button>
              <button class="play-card" onClick={() => startGame('local')}>
                <div class="play-card-title">Local 2P</div>
                <div class="play-card-desc">Same device</div>
              </button>
            </div>

            <div class="landing-shortcuts">
              <span>Enter</span> roll &middot; <span>Z</span> undo &middot; <span>D</span> double &middot; <span>F</span> flip
            </div>

            <div style={{ "margin-top": "12px" }}>
              <a href="#" class="dev-link" onClick={(e) => { e.preventDefault(); setShowDev(d => !d); }}>{showDev() ? 'hide dev' : 'dev'}</a>
            </div>
            <Show when={showDev()}>
              <div class="play-cards" style={{ "margin-top": "8px" }}>
                <button class="play-card small" onClick={() => startGame('ai', BEAROFF_RACE)}>Bear-off</button>
                <button class="play-card small" onClick={() => startGame('ai', MID_GAME)}>Mid-game</button>
                <button class="play-card small" onClick={() => startGame('ai', JAIL_BLOCKED)}>Jail blocked</button>
              </div>
            </Show>
          </div>

          {/* Friends panel — top-right on landing */}
          <Show when={user()}>
            <div class="friends-panel">
              <div class="friends-header">
                <span class="friends-label">Friends</span>
                <span class="friends-count">{acceptedFriends().filter(f => onlineFriends().has(f.friendUsername)).length} online</span>
              </div>
              <div class="friends-list">
                <For each={acceptedFriends()}>
                  {(f) => {
                    const isOnline = () => onlineFriends().has(f.friendUsername);
                    return (
                      <div class={`friend-row ${isOnline() ? '' : 'offline'}`}>
                        <div class={`online-dot ${isOnline() ? 'on' : 'off'}`} />
                        <span class="friend-name">{f.friendUsername}</span>
                        <Show when={isOnline()}>
                          <Show when={challengeSent()?.username === f.friendUsername} fallback={
                            <button class="btn btn-small friend-challenge" onClick={() => openChallengeModal(f.friendUsername)}>⚔</button>
                          }>
                            <button class="btn btn-small challenge-pending" disabled>⚔ {challengeCountdown()}s</button>
                          </Show>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
              <Show when={pendingIncoming().length > 0}>
                <div class="friends-pending">
                  <For each={pendingIncoming()}>
                    {(f) => (
                      <div class="friend-row pending">
                        <span class="friend-name"><span class="pending-name">{f.friendUsername}</span> wants to be friends</span>
                        <button class="btn btn-small friend-accept" onClick={() => handleAcceptFriend(f.id)}>Accept</button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <div class="friends-add">
                <input type="text" placeholder="Add friend..." value={addFriendInput()}
                  onInput={(e) => setAddFriendInput(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddFriend(); }} />
                <button class="btn btn-small" onClick={handleAddFriend}>+</button>
              </div>
              <Show when={friendError()}><span class="friend-error">{friendError()}</span></Show>
            </div>
            <Show when={challengeTarget()}>
              <div class="challenge-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeChallengeModal(); }}>
                <div class="challenge-modal">
                  <div class="challenge-title-label">Challenge</div>
                  <div class="challenge-title-name">{challengeTarget()}</div>

                  <div class="challenge-section-label">Play as</div>
                  <div class="challenge-color-picker">
                    <div class={`challenge-color-opt ${challengeColor() === 'w' ? 'selected' : ''}`} onClick={() => setChallengeColor('w')}>
                      <div class="checker-circle white" />
                      <span>White</span>
                    </div>
                    <div class={`challenge-color-opt ${challengeColor() === 'random' ? 'selected' : ''}`} onClick={() => setChallengeColor('random')}>
                      <div class="checker-circle random" />
                      <span>Random</span>
                    </div>
                    <div class={`challenge-color-opt ${challengeColor() === 'b' ? 'selected' : ''}`} onClick={() => setChallengeColor('b')}>
                      <div class="checker-circle black" />
                      <span>Black</span>
                    </div>
                  </div>

                  <div class="challenge-section-label">Time per turn</div>
                  <div class="challenge-time-presets">
                    <button class={`challenge-time-btn ${challengeTime() === 15 ? 'selected' : ''}`} onClick={() => { setChallengeTime(15); setChallengeCustomTime(''); }}>15s</button>
                    <button class={`challenge-time-btn ${challengeTime() === 30 ? 'selected' : ''}`} onClick={() => { setChallengeTime(30); setChallengeCustomTime(''); }}>30s</button>
                    <button class={`challenge-time-btn ${challengeTime() === 60 ? 'selected' : ''}`} onClick={() => { setChallengeTime(60); setChallengeCustomTime(''); }}>60s</button>
                    <button class={`challenge-time-btn ${challengeTime() === null && !challengeCustomTime() ? 'selected' : ''}`} onClick={() => { setChallengeTime(null); setChallengeCustomTime(''); }}>∞</button>
                  </div>
                  <div class="challenge-time-custom">
                    <input type="number" placeholder="custom" value={challengeCustomTime()}
                      onInput={(e) => { setChallengeCustomTime(e.currentTarget.value); const v = parseInt(e.currentTarget.value); setChallengeTime(v > 0 ? v : null); }} />
                    <span>seconds</span>
                  </div>

                  <div class="challenge-actions">
                    <button class="btn challenge-cancel" onClick={closeChallengeModal}>Cancel</button>
                    <button class="btn btn-primary challenge-send" onClick={sendChallenge}>Challenge ⚔</button>
                  </div>
                </div>
              </div>
            </Show>
          </Show>
        </Show>

        {/* Game */}
        <Show when={page() === 'game'}>
          <GameView onExit={handleExit} mode={gameMode()} devPreset={devPreset()} onlineGameId={onlineGameId()} />
        </Show>
      </div>
    </>
  );
}

render(() => <App />, document.getElementById('app')!);
