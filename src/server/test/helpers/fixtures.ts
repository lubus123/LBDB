import type { Server } from 'http';
import { createAppServer } from '../../index';
import { TestWsClient } from './ws-client';
import type { DiceRoller } from '../../GameRoom';

/** Start a test server on a random port */
export async function setupGameServer(): Promise<{ port: number; cleanup: () => Promise<void>; server: ReturnType<typeof createAppServer> }> {
  const server = createAppServer();

  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, () => resolve());
  });

  const port = (server.httpServer.address() as any).port as number;

  return {
    port,
    server,
    cleanup: async () => {
      // Close all WebSocket connections
      server.wss.clients.forEach((client) => client.close());
      // Close the HTTP server
      await new Promise<void>((resolve, reject) => {
        server.httpServer.close((err) => err ? reject(err) : resolve());
      });
    },
  };
}

/** Connect two players and create a game, returning both clients and the game ID */
export async function createTwoPlayerGame(port: number): Promise<{
  white: TestWsClient;
  black: TestWsClient;
  gameId: string;
}> {
  const white = new TestWsClient(port);
  const black = new TestWsClient(port);
  await Promise.all([white.connect(), black.connect()]);

  // White creates game
  white.send({ type: 'create' });
  const created = await white.waitFor<any>('game_created');
  const gameId = created.gameId;

  // Black joins
  black.send({ type: 'join', gameId });

  // Both receive game_start
  await Promise.all([
    white.waitFor('game_start'),
    black.waitFor('game_start'),
  ]);

  return { white, black, gameId };
}

/** Create a deterministic dice roller from a sequence of preset rolls */
export function fixedDice(...rolls: [number, number][]): DiceRoller {
  let index = 0;
  return () => {
    if (index >= rolls.length) {
      throw new Error(`fixedDice exhausted: expected at most ${rolls.length} rolls, got call #${index + 1}`);
    }
    return rolls[index++];
  };
}
