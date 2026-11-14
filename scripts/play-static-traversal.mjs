import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "A09";
if (!["A04", "A09"].includes(task)) throw new Error("Choose A04 or A09.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/static-traversal");
console.log(server.url + "?task=" + task);
