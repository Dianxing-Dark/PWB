import { serveReference } from "./server.mjs";

const task = process.argv[2] ?? "P05";
if (!["A06", "C05", "P05"].includes(task)) throw new Error("Choose A06, C05 or P05.");
const server = await serveReference(Number(process.env.PORT || 8080), "references/keys");
console.log(server.url + "?task=" + task);
