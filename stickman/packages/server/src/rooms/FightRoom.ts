// packages/server/src/rooms/FightRoom.ts
/**
 * Authoritative Colyseus Room for one 2-player fight.
 *
 * Matchmaking modes:
 *   • Quick match  — `joinOrCreate('fight', { mode: 'quick' })`
 *   • Private room — `create('fight', { mode: 'private' })`
 *                    Creator receives 'room_code' message.
 *   • Join private — `joinById(roomId)` after resolving code via HTTP API.
 *
 * Simulation: fixed-timestep 60 Hz via `setSimulationInterval`.
 *
 * Round system: Best of 3 (first to 2 round wins), 99-second timer.
 */
import { Room, type Client } from 'colyseus';
import {
  MatchState,
  PlayerState,
  ClientMsg,
  ServerMsg,
  ARENA,
  JUMP_VELOCITY,
  type InputPayload,
  type MatchPhase,
} from '@stickman/shared';
import { tickFSM } from '../simulation/CombatFSM.js';
import { applyPhysics, resolvePushApart, autoFace } from '../simulation/PhysicsEngine.js';
import { checkHit } from '../simulation/HitDetection.js';
import { RoundSystem } from '../simulation/RoundSystem.js';
import { privateRoomRegistry } from '../registry.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const TICK_RATE_HZ      = 60;
const TICK_MS           = 1000 / TICK_RATE_HZ;   // ≈16.67 ms
const ROUND_DURATION_S  = 99;
const MAX_ROUNDS        = 3;
const COUNTDOWN_S       = 3;
const ROUND_END_DELAY   = 3000;   // ms before next round / match-end

