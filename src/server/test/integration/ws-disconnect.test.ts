import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import { setupTestDb, cleanDb, teardownTestDb } from '../helpers/db';
import { setupGameServer, createTwoPlayerGame } from '../helpers/fixtures';
import { TestWsClient } from '../helpers/ws-client';

describe('WebSocket Disconnect/Reconnect', () => {
  let port: number;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    await setupTestDb();
    const server = await setupGameServer();
    port = server.port;
    cleanup = server.cleanup;
  });

  afterAll(async () => {
    await cleanup();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  it('opponent notified on disconnect', async () => {
    const { white, black } = await createTwoPlayerGame(port);

    white.close();
    const msg = await black.waitFor<any>('opponent_disconnected');
    expect(msg.type).toBe('opponent_disconnected');

    black.close();
  });

  it('error when sending action outside a game', async () => {
    const client = new TestWsClient(port);
    await client.connect();
    client.send({ type: 'roll' });
    const err = await client.waitFor<any>('error');
    expect(err.message).toContain('Not in a game');
    client.close();
  });
});
