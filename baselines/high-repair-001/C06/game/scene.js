import * as THREE from "./three.module.js";
import { createView } from "./repair-view.js";

export function createWorkshop(mount, layout, positions, markers) {
  const view = createView(mount, {
    background: 0x182324, eye: [10, 13, 20], focus: [0, 0.65, 0], width: 20.5, minHeight: 13,
  });
  const { left, right, back, front, height, upperEdge, rampLeft, rampFoot } = layout;
  const { deck, ramp, box } = view;
  deck(left, right, back, front, 0, 0x657971);
  deck(left, right, back, upperEdge, height, 0x87988d);
  const middle = (right + rampLeft) / 2;
  ramp([middle, height, upperEdge], [middle, 0, rampFoot], right - rampLeft, 0x738a7e);
  for (const x of [rampLeft + 0.07, right - 0.07]) {
    ramp([x, height + 0.47, upperEdge], [x, 0.47, rampFoot], 0.08, 0xc4a66b, 0.065);
  }
  box([rampLeft - left, 0.10, 0.11], [(left + rampLeft) / 2, height + 0.42, upperEdge], 0x9eaa91);
  for (const x of [left + 0.45, -3.1, 1.6, right - 0.45]) {
    box([0.21, height, 0.22], [x, height / 2, upperEdge - 0.55], 0x435951);
  }

  const [ox, oy, oz] = positions.ore;
  const [fx, fy, fz] = positions.fiber;
  const [bx, by, bz] = positions.bench;
  const [dx, dy, dz] = positions.delivery;
  const lift = (x, y, z) => [x, y + 0.46, z];
  box([1.0, 0.15, 0.91], [ox, oy + 0.08, oz], 0x354d44);
  box([0.93, 0.15, 0.83], [fx, fy + 0.08, fz], 0x354d44);
  const ore = view.mesh(new THREE.DodecahedronGeometry(0.40), lift(ox, oy, oz), 0xefb864);
  const fiber = view.mesh(new THREE.TorusGeometry(0.29, 0.14, 12, 24), lift(fx, fy, fz), 0x72c3a2);
  fiber.rotation.y = -0.5;
  box([1.12, 0.58, 0.66], [bx, by + 0.29, bz], 0x485c52);
  box([1.36, 0.14, 0.83], [bx, by + 0.65, bz], 0xcb9960);
  const benchLight = box([0.28, 0.08, 0.24], [bx + 0.32, by + 0.75, bz], 0xf4c36e);
  box([0.91, 0.16, 0.78], [dx, dy + 0.08, dz], 0x273b33);
  const terminal = box([0.76, 0.85, 0.51], [dx, dy + 0.55, dz - 0.12], 0x588fb1);
  const player = view.actor(0xc5da9e, 0x385e49);
  const locations = {
    ore: [ox, oy + 1.22, oz], fiber: [fx, fy + 1.01, fz],
    bench: [bx, by + 0.99, bz], delivery: [dx, dy + 1.24, dz],
  };

  return {
    render(state, heading) {
      const [x, y, z] = state.avatar.position;
      player.position.set(x, y, z);
      player.rotation.y = heading;
      ore.visible = !state.ore.collected;
      fiber.visible = !state.fiber.collected;
      benchLight.material = view.material(state.inventory.kit ? 0x76e8b0 : 0xf4c36e, true);
      terminal.material = view.material(state.outcome === "victory" ? 0x6abb91 : 0x588fb1);
      markers.ore.hidden = state.ore.collected;
      markers.fiber.hidden = state.fiber.collected;
      for (const [id, position] of Object.entries(locations)) view.placeLabel(markers[id], ...position);
      view.placeLabel(markers.player, x, y + 1.05, z);
      view.draw();
    },
  };
}
