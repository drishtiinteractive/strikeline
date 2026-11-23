// packages/client/src/scene/StickmanMesh.ts
import * as THREE from 'three';

/**
 * Procedurally built stickman using THREE.js primitives.
 * Returns a Group whose origin is at the character's feet.
 *
 *   HEAD  ○
 *         |   TORSO
 *        /|\  ARMS
 *         |
 *        / \  LEGS
 */
export function createStickmanMesh(color: number = 0xffffff): THREE.Group {
  const group = new THREE.Group();
  const mat   = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const lineMat = new THREE.LineBasicMaterial({ color });

  const addBone = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius = 0.06,
  ): void => {
    const dir    = new THREE.Vector3().subVectors(to, from);
    const length = dir.length();
    const geo    = new THREE.CylinderGeometry(radius, radius, length, 6);
    const mesh   = new THREE.Mesh(geo, mat);

    // Position cylinder midpoint between joints
    mesh.position.copy(from).addScaledVector(dir.normalize(), length / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(mesh);
  };

  // ── Joints (y=0 is floor/feet) ──────────────────────────────────────────
  const feet    = new THREE.Vector3(0, 0, 0);
  const kneeL   = new THREE.Vector3(-0.2, 0.7, 0);
  const kneeR   = new THREE.Vector3( 0.2, 0.7, 0);
  const hips    = new THREE.Vector3(0, 1.1, 0);
  const torsoT  = new THREE.Vector3(0, 2.0, 0);
  const neck    = new THREE.Vector3(0, 2.1, 0);
  const elbowL  = new THREE.Vector3(-0.6, 1.6, 0);
  const elbowR  = new THREE.Vector3( 0.6, 1.6, 0);
  const handL   = new THREE.Vector3(-0.9, 1.2, 0);
  const handR   = new THREE.Vector3( 0.9, 1.2, 0);

  // Legs
  addBone(feet.clone().setX(-0.1), kneeL, 0.07);
  addBone(feet.clone().setX( 0.1), kneeR, 0.07);
  addBone(kneeL, hips, 0.07);
  addBone(kneeR, hips, 0.07);

  // Torso
  addBone(hips, torsoT, 0.08);

  // Arms
  addBone(torsoT, elbowL, 0.055);
  addBone(torsoT, elbowR, 0.055);
  addBone(elbowL, handL, 0.055);
  addBone(elbowR, handR, 0.055);

  // Head
  const headGeo  = new THREE.SphereGeometry(0.22, 8, 6);
  const headMesh = new THREE.Mesh(headGeo, mat);
  headMesh.position.set(0, 2.35, 0);
  group.add(headMesh);

  return group;
}
