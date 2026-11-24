// Replay policies specify player destinations in world coordinates. All checks
// and grading rules are shared, including for submissions with a reviewed replay.
export const replays = {
  reference: {
    folder: "references/p01",
    probe: "d",
    pushKey: "d",
    crateTarget: { axis: 0, value: -0.16, direction: 1 },
    rampWaypoints: [[-7.35, -1], [-7.35, 1.5], [-0.65, 1.5]],
    plate: [-0.65, 1.5],
    release: [-1.55, 1.5],
    gateBefore: [1.2, 1.5],
    gateAfter: [2.93, 1.5],
    gatePlane: { axis: 0, position: 2.3, direction: 1 },
    upperHeight: 2.2,
    maxStep: 0.061,
    tolerance: 0.10,
    exit: [4.85, 1.5],
    lowerExitWaypoints: [[-3, 1.5], [4.85, 1.5]],
    fall: [-3, -4],
    feedback: { gateLabel: "#gate", open: "Open", gateColor: [241, 35, 131],
      statusLabel: "#status", outcomes: ["Fall detected. Press R to retry.", "In progress", "Exit reached"] },
  },
  offset: {
    folder: "references/p01-offset",
    probe: "s",
    pushKey: "s",
    crateTarget: { axis: 2, value: 0.34, direction: 1 },
    rampWaypoints: [[2, -0.23], [2, -5.3], [2, 1.05]],
    plate: [2, 1.05],
    release: [2, 0.25],
    gateBefore: [2, 2.55],
    gateAfter: [2, 4.02],
    gatePlane: { axis: 2, position: 3.45, direction: 1 },
    upperHeight: 1.65,
    maxStep: 0.05,
    tolerance: 0.10,
    exit: [2, 5.6],
    lowerExitWaypoints: [[-0.75, -3.5], [-0.75, 5.6], [2, 5.6]],
    fall: [0.35, -6.5],
    feedback: { gateLabel: "#airlock", open: "Unsealed", gateColor: [231, 91, 43],
      statusLabel: "#attempt", outcomes: ["You fell. Press R.", "Reach the exit", "Chamber cleared"] },
  },
};

const contactReplay = {
  plateA: [0, 0, -1],
  plateHalfWidth: 0.34,
  contactPush: { key: "d", axis: 0, direction: 1, contactAt: -0.21, alignedAt: -0.14, pastPlate: 0.85 },
};

export const flatReplay = {
  ...replays.reference,
  ...contactReplay,
  folder: "references/plates-flat",
  rampWaypoints: [[-0.71, 1.5]],
  upperHeight: 0,
  fall: [-3, -2.8],
  plateSupport: "floor",
  nearMiss: { minGap: 0.64, maxOffset: 0.8 },
};

export const atomReplay = {
  ...replays.reference,
  ...contactReplay,
  plateSupport: "lower",
  otherPlateSupport: "upper",
  minVerticalGap: 0.25,
};
