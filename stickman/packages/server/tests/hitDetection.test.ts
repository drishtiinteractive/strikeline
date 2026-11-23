// packages/server/tests/hitDetection.test.ts
/**
 * Unit tests for 3D hitbox / hurtbox collision detection, damage calculation,
 * block mechanics, guard-break, and the attackHit deduplication flag.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerState } from '@stickman/shared';
import { MOVE_DATA, HITBOX_GEOMETRY, HURTBOX_EXTENT, HURTBOX_OFFSET_Y } from '@stickman/shared';
import {
  checkHit,
  getHitbox,
  getHurtbox,
  aabbOverlap,
} from '../src/simulation/HitDetection.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  const p = new PlayerState();
  p.id           = overrides.id           ?? 'player-a';
  p.posX         = overrides.posX         ?? 0;
  p.posY         = overrides.posY         ?? 0;
  p.posZ         = overrides.posZ         ?? 0;
  p.facingDir    = overrides.facingDir    ?? 1;
  p.combatState  = overrides.combatState  ?? 'IDLE';
  p.stateElapsedMs = overrides.stateElapsedMs ?? 0;
  p.health       = overrides.health       ?? 1000;
  p.stamina      = overrides.stamina      ?? 100;
  p.isBlocking   = overrides.isBlocking   ?? false;
  p.attackHit    = overrides.attackHit    ?? false;
  return p;
}

/** Put attacker squarely in the ACTIVE window of LIGHT_PUNCH */
function inActiveWindow(player: PlayerState, move: 'LIGHT_PUNCH' | 'HEAVY_KICK' = 'LIGHT_PUNCH'): void {
  const data = MOVE_DATA[move];
  player.stateElapsedMs = data.startup + data.active / 2;
  player.combatState    = data.state;
}

/** Position defender so their hurtbox overlaps the attacker's hitbox */
function placeInRange(attacker: PlayerState, defender: PlayerState): void {
  // attacker faces right (+1); place defender 1.2 units to the right
  defender.posX = attacker.posX + attacker.facingDir * 1.2;
  defender.posY = attacker.posY;
  defender.posZ = attacker.posZ;
}

/** Position defender out of hitbox range */
function placeOutOfRange(attacker: PlayerState, defender: PlayerState): void {
  defender.posX = attacker.posX + attacker.facingDir * 8;
}

// ── AABB helpers ─────────────────────────────────────────────────────────────

