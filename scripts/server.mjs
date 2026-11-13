import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

export async function serveReference(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = decodeURIComponent(url.pathname === "/" ? "/references/p01/index.html" : url.pathname);
      const file = resolve(repo, "." + path);
      const allowed = ["references/p01", "node_modules/three/build"].some(
        dir => file.startsWith(resolve(repo, dir) + sep),
      );
      const type = contentTypes[extname(file)];
      if (req.method !== "GET" || !allowed || !type || !(await stat(file)).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", accept);
  });
  return { url: "http://127.0.0.1:" + server.address().port + "/references/p01/index.html",
    close: () => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())) };
}
