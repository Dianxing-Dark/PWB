import { serveReference } from "./server.mjs";

import { replays } from "./p01-replays.mjs";

const layout = process.argv[2] ?? "reference";
if (!Object.hasOwn(replays, layout)) throw new Error("Choose reference or offset.");
const server = await serveReference(Number(process.env.PORT || 8080), replays[layout].folder);
console.log(server.url);
