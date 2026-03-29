import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { eq, or, and } from 'drizzle-orm';
import { GameRoom } from './GameRoom';
import { handleApiRoute } from './api';
import { validateToken, type AuthUser } from './auth';
import { getDb, migrateDb } from './db/index';
import { users, friends, games } from './db/schema';
import type { ClientMessage } from './protocol';

const PORT = Number(process.env.PORT) || 3001;
const DIST = join(process.cwd(), 'dist');
const SERVE_STATIC = existsSync(DIST);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = req.url?.split('?')[0] || '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, users: authenticatedUsers.size }));
    return;
  }

  // API routes
  if (await handleApiRoute(req, res)) return;

  // Static files
  if (SERVE_STATIC) {
    let filePath = join(DIST, url === '/' ? 'index.html' : url);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(DIST, 'index.html');
    }
    try {
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cache });
      res.end(data);
      return;
    } catch { /* fall through */ }
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });
const rooms = new Map<string, GameRoom>();
const playerRooms = new Map<WebSocket, string>();
const authenticatedUsers = new Map<number, { ws: WebSocket; user: AuthUser }>();
const wsUserMap = new Map<WebSocket, AuthUser>();

// Challenge management
interface PendingChallenge {
  id: string;
  fromUser: AuthUser;
  toUsername: string;
  timeLimit: number;
  createdAt: number;
}
const pendingChallenges = new Map<string, PendingChallenge>();

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getUniqueId(): string {
  let id: string;
  do { id = generateId(); } while (rooms.has(id));
  return id;
}

/** Notify user's online friends that they came online/offline */
async function notifyFriendsStatus(userId: number, username: string, online: boolean) {
  const db = getDb();
  if (!db) return;
  const friendRows = await db.select({ userId: friends.userId, friendId: friends.friendId })
    .from(friends)
    .where(and(
      or(eq(friends.userId, userId), eq(friends.friendId, userId)),
      eq(friends.status, 'accepted')
    ));

  for (const row of friendRows) {
    const friendUserId = row.userId === userId ? row.friendId : row.userId;
    const friendConn = authenticatedUsers.get(friendUserId);
    if (friendConn?.ws.readyState === WebSocket.OPEN) {
      friendConn.ws.send(JSON.stringify({
        type: online ? 'friend_online' : 'friend_offline',
        username,
      }));
    }
  }
}

