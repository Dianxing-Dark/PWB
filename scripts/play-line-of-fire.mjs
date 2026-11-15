import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "P06";
if (!["A08", "C08", "P06"].includes(task)) throw new Error("Choose A08, C08, or P06.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/line-of-fire");
console.log(server.url + "?task=" + task);
