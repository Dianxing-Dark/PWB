import { serveReference } from "./server.mjs";
import { layouts } from "./platform-replays.mjs";

const task = process.argv[2] ?? "C03";
const layout = process.argv[3] ?? "reference";
if (!["A03", "C03", "P04"].includes(task) || !Object.hasOwn(layouts, layout)) {
  throw new Error("Choose A03, C03 or P04 and optionally reference or curve.");
}
const server = await serveReference(Number(process.env.PORT || 8080), layouts[layout].folder);
console.log(server.url + "?task=" + task);