describe('aabbOverlap', () => {
  it('returns true for two overlapping boxes', () => {
    expect(aabbOverlap(
      { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 },
      { minX: 1, maxX: 3, minY: 1, maxY: 3, minZ: 1, maxZ: 3 },
    )).toBe(true);
  });

  it('returns false for non-overlapping boxes (X gap)', () => {
    expect(aabbOverlap(
      { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
      { minX: 2, maxX: 3, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    )).toBe(false);
  });

  it('returns false for non-overlapping boxes (Y gap)', () => {
    expect(aabbOverlap(
      { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
      { minX: 0, maxX: 1, minY: 2, maxY: 3, minZ: 0, maxZ: 1 },
    )).toBe(false);
  });

  it('returns true for touching boxes (edge contact)', () => {
    expect(aabbOverlap(
      { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
      { minX: 1, maxX: 2, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    )).toBe(true);
  });
});

// ── Hurtbox geometry ──────────────────────────────────────────────────────────

describe('getHurtbox', () => {
  it('is centred on the player position with correct offsets', () => {
    const p = makePlayer({ posX: 2, posY: 0, posZ: -1 });
    const box = getHurtbox(p);
    expect(box.minX).toBeCloseTo(2 - HURTBOX_EXTENT.x);
    expect(box.maxX).toBeCloseTo(2 + HURTBOX_EXTENT.x);
    expect(box.minY).toBeCloseTo(HURTBOX_OFFSET_Y - HURTBOX_EXTENT.y);
    expect(box.maxY).toBeCloseTo(HURTBOX_OFFSET_Y + HURTBOX_EXTENT.y);
    expect(box.minZ).toBeCloseTo(-1 - HURTBOX_EXTENT.z);
    expect(box.maxZ).toBeCloseTo(-1 + HURTBOX_EXTENT.z);
  });
});

// ── Hit detection ─────────────────────────────────────────────────────────────

describe('checkHit — basic registration', () => {
  let attacker: PlayerState;
  let defender: PlayerState;

  beforeEach(() => {
    attacker = makePlayer({ id: 'a', posX: 0, facingDir: 1 });
    defender = makePlayer({ id: 'b' });
  });

  it('returns null when attacker is in IDLE state', () => {
    attacker.combatState = 'IDLE';
    placeInRange(attacker, defender);
    expect(checkHit(attacker, defender)).toBeNull();
  });

  it('returns null during startup frames (before active window)', () => {
    attacker.combatState    = 'ATTACK_LIGHT';
    attacker.stateElapsedMs = MOVE_DATA.LIGHT_PUNCH.startup / 2; // mid-startup
    placeInRange(attacker, defender);
    expect(checkHit(attacker, defender)).toBeNull();
  });

  it('returns null during recovery frames (after active window)', () => {
    const lp = MOVE_DATA.LIGHT_PUNCH;
    attacker.combatState    = 'ATTACK_LIGHT';
    attacker.stateElapsedMs = lp.startup + lp.active + 10; // into recovery
    placeInRange(attacker, defender);
    expect(checkHit(attacker, defender)).toBeNull();
  });

  it('returns null when defender is out of hitbox range', () => {
    inActiveWindow(attacker);
    placeOutOfRange(attacker, defender);
    expect(checkHit(attacker, defender)).toBeNull();
  });

  it('registers a hit during active frames with overlapping hurtbox', () => {
    inActiveWindow(attacker);
    placeInRange(attacker, defender);
    const result = checkHit(attacker, defender);
    expect(result).not.toBeNull();
    expect(result!.attackerId).toBe('a');
    expect(result!.defenderId).toBe('b');
    expect(result!.damage).toBeGreaterThan(0);
  });

  it('applies correct damage to defender health', () => {
    inActiveWindow(attacker);
    placeInRange(attacker, defender);
    const result = checkHit(attacker, defender);
    expect(defender.health).toBe(1000 - result!.damage);
  });

  it('sets attackHit flag on attacker to prevent double-hit', () => {
    inActiveWindow(attacker);
    placeInRange(attacker, defender);
    checkHit(attacker, defender);
    expect(attacker.attackHit).toBe(true);
  });

  it('returns null on the second check in the same active window (attackHit guard)', () => {
    inActiveWindow(attacker);
    placeInRange(attacker, defender);
    checkHit(attacker, defender);        // first hit — lands
    const second = checkHit(attacker, defender); // same tick second check
    expect(second).toBeNull();
  });

  it('puts defender into HITSTUN after a successful hit', () => {
    inActiveWindow(attacker);
    placeInRange(attacker, defender);
    checkHit(attacker, defender);
    expect(defender.combatState).toBe('HITSTUN');
    expect(defender.hitstunMs).toBeGreaterThan(0);
  });

  it('returns null when defender is already KO', () => {
    inActiveWindow(attacker);
    placeInRange(attacker, defender);
    defender.combatState = 'KO';
    expect(checkHit(attacker, defender)).toBeNull();
  });
});

// ── Heavy kick ────────────────────────────────────────────────────────────────

describe('checkHit — HEAVY_KICK', () => {
  it('deals more damage than light punch', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    const d = makePlayer({ id: 'b' });
    inActiveWindow(a, 'HEAVY_KICK');
    placeInRange(a, d);

    const result = checkHit(a, d);
    expect(result).not.toBeNull();
    expect(result!.damage).toBeGreaterThan(MOVE_DATA.LIGHT_PUNCH.damage);
  });

  it('inflicts longer hitstun than light punch', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    const d = makePlayer({ id: 'b' });
    inActiveWindow(a, 'HEAVY_KICK');
    placeInRange(a, d);
    checkHit(a, d);
    expect(d.hitstunMs).toBeGreaterThan(MOVE_DATA.LIGHT_PUNCH.hitstunMs);
  });
});

// ── Block mechanics ───────────────────────────────────────────────────────────

describe('checkHit — blocking and guard mechanics', () => {
  it('reduces damage by 80% when defender is blocking with stamina', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    const d = makePlayer({ id: 'b', isBlocking: true, stamina: 100 });
    d.combatState = 'BLOCK';

    inActiveWindow(a);
    placeInRange(a, d);
    const result = checkHit(a, d);

    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.guardBroken).toBe(false);

    const expectedChip = Math.ceil(MOVE_DATA.LIGHT_PUNCH.damage * 0.20);
    expect(result!.damage).toBe(expectedChip);
  });

  it('drains stamina on a blocked hit', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    const d = makePlayer({ id: 'b', isBlocking: true, stamina: 100 });
    d.combatState = 'BLOCK';

    inActiveWindow(a);
    placeInRange(a, d);
    checkHit(a, d);

    expect(d.stamina).toBeLessThan(100);
  });

  it('causes guard break and full damage when stamina is depleted', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    // Stamina so low that any hit breaks the guard
    const d = makePlayer({ id: 'b', isBlocking: true, stamina: 1 });
    d.combatState = 'BLOCK';

    inActiveWindow(a);
    placeInRange(a, d);
    const result = checkHit(a, d);

    expect(result).not.toBeNull();
    expect(result!.guardBroken).toBe(true);
    expect(result!.blocked).toBe(false);
    expect(result!.damage).toBe(MOVE_DATA.LIGHT_PUNCH.damage);
  });

  it('guard break puts defender into HITSTUN', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    const d = makePlayer({ id: 'b', isBlocking: true, stamina: 1 });
    d.combatState = 'BLOCK';

    inActiveWindow(a);
    placeInRange(a, d);
    checkHit(a, d);

    expect(d.combatState).toBe('HITSTUN');
  });

  it('blocked hit does NOT put defender into HITSTUN (no guard break)', () => {
    const a = makePlayer({ id: 'a', facingDir: 1 });
    const d = makePlayer({ id: 'b', isBlocking: true, stamina: 100 });
    d.combatState = 'BLOCK';

    inActiveWindow(a);
    placeInRange(a, d);
    checkHit(a, d);

    // Defender should still be in BLOCK, not HITSTUN
    expect(d.combatState).toBe('BLOCK');
  });
});

// ── Knockback direction ───────────────────────────────────────────────────────

describe('checkHit — knockback direction', () => {
  it('pushes defender in the same direction the attacker is facing', () => {
    const a = makePlayer({ id: 'a', posX: 0, facingDir: 1 });
    const d = makePlayer({ id: 'b', posX: 1.2 });
    inActiveWindow(a);
    checkHit(a, d);
    // velX should be positive (pushed right, away from left-facing attacker)
    expect(d.velX).toBeGreaterThan(0);
  });

  it('pushes defender to the left when attacker faces left', () => {
    const a = makePlayer({ id: 'a', posX: 2, facingDir: -1 });
    const d = makePlayer({ id: 'b', posX: 0.8 });
    inActiveWindow(a);
    checkHit(a, d);
    expect(d.velX).toBeLessThan(0);
  });
});
