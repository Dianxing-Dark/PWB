import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "C09";
if (!["A05", "C09"].includes(task)) throw new Error("Choose A05 or C09.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/spatial-pickup");
console.log(server.url + "?task=" + task);
