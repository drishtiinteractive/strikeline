// packages/server/src/simulation/RoundSystem.ts
/**
 * Pure-logic round management (no Colyseus dependency).
 * FightRoom owns one instance and delegates all round bookkeeping here.
 * Fully unit-testable without a running server.
 */
import type { PlayerState } from '@stickman/shared';
import type { RoundEndReason } from '@stickman/shared';

export interface RoundResult {
  winnerId:  string | null;
  reason:    RoundEndReason;
}

export class RoundSystem {
  private readonly maxRounds: number;
  private wins = new Map<string, number>();   // playerId → rounds won
  public  currentRound = 1;

  constructor(maxRounds = 3) {
    this.maxRounds = maxRounds;
  }

  /** Register a player so they appear in the wins map (call on join). */
  registerPlayer(id: string): void {
    if (!this.wins.has(id)) this.wins.set(id, 0);
  }

  /**
   * Check whether one player has been KO'd this tick.
   * Returns a RoundResult if the round should end, null otherwise.
   */
  checkKO(players: PlayerState[]): RoundResult | null {
    const ko = players.find((p) => p.health <= 0);
    if (!ko) return null;

    const winner = players.find((p) => p.id !== ko.id && p.health > 0);
    return { winnerId: winner?.id ?? null, reason: 'KO' };
  }

  /**
   * Determine the round winner when the timer expires.
   * Higher health wins; equal health → DRAW.
   */
  resolveTimeout(players: PlayerState[]): RoundResult {
    const sorted = [...players].sort((a, b) => b.health - a.health);
    if (sorted.length < 2 || sorted[0].health === sorted[1].health) {
      return { winnerId: null, reason: 'DRAW' };
    }
    return { winnerId: sorted[0].id, reason: 'TIME_UP' };
  }

  /**
   * Record the winner of this round.
   * @returns `'match_end'` if the match winner is now decided, else `'next_round'`
   */
  recordWin(result: RoundResult): 'match_end' | 'next_round' {
    if (result.winnerId) {
      const prev = this.wins.get(result.winnerId) ?? 0;
      this.wins.set(result.winnerId, prev + 1);
    }
    return this.getMatchWinner() !== null ? 'match_end' : 'next_round';
  }

  /** Advance to next round. */
  nextRound(): void {
    this.currentRound++;
  }

  /** Returns the player who has won enough rounds to win the match, or null. */
  getMatchWinner(): string | null {
    const winsNeeded = Math.ceil(this.maxRounds / 2);
    for (const [id, wins] of this.wins) {
      if (wins >= winsNeeded) return id;
    }
    return null;
  }

  getRoundWins(playerId: string): number {
    return this.wins.get(playerId) ?? 0;
  }

  /** Reset for a new round (health/positions reset by FightRoom). */
  resetForNextRound(players: PlayerState[]): void {
    for (const p of players) {
      p.health          = 1000;
      p.stamina         = 100;
      p.combatState     = 'IDLE';
      p.stateElapsedMs  = 0;
      p.hitstunMs       = 0;
      p.velX            = 0;
      p.velY            = 0;
      p.velZ            = 0;
      p.attackHit       = false;
      p.isBlocking      = false;
    }
  }
}
