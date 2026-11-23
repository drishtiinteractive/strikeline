// packages/shared/src/types/arena.ts

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

export interface ArenaDimensions {
  /** Total width in world units (X axis: leftWallX to rightWallX) */
  width:        number;
  /** Total depth in world units (Z axis: 2.5D lane) */
  depth:        number;
  floorY:       number;
  ceilingY:     number;
  leftWallX:    number;
  rightWallX:   number;
  frontWallZ:   number;
  backWallZ:    number;
  spawnPoints:  [SpawnPoint, SpawnPoint];
}

export const ARENA: ArenaDimensions = {
  width:       20,
  depth:       4,
  floorY:      0,
  ceilingY:    12,
  leftWallX:  -10,
  rightWallX:  10,
  frontWallZ:  2,
  backWallZ:  -2,
  spawnPoints: [
    { x: -4, y: 0, z: 0 },   // P1
    { x:  4, y: 0, z: 0 },   // P2
  ],
};

// ── Physics constants ────────────────────────────────────────────────────────

/** Gravity (world-units / s²) */
export const GRAVITY             = 28;

/** Initial vertical velocity when jumping (world-units / s) */
export const JUMP_VELOCITY       = 14;

/** Horizontal ground movement speed (world-units / s) */
export const MOVE_SPEED          = 6;

/** Z-depth sidestep speed (world-units / s) */
export const SIDESTEP_SPEED      = 4;

/** Friction applied to velX per frame (multiplier, 0-1) */
export const KNOCKBACK_FRICTION  = 0.78;

/** Stamina regen per second when not blocking */
export const STAMINA_REGEN_RATE  = 15;

/** Stamina cost per blocked light hit */
export const STAMINA_COST_LIGHT  = 10;

/** Stamina cost per blocked heavy hit */
export const STAMINA_COST_HEAVY  = 25;

/** Block damage multiplier (1 − 0.8 = 20% chip damage passes through) */
export const BLOCK_CHIP_MULT     = 0.20;

/** Players must be at least this far apart on X (push-apart threshold) */
export const MIN_PLAYER_SEPARATION = 0.6;
