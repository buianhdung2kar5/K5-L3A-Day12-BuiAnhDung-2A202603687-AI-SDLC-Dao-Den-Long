// End-to-end check of the REAL web game in a real (headless) Chrome with real key presses.
// Needs Chrome/Chromium (CHROME_PATH or a default location) and `npm run build` first.
// Writes docs/proof/phase1/e2e-results.md and screenshots to docs/proof/phase1/screens/.
import puppeteer from "puppeteer-core";
import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { cpus, platform, tmpdir, release } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "docs", "proof", "phase1", "screens");
mkdirSync(shots, { recursive: true });
const PORT = 8123;
const base = `http://localhost:${PORT}/`;

const chromePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.error("Chrome not found: set CHROME_PATH");
  process.exit(1);
}

const server = spawn("node", [join(root, "scripts", "serve.mjs")], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,720"],
  defaultViewport: { width: 1280, height: 720 },
});

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (scn) => `${base}?autostart&seed=3&scenario=${encodeURIComponent(JSON.stringify(scn))}`;
const quiet = { random_motes: false, random_shades: false, motes: [] };

async function waitFor(page, fn, timeout = 8000, ...args) {
  await page.waitForFunction(fn, { timeout, polling: 50 }, ...args);
}
const sim = (page, expr) => page.evaluate(`(() => { const s = window.__game.sim; return ${expr}; })()`);
const text = (page, id) => page.$eval(`#${id}`, (e) => e.textContent);

