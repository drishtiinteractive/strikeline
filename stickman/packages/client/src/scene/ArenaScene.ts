// packages/client/src/scene/ArenaScene.ts
import * as THREE from 'three';
import { ARENA } from '@stickman/shared';

export interface ArenaSceneObjects {
  scene:    THREE.Scene;
  camera:   THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createArenaScene(container: HTMLElement): ArenaSceneObjects {
  // ── Renderer ──────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);
  scene.fog = new THREE.Fog(0x0a0a1a, 20, 60);

  // ── Camera ────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 4, 14);
  camera.lookAt(0, 2, 0);

  // ── Lighting ──────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x334466, 1.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 3);
  keyLight.position.set(5, 10, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far  = 50;
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x4466ff, 1.5);
  rimLight.position.set(-8, 6, -6);
  scene.add(rimLight);

  // ── Floor ─────────────────────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(ARENA.width + 4, ARENA.depth + 4, 20, 4);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Floor edge glow lines
  const edgeGeo = new THREE.EdgesGeometry(floorGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x3344aa, linewidth: 1 });
  const edges   = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.rotation.x = -Math.PI / 2;
  edges.position.y = 0.001;
  scene.add(edges);

  // ── Arena boundary indicators ─────────────────────────────────────────────
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2233aa,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
  });

  [-1, 1].forEach((side) => {
    const wallGeo  = new THREE.PlaneGeometry(ARENA.depth + 4, ARENA.ceilingY);
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.set(side * (ARENA.width / 2 + 0.1), ARENA.ceilingY / 2, 0);
    wallMesh.rotation.y = Math.PI / 2;
    scene.add(wallMesh);
  });

  // ── Background grid ───────────────────────────────────────────────────────
  const gridHelper = new THREE.GridHelper(60, 60, 0x222244, 0x111133);
  gridHelper.position.y = 0.002;
  scene.add(gridHelper);

  // ── Responsive resize ──────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
