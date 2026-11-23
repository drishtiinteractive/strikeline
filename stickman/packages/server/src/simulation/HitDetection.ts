// packages/server/src/simulation/HitDetection.ts
/**
 * 3D Axis-Aligned Bounding Box hit detection.
 *
 * Every server tick, for each pair (attacker, defender):
 *   1. Is the attacker in an attack state?
 *   2. Are they in the ACTIVE frames window?
 *   3. Has this swing already registered (attackHit flag)?
 *   4. Do the hitbox and hurtbox overlap in 3D?
 *   5. If yes → compute damage (considering block / guard-break), apply state.
 */
import {
  MOVE_DATA,
  HITBOX_GEOMETRY,
  HURTBOX_EXTENT,
  HURTBOX_OFFSET_Y,
  STATE_TO_MOVE,
  BLOCK_CHIP_MULT,
  STAMINA_COST_LIGHT,
  STAMINA_COST_HEAVY,
  type AABB,
  type HitResult,
  type MoveId,
} from '@stickman/shared';
import type { PlayerState } from '@stickman/shared';
import { applyHitstun } from './CombatFSM.js';

// ─── AABB helpers ─────────────────────────────────────────────────────────────

export function getHurtbox(p: PlayerState): AABB {
  return {
    minX: p.posX - HURTBOX_EXTENT.x,
    maxX: p.posX + HURTBOX_EXTENT.x,
    minY: p.posY + HURTBOX_OFFSET_Y - HURTBOX_EXTENT.y,
    maxY: p.posY + HURTBOX_OFFSET_Y + HURTBOX_EXTENT.y,
    minZ: p.posZ - HURTBOX_EXTENT.z,
    maxZ: p.posZ + HURTBOX_EXTENT.z,
  };
}

export function getHitbox(attacker: PlayerState, moveId: MoveId): AABB | null {
  const geo = HITBOX_GEOMETRY[moveId];
  if (!geo) return null;

  const hx = attacker.posX + attacker.facingDir * (HURTBOX_EXTENT.x + geo.extentX / 2);
  const hy = attacker.posY + geo.offsetY;
  const hz = attacker.posZ;

  return {
    minX: hx - geo.extentX / 2,
    maxX: hx + geo.extentX / 2,
    minY: hy - geo.extentY / 2,
    maxY: hy + geo.extentY / 2,
    minZ: hz - geo.extentZ / 2,
    maxZ: hz + geo.extentZ / 2,
  };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
  );
}

// ─── Main detection function ──────────────────────────────────────────────────

/**
 * Check if `attacker`'s hitbox overlaps `defender`'s hurtbox this tick.
 *
 * Returns a fully-computed `HitResult` (and mutates both players' states)
 * if a hit is registered, or `null` otherwise.
 */
export function checkHit(
  attacker: PlayerState,
  defender: PlayerState,
): HitResult | null {
  // 1. Attacker must be in an attack state
  const moveId = STATE_TO_MOVE[attacker.combatState] as MoveId | undefined;
  if (!moveId) return null;

  // 2. Must be in active frames
  const move = MOVE_DATA[moveId];
  const activeStart = move.startup;
  const activeEnd   = move.startup + move.active;
  if (attacker.stateElapsedMs < activeStart || attacker.stateElapsedMs > activeEnd) {
    return null;
  }

  // 3. Each swing only registers one hit
  if (attacker.attackHit) return null;

  // 4. Defender must not already be KO
  if (defender.combatState === 'KO') return null;

  // 5. 3D hitbox / hurtbox AABB overlap
  const hitbox  = getHitbox(attacker, moveId);
  if (!hitbox) return null;

  const hurtbox = getHurtbox(defender);
  if (!aabbOverlap(hitbox, hurtbox)) return null;

  // ── Hit confirmed ─────────────────────────────────────────────────────────
  attacker.attackHit = true;

  const isBlocking = defender.isBlocking && defender.combatState === 'BLOCK';

  let damage: number;
  let guardBroken = false;

  if (isBlocking) {
    const staminaCost = moveId === 'HEAVY_KICK' ? STAMINA_COST_HEAVY : STAMINA_COST_LIGHT;
    const newStamina  = defender.stamina - staminaCost;

    if (newStamina <= 0) {
      // Guard break: full damage, full hitstun
      guardBroken      = true;
      damage           = move.damage;
      defender.stamina = 0;
    } else {
      // Successful block: chip damage only
      damage           = Math.ceil(move.damage * BLOCK_CHIP_MULT);
      defender.stamina = Math.round(newStamina);
    }
  } else {
    damage = move.damage;
  }

  const newHealth = Math.max(0, defender.health - damage);
  defender.health = newHealth;

  // Apply hitstun (skip if guard was not broken — blocked hits have minimal stun)
  if (!isBlocking || guardBroken) {
    applyHitstun(
      defender,
      guardBroken ? move.hitstunMs * 1.5 : move.hitstunMs,
      move.knockbackX / 100,
      attacker.facingDir,
    );
  }

  return {
    attackerId:  attacker.id,
    defenderId:  defender.id,
    moveId,
    damage,
    knockbackX:  move.knockbackX,
    hitstunMs:   move.hitstunMs,
    newHealth,
    blocked:     isBlocking && !guardBroken,
    guardBroken,
  };
}
