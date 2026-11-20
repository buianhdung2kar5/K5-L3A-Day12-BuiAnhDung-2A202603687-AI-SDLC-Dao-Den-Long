// Run the game: `node scripts/serve.mjs` (after `npm run build`).
//   --export-leaderboard out.json   write {"entries":[...]} (top 10, in order) and exit
//   --port 3000                     (or PORT=3000)
import { writeFileSync } from "node:fs";
import { hasBuild, leaderboardPath, readEntries, startServer } from "./server.mjs";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes("--export-leaderboard")) {
  const out = opt("--export-leaderboard");
  if (!out) {
    console.error("usage: serve --export-leaderboard <out.json>");
    process.exit(2);
  }
  writeFileSync(out, JSON.stringify({ entries: readEntries() }, null, 2) + "\n");
  console.log(`leaderboard (${leaderboardPath()}) exported to ${out}`);
  process.exit(0);
}

if (!hasBuild()) {
  console.error("dist/web is missing: run `npm run build` first.");
  process.exit(1);
}
const wanted = Number(opt("--port") ?? process.env.PORT ?? 8080);
const { port } = await startServer({ port: wanted });
if (port !== wanted) console.log(`port ${wanted} is busy, using ${port}`);
console.log(`Dao Den Long: http://localhost:${port}`);
