// packages/shared/src/types/network.ts

export type MatchPhase = 'WAITING' | 'COUNTDOWN' | 'FIGHTING' | 'ROUND_END' | 'MATCH_END';

// ─── Client → Server ────────────────────────────────────────────────────────

export interface InputPayload {
  /** Monotonic sequence number for client reconciliation */
  seq:    number;
  /** Client tick timestamp at time of capture */
  tick:   number;
  /** Horizontal: -1 (left) | 0 | 1 (right) */
  moveX:  number;
  /** Depth sidestep: -1 | 0 | 1 */
  moveZ:  number;
  jump:   boolean;
  attack: 'none' | 'light' | 'heavy';
  block:  boolean;
}

export const ClientMsg = {
  INPUT:       'input',   // InputPayload — up to 60/s
  READY:       'ready',   // {} — player loaded and ready
} as const;
export type ClientMsgType = typeof ClientMsg[keyof typeof ClientMsg];

// ─── Server → Client ────────────────────────────────────────────────────────

export interface HitEvent {
  attackerId:  string;
  defenderId:  string;
  moveId:      string;
  damage:      number;
  newHealth:   number;
  hitstunMs:   number;
  knockbackX:  number;
  blocked:     boolean;
  guardBroken: boolean;
}

export interface RoundResultEvent {
  winnerId:  string;
  round:     number;
  reason:    'KO' | 'TIME_UP' | 'FORFEIT' | 'DRAW';
}

export interface PhaseChangeEvent {
  phase:      MatchPhase;
  countdown?: number;
}

export interface RoomCodeEvent {
  code: string;
}

export const ServerMsg = {
  HIT:          'hit',
  ROUND_RESULT: 'round_result',
  PHASE_CHANGE: 'phase_change',
  ROOM_CODE:    'room_code',   // sent to creator of a private room
  SYNC:         'sync',
} as const;
export type ServerMsgType = typeof ServerMsg[keyof typeof ServerMsg];
