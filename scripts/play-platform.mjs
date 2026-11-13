import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "C03";
if (!["A03", "C03", "P04"].includes(task)) throw new Error("Choose A03, C03 or P04.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/platform");
console.log(server.url + "?task=" + task);
