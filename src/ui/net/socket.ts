/**
 * WebSocket client with auto-reconnect.
 */
import type { ClientMessage, ServerMessage } from '../../server/protocol';

type MessageHandler = (msg: ServerMessage) => void;
type StatusHandler = (connected: boolean) => void;

let ws: WebSocket | null = null;
let url: string = '';
let handlers: MessageHandler[] = [];
let statusHandlers: StatusHandler[] = [];
let reconnectAttempts = 0;
let reconnectTimer: number | undefined;
let queue: ClientMessage[] = [];

export function connect(wsUrl: string) {
  url = wsUrl;
  reconnectAttempts = 0;
  doConnect();
}

function doConnect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectAttempts = 0;
    statusHandlers.forEach(h => h(true));
    // Send auth token if available
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('dg-token') : null;
    if (token) {
      ws!.send(JSON.stringify({ type: 'auth', token }));
    }
    // Flush queued messages
    for (const msg of queue) {
      ws!.send(JSON.stringify(msg));
    }
    queue = [];
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      handlers.forEach(h => h(msg));
    } catch { /* ignore parse errors */ }
  };

  ws.onclose = () => {
    statusHandlers.forEach(h => h(false));
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (reconnectAttempts >= 10) return; // give up after 10 attempts
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
  reconnectAttempts++;
  reconnectTimer = window.setTimeout(doConnect, delay);
}

export function send(msg: ClientMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    queue.push(msg);
  }
}

export function onMessage(handler: MessageHandler) {
  handlers.push(handler);
  return () => { handlers = handlers.filter(h => h !== handler); };
}

export function onStatus(handler: StatusHandler) {
  statusHandlers.push(handler);
  return () => { statusHandlers = statusHandlers.filter(h => h !== handler); };
}

export function disconnect() {
  clearTimeout(reconnectTimer);
  reconnectAttempts = 999; // prevent reconnect
  if (ws) ws.close();
  ws = null;
  handlers = [];
  statusHandlers = [];
  queue = [];
}
