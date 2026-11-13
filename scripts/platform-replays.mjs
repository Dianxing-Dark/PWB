// Layout coordinates are measured by the evaluator. The behavior checks are shared.
export const layouts = {
  reference: {
    folder: "references/platform",
    axis: 0, direction: 1, advance: "d", probe: { key: "s", axis: 2, direction: 1 }, fall: "w",
    boardAt: -0.62, stepOffAt: 6.55, gate: 7.6, pastGate: 8.27, delivery: 9.4,
    dockDelta: [4, 2.2, 0], maxStep: 0.062,
    feedback: { lift: [64, 232, 191], player: [103, 189, 255], gate: [231, 92, 92] },
  },
  curve: {
    folder: "references/platform-curve",
    axis: 0, direction: -1, advance: "a", probe: { key: "s", axis: 2, direction: 1 }, fall: "w",
    boardAt: -1.91, stepOffAt: 5.84, gate: 6.79, pastGate: 7.41, delivery: 8.55,
    dockDelta: [-4.8, 2.65, 0], maxStep: 0.072,
    feedback: { lift: [255, 187, 63], player: [232, 248, 255], gate: [236, 85, 161] },
  },
};
