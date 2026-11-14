export const HEIGHT = 2.65;
// Plan coordinates use s along the terraces and t across them. World X/Z are t/s.
export const toWorld = ([s, y, t]) => [t + 1.5, y, s + 0.5];
export const checkpointPads = { lower: [0.35, 0, 0], upper: [0.35, HEIGHT, 0] };
export const trapPads = { lower: [2.85, 0, 0], upper: [2.85, HEIGHT, 0.92] };
export const consoles = { lower_power: [-2.85, 0, 0], upper_switch: [1.55, HEIGHT, 0] };
export const exit = [5.38, HEIGHT, 0];

export const decks = [
  { id: "service", s: [-6, 6.2], t: [-1.48, 1.48], from: 0, to: 0 },
  { id: "service", s: [-5.55, -4.35], t: [-3.76, -1.40], from: 0, to: 0 },
  { id: "incline", s: [-4.35, -1.5], t: [-3.76, -2.35], from: 0, to: HEIGHT },
  { id: "gallery", s: [-1.5, -0.26], t: [-3.76, -1.40], from: HEIGHT, to: HEIGHT },
  { id: "gallery", s: [-2.3, 6.2], t: [-1.48, 1.48], from: HEIGHT, to: HEIGHT },
];
export const deckY = (deck, s) => deck.from + (deck.to - deck.from) * (s - deck.s[0]) / (deck.s[1] - deck.s[0]);
