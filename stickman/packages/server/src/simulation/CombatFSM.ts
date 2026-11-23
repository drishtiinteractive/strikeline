// packages/server/src/simulation/CombatFSM.ts
/**
 * Authoritative per-player Combat Finite State Machine.
 *
 * States and legal transitions:
 *
 *   IDLE ──────► MOVE          (moveX or moveZ != 0)
 *   IDLE ──────► JUMP          (jump input)
 *   IDLE ──────► ATTACK_LIGHT  (attack = 'light')
 *   IDLE ──────► ATTACK_HEAVY  (attack = 'heavy')
 *   IDLE ──────► BLOCK         (block held)
 *
 *   MOVE ──────► IDLE          (no movement input)
 *   MOVE ──────► JUMP / ATTACK_LIGHT / ATTACK_HEAVY / BLOCK (same as IDLE)
 *
 *   JUMP ──────► IDLE          (land on floor)
 *   JUMP ──────► ATTACK_LIGHT  (airOk=true)
 *
 *   ATTACK_LIGHT / ATTACK_HEAVY ──► IDLE  (startup+active+recovery elapsed)
 *
 *   BLOCK ─────► IDLE          (block released)
 *
 *   * ─────────► HITSTUN       (hit by HitDetection — external call)
 *   HITSTUN ───► IDLE | KO     (hitstunMs countdown reaches 0)
 *
 *   * ─────────► KO            (health reaches 0)
 */
import {
  MOVE_DATA,
  STATE_TO_MOVE,
  ARENA,
  JUMP_VELOCITY,
  MOVE_SPEED,
  SIDESTEP_SPEED,
  STAMINA_REGEN_RATE,
  type CombatState,
  type InputPayload,
} from '@stickman/shared';
import type { PlayerState } from '@stickman/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function transition(player: PlayerState, next: CombatState): void {
  player.combatState    = next;
  player.stateElapsedMs = 0;
  player.attackHit      = false;
  if (next !== 'BLOCK') player.isBlocking = false;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Advance the FSM by `dtMs` milliseconds using the given player input.
 * Mutates `player` in place. Called by FightRoom every simulation tick.
 */
