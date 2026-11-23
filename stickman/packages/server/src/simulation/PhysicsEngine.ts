// packages/server/src/simulation/PhysicsEngine.ts
/**
 * Stateless physics tick — runs every server frame BEFORE the FSM.
 * Applies gravity, knockback decay, and arena boundary clamping.
 * Does NOT touch combat state; that is exclusively the FSM's job.
 */
import {
  ARENA,
  GRAVITY,
  KNOCKBACK_FRICTION,
  MIN_PLAYER_SEPARATION,
} from '@stickman/shared';
import type { PlayerState } from '@stickman/shared';

export function applyPhysics(player: PlayerState, dtMs: number): void {
  const dtSec = dtMs / 1000;

  // ── Vertical physics (gravity + floor clamping) ──────────────────────────
  // Apply gravity to any airborne player (FSM for JUMP sets velY on takeoff).
  if (player.posY > ARENA.floorY || player.velY > 0) {
    player.velY -= GRAVITY * dtSec;
    player.posY += player.velY * dtSec;
  }

  if (player.posY <= ARENA.floorY) {
    player.posY = ARENA.floorY;
    player.velY = 0;
  }

  // ── Horizontal knockback decay ────────────────────────────────────────────
  if (player.velX !== 0) {
    player.posX  += player.velX * dtSec;
    player.velX  *= KNOCKBACK_FRICTION;
    if (Math.abs(player.velX) < 0.05) player.velX = 0;
  }

  // ── Z velocity decay (sidestep momentum) ─────────────────────────────────
  if (player.velZ !== 0) {
    player.posZ  += player.velZ * dtSec;
    player.velZ  *= 0.80;
    if (Math.abs(player.velZ) < 0.02) player.velZ = 0;
  }

  // ── Arena boundary clamp ──────────────────────────────────────────────────
  player.posX = clamp(player.posX, ARENA.leftWallX,  ARENA.rightWallX);
  player.posZ = clamp(player.posZ, ARENA.backWallZ,   ARENA.frontWallZ);
  player.posY = Math.max(player.posY, ARENA.floorY);
}

/**
 * Push two players apart when they overlap on the X axis.
 * This prevents players from walking through each other.
 */
export function resolvePushApart(a: PlayerState, b: PlayerState): void {
  const overlap = MIN_PLAYER_SEPARATION - Math.abs(b.posX - a.posX);
  if (overlap <= 0) return;

  const half = overlap / 2;
  if (a.posX < b.posX) {
    a.posX = clamp(a.posX - half, ARENA.leftWallX,  ARENA.rightWallX);
    b.posX = clamp(b.posX + half, ARENA.leftWallX,  ARENA.rightWallX);
  } else {
    a.posX = clamp(a.posX + half, ARENA.leftWallX,  ARENA.rightWallX);
    b.posX = clamp(b.posX - half, ARENA.leftWallX,  ARENA.rightWallX);
  }
}

/**
 * Update each player's facing direction to track the opponent.
 * Not applied during attack or KO states.
 */
export function autoFace(player: PlayerState, opponent: PlayerState): void {
  const noAutoFaceStates = new Set(['ATTACK_LIGHT', 'ATTACK_HEAVY', 'KO', 'HITSTUN']);
  if (noAutoFaceStates.has(player.combatState)) return;
  if (Math.abs(opponent.posX - player.posX) < 0.01) return;
  player.facingDir = opponent.posX > player.posX ? 1 : -1;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
