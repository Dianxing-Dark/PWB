import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "A07";
if (!["A07", "C06", "C10"].includes(task)) throw new Error("Choose A07, C06 or C10.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/workshop");
console.log(server.url + "?task=" + task);
