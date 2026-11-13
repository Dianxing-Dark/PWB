import { serveReference } from "./server.mjs";

import { replays, flatReplay } from "./p01-replays.mjs";

const choice = process.argv[2] ?? "reference";
const tasks = ["A01", "A02", "C01", "C02", "P01", "P02"];
if (!tasks.includes(choice) && !Object.hasOwn(replays, choice)) {
  throw new Error("Choose A01, A02, C01, C02, P01, P02, reference, or offset.");
}
const route = choice.endsWith("2") ? flatReplay : replays[choice] ?? replays.reference;
const server = await serveReference(Number(process.env.PORT || 8080), route.folder);
console.log(server.url + (tasks.includes(choice) ? "?task=" + choice : ""));
