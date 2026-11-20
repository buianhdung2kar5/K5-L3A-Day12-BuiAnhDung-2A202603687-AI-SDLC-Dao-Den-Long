// Builds release/dao-den-long-<version>.zip: the static web build + the dependency-free Node server + docs.
//   node scripts/package-release.mjs v1.0.0
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { repoRoot, webRoot } from "./server.mjs";

const version = process.argv[2] ?? "v1.0.0";
if (!existsSync(join(webRoot, "index.html"))) {
  console.error("dist/web is missing: run `npm run build` first");
  process.exit(1);
}
const name = `dao-den-long-${version}`;
const out = join(repoRoot, "release");
const stage = join(out, name);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(stage, "scripts"), { recursive: true });
cpSync(webRoot, join(stage, "dist", "web"), { recursive: true });
for (const f of ["serve.mjs", "server.mjs"]) cpSync(join(repoRoot, "scripts", f), join(stage, "scripts", f));
for (const f of ["LICENSE", "CREDITS.md", "CHANGELOG.md"]) cpSync(join(repoRoot, f), join(stage, f));
writeFileSync(
  join(stage, "README.txt"),
  `Dao Den Long ${version} - runnable web build

Requirements: Node.js 18 or newer, and a modern browser with WebGL2 (Chrome, Edge, Firefox).

Run:
  node scripts/serve.mjs            (then open http://localhost:8080; PORT=3000 node scripts/serve.mjs to change the port)

The server also stores the local leaderboard (data/leaderboard.json next to this folder; LEADERBOARD_PATH to change):
  node scripts/serve.mjs --export-leaderboard out.json

Without the server (static hosting) the game still works and keeps the leaderboard in the browser.
Source code, tests, benchmark and docs: the GitHub repository (tag ${version}).
`,
);
const zip = join(out, `${name}.zip`);
if (platform() === "win32") {
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${stage}' -DestinationPath '${zip}' -Force`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-q", zip, name], { cwd: out, stdio: "inherit" });
}
console.log(zip);
