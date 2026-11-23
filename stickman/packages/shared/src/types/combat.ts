// packages/shared/src/types/combat.ts

export type CombatState =
  | 'IDLE'
  | 'MOVE'
  | 'JUMP'
  | 'ATTACK_LIGHT'
  | 'ATTACK_HEAVY'
  | 'BLOCK'
  | 'HITSTUN'
  | 'KO';

export type MoveId = 'LIGHT_PUNCH' | 'HEAVY_KICK' | 'DASH' | 'BLOCK';

export type RoundEndReason = 'KO' | 'TIME_UP' | 'FORFEIT' | 'DRAW';

export interface FrameData {
  /** State name this frame data maps to */
  state: CombatState;
  /** Time before active frames begin (ms) */
  startup: number;
  /** Time hitbox is active (ms). -1 = indefinite (BLOCK) */
  active: number;
  /** Time after active frames until IDLE (ms) */
  recovery: number;
  /** Raw damage dealt on hit */
  damage: number;
  /** Horizontal knockback impulse (world-units/s) */
  knockbackX: number;
  /** Hitstun inflicted on opponent (ms) */
  hitstunMs: number;
  /** Whether this move can be used in the air */
  airOk: boolean;
}

export interface HitResult {
  attackerId:  string;
  defenderId:  string;
  moveId:      MoveId;
  damage:      number;
  knockbackX:  number;
  hitstunMs:   number;
  newHealth:   number;
  blocked:     boolean;
  guardBroken: boolean;
}

/** 3D Axis-Aligned Bounding Box */
export interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}
