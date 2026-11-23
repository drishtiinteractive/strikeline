// packages/server/src/index.ts
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { FightRoom } from './rooms/FightRoom.js';
import { privateRoomRegistry } from './registry.js';

const PORT = Number(process.env.PORT ?? 2567);

async function main(): Promise<void> {
  const app    = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  // ── Colyseus server ────────────────────────────────────────────────────────
  const gameServer = new Server({
    transport: new WebSocketTransport({ server }),
  });

  /**
   * Register one room type with filterBy(['mode']) so quick-match players
   * are never accidentally routed into a private room.
   *
   * Quick match : joinOrCreate('fight', { mode: 'quick' })
   * Private room: create('fight', { mode: 'private' })  → receive room_code msg
   * Join private: joinById(roomId)                       → after resolving code
   */
  gameServer.define('fight', FightRoom).filterBy(['mode']);

  // ── REST API ───────────────────────────────────────────────────────────────

  /** Health check */
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  /**
   * Resolve a 4-character private room code to a Colyseus room ID.
   *
   * GET /api/rooms/:code
   * → 200 { roomId: string }
   * → 404 { error: 'Room not found' }
   *
   * Client flow:
   *   1. P1 creates private room → receives ROOM_CODE message
   *   2. P1 shares the 4-char code (out-of-band)
   *   3. P2 calls GET /api/rooms/CODE → gets roomId
   *   4. P2 calls client.joinById(roomId)
   */
  app.get('/api/rooms/:code', (req, res) => {
    const code   = req.params.code?.toUpperCase();
    const roomId = privateRoomRegistry.get(code);
    if (!roomId) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    return res.json({ roomId });
  });

  // Colyseus Monitor Dashboard
  app.use('/colyseus', monitor());

  // ── Start ──────────────────────────────────────────────────────────────────
  await gameServer.listen(PORT);
  console.log(`✅  Stickman game server  →  ws://localhost:${PORT}`);
  console.log(`📊  Colyseus monitor     →  http://localhost:${PORT}/colyseus`);
  console.log(`🔗  Private room API     →  GET http://localhost:${PORT}/api/rooms/:code`);
}

main().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
