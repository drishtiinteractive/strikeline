// packages/server/src/registry.ts
/**
 * Module-level registry mapping private room codes → Colyseus room IDs.
 * Lives in memory; fine for single-process deployment.
 */
export const privateRoomRegistry = new Map<string, string>();
