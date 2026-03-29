import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../../protocol';

export class TestWsClient {
  private ws: WebSocket | null = null;
  private queue: ServerMessage[] = [];
  private waiters: Array<{ type: string | null; resolve: (msg: ServerMessage) => void; reject: (err: Error) => void }> = [];
  private port: number;

  constructor(port: number) {
    this.port = port;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        // Check if any waiter matches
        const idx = this.waiters.findIndex(w => w.type === null || w.type === msg.type);
        if (idx >= 0) {
          const waiter = this.waiters.splice(idx, 1)[0];
          waiter.resolve(msg);
        } else {
          this.queue.push(msg);
        }
      });
    });
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(msg));
  }

  /** Wait for a message of a specific type (or any message if type is null) */
  waitFor<T extends ServerMessage = ServerMessage>(type: string, timeoutMs: number = 3000): Promise<T> {
    // Check queue first
    const idx = this.queue.findIndex(m => m.type === type);
    if (idx >= 0) {
      return Promise.resolve(this.queue.splice(idx, 1)[0] as T);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.resolve === resolve as any);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for message type "${type}" after ${timeoutMs}ms. Queue: ${JSON.stringify(this.queue.map(m => m.type))}`));
      }, timeoutMs);

      this.waiters.push({
        type,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg as T);
        },
        reject,
      });
    });
  }

  /** Wait for any next message */
  waitForAny(timeoutMs: number = 3000): Promise<ServerMessage> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.resolve === resolve as any);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for any message after ${timeoutMs}ms`));
      }, timeoutMs);

      this.waiters.push({
        type: null,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject,
      });
    });
  }

  /** Get all buffered messages */
  drain(): ServerMessage[] {
    const msgs = [...this.queue];
    this.queue = [];
    return msgs;
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Reject any pending waiters
    for (const waiter of this.waiters) {
      waiter.reject(new Error('WebSocket closed'));
    }
    this.waiters = [];
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
