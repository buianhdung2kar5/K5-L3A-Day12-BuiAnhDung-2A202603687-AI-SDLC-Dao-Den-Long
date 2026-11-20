// Static file server + local leaderboard API (no dependencies). Used by `npm start` and by the bench runner.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..");
export const webRoot = join(repoRoot, "dist", "web");

/** 3-12 characters: letters (Vietnamese diacritics allowed), digits, underscore. */
export const NAME_RE = /^[\p{L}\p{N}_]{3,12}$/u;
const MAX_ENTRIES = 10;

export function leaderboardPath() {
  return process.env.LEADERBOARD_PATH ?? join(repoRoot, "data", "leaderboard.json");
}

/** Entries sorted by score (descending); equal scores keep the order they were achieved in (earlier first). */
export function readEntries(path = leaderboardPath()) {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const list = Array.isArray(data) ? data : data.entries;
    return Array.isArray(list) ? sortEntries(list).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function sortEntries(list) {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || String(a.e.achieved_at).localeCompare(String(b.e.achieved_at)) || a.i - b.i)
    .map((x) => x.e);
}

export function validateEntry(body) {
  if (typeof body !== "object" || body === null) return "body must be an object";
  if (typeof body.name !== "string" || !NAME_RE.test(body.name)) return "name must be 3-12 characters: letters, digits or _";
  if (!Number.isInteger(body.score) || body.score < 0 || body.score > 10_000_000) return "score must be a non-negative integer";
  if (!Number.isInteger(body.nights_won) || body.nights_won < 0 || body.nights_won > 3) return "nights_won must be 0-3";
  if (!Number.isInteger(body.seed)) return "seed must be an integer";
  return null;
}

export function addEntry(body, path = leaderboardPath(), now = new Date()) {
  const entry = { name: body.name, score: body.score, nights_won: body.nights_won, achieved_at: now.toISOString(), seed: body.seed };
  const all = readEntries(path);
  const rank = all.filter((e) => e.score >= entry.score).length + 1; // ties: earlier entries stay above
  const entries = sortEntries([...all, entry]).slice(0, MAX_ENTRIES);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + "\n");
  renameSync(tmp, path);
  return { entries, rank: rank <= MAX_ENTRIES ? rank : null };
}

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".map": "application/json" };

function handler(root, lbPath) {
  return async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const json = (code, obj) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(obj));
    if (url === "/api/leaderboard") {
      if (req.method === "GET") return json(200, { entries: readEntries(lbPath) });
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 4096) return json(413, { error: "too large" });
        }
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return json(400, { error: "invalid JSON" });
        }
        const err = validateEntry(body);
        if (err) return json(400, { error: err });
        return json(200, addEntry(body, lbPath));
      }
      return json(405, { error: "method not allowed" });
    }
    const path = normalize(decodeURIComponent(url));
    const file = join(root, path === "/" || path === "\\" ? "index.html" : path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  };
}

/** Starts the server on `port` (tries the next ports when busy). Resolves with { server, port }. */
export function startServer({ port = 8080, root = webRoot, lbPath = leaderboardPath(), tries = 10 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      const server = createServer(handler(root, lbPath));
      server.once("error", (e) => (e.code === "EADDRINUSE" && left > 0 ? attempt(p + 1, left - 1) : reject(e)));
      server.listen(p, () => resolve({ server, port: p }));
    };
    attempt(port, tries);
  });
}

export function hasBuild() {
  return existsSync(join(webRoot, "index.html"));
}
