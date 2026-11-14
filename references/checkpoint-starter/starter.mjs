import * as THREE from "three";

const mount = document.querySelector("#world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182739);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
camera.position.set(4, 5, 7);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
mount.append(renderer.domElement);
const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0x4b6174 }));
scene.add(deck);
new ResizeObserver(() => {
  camera.aspect = mount.clientWidth / mount.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
}).observe(mount);

let start;
let tick = 0;
renderer.setAnimationLoop(now => {
  start ??= now;
  tick = Math.floor((now - start) * 60 / 1000);
  renderer.render(scene, camera);
});
window.__gameTest = {
  getSnapshot() {
    return { attemptId: 0, tick, avatar: { position: [0, 0, 0], supportSurface: "lower" },
      checkpoint: { id: null, position: null }, lowerPowered: false, upperSwitchOn: false, outcome: "none" };
  },
  getEvents() { return []; },
  loadScenario() { return { ok: false, reason: "unknown_scenario" }; },
};
