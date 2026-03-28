import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { GameRoom } from './GameRoom';
import type { ClientMessage } from './protocol';

const PORT = Number(process.env.PORT) || 3001;
const DIST = join(process.cwd(), 'dist');
const SERVE_STATIC = existsSync(DIST);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const url = req.url?.split('?')[0] || '/';

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  // Serve static files from dist/
  if (SERVE_STATIC) {
    let filePath = join(DIST, url === '/' ? 'index.html' : url);

    // SPA fallback: if file doesn't exist, serve index.html
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(DIST, 'index.html');
    }

    try {
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
      res.end(data);
      return;
    } catch {
      // fall through to 404
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });
const rooms = new Map<string, GameRoom>();
const playerRooms = new Map<WebSocket, string>();

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

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'create': {
        const id = getUniqueId();
        const room = new GameRoom(id, msg.timeLimit ?? 30);
        rooms.set(id, room);
        room.addPlayer(ws);
        playerRooms.set(ws, id);
        ws.send(JSON.stringify({ type: 'game_created', gameId: id }));
        console.log(`[${id}] Room created`);
        break;
      }

      case 'join': {
        const room = rooms.get(msg.gameId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
          return;
        }
        if (room.isFull) {
          ws.send(JSON.stringify({ type: 'error', message: 'Game is full' }));
          return;
        }
        const color = room.addPlayer(ws);
        if (!color) {
          ws.send(JSON.stringify({ type: 'error', message: 'Could not join' }));
          return;
        }
        playerRooms.set(ws, msg.gameId);
        room.startGame();
        console.log(`[${msg.gameId}] Player joined as ${color}, game starting`);
        break;
      }

      default: {
        const gameId = playerRooms.get(ws);
        if (!gameId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not in a game' }));
          return;
        }
        const room = rooms.get(gameId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
          return;
        }

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
        break;
      }
    }
  });

  ws.on('close', () => {
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
              console.log(`[${gameId}] Room cleaned up`);
            }
          }
        }, 70000);
      }
      playerRooms.delete(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log(`duckGammon server listening on port ${PORT}`);
  if (SERVE_STATIC) console.log(`Serving static files from ${DIST}`);
});
