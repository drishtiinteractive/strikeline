// packages/client/src/game/Reconciler.ts
import type { PlayerState } from '@stickman/shared';
import type * as THREE from 'three';

const LERP_FACTOR = 0.25; // blend factor per frame toward server position

/**
 * Smooth client-side render position toward the authoritative server state.
 * Call once per animation frame after receiving a Colyseus state patch.
 */
export function reconcilePosition(
  mesh: THREE.Object3D,
  serverState: PlayerState,
): void {
  mesh.position.x += (serverState.posX - mesh.position.x) * LERP_FACTOR;
  mesh.position.y += (serverState.posY - mesh.position.y) * LERP_FACTOR;
  mesh.position.z += (serverState.posZ - mesh.position.z) * LERP_FACTOR;

  // Flip mesh to face direction
  mesh.scale.x = serverState.facingDir;
}
