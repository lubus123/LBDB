import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => { this.readyState = MockWebSocket.CLOSED; });

  // Helper to simulate events
  simulateOpen() { this.readyState = MockWebSocket.OPEN; this.onopen?.(); }
  simulateMessage(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  simulateClose() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(); }
}

let mockWsInstances: MockWebSocket[] = [];

// Mock window.setTimeout (used by scheduleReconnect via window.setTimeout)
vi.stubGlobal('window', {
  setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
});

function stubDefaultWebSocket() {
  vi.stubGlobal('WebSocket', class extends MockWebSocket {
    constructor(_url: string) {
      super();
      mockWsInstances.push(this);
      // Auto-open after microtask
      setTimeout(() => this.simulateOpen(), 0);
    }
  });
}

function stubDefaultLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  mockWsInstances = [];
  stubDefaultWebSocket();
  stubDefaultLocalStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  // Re-stub window after unstubbing so next beforeEach has it
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('connect()', () => {
  it('creates a WebSocket with the correct URL', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    expect(mockWsInstances).toHaveLength(1);
  });

  it('does not create a second WebSocket if already OPEN', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    // First WS auto-opens via setTimeout(0)
    await vi.runAllTimersAsync();
    expect(mockWsInstances).toHaveLength(1);

    // Calling connect again should not create a new WebSocket (already OPEN)
    socket.connect('ws://localhost:8080');
    expect(mockWsInstances).toHaveLength(1);
  });
});

describe('send()', () => {
  it('sends a JSON-serialised message when connected', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync(); // triggers simulateOpen → onopen

    socket.send({ type: 'roll' });
    expect(mockWsInstances[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'roll' }));
  });

  it('queues the message when not yet connected', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    // Do NOT advance timers — WS is still CONNECTING (readyState = OPEN from
    // constructor but onopen has not fired yet, so the module checks readyState).
    // Override readyState to simulate CONNECTING:
    mockWsInstances[0].readyState = MockWebSocket.CONNECTING;

    socket.send({ type: 'roll' });
    // Should NOT have been sent directly
    expect(mockWsInstances[0].send).not.toHaveBeenCalled();
  });

  it('flushes queued messages when no auth token is present', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    mockWsInstances[0].readyState = MockWebSocket.CONNECTING;

    socket.send({ type: 'roll' });
    socket.send({ type: 'confirm' });

    // Now open the connection
    await vi.runAllTimersAsync();

    expect(mockWsInstances[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'roll' }));
    expect(mockWsInstances[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'confirm' }));
  });
});

