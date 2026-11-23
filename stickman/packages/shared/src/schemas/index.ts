// packages/shared/src/schemas/index.ts
import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  // ── Identity ────────────────────────────────────────────────────────────
  @type('string')  id              = '';
  @type('boolean') isConnected     = false;

  // ── Position & Velocity ─────────────────────────────────────────────────
  @type('float32') posX            = 0;
  @type('float32') posY            = 0;
  @type('float32') posZ            = 0;
  @type('float32') velX            = 0;  // horizontal knockback / momentum
  @type('float32') velY            = 0;  // vertical (jump / gravity)
  @type('float32') velZ            = 0;  // depth sidestep momentum

  // ── Orientation ─────────────────────────────────────────────────────────
  /** +1 = facing right, -1 = facing left */
  @type('int8')    facingDir       = 1;

  // ── Combat State ────────────────────────────────────────────────────────
  /**
   * One of: IDLE | MOVE | JUMP | ATTACK_LIGHT | ATTACK_HEAVY |
   *         BLOCK | HITSTUN | KO
   */
  @type('string')  combatState     = 'IDLE';

  /**
   * Ms elapsed since entering combatState.
   * Used to determine startup / active / recovery phases.
   */
  @type('float32') stateElapsedMs  = 0;

  /**
   * Countdown of hitstun remaining (ms). Only meaningful in HITSTUN.
   */
  @type('float32') hitstunMs       = 0;

  /**
   * Whether the current attack swing has already registered a hit.
   * Prevents multi-hit within one attack's active window.
   */
  @type('boolean') attackHit       = false;

  // ── Stats ────────────────────────────────────────────────────────────────
  @type('uint16')  health          = 1000;
  /** Stamina 0-100; consumed when blocking hits; regenerates over time. */
  @type('uint8')   stamina         = 100;
  /** Number of rounds won by this player in the current match. */
  @type('uint8')   roundWins       = 0;

  // ── Match bookkeeping ────────────────────────────────────────────────────
  /** Last acknowledged input sequence number (for client reconciliation). */
  @type('uint16')  lastSeq         = 0;
}

export class RoundTimer extends Schema {
  @type('uint8')   round           = 1;
  @type('float32') timeLeft        = 99;
  @type('boolean') isRunning       = false;
}

export class MatchState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(RoundTimer) timer            = new RoundTimer();

  /**
   * WAITING | COUNTDOWN | FIGHTING | ROUND_END | MATCH_END
   */
  @type('string')  phase            = 'WAITING';
  @type('string')  winnerId         = '';

  /** 4-char code for private rooms; empty for public quick-match rooms. */
  @type('string')  roomCode         = '';
}