/** Save completed game to DB and update user stats */
async function saveGame(room: GameRoom) {
  const db = getDb();
  if (!db) return;
  if (!room.whiteUserId && !room.blackUserId) return; // anonymous game

  try {
    await db.insert(games).values({
      whiteId: room.whiteUserId,
      blackId: room.blackUserId,
      winner: room.state.phase === 'gameOver' ? (room.state.whiteOff >= 15 ? 'w' : 'b') : null,
      resultType: room.resultType || 'single',
      moves: room.moveHistory,
      luckWhite: room.luckWhite,
      luckBlack: room.luckBlack,
      timeControl: room.timeLimit,
    });

    // Update user stats
    for (const color of ['w', 'b'] as const) {
      const uid = color === 'w' ? room.whiteUserId : room.blackUserId;
      if (!uid) continue;

      const gameLuck = color === 'w' ? room.luckWhite : room.luckBlack;
      const won = (room.state.whiteOff >= 15 && color === 'w') || (room.state.blackOff >= 15 && color === 'b');

      // Luck capitalisation formula
      let capDelta = 0;
      if (gameLuck !== 0) {
        const lucky = gameLuck > 0;
        if (won && lucky) capDelta = 1;      // Expected win
        else if (won && !lucky) capDelta = 2; // Overcame bad luck
        else if (!won && lucky) capDelta = -2; // Squandered good luck
        else capDelta = -1;                    // Expected loss
      }

      const [current] = await db.select({
        gamesPlayed: users.gamesPlayed,
        gamesWon: users.gamesWon,
        totalLuck: users.totalLuck,
        luckStreak: users.luckStreak,
        bestLuckStreak: users.bestLuckStreak,
        worstLuckStreak: users.worstLuckStreak,
        luckCapitalisation: users.luckCapitalisation,
      }).from(users).where(eq(users.id, uid)).limit(1);
      if (!current) continue;

      // Update streak
      let newStreak = current.luckStreak;
      if (gameLuck > 0 && newStreak >= 0) newStreak += gameLuck;
      else if (gameLuck < 0 && newStreak <= 0) newStreak += gameLuck;
      else newStreak = gameLuck; // sign changed, reset

      await db.update(users).set({
        gamesPlayed: current.gamesPlayed + 1,
        gamesWon: current.gamesWon + (won ? 1 : 0),
        totalLuck: current.totalLuck + gameLuck,
        luckStreak: newStreak,
        bestLuckStreak: Math.max(current.bestLuckStreak, newStreak),
        worstLuckStreak: Math.min(current.worstLuckStreak, newStreak),
        luckCapitalisation: current.luckCapitalisation + capDelta,
      }).where(eq(users.id, uid));
    }
  } catch (err) {
    console.error('[db] Error saving game:', err);
  }
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', async (data) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(data.toString()); }
    catch { ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' })); return; }

    // ─── Auth ───
    if (msg.type === 'auth') {
      const user = await validateToken(msg.token);
      if (!user) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
        return;
      }
      wsUserMap.set(ws, user);
      authenticatedUsers.set(user.id, { ws, user });
      ws.send(JSON.stringify({ type: 'authenticated', user: { id: user.id, username: user.username } }));
      notifyFriendsStatus(user.id, user.username, true);

      // Update username in any GameRoom this player is already in
      const existingGameId = playerRooms.get(ws);
      if (existingGameId) {
        const room = rooms.get(existingGameId);
        if (room) {
          const player = room.players.get(ws);
          if (player) {
            player.username = user.username;
            player.userId = user.id;
            if (player.color === 'w') { room.whiteUsername = user.username; room.whiteUserId = user.id; }
            else { room.blackUsername = user.username; room.blackUserId = user.id; }
            // Notify opponent of the name
            const opponent = player.color === 'w' ? room.black : room.white;
            if (opponent?.readyState === WebSocket.OPEN) {
              opponent.send(JSON.stringify({ type: 'game_start', state: room.state, color: player.color === 'w' ? 'b' : 'w', opponent: user.username }));
            }
          }
        }
      }
      return;
    }

    // ─── Chat ───
    if (msg.type === 'chat') {
      const gameId = playerRooms.get(ws);
      if (!gameId) return;
      const room = rooms.get(gameId);
      if (!room) return;
      const user = wsUserMap.get(ws);
      const from = user?.username || (room.getColor(ws) === 'w' ? 'White' : 'Black');
      // Relay to opponent
      const color = room.getColor(ws);
      // Send to both players (sender sees their own message too)
      const text = msg.text.slice(0, 200);
      const chatMsg = JSON.stringify({ type: 'chat', from, text });
      if (room.white?.readyState === WebSocket.OPEN) room.white.send(chatMsg);
      if (room.black?.readyState === WebSocket.OPEN && room.black !== room.white) room.black.send(chatMsg);
      return;
    }

    // ─── Challenge ───
    if (msg.type === 'challenge') {
      const fromUser = wsUserMap.get(ws);
      if (!fromUser) { ws.send(JSON.stringify({ type: 'error', message: 'Must be logged in' })); return; }
      const targetConn = [...authenticatedUsers.values()].find(c => c.user.username === msg.username.toLowerCase());
      if (!targetConn) { ws.send(JSON.stringify({ type: 'error', message: 'User not online' })); return; }

      const id = generateId();
      pendingChallenges.set(id, {
        id, fromUser, toUsername: msg.username.toLowerCase(),
        timeLimit: msg.timeLimit ?? 30, createdAt: Date.now(),
      });
      targetConn.ws.send(JSON.stringify({
        type: 'challenge_received', from: fromUser.username, challengeId: id, timeLimit: msg.timeLimit ?? 30,
      }));
      // Expire after 60s
      setTimeout(() => pendingChallenges.delete(id), 60000);
      return;
    }

    if (msg.type === 'accept_challenge') {
      const challenge = pendingChallenges.get(msg.challengeId);
      if (!challenge) { ws.send(JSON.stringify({ type: 'error', message: 'Challenge expired' })); return; }
      pendingChallenges.delete(msg.challengeId);

      const acceptUser = wsUserMap.get(ws);
      if (!acceptUser || acceptUser.username !== challenge.toUsername) return;

      // Create game room
      const gameId = getUniqueId();
      const room = new GameRoom(gameId, challenge.timeLimit);
      rooms.set(gameId, room);

      // Find challenger's socket
      const challengerConn = authenticatedUsers.get(challenge.fromUser.id);
      if (!challengerConn) return;

      room.addPlayer(challengerConn.ws, challenge.fromUser.id, challenge.fromUser.username);
      room.addPlayer(ws, acceptUser.id, acceptUser.username);
      playerRooms.set(challengerConn.ws, gameId);
      playerRooms.set(ws, gameId);
      room.startGame();

      challengerConn.ws.send(JSON.stringify({ type: 'challenge_accepted', gameId }));
      ws.send(JSON.stringify({ type: 'challenge_accepted', gameId }));
      return;
    }

    // ─── Game actions ───
    if (msg.type === 'create') {
      const id = getUniqueId();
      const room = new GameRoom(id, msg.timeLimit ?? 30);
      rooms.set(id, room);
      const user = wsUserMap.get(ws);
      room.addPlayer(ws, user?.id, user?.username);
      playerRooms.set(ws, id);
      ws.send(JSON.stringify({ type: 'game_created', gameId: id }));
      console.log(`[${id}] Room created`);
      return;
    }

    if (msg.type === 'join') {
      const room = rooms.get(msg.gameId);
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Game not found' })); return; }
      if (room.isFull) {
        // Room full — check if this is a reconnect (same userId, new WS)
        const user = wsUserMap.get(ws);
        if (user) {
          for (const [oldWs, player] of room.players) {
            if (player.userId === user.id && oldWs !== ws) {
              room.handleReconnect(oldWs, ws);
              playerRooms.set(ws, msg.gameId);
              console.log(`[${msg.gameId}] ${user.username} reconnected`);
              return;
            }
          }
        }
        ws.send(JSON.stringify({ type: 'error', message: 'Game is full' }));
        return;
      }
      const user = wsUserMap.get(ws);
      const color = room.addPlayer(ws, user?.id, user?.username);
      if (!color) { ws.send(JSON.stringify({ type: 'error', message: 'Could not join' })); return; }
      playerRooms.set(ws, msg.gameId);
      room.startGame();
      console.log(`[${msg.gameId}] Player joined as ${color}`);
      return;
    }

    // Forward to room
    const gameId = playerRooms.get(ws);
    if (!gameId) { ws.send(JSON.stringify({ type: 'error', message: 'Not in a game' })); return; }
    const room = rooms.get(gameId);
    if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Game not found' })); return; }

    switch (msg.type) {
      case 'roll': room.handleRoll(ws); break;
      case 'move': room.handleMove(ws, msg.move); break;
      case 'confirm': room.handleConfirm(ws); break;
      case 'undo': room.handleUndo(ws); break;
      case 'double': room.handleDouble(ws); break;
      case 'accept_double': room.handleAcceptDouble(ws); break;
      case 'drop_double': room.handleDropDouble(ws); break;
      case 'resign': room.handleResign(ws); break;
      case 'rematch': case 'accept_rematch': room.handleRematch(ws); break;
    }

    // Check if game just ended — save to DB
    if (room.state.phase === 'gameOver' && !room.saved) {
      room.saved = true;
      saveGame(room);
    }
  });

  ws.on('close', () => {
    const user = wsUserMap.get(ws);
    if (user) {
      authenticatedUsers.delete(user.id);
      wsUserMap.delete(ws);
      notifyFriendsStatus(user.id, user.username, false);
    }

    const gameId = playerRooms.get(ws);
    if (gameId) {
      const room = rooms.get(gameId);
      if (room) {
        room.handleDisconnect(ws);
        setTimeout(() => {
          if (room.state.phase === 'gameOver') {
            let allDisconnected = true;
            for (const [playerWs] of room.players) {
              if (playerWs.readyState === WebSocket.OPEN) allDisconnected = false;
            }
            if (allDisconnected) {
              room.destroy();
              rooms.delete(gameId);
            }
          }
        }, 70000);
      }
      playerRooms.delete(ws);
    }
  });
});

// ─── Startup ───
async function start() {
  await migrateDb();
  server.listen(PORT, () => {
    console.log(`duckGammon server listening on port ${PORT}`);
    if (SERVE_STATIC) console.log(`Serving static files from ${DIST}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  // Start anyway without DB
  server.listen(PORT, () => {
    console.log(`duckGammon server listening on port ${PORT} (no database)`);
  });
});