describe('onMessage()', () => {
  it('calls handler with the parsed server message', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    const handler = vi.fn();
    socket.onMessage(handler);

    mockWsInstances[0].simulateMessage({ type: 'error', message: 'oops' });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: 'error', message: 'oops' });
  });

  it('stops calling handler after unsubscribe', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    const handler = vi.fn();
    const unsub = socket.onMessage(handler);
    unsub();

    mockWsInstances[0].simulateMessage({ type: 'error', message: 'oops' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores malformed (non-JSON) messages', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    const handler = vi.fn();
    socket.onMessage(handler);

    // Simulate a raw non-JSON message
    mockWsInstances[0].onmessage?.({ data: 'not-json{{' });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('onStatus()', () => {
  it('calls handler with true when connection opens', async () => {
    const socket = await import('./socket');
    const handler = vi.fn();
    socket.onStatus(handler);

    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync(); // triggers simulateOpen

    expect(handler).toHaveBeenCalledWith(true);
  });

  it('calls handler with false when connection closes', async () => {
    const socket = await import('./socket');
    const handler = vi.fn();
    socket.onStatus(handler);

    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    mockWsInstances[0].simulateClose();
    expect(handler).toHaveBeenCalledWith(false);
  });

  it('stops calling handler after unsubscribe', async () => {
    const socket = await import('./socket');
    const handler = vi.fn();
    const unsub = socket.onStatus(handler);
    unsub();

    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();
    mockWsInstances[0].simulateClose();

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('disconnect()', () => {
  it('closes the WebSocket', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    socket.disconnect();
    expect(mockWsInstances[0].close).toHaveBeenCalledOnce();
  });

  it('prevents auto-reconnect after intentional disconnect', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    socket.disconnect();
    mockWsInstances[0].simulateClose(); // simulate close event firing after close()

    // Advance timers well past any reconnect delay
    await vi.runAllTimersAsync();

    // Should still be only 1 WS instance created
    expect(mockWsInstances).toHaveLength(1);
  });

  it('clears all handlers so they are not called after disconnect', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync();

    const msgHandler = vi.fn();
    const statusHandler = vi.fn();
    socket.onMessage(msgHandler);
    socket.onStatus(statusHandler);

    socket.disconnect();

    // These should not throw and the handlers should not be called
    mockWsInstances[0].simulateMessage({ type: 'error', message: 'x' });
    expect(msgHandler).not.toHaveBeenCalled();
    expect(statusHandler).not.toHaveBeenCalled();
  });
});

describe('auto-reconnect', () => {
  it('schedules a reconnect when the connection closes unexpectedly', async () => {
    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync(); // open

    expect(mockWsInstances).toHaveLength(1);

    // Simulate unexpected close (not via disconnect())
    mockWsInstances[0].simulateClose();

    // Advance past the first reconnect delay (1000 * 1.5^0 = 1000ms)
    await vi.advanceTimersByTimeAsync(1100);

    expect(mockWsInstances).toHaveLength(2);
  });

  it('gives up after 10 reconnect attempts', async () => {
    // Use a custom WebSocket that only auto-opens the very first instance.
    // Subsequent reconnect instances stay CONNECTING so onopen never fires
    // and reconnectAttempts never resets to 0.
    let wsCreationCount = 0;
    const localInstances: MockWebSocket[] = [];
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(_url: string) {
        super();
        wsCreationCount++;
        localInstances.push(this);
        mockWsInstances.push(this);
        if (wsCreationCount === 1) {
          // First connection: auto-open so the test has a proper open socket
          setTimeout(() => this.simulateOpen(), 0);
        } else {
          // Reconnect attempts: stay CONNECTING indefinitely
          this.readyState = MockWebSocket.CONNECTING;
        }
      }
    });

    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.advanceTimersByTimeAsync(10); // fire first auto-open

    // Now drive reconnect attempts. Each close triggers scheduleReconnect which
    // increments reconnectAttempts (starts at 0 after onopen reset it).
    // scheduleReconnect bails when attempts >= 10 BEFORE incrementing, so the
    // 11th call is the first to bail → 10 new WS instances created.
    // But new WS stays CONNECTING, so doConnect skips on next reconnect timer.
    // We need to simulate close → new WS created → that WS fails immediately
    // so we close it too... actually, since new WS is CONNECTING, doConnect
    // will not create another one. Instead we directly call simulateClose on
    // each reconnect WS to drive the count up.

    // Simpler: just close, advance timer (fires doConnect → new CONNECTING ws),
    // then close that new CONNECTING ws (set readyState=CLOSED first), repeat.
    for (let attempt = 0; attempt < 10; attempt++) {
      const current = localInstances[localInstances.length - 1];
      // Mark as CLOSED so doConnect will not bail on the next reconnect call
      current.readyState = MockWebSocket.CLOSED;
      current.simulateClose(); // triggers scheduleReconnect
      await vi.advanceTimersByTimeAsync(15000); // fires the reconnect timer → doConnect → new WS
    }

    // 1 initial + 10 reconnects = 11
    expect(localInstances).toHaveLength(11);

    // 11th close: reconnectAttempts is now 10, scheduleReconnect should bail
    const last = localInstances[localInstances.length - 1];
    last.readyState = MockWebSocket.CLOSED;
    last.simulateClose();
    await vi.advanceTimersByTimeAsync(15000);

    expect(localInstances).toHaveLength(11);
  });
});

describe('authenticated message clears queue', () => {
  it('discards pending queue (does not flush) when authenticated message arrives', async () => {
    const socket = await import('./socket');

    // Provide a token so onopen sends auth and does NOT flush the queue
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('my-token');

    socket.connect('ws://localhost:8080');
    // Do not open yet — queue a message while still CONNECTING
    mockWsInstances[0].readyState = MockWebSocket.CONNECTING;
    socket.send({ type: 'roll' });

    // Now open — onopen fires, sends auth, leaves queue intact
    mockWsInstances[0].readyState = MockWebSocket.OPEN;
    mockWsInstances[0].simulateOpen();

    // At this point send() calls directly forwarded (WS open), but 'roll' is
    // still sitting in queue from when the socket was CONNECTING.
    // Reset mock so we can track what happens next cleanly.
    mockWsInstances[0].send.mockClear();

    // Receive authenticated — queue should be CLEARED (not flushed)
    mockWsInstances[0].simulateMessage({
      type: 'authenticated',
      user: { id: 1, username: 'alice' },
    });

    // The queued 'roll' should NOT have been sent out (queue discarded)
    const sentAfterAuth = mockWsInstances[0].send.mock.calls.map(c =>
      JSON.parse(c[0] as string)
    );
    const hasRoll = sentAfterAuth.some((m: { type: string }) => m.type === 'roll');
    expect(hasRoll).toBe(false);
  });
});

describe('auth token sent on connect', () => {
  it('sends an auth message on open if localStorage has dg-token', async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('secret-token');

    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync(); // open

    expect(mockWsInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth', token: 'secret-token' })
    );
  });

  it('does not send an auth message when no token is stored', async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const socket = await import('./socket');
    socket.connect('ws://localhost:8080');
    await vi.runAllTimersAsync(); // open

    const sentCalls = mockWsInstances[0].send.mock.calls.map(c => JSON.parse(c[0] as string));
    const hasAuth = sentCalls.some((m: { type: string }) => m.type === 'auth');
    expect(hasAuth).toBe(false);
  });
});
