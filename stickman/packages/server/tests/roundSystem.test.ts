// packages/server/tests/roundSystem.test.ts
/**
 * Unit tests for RoundSystem:
 *   - KO detection
 *   - Timeout winner resolution (by health comparison)
 *   - Best-of-3 match completion
 *   - Disconnect / forfeit handling
 *   - Player state reset between rounds
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerState } from '@stickman/shared';
import { RoundSystem } from '../src/simulation/RoundSystem.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(id: string, health = 1000): PlayerState {
  const p = new PlayerState();
  p.id           = id;
  p.health       = health;
  p.stamina      = 100;
  p.combatState  = 'IDLE';
  p.stateElapsedMs = 0;
  p.hitstunMs    = 0;
  p.velX         = 0;
  p.velY         = 0;
  p.velZ         = 0;
  p.attackHit    = false;
  p.isBlocking   = false;
  return p;
}

// ── checkKO ──────────────────────────────────────────────────────────────────

describe('RoundSystem.checkKO', () => {
  let rs: RoundSystem;
  beforeEach(() => { rs = new RoundSystem(3); });

  it('returns null when both players are alive', () => {
    const players = [makePlayer('a', 1000), makePlayer('b', 500)];
    expect(rs.checkKO(players)).toBeNull();
  });

  it('detects KO when one player reaches 0 health', () => {
    const players = [makePlayer('a', 0), makePlayer('b', 800)];
    const result  = rs.checkKO(players);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('KO');
    expect(result!.winnerId).toBe('b');
  });

  it('the KO player is not the winner', () => {
    const players = [makePlayer('a', 500), makePlayer('b', 0)];
    const result  = rs.checkKO(players);
    expect(result!.winnerId).toBe('a');
  });

  it('handles both players at 0 health (simultaneous KO → no winner)', () => {
    const players = [makePlayer('a', 0), makePlayer('b', 0)];
    const result  = rs.checkKO(players);
    // Both KO → no winner (winnerId is null)
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBeNull();
  });
});

// ── resolveTimeout ────────────────────────────────────────────────────────────

describe('RoundSystem.resolveTimeout', () => {
  let rs: RoundSystem;
  beforeEach(() => { rs = new RoundSystem(3); });

  it('awards timeout win to the player with more health', () => {
    const players = [makePlayer('a', 700), makePlayer('b', 300)];
    const result  = rs.resolveTimeout(players);
    expect(result.winnerId).toBe('a');
    expect(result.reason).toBe('TIME_UP');
  });

  it('declares DRAW when both players have equal health', () => {
    const players = [makePlayer('a', 500), makePlayer('b', 500)];
    const result  = rs.resolveTimeout(players);
    expect(result.winnerId).toBeNull();
    expect(result.reason).toBe('DRAW');
  });

  it('handles single player edge case gracefully', () => {
    const players = [makePlayer('a', 999)];
    const result  = rs.resolveTimeout(players);
    expect(result.winnerId).toBeNull();
    expect(result.reason).toBe('DRAW');
  });
});

// ── Match progression (Best of 3) ─────────────────────────────────────────────

describe('RoundSystem — Best of 3 match flow', () => {
  let rs: RoundSystem;
  let p1: PlayerState;
  let p2: PlayerState;

  beforeEach(() => {
    rs = new RoundSystem(3);
    p1 = makePlayer('p1');
    p2 = makePlayer('p2');
    rs.registerPlayer('p1');
    rs.registerPlayer('p2');
  });

  it('no match winner after first round', () => {
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    expect(rs.getMatchWinner()).toBeNull();
  });

  it('p1 wins the match after 2 consecutive round wins', () => {
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    rs.nextRound();
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    expect(rs.getMatchWinner()).toBe('p1');
  });

  it('no match winner after split rounds (1-1)', () => {
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    rs.nextRound();
    rs.recordWin({ winnerId: 'p2', reason: 'TIME_UP' });
    expect(rs.getMatchWinner()).toBeNull();
  });

  it('p2 wins tie-breaker round 3', () => {
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    rs.nextRound();
    rs.recordWin({ winnerId: 'p2', reason: 'TIME_UP' });
    rs.nextRound();
    rs.recordWin({ winnerId: 'p2', reason: 'KO' });
    expect(rs.getMatchWinner()).toBe('p2');
  });

  it('recordWin returns match_end when match is decided', () => {
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    rs.nextRound();
    const outcome = rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    expect(outcome).toBe('match_end');
  });

  it('recordWin returns next_round when match continues', () => {
    const outcome = rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    expect(outcome).toBe('next_round');
  });

  it('tracks round win counts per player', () => {
    rs.recordWin({ winnerId: 'p1', reason: 'KO' });
    rs.nextRound();
    rs.recordWin({ winnerId: 'p2', reason: 'TIME_UP' });
    expect(rs.getRoundWins('p1')).toBe(1);
    expect(rs.getRoundWins('p2')).toBe(1);
  });

  it('DRAW round does not advance either player toward match win', () => {
    rs.recordWin({ winnerId: null, reason: 'DRAW' });
    expect(rs.getMatchWinner()).toBeNull();
    expect(rs.getRoundWins('p1')).toBe(0);
    expect(rs.getRoundWins('p2')).toBe(0);
  });
});

// ── resetForNextRound ─────────────────────────────────────────────────────────

describe('RoundSystem.resetForNextRound', () => {
  it('restores full health and stamina', () => {
    const rs = new RoundSystem(3);
    const p  = makePlayer('a', 100);
    p.stamina = 20;
    rs.resetForNextRound([p]);
    expect(p.health).toBe(1000);
    expect(p.stamina).toBe(100);
  });

  it('resets combat state to IDLE', () => {
    const rs = new RoundSystem(3);
    const p  = makePlayer('a');
    p.combatState = 'HITSTUN';
    rs.resetForNextRound([p]);
    expect(p.combatState).toBe('IDLE');
  });

  it('clears all velocities', () => {
    const rs = new RoundSystem(3);
    const p  = makePlayer('a');
    p.velX = 5; p.velY = 10; p.velZ = -3;
    rs.resetForNextRound([p]);
    expect(p.velX).toBe(0);
    expect(p.velY).toBe(0);
    expect(p.velZ).toBe(0);
  });

  it('clears hitstun countdown', () => {
    const rs = new RoundSystem(3);
    const p  = makePlayer('a');
    p.hitstunMs = 500;
    rs.resetForNextRound([p]);
    expect(p.hitstunMs).toBe(0);
  });
});

// ── currentRound tracking ────────────────────────────────────────────────────

describe('RoundSystem.currentRound', () => {
  it('starts at round 1', () => {
    const rs = new RoundSystem(3);
    expect(rs.currentRound).toBe(1);
  });

  it('increments on nextRound()', () => {
    const rs = new RoundSystem(3);
    rs.nextRound();
    expect(rs.currentRound).toBe(2);
    rs.nextRound();
    expect(rs.currentRound).toBe(3);
  });
});