async function test(name, covers, why, fn) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  let ok = true;
  let detail = "";
  try {
    await fn(page);
    if (errors.length) throw new Error("console errors: " + errors.join(" | "));
  } catch (e) {
    ok = false;
    detail = String(e.message ?? e);
    await page.screenshot({ path: join(shots, `e2e-FAIL-${name}.png`) }).catch(() => {});
  }
  await page.close();
  results.push({ name, covers, why, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "\n     " + detail : ""}`);
}

await test("walk_pickup_deposit_light", "R2,R3,R12", "Hold D (real key presses) to walk to a firefly, pick it up, stop near lantern L1, press E: lantern lights, HUD and score update.", async (page) => {
  await page.goto(q({ ...quiet, player: { carried: 4 }, motes: [[2, 0]], lanterns: [{ id: "L1", pos: [5, 0] }] }));
  await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
  await page.keyboard.down("d");
  await waitFor(page, () => window.__game.sim.player.pos[0] > 3);
  await page.keyboard.up("d");
  if ((await sim(page, "s.player.carried")) !== 5) throw new Error("firefly was not picked up");
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.sim.lanterns[0].lit);
  await sleep(150);
  const hud = { lit: await text(page, "hud-lanterns"), carried: await text(page, "hud-carried"), score: await text(page, "hud-score") };
  if (hud.lit !== "1" || hud.carried !== "0" || hud.score !== "110") throw new Error("HUD wrong: " + JSON.stringify(hud));
  await page.screenshot({ path: join(shots, "e2e-lantern-lit.png") });
});

await test("camera_yaw_changes_move_direction", "R12", "Hold ArrowRight until yaw >= 85 deg, then hold W: Mây must walk toward +x (camera-relative movement).", async (page) => {
  await page.goto(q({ ...quiet }));
  await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
  await page.keyboard.down("ArrowRight");
  await waitFor(page, () => window.__game.yaw >= 85);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("w");
  await waitFor(page, () => window.__game.sim.player.pos[0] > 1.5);
  await page.keyboard.up("w");
  const [x, z] = await sim(page, "[s.player.pos[0], s.player.pos[2]]");
  if (!(x > 1.5 && Math.abs(z) < x * 0.6)) throw new Error(`expected mostly +x movement, got x=${x.toFixed(2)} z=${z.toFixed(2)}`);
});

await test("jump_key", "R12", "Press Space: Mây leaves the ground and lands again.", async (page) => {
  await page.goto(q({ ...quiet }));
  await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
  await page.keyboard.press("Space");
  await waitFor(page, () => window.__game.sim.player.pos[1] > 0.5);
  await waitFor(page, () => window.__game.sim.player.pos[1] === 0);
});

await test("pulse_key_stuns_shade", "R8,R12", "Press F with 1 firefly while a shade is 3 m away: shade becomes stunned, firefly spent, ring effect shown.", async (page) => {
  await page.goto(q({ ...quiet, player: { carried: 1 }, shades: [{ id: "A", pos: [3, 0.5, 0] }] }));
  await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
  await page.keyboard.press("f");
  await waitFor(page, () => window.__game.sim.shades[0].state === "stunned");
  await sleep(120);
  await page.screenshot({ path: join(shots, "e2e-pulse.png") });
  if ((await text(page, "hud-carried")) !== "0") throw new Error("firefly not spent");
});

await test("win_screen_and_restart", "R4,R12", "Light the last lantern with E: win overlay appears with all_lit text; the Chơi lại button starts a fresh night.", async (page) => {
  await page.goto(
    q({
      ...quiet,
      player: { pos: [14, 0], carried: 5 },
      lanterns: ["L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })),
    })
  );
  await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.sim.state === "won");
  await sleep(150);
  const title = await text(page, "ov-title");
  if (title !== "Chiến thắng!") throw new Error("overlay title: " + title);
  await page.screenshot({ path: join(shots, "e2e-win.png") });
  await page.click("#ov-btn");
  await waitFor(page, () => window.__game.sim.state === "playing" && window.__game.sim.tick < 30);
  if (await page.$eval("#overlay", (e) => !e.classList.contains("hidden"))) throw new Error("overlay still visible after restart");
  if ((await text(page, "hud-lanterns")) !== "0") throw new Error("HUD not reset");
});

await test("lose_by_shade_and_restart_key", "R5,R6,R12", "A shade next to Mây with 1 flame: game ends with 'Thua rồi'; R restarts.", async (page) => {
  await page.goto(q({ ...quiet, player: { flames: 1 }, shades: [{ id: "A", pos: [0.5, 0.5, 0] }] }));
  await waitFor(page, () => window.__game && window.__game.sim.state === "lost");
  await sleep(150);
  if ((await text(page, "ov-title")) !== "Thua rồi") throw new Error("overlay title wrong");
  await page.screenshot({ path: join(shots, "e2e-lose.png") });
  await page.keyboard.press("r");
  await waitFor(page, () => window.__game.sim.state === "playing");
});

await test("title_screen_start", "R12", "Without autostart the title overlay shows; clicking Bắt đầu hides it and the sim starts ticking.", async (page) => {
  await page.goto(`${base}?seed=3`);
  await sleep(500);
  if ((await sim(page, "s.tick")) !== 0) throw new Error("sim ran before start");
  await page.screenshot({ path: join(shots, "e2e-title.png") });
  await page.click("#ov-btn");
  await waitFor(page, () => window.__game.sim.tick > 10);
});

// --- performance (rendering) ---
let perf = {};
{
  // Separate browser WITHOUT the SwiftShader flags so Chrome may use the real GPU if there is one.
  const perfBrowser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--ignore-gpu-blocklist", "--window-size=1280,720"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await perfBrowser.newPage();
  await page.goto(q({ ...quiet, random_motes: true, motes: undefined, time_left_s: 170, lanterns: ["L1", "L2", "L3"].map((id) => ({ id, lit: true })), shades: [{ id: "A", pos: [8, 0.5, 8] }] }));
  await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
  perf = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
        let frames = 0;
        const t0 = performance.now();
        const worst = [];
        let last = t0;
        const loop = (t) => {
          frames++;
          worst.push(t - last);
          last = t;
          if (t - t0 < 5000) requestAnimationFrame(loop);
          else {
            worst.sort((a, b) => b - a);
            resolve({ renderer, fps: (frames / (t - t0)) * 1000, worstFrameMs: worst[0] });
          }
        };
        requestAnimationFrame(loop);
      })
  );
  await page.screenshot({ path: join(shots, "e2e-perf-scene.png") });
  await page.close();
  await perfBrowser.close();
  console.log("perf", perf);
}
await browser.close();
server.kill();

// --- simulation throughput (headless) ---
const work = mkdtempSync(join(tmpdir(), "ddl-perf-"));
const scn = join(work, "s.json");
writeFileSync(scn, JSON.stringify({ time_left_s: 100000, player: { flames: 1000000 } }));
const N = 200000;
const t0 = process.hrtime.bigint();
const r = spawnSync("node", [join(root, "dist", "headless.js"), "--seed", "1", "--night", "1", "--scenario", scn, "--ticks", String(N), "--snapshot-every", "1000", "--out", join(work, "o.jsonl")], { encoding: "utf8" });
const secs = Number(process.hrtime.bigint() - t0) / 1e9;
if (r.status !== 0) console.error(r.stderr);
const simPerf = { ticks: N, secs, ticksPerSec: N / secs, gameHoursPerSec: N / 60 / 3600 / secs };

let commit = "unknown";
let dirty = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  dirty = execSync("git status --porcelain -- . \":(exclude)docs/proof\"", { cwd: root }).toString().trim() ? " (working tree has uncommitted changes)" : "";
} catch {}
const failed = results.filter((r) => !r.ok).length;
const md = [
  "# Phase 1 end-to-end results (real browser, real key presses)",
  "",
  `Generated by \`npm run e2e\` (tests/e2e.mjs). Commit: ${commit}${dirty}. ${new Date().toISOString()}.`,
  `Machine: ${cpus()[0].model}, ${cpus().length} threads, ${platform()} ${release()}, Node ${process.version}, Chrome headless (puppeteer-core).`,
  "",
  `Result: ${results.length - failed}/${results.length} passed. Screenshots in \`screens/e2e-*.png\`.`,
  "",
  "| Test | Covers | What it proves | Result |",
  "|---|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${r.covers} | ${r.why} | ${r.ok ? "pass" : "FAIL: " + r.detail} |`),
  "",
  "## Performance",
  "",
  `- Rendering: **${perf.fps.toFixed(1)} FPS** average over 5 s, worst frame ${perf.worstFrameMs.toFixed(1)} ms. Renderer: \`${perf.renderer}\`. Resolution 1280x720, scene: 3 lit lanterns, ~40 fireflies, 1 shade, glow layer on. ${/swiftshader/i.test(perf.renderer) ? "This is a **software** renderer (SwiftShader, no GPU), so it is a pessimistic lower bound, not a GPU measurement." : "Hardware-accelerated renderer."}`,
  `- Simulation (headless CLI, default 3 flames replaced by 1,000,000 so the run never ends, random shades on): ${simPerf.ticks} ticks in ${simPerf.secs.toFixed(2)} s = **${Math.round(simPerf.ticksPerSec)} ticks/s** (${simPerf.gameHoursPerSec.toFixed(1)} game-hours of play per real second, including process start and writing output).`,
  "",
  "Not covered: mouse-drag camera rotation, gamepad/touch, long play sessions, real-GPU frame rate.",
  "",
].join("\n");
writeFileSync(join(root, "docs", "proof", "phase1", "e2e-results.md"), md);
console.log(`\n${results.length - failed}/${results.length} e2e passed; sim ${Math.round(simPerf.ticksPerSec)} ticks/s`);
process.exit(failed ? 1 : 0);
