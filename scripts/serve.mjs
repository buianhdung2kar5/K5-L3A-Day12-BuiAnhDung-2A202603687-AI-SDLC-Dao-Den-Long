// Minimal static server for dist/web (no dependencies).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "dist", "web");
const port = Number(process.env.PORT ?? 8080);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".map": "application/json" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  const file = join(root, path === "/" || path === "\\" ? "index.html" : path);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`Dao Den Long: http://localhost:${port}`));
