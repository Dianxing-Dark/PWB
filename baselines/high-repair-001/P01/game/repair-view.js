import * as THREE from "./three.module.js";

export function createView(mount, { background, eye, focus, width, minHeight }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(...eye);
  camera.lookAt(...focus);
  camera.updateMatrixWorld();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  mount.append(renderer.domElement);
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = mount;
    if (!w || !h) return;
    const height = Math.max(minHeight, width * h / w);
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.left = -height * w / h / 2;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  new ResizeObserver(resize).observe(mount);
  resize();

  scene.add(new THREE.HemisphereLight(0xe2f2ff, 0x364445, 2.0));
  const key = new THREE.DirectionalLight(0xffecd2, 2.2);
  key.position.set(-5, 13, 8);
  scene.add(key);

  const materials = new Map();
  function material(color, unlit = false) {
    const id = color + "/" + unlit;
    if (!materials.has(id)) {
      const Material = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
      materials.set(id, new Material({ color }));
    }
    return materials.get(id);
  }
  function mesh(geometry, position, color, parent = scene) {
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(...position);
    parent.add(object);
    return object;
  }
  const box = (size, position, color, parent) => mesh(new THREE.BoxGeometry(...size), position, color, parent);
  function deck(x1, x2, z1, z2, y, color, thickness = 0.22) {
    return box([x2 - x1, thickness, z2 - z1], [(x1 + x2) / 2, y - thickness / 2, (z1 + z2) / 2], color);
  }
  function ramp(start, end, width, color, thickness = 0.22) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const along = b.clone().sub(a);
    const cross = along.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = cross.clone().cross(along).normalize();
    const placement = a.clone().lerp(b, 0.5).addScaledVector(up, -thickness / 2);
    const body = box([along.length(), thickness, width], placement.toArray(), color);
    body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along.normalize(), up, cross));
    return body;
  }
  function actor(color, accent) {
    const body = new THREE.Group();
    scene.add(body);
    mesh(new THREE.CapsuleGeometry(0.22, 0.36, 5, 12), [0, 0.43, 0], color, body);
    mesh(new THREE.SphereGeometry(0.19, 12, 8), [0, 0.87, 0], 0xe7f3ed, body);
    box([0.24, 0.11, 0.04], [0, 0.89, 0.17], accent, body);
    return body;
  }
  const projected = new THREE.Vector3();
  function placeLabel(element, x, y, z) {
    projected.set(x, y, z).project(camera);
    const left = (projected.x + 1) * mount.clientWidth / 2;
    const top = (1 - projected.y) * mount.clientHeight / 2;
    element.style.transform = "translate(" + Math.round(left) + "px, " + Math.round(top) + "px) translate(-50%, -100%)";
  }
  return { box, deck, ramp, material, mesh, actor, placeLabel, draw: () => renderer.render(scene, camera) };
}

export function fixedClock(hz, step, draw) {
  const interval = 1000 / hz;
  let previous;
  let backlog = 0;
  function frame(now) {
    backlog += Math.min(previous === undefined ? 0 : now - previous, 200);
    previous = now;
    while (backlog >= interval) {
      step();
      backlog -= interval;
    }
    draw();
    requestAnimationFrame(frame);
  }
  draw();
  requestAnimationFrame(frame);
  return () => { backlog = 0; };
}
