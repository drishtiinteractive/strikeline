// packages/client/src/main.ts
import { Client } from 'colyseus.js';
import { ClientMsg, ServerMsg, type HitEvent, type RoundResultEvent } from '@stickman/shared';
import type { MatchState } from '@stickman/shared';
import { createArenaScene }  from './scene/ArenaScene.js';
import { createStickmanMesh } from './scene/StickmanMesh.js';
import { InputManager }     from './game/InputManager.js';
import { GameLoop }         from './game/GameLoop.js';
import { reconcilePosition } from './game/Reconciler.js';
import { HUD }              from './ui/HUD.js';
import * as THREE from 'three';

// ── Config ──────────────────────────────────────────────────────────────────
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';
const COLORS = [0x44aaff, 0xff4444];

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const container = document.getElementById('canvas-container')!;
  const hudEl     = document.getElementById('hud')!;

  const { scene, camera, renderer } = createArenaScene(container);
  const hud     = new HUD(hudEl);
  const input   = new InputManager();

  // ── Colyseus ──────────────────────────────────────────────────────────────
  const colyseusClient = new Client(SERVER_URL);

  console.log('🔌 Connecting to server…');
  const room = await colyseusClient.joinOrCreate<MatchState>('fight');
  const myId  = room.sessionId;
  console.log(`✅ Joined room ${room.id} as ${myId}`);

  // Map sessionId → Three.js group
  const meshMap = new Map<string, THREE.Group>();
  let colorIdx  = 0;

  room.state.players.onAdd((player, sessionId) => {
    const color = COLORS[colorIdx++ % COLORS.length];
    const mesh  = createStickmanMesh(color);
    mesh.position.set(player.posX, player.posY, player.posZ);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshMap.set(sessionId, mesh);
  });

  room.state.players.onRemove((_player, sessionId) => {
    const mesh = meshMap.get(sessionId);
    if (mesh) { scene.remove(mesh); meshMap.delete(sessionId); }
  });

  // Discrete events
  room.onMessage(ServerMsg.HIT, (evt: HitEvent) => {
    // Flash screen on hit
    if (evt.defenderId === myId) screenFlash(renderer);
  });

  room.onMessage(ServerMsg.ROUND_RESULT, (evt: RoundResultEvent) => {
    const msg = evt.winnerId === myId ? '🏆 YOU WIN' : evt.reason === 'KO' ? 'KO!' : 'TIME!';
    hud.showStatus(msg, 2500);
  });

  room.onMessage(ServerMsg.PHASE_CHANGE, ({ phase }: { phase: string }) => {
    if (phase === 'COUNTDOWN')  hud.showStatus('READY?', 1000);
    if (phase === 'FIGHTING')   hud.showStatus('FIGHT!', 800);
    if (phase === 'MATCH_END')  hud.showStatus('MATCH OVER', 4000);
  });

  // Signal ready
  room.send(ClientMsg.READY);

  // ── Game loop ─────────────────────────────────────────────────────────────
  const loop = new GameLoop((dt, tick) => {
    // Sample + send input
    const payload = input.sample(tick);
    room.send(ClientMsg.INPUT, payload);

    // Reconcile all players
    for (const [sessionId, mesh] of meshMap) {
      const serverPlayer = room.state.players.get(sessionId);
      if (serverPlayer) reconcilePosition(mesh, serverPlayer);
    }

    // Update HUD
    hud.update(room.state, myId);

    renderer.render(scene, camera);
  });

  loop.start();
}

/** Brief red vignette flash on the renderer domElement */
function screenFlash(renderer: THREE.WebGLRenderer): void {
  const el = renderer.domElement;
  el.style.transition = 'none';
  el.style.outline    = '6px solid rgba(255,0,0,0.6)';
  setTimeout(() => {
    el.style.transition = 'outline 0.3s';
    el.style.outline    = '6px solid rgba(255,0,0,0)';
  }, 80);
}

main().catch((err) => {
  console.error('Fatal:', err);
  document.body.innerHTML = `<pre style="color:red;padding:2rem">${err}</pre>`;
});
