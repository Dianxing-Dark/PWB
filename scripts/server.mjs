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
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".wasm": "application/wasm",
};

export async function serveReference(port = 0, folder = "references/p01") {
  const artifact = await realpath(resolve(repo, folder));
  const reference = artifact.startsWith(resolve(repo, "references") + sep);
  const vendor = reference && await realpath(resolve(repo, "node_modules/three/build"));
  const style = reference && resolve(repo, "references/p01/style.css");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = decodeURIComponent(url.pathname);
      const vendorPrefix = "/vendor/";
      const fromVendor = reference && path.startsWith(vendorPrefix);
      const root = fromVendor ? vendor : artifact;
      const relativePath = fromVendor ? path.slice(vendorPrefix.length) : path === "/" ? "index.html" : path.slice(1);
      const useReferenceStyle = reference && path === "/p01-style.css";
      const requested = useReferenceStyle ? style : resolve(root, relativePath);
      const file = await realpath(requested);
      const type = contentTypes[extname(file)];
      const allowed = useReferenceStyle && file === style || file.startsWith(root + sep);
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
