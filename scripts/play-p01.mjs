import { serveReference } from "./server.mjs";

const server = await serveReference(Number(process.env.PORT || 8080));
console.log(server.url);