export function tickFSM(
  player: PlayerState,
  input:  InputPayload,
  dtMs:   number,
): void {
  const state = player.combatState as CombatState;

  // Dead players are frozen; only physics (knockback decay) still applies
  if (state === 'KO') return;

  // Advance state timer
  player.stateElapsedMs += dtMs;

  switch (state) {
    // ── Neutral ─────────────────────────────────────────────────────────
    case 'IDLE': {
      _regenStamina(player, dtMs);

      if (input.block) {
        transition(player, 'BLOCK');
      } else if (input.attack === 'light') {
        transition(player, 'ATTACK_LIGHT');
      } else if (input.attack === 'heavy') {
        transition(player, 'ATTACK_HEAVY');
      } else if (input.jump) {
        player.velY = JUMP_VELOCITY;
        transition(player, 'JUMP');
      } else if (input.moveX !== 0 || input.moveZ !== 0) {
        _applyGroundMove(player, input, dtMs);
        transition(player, 'MOVE');
      }
      break;
    }

    // ── Ground movement ──────────────────────────────────────────────────
    case 'MOVE': {
      _regenStamina(player, dtMs);

      if (input.block) {
        transition(player, 'BLOCK');
      } else if (input.attack === 'light') {
        transition(player, 'ATTACK_LIGHT');
      } else if (input.attack === 'heavy') {
        transition(player, 'ATTACK_HEAVY');
      } else if (input.jump) {
        player.velY = JUMP_VELOCITY;
        transition(player, 'JUMP');
      } else if (input.moveX === 0 && input.moveZ === 0) {
        transition(player, 'IDLE');
      } else {
        _applyGroundMove(player, input, dtMs);
      }
      break;
    }

    // ── Airborne ─────────────────────────────────────────────────────────
    case 'JUMP': {
      // Allow air light attacks
      if (input.attack === 'light' && MOVE_DATA.LIGHT_PUNCH.airOk) {
        transition(player, 'ATTACK_LIGHT');
        break;
      }

      // Air horizontal drift
      if (input.moveX !== 0) {
        player.posX = clamp(
          player.posX + input.moveX * MOVE_SPEED * 0.7 * (dtMs / 1000),
          ARENA.leftWallX,
          ARENA.rightWallX,
        );
      }

      // Land detection (physics pre-pass already moved posY)
      if (player.posY <= ARENA.floorY && player.velY <= 0) {
        player.posY = ARENA.floorY;
        player.velY = 0;
        transition(player, input.moveX !== 0 ? 'MOVE' : 'IDLE');
      }
      break;
    }

    // ── Light Attack ─────────────────────────────────────────────────────
    case 'ATTACK_LIGHT': {
      const move = MOVE_DATA.LIGHT_PUNCH;
      const done = move.startup + move.active + move.recovery;
      if (player.stateElapsedMs >= done) {
        transition(player, player.posY > ARENA.floorY ? 'JUMP' : 'IDLE');
      }
      break;
    }

    // ── Heavy Attack ──────────────────────────────────────────────────────
    case 'ATTACK_HEAVY': {
      const move = MOVE_DATA.HEAVY_KICK;
      const done = move.startup + move.active + move.recovery;
      if (player.stateElapsedMs >= done) {
        transition(player, 'IDLE');
      }
      break;
    }

    // ── Block ─────────────────────────────────────────────────────────────
    case 'BLOCK': {
      player.isBlocking = true;
      _regenStamina(player, dtMs * 0.3); // slower regen while guarding

      if (!input.block) {
        player.isBlocking = false;
        transition(player, 'IDLE');
      } else if (player.stamina <= 0) {
        // Guard break — forced into IDLE with no protection
        player.isBlocking = false;
        transition(player, 'IDLE');
      }
      break;
    }

    // ── Hitstun ───────────────────────────────────────────────────────────
    case 'HITSTUN': {
      player.hitstunMs -= dtMs;

      if (player.hitstunMs <= 0) {
        player.hitstunMs = 0;
        transition(player, player.health <= 0 ? 'KO' : 'IDLE');
      }
      break;
    }
  }
}

/**
 * Force a player into HITSTUN (called by HitDetection after a successful hit).
 * @param hitstunMs  Duration of the stun in milliseconds
 * @param knockbackX Horizontal impulse (world-units/s, sign is applied here)
 * @param attackerFacingDir  Attacker's facing direction; knockback pushes away
 */
export function applyHitstun(
  player:            PlayerState,
  hitstunMs:         number,
  knockbackX:        number,
  attackerFacingDir: number,
): void {
  if (player.combatState === 'KO') return;

  player.combatState    = 'HITSTUN';
  player.stateElapsedMs = 0;
  player.hitstunMs      = hitstunMs;
  player.isBlocking     = false;
  player.attackHit      = false;

  // Knockback: push defender away from attacker
  player.velX = attackerFacingDir * knockbackX;

  // A hit that sends someone below zero health → KO when hitstun expires
  // Health is set by HitDetection before this call
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _applyGroundMove(
  player: PlayerState,
  input:  InputPayload,
  dtMs:   number,
): void {
  const dtSec = dtMs / 1000;
  if (input.moveX !== 0) {
    player.posX = clamp(
      player.posX + input.moveX * MOVE_SPEED * dtSec,
      ARENA.leftWallX,
      ARENA.rightWallX,
    );
    player.facingDir = input.moveX > 0 ? 1 : -1;
  }
  if (input.moveZ !== 0) {
    player.posZ = clamp(
      player.posZ + input.moveZ * SIDESTEP_SPEED * dtSec,
      ARENA.backWallZ,
      ARENA.frontWallZ,
    );
  }
}

function _regenStamina(player: PlayerState, dtMs: number): void {
  if (player.stamina < 100) {
    player.stamina = Math.min(
      100,
      player.stamina + (STAMINA_REGEN_RATE * dtMs) / 1000,
    );
  }
}

// Re-export convenience accessor used by HitDetection
export { STATE_TO_MOVE };

// Expose for tests
export { transition as _transitionForTest };
