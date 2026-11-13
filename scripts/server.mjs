import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".glb": "model/gltf-binary",
};

export async function serveReference(port = 0, folder = "references/p01") {
  const artifact = await realpath(resolve(repo, folder));
  const vendor = await realpath(resolve(repo, "node_modules/three/build"));
  const style = resolve(repo, "references/p01/style.css");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = decodeURIComponent(url.pathname);
      const vendorPrefix = "/vendor/";
      const fromVendor = path.startsWith(vendorPrefix);
      const root = fromVendor ? vendor : artifact;
      const relativePath = fromVendor ? path.slice(vendorPrefix.length) : path === "/" ? "index.html" : path.slice(1);
      const requested = path === "/p01-style.css" ? style : resolve(root, relativePath);
      const file = await realpath(requested);
      const type = contentTypes[extname(file)];
      const allowed = file === style && path === "/p01-style.css" || file.startsWith(root + sep);
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
  return { url: "http://127.0.0.1:" + server.address().port + "/",
    close: () => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())) };
}
