// packages/shared/src/framedata/moves.ts
import type { FrameData, MoveId } from '../types/combat.js';

/**
 * Frame data for all moves at 60 Hz (1 frame ≈ 16.67 ms).
 *
 * Move          | Startup | Active | Recovery | Total  | Dmg | KB   | Hitstun
 * --------------|---------|--------|----------|--------|-----|------|--------
 * LIGHT_PUNCH   |  67ms   | 100ms  |  183ms   | 350ms  |  60 | 180  | 320ms
 * HEAVY_KICK    | 183ms   | 150ms  |  350ms   | 683ms  | 150 | 480  | 620ms
 * DASH          |  50ms   | 200ms  |  100ms   | 350ms  |   0 |   0  |   0ms
 * BLOCK         |  83ms   |   ∞    |  100ms   |   ∞    |   0 |   0  |   0ms
 */
export const MOVE_DATA: Record<MoveId, FrameData> = {
  LIGHT_PUNCH: {
    state:      'ATTACK_LIGHT',
    startup:    67,
    active:     100,
    recovery:   183,
    damage:     60,
    knockbackX: 180,
    hitstunMs:  320,
    airOk:      true,
  },
  HEAVY_KICK: {
    state:      'ATTACK_HEAVY',
    startup:    183,
    active:     150,
    recovery:   350,
    damage:     150,
    knockbackX: 480,
    hitstunMs:  620,
    airOk:      false,
  },
  DASH: {
    state:      'MOVE',
    startup:    50,
    active:     200,
    recovery:   100,
    damage:     0,
    knockbackX: 0,
    hitstunMs:  0,
    airOk:      false,
  },
  BLOCK: {
    state:      'BLOCK',
    startup:    83,
    active:     -1,  // indefinite while held
    recovery:   100,
    damage:     0,
    knockbackX: 0,
    hitstunMs:  0,
    airOk:      false,
  },
};

/** Map combat state → MoveId (for hitbox / frame-data lookup) */
export const STATE_TO_MOVE: Partial<Record<string, MoveId>> = {
  ATTACK_LIGHT: 'LIGHT_PUNCH',
  ATTACK_HEAVY: 'HEAVY_KICK',
};

/**
 * Hitbox geometry for each attack move.
 * Origin: attacker's posX + facingDir * (hurtboxHalfW + extentX / 2)
 *
 * extentX/Y/Z: full size of the hitbox AABB in each axis.
 * offsetY: how high above posY the hitbox centre sits.
 */
export const HITBOX_GEOMETRY: Partial<Record<MoveId, {
  extentX: number;
  extentY: number;
  extentZ: number;
  offsetY: number;   // above posY
}>> = {
  LIGHT_PUNCH: { extentX: 1.4, extentY: 1.0, extentZ: 1.2, offsetY: 1.2 },
  HEAVY_KICK:  { extentX: 1.8, extentY: 1.2, extentZ: 1.4, offsetY: 0.8 },
};

/** Hurtbox (body) half-extents for all players — a standing capsule approximated as AABB */
export const HURTBOX_EXTENT = { x: 0.4, y: 1.0, z: 0.3 };
/** Hurtbox centre offset above posY */
export const HURTBOX_OFFSET_Y = 1.0;
