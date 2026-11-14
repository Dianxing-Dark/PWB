import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "C12";
if (!["A10", "C07", "C12"].includes(task)) throw new Error("Choose A10, C07 or C12.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/checkpoints");
console.log(server.url + "?task=" + task);
