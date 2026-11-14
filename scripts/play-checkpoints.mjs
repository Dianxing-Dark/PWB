import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "C12";
const layout = process.argv[3] ?? "terrace";
if (!["A10", "C07", "C12"].includes(task) || !["terrace", "gallery"].includes(layout)) {
  throw new Error("Choose A10, C07 or C12 and optionally terrace or gallery.");
}
const server = await serveReference(Number(process.env.PORT || 8080),
  layout === "gallery" ? "references/checkpoints-turn" : "references/checkpoints");
console.log(server.url + "?task=" + task);