// ── Private room code generator ───────────────────────────────────────────────
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  return Array.from(
    { length: 4 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('');
}

// ── Room ─────────────────────────────────────────────────────────────────────

type RoomMode = 'quick' | 'private';

export class FightRoom extends Room<MatchState> {
  maxClients = 2;

  private roundSystem!: RoundSystem;
  /** Most-recent input buffered per session ID */
  private inputBuffer = new Map<string, InputPayload>();
  private neutralInput: InputPayload = {
    seq: 0, tick: 0,
    moveX: 0, moveZ: 0,
    jump: false, attack: 'none', block: false,
  };
  private mode: RoomMode = 'quick';

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  onCreate(options: { mode?: RoomMode } = {}): void {
    this.mode = options.mode === 'private' ? 'private' : 'quick';

    this.setState(new MatchState());
    this.roundSystem = new RoundSystem(MAX_ROUNDS);

    // Private room: generate a shareable code
    if (this.mode === 'private') {
      let code: string;
      do { code = generateCode(); }
      while (privateRoomRegistry.has(code));

      privateRoomRegistry.set(code, this.roomId);
      this.state.roomCode = code;
      this.setMetadata({ code, mode: 'private' });
    } else {
      this.setMetadata({ mode: 'quick' });
    }

    // Message handlers
    this.onMessage(ClientMsg.INPUT, (client: Client, payload: InputPayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.lastSeq = payload.seq;
      this.inputBuffer.set(client.sessionId, payload);
    });

    this.onMessage(ClientMsg.READY, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isConnected = true;
        this._maybeBeginCountdown();
      }
    });

    // 60 Hz authoritative simulation loop
    this.setSimulationInterval((dtMs: number) => {
      this._tick(dtMs);
    }, TICK_MS);

    console.log(`[FightRoom] ${this.roomId} created (mode=${this.mode})`);
  }

  onJoin(client: Client, options: Record<string, unknown> = {}): void {
    const slotIdx  = this.state.players.size;           // 0 or 1
    const spawn    = ARENA.spawnPoints[slotIdx as 0 | 1] ?? ARENA.spawnPoints[0];

    const player           = new PlayerState();
    player.id              = client.sessionId;
    player.posX            = spawn.x;
    player.posY            = spawn.y;
    player.posZ            = spawn.z;
    player.facingDir       = slotIdx === 0 ? 1 : -1;
    player.isConnected     = false; // becomes true on READY message
    player.health          = 1000;
    player.stamina         = 100;
    player.combatState     = 'IDLE';
    player.roundWins       = 0;

    this.state.players.set(client.sessionId, player);
    this.roundSystem.registerPlayer(client.sessionId);

    // If private room creator, send them their code
    if (this.mode === 'private' && slotIdx === 0 && this.state.roomCode) {
      client.send(ServerMsg.ROOM_CODE, { code: this.state.roomCode });
    }

    console.log(`[FightRoom] ${client.sessionId} joined slot ${slotIdx}`);
  }

  onLeave(client: Client, consented: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isConnected = false;
      player.combatState = 'KO';
    }
    this.inputBuffer.delete(client.sessionId);

    // If game was in progress, the remaining player wins by forfeit
    if (this.state.phase === 'FIGHTING' || this.state.phase === 'COUNTDOWN') {
      const winner = [...this.state.players.values()].find(
        (p) => p.id !== client.sessionId,
      );
      this.state.winnerId = winner?.id ?? '';
      this._setPhase('MATCH_END');
      this.broadcast(ServerMsg.ROUND_RESULT, {
        winnerId: this.state.winnerId,
        round:    this.state.timer.round,
        reason:   'FORFEIT',
      });
    }

    console.log(`[FightRoom] ${client.sessionId} left (consented=${consented})`);
  }

  onDispose(): void {
    // Clean up private room registration
    if (this.state.roomCode) {
      privateRoomRegistry.delete(this.state.roomCode);
    }
    console.log(`[FightRoom] ${this.roomId} disposed`);
  }

  // ── Match flow ───────────────────────────────────────────────────────────────

  private _maybeBeginCountdown(): void {
    if (this.state.phase !== 'WAITING') return;
    if (this.state.players.size < 2) return;

    const allReady = [...this.state.players.values()].every((p) => p.isConnected);
    if (!allReady) return;

    this._beginCountdown();
  }

  private _beginCountdown(): void {
    this._setPhase('COUNTDOWN');
    this.broadcast(ServerMsg.PHASE_CHANGE, {
      phase:     'COUNTDOWN',
      countdown: COUNTDOWN_S,
    });

    this.clock.setTimeout(() => {
      this.state.timer.timeLeft  = ROUND_DURATION_S;
      this.state.timer.isRunning = true;
      this.state.timer.round     = this.roundSystem.currentRound;
      this._setPhase('FIGHTING');
      this.broadcast(ServerMsg.PHASE_CHANGE, { phase: 'FIGHTING' });
    }, COUNTDOWN_S * 1000);
  }

  private _setPhase(phase: MatchPhase): void {
    this.state.phase = phase;
  }

  // ── Simulation tick (60 Hz) ──────────────────────────────────────────────────

  private _tick(dtMs: number): void {
    if (this.state.phase !== 'FIGHTING') return;

    const players = [...this.state.players.values()];
    if (players.length < 2) return;
    const [p1, p2] = players as [PlayerState, PlayerState];

    // 1. Auto-face opponent
    autoFace(p1, p2);
    autoFace(p2, p1);

    // 2. Physics pre-pass (gravity, knockback decay)
    applyPhysics(p1, dtMs);
    applyPhysics(p2, dtMs);

    // 3. Push-apart resolution
    resolvePushApart(p1, p2);

    // 4. FSM tick with buffered input
    const inp1 = this.inputBuffer.get(p1.id) ?? this.neutralInput;
    const inp2 = this.inputBuffer.get(p2.id) ?? this.neutralInput;
    tickFSM(p1, inp1, dtMs);
    tickFSM(p2, inp2, dtMs);

    // 5. Hitbox / hurtbox collision
    const hit1 = checkHit(p1, p2);
    if (hit1) {
      this.broadcast(ServerMsg.HIT, hit1);
    }
    const hit2 = checkHit(p2, p1);
    if (hit2) {
      this.broadcast(ServerMsg.HIT, hit2);
    }

    // 6. KO detection
    const koResult = this.roundSystem.checkKO(players);
    if (koResult) {
      this._endRound(koResult.winnerId, koResult.reason as 'KO');
      return;
    }

    // 7. Round timer
    this.state.timer.timeLeft -= dtMs / 1000;
    if (this.state.timer.timeLeft <= 0) {
      this.state.timer.timeLeft = 0;
      const timeoutResult = this.roundSystem.resolveTimeout(players);
      this._endRound(timeoutResult.winnerId, timeoutResult.reason as 'TIME_UP' | 'DRAW');
      return;
    }

    // 8. Flush input buffer (consume this tick's inputs)
    this.inputBuffer.clear();
  }

  // ── Round / match resolution ─────────────────────────────────────────────────

  private _endRound(winnerId: string | null, reason: 'KO' | 'TIME_UP' | 'FORFEIT' | 'DRAW'): void {
    this.state.timer.isRunning = false;
    this._setPhase('ROUND_END');

    // Record win and update roundWins on player state for HUD
    const result = { winnerId, reason };
    if (winnerId) {
      const p = this.state.players.get(winnerId);
      if (p) p.roundWins++;
    }
    const outcome = this.roundSystem.recordWin(result);

    this.broadcast(ServerMsg.ROUND_RESULT, {
      winnerId:  winnerId ?? '',
      round:     this.roundSystem.currentRound,
      reason,
    });

    this.clock.setTimeout(() => {
      if (outcome === 'match_end') {
        this.state.winnerId = this.roundSystem.getMatchWinner() ?? '';
        this._setPhase('MATCH_END');
        this.broadcast(ServerMsg.PHASE_CHANGE, { phase: 'MATCH_END' });
      } else {
        // Reset for next round
        this.roundSystem.nextRound();
        const players = [...this.state.players.values()];
        this.roundSystem.resetForNextRound(players);
        this._respawnPlayers();
        this._setPhase('WAITING');
        this._beginCountdown();
      }
    }, ROUND_END_DELAY);
  }

  private _respawnPlayers(): void {
    let idx = 0;
    for (const player of this.state.players.values()) {
      const spawn = ARENA.spawnPoints[idx as 0 | 1] ?? ARENA.spawnPoints[0];
      player.posX = spawn.x;
      player.posY = spawn.y;
      player.posZ = spawn.z;
      player.facingDir = idx === 0 ? 1 : -1;
      idx++;
    }
  }
}
