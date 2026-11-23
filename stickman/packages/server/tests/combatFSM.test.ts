// packages/server/tests/combatFSM.test.ts
/**
 * Unit tests for the combat state machine:
 *   - State transitions on input
 *   - Frame-data-driven attack completion
 *   - Hitstun countdown and IDLE recovery
 *   - KO transition when health is 0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerState } from '@stickman/shared';
import { MOVE_DATA } from '@stickman/shared';
import { tickFSM, applyHitstun } from '../src/simulation/CombatFSM.js';
import type { InputPayload } from '@stickman/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  const p = new PlayerState();
  p.id             = overrides.id             ?? 'p';
  p.posX           = overrides.posX           ?? 0;
  p.posY           = overrides.posY           ?? 0;
  p.posZ           = overrides.posZ           ?? 0;
  p.velX           = overrides.velX           ?? 0;
  p.velY           = overrides.velY           ?? 0;
  p.facingDir      = overrides.facingDir      ?? 1;
  p.combatState    = overrides.combatState    ?? 'IDLE';
  p.stateElapsedMs = overrides.stateElapsedMs ?? 0;
  p.hitstunMs      = overrides.hitstunMs      ?? 0;
  p.health         = overrides.health         ?? 1000;
  p.stamina        = overrides.stamina        ?? 100;
  p.isBlocking     = overrides.isBlocking     ?? false;
  p.attackHit      = overrides.attackHit      ?? false;
  return p;
}

const neutral: InputPayload = {
  seq: 0, tick: 0, moveX: 0, moveZ: 0,
  jump: false, attack: 'none', block: false,
};

const left:    InputPayload = { ...neutral, moveX: -1 };
const right:   InputPayload = { ...neutral, moveX:  1 };
const jumpInp: InputPayload = { ...neutral, jump: true };
const light:   InputPayload = { ...neutral, attack: 'light' };
const heavy:   InputPayload = { ...neutral, attack: 'heavy' };
const block:   InputPayload = { ...neutral, block: true };

// ── IDLE transitions ─────────────────────────────────────────────────────────

describe('IDLE → transitions', () => {
  let p: PlayerState;
  beforeEach(() => { p = makePlayer(); });

  it('stays IDLE on neutral input', () => {
    tickFSM(p, neutral, 16);
    expect(p.combatState).toBe('IDLE');
  });

  it('transitions to MOVE on horizontal input', () => {
    tickFSM(p, right, 16);
    expect(p.combatState).toBe('MOVE');
  });

  it('transitions to JUMP on jump input', () => {
    tickFSM(p, jumpInp, 16);
    expect(p.combatState).toBe('JUMP');
  });

  it('sets velY to JUMP_VELOCITY when jumping', () => {
    tickFSM(p, jumpInp, 16);
    expect(p.velY).toBeGreaterThan(0);
  });

  it('transitions to ATTACK_LIGHT on light input', () => {
    tickFSM(p, light, 16);
    expect(p.combatState).toBe('ATTACK_LIGHT');
  });

  it('transitions to ATTACK_HEAVY on heavy input', () => {
    tickFSM(p, heavy, 16);
    expect(p.combatState).toBe('ATTACK_HEAVY');
  });

  it('transitions to BLOCK when block is held', () => {
    tickFSM(p, block, 16);
    expect(p.combatState).toBe('BLOCK');
  });
});

// ── MOVE transitions ─────────────────────────────────────────────────────────

describe('MOVE → transitions', () => {
  let p: PlayerState;
  beforeEach(() => {
    p = makePlayer({ combatState: 'MOVE' });
  });

  it('returns to IDLE when no movement input', () => {
    tickFSM(p, neutral, 16);
    expect(p.combatState).toBe('IDLE');
  });

  it('attacks from MOVE state', () => {
    tickFSM(p, light, 16);
    expect(p.combatState).toBe('ATTACK_LIGHT');
  });

  it('jumps from MOVE state', () => {
    tickFSM(p, jumpInp, 16);
    expect(p.combatState).toBe('JUMP');
  });
});

// ── ATTACK_LIGHT frame lifecycle ──────────────────────────────────────────────

describe('ATTACK_LIGHT frame lifecycle', () => {
  const lp = MOVE_DATA.LIGHT_PUNCH;

  it('stays in ATTACK_LIGHT during startup frames', () => {
    const p = makePlayer({ combatState: 'ATTACK_LIGHT', stateElapsedMs: lp.startup / 2 });
    tickFSM(p, neutral, 1); // tick 1ms
    expect(p.combatState).toBe('ATTACK_LIGHT');
  });

  it('stays in ATTACK_LIGHT during active frames', () => {
    const p = makePlayer({
      combatState:    'ATTACK_LIGHT',
      stateElapsedMs: lp.startup + lp.active / 2,
    });
    tickFSM(p, neutral, 1);
    expect(p.combatState).toBe('ATTACK_LIGHT');
  });

  it('stays in ATTACK_LIGHT during early recovery', () => {
    const p = makePlayer({
      combatState:    'ATTACK_LIGHT',
      stateElapsedMs: lp.startup + lp.active + 1,
    });
    tickFSM(p, neutral, 1);
    expect(p.combatState).toBe('ATTACK_LIGHT');
  });

  it('transitions to IDLE after full duration elapses', () => {
    const totalDuration = lp.startup + lp.active + lp.recovery;
    const p = makePlayer({
      combatState:    'ATTACK_LIGHT',
      stateElapsedMs: totalDuration - 1,
    });
    tickFSM(p, neutral, 2); // push past the boundary
    expect(p.combatState).toBe('IDLE');
  });

  it('resets stateElapsedMs to 0 on transition to IDLE', () => {
    const totalDuration = MOVE_DATA.LIGHT_PUNCH.startup + MOVE_DATA.LIGHT_PUNCH.active + MOVE_DATA.LIGHT_PUNCH.recovery;
    const p = makePlayer({
      combatState:    'ATTACK_LIGHT',
      stateElapsedMs: totalDuration - 1,
    });
    tickFSM(p, neutral, 2);
    expect(p.stateElapsedMs).toBe(0);
  });
});

// ── ATTACK_HEAVY frame lifecycle ──────────────────────────────────────────────

describe('ATTACK_HEAVY frame lifecycle', () => {
  const hk = MOVE_DATA.HEAVY_KICK;

  it('has longer total duration than light punch', () => {
    const lp = MOVE_DATA.LIGHT_PUNCH;
    expect(hk.startup + hk.active + hk.recovery)
      .toBeGreaterThan(lp.startup + lp.active + lp.recovery);
  });

  it('transitions to IDLE after recovery completes', () => {
    const total = hk.startup + hk.active + hk.recovery;
    const p = makePlayer({ combatState: 'ATTACK_HEAVY', stateElapsedMs: total - 1 });
    tickFSM(p, neutral, 2);
    expect(p.combatState).toBe('IDLE');
  });
});

// ── HITSTUN ───────────────────────────────────────────────────────────────────

describe('HITSTUN mechanics', () => {
  it('stays in HITSTUN while countdown is positive', () => {
    const p = makePlayer({ combatState: 'HITSTUN', hitstunMs: 320, health: 1000 });
    tickFSM(p, neutral, 16);
    expect(p.combatState).toBe('HITSTUN');
    expect(p.hitstunMs).toBeCloseTo(304); // 320 - 16
  });

  it('transitions to IDLE when hitstun expires with health > 0', () => {
    const p = makePlayer({ combatState: 'HITSTUN', hitstunMs: 10, health: 500 });
    tickFSM(p, neutral, 20); // 20ms > 10ms remaining
    expect(p.combatState).toBe('IDLE');
  });

  it('transitions to KO when hitstun expires with health = 0', () => {
    const p = makePlayer({ combatState: 'HITSTUN', hitstunMs: 10, health: 0 });
    tickFSM(p, neutral, 20);
    expect(p.combatState).toBe('KO');
  });

  it('ignores all input while in HITSTUN (no state change from attack input)', () => {
    const p = makePlayer({ combatState: 'HITSTUN', hitstunMs: 500, health: 500 });
    tickFSM(p, light, 16);
    expect(p.combatState).toBe('HITSTUN');
  });
});

// ── applyHitstun ─────────────────────────────────────────────────────────────

describe('applyHitstun', () => {
  it('forces player into HITSTUN with correct duration', () => {
    const p = makePlayer({ combatState: 'IDLE' });
    applyHitstun(p, 320, 1.8, 1);
    expect(p.combatState).toBe('HITSTUN');
    expect(p.hitstunMs).toBe(320);
  });

  it('applies knockback velocity in direction away from attacker', () => {
    const p = makePlayer({ combatState: 'IDLE' });
    applyHitstun(p, 300, 2, 1); // attacker faces right → defender pushed right
    expect(p.velX).toBeGreaterThan(0);
  });

  it('applies knockback left when attacker faces left', () => {
    const p = makePlayer({ combatState: 'IDLE' });
    applyHitstun(p, 300, 2, -1); // attacker faces left → defender pushed left
    expect(p.velX).toBeLessThan(0);
  });

  it('does not affect KO players', () => {
    const p = makePlayer({ combatState: 'KO', health: 0 });
    applyHitstun(p, 300, 2, 1);
    expect(p.combatState).toBe('KO');
  });

  it('clears isBlocking flag', () => {
    const p = makePlayer({ combatState: 'BLOCK', isBlocking: true });
    applyHitstun(p, 300, 2, 1);
    expect(p.isBlocking).toBe(false);
  });
});

// ── KO state ─────────────────────────────────────────────────────────────────

describe('KO state', () => {
  it('KO player ignores all inputs (FSM frozen)', () => {
    const p = makePlayer({ combatState: 'KO', health: 0 });
    tickFSM(p, light, 100);
    tickFSM(p, heavy, 100);
    tickFSM(p, jumpInp, 100);
    expect(p.combatState).toBe('KO');
  });
});

// ── BLOCK state ───────────────────────────────────────────────────────────────

describe('BLOCK state', () => {
  it('stays in BLOCK while block is held', () => {
    const p = makePlayer({ combatState: 'BLOCK', stamina: 100 });
    tickFSM(p, block, 16);
    expect(p.combatState).toBe('BLOCK');
    expect(p.isBlocking).toBe(true);
  });

  it('transitions to IDLE when block is released', () => {
    const p = makePlayer({ combatState: 'BLOCK', stamina: 100 });
    tickFSM(p, neutral, 16);
    expect(p.combatState).toBe('IDLE');
    expect(p.isBlocking).toBe(false);
  });

  it('guard breaks when stamina drops to 0', () => {
    const p = makePlayer({ combatState: 'BLOCK', stamina: 0 });
    tickFSM(p, block, 16);
    // Guard break → back to IDLE (vulnerable)
    expect(p.combatState).toBe('IDLE');
    expect(p.isBlocking).toBe(false);
  });
});

// ── JUMP state ────────────────────────────────────────────────────────────────

describe('JUMP state', () => {
  it('allows light attack while airborne', () => {
    const p = makePlayer({ combatState: 'JUMP', posY: 3, velY: 5 });
    tickFSM(p, light, 16);
    expect(p.combatState).toBe('ATTACK_LIGHT');
  });

  it('lands and returns to IDLE when posY hits floor', () => {
    const p = makePlayer({ combatState: 'JUMP', posY: 0, velY: -1 });
    tickFSM(p, neutral, 16);
    expect(p.combatState).toBe('IDLE');
  });
});
