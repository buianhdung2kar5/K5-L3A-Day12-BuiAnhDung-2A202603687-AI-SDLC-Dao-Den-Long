// End-to-end check of the REAL web game in a real (headless) Chrome with real key presses.
// Needs Chrome/Chromium (CHROME_PATH or a default location) and `npm run build` first.
// Writes docs/proof/phase2/e2e-results.md and screenshots to docs/proof/phase2/screens/.
import puppeteer from "puppeteer-core";
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "docs", "proof", "phase2", "screens");
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

// Software GL keeps the functional tests independent of the GPU; the performance run uses the real GPU.
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,720"],
  defaultViewport: { width: 1280, height: 720 },
});

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const QUIET = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [] };
const url = (night, scn, extra = "") => `${base}?autostart&night=${night}&seed=3${extra}&scenario=${encodeURIComponent(JSON.stringify({ ...QUIET, ...scn }))}`;

async function waitFor(page, fn, timeout = 15000, ...args) {
  await page.waitForFunction(fn, { timeout, polling: 50 }, ...args);
}
const sim = (page, expr) => page.evaluate(`(() => { const s = window.__game.sim; return ${expr}; })()`);
const text = (page, id) => page.$eval(`#${id}`, (e) => e.textContent);
const visible = (page, id) => page.$eval(`#${id}`, (e) => e.classList.contains("show") || getComputedStyle(e).display !== "none");
const ready = (page) => waitFor(page, () => window.__game && window.__game.flow === "play" && window.__game.sim.tick > 2);

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

await test("menu_intro_play_flow", "S19", "Menu -> Bắt đầu -> intro of Night 1 (island name + Ông Đăng) -> Vào đêm -> playing.", async (page) => {
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  if (!(await visible(page, "p-menu"))) throw new Error("menu not shown");
  await page.screenshot({ path: join(shots, "e2e-menu.png") });
  await page.click("#btn-start");
  if (!(await visible(page, "p-intro"))) throw new Error("intro not shown");
  const quote = await text(page, "intro-quote");
  if (!(await text(page, "intro-title")).includes("Đảo Bến") || !quote.includes("Ông Đăng")) throw new Error("intro text wrong");
  await page.screenshot({ path: join(shots, "e2e-intro.png") });
  await page.click("#btn-intro-go");
  await waitFor(page, () => window.__game.flow === "play" && window.__game.sim.tick > 5);
});

await test("walk_deposit_light_hud", "S5,S19", "Walk with W to L1, press E: lantern lights, HUD shows 1/5 and score 200 (10 motes x10 + 100).", async (page) => {
  await page.goto(url(1, { player: { pos: [0, 20], carried: 10 } }));
  await ready(page);
  await page.keyboard.down("w");
  await waitFor(page, () => window.__game.sim.player.pos[2] > 23.5);
  await page.keyboard.up("w");
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.sim.lanterns[0].lit);
  await sleep(200);
  const hud = { lit: await text(page, "hud-lanterns"), score: await text(page, "hud-score") };
  if (hud.lit !== "1/5" || hud.score !== "200") throw new Error("HUD wrong: " + JSON.stringify(hud));
  await page.screenshot({ path: join(shots, "e2e-lantern-lit.png") });
});

await test("dash_shift", "S2", "Shift dashes (>2.5 m in 0.2 s) and the Lướt icon shows a cooldown countdown.", async (page) => {
  await page.goto(url(1, {}));
  await ready(page);
  const z0 = await sim(page, "s.player.pos[2]");
  await page.keyboard.press("Shift");
  await waitFor(page, () => window.__game.sim.player.dashCd > 0);
  await waitFor(page, () => window.__game.sim.player.dashLeft === 0);
  const z1 = await sim(page, "s.player.pos[2]");
  if (z1 - z0 < 2.5) throw new Error(`dash moved only ${(z1 - z0).toFixed(2)} m`);
  await sleep(200);
  const label = await text(page, "hud-dash-n");
  if (!/\d/.test(label)) throw new Error("cooldown icon shows no countdown: " + label);
  await page.screenshot({ path: join(shots, "e2e-dash.png") });
});

await test("camera_yaw_changes_move_direction", "S19", "Hold ArrowRight until yaw >= 85 deg, then hold W: Mây walks toward +x.", async (page) => {
  await page.goto(url(1, {}));
  await ready(page);
  await page.keyboard.down("ArrowRight");
  await waitFor(page, () => window.__game.yaw >= 85);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("w");
  await waitFor(page, () => window.__game.sim.player.pos[0] > 1.5);
  await page.keyboard.up("w");
  const [x, z] = await sim(page, "[s.player.pos[0], s.player.pos[2]]");
  if (!(x > 1.5 && Math.abs(z) < x * 0.6)) throw new Error(`expected mostly +x movement, got x=${x.toFixed(2)} z=${z.toFixed(2)}`);
});

await test("jump_space", "S0", "Space: Mây leaves the ground and lands again.", async (page) => {
  await page.goto(url(1, {}));
  await ready(page);
  await page.keyboard.press("Space");
  await waitFor(page, () => window.__game.sim.player.pos[1] > 0.5);
  await waitFor(page, () => window.__game.sim.player.pos[1] === 0);
});

await test("pulse_f_stuns_shade", "S7", "F with 5 fireflies and a shade 3 m away: shade stunned, 3 fireflies spent, score +5.", async (page) => {
  await page.goto(url(1, { player: { carried: 5 }, shades: [{ id: "A", pos: [3, 0.5, 0] }] }));
  await ready(page);
  await page.keyboard.press("f");
  await waitFor(page, () => window.__game.sim.shades[0].state === "stunned");
  await sleep(150);
  if ((await sim(page, "s.player.carried")) !== 2) throw new Error("fireflies not spent");
  if ((await text(page, "hud-score")) !== "5") throw new Error("score not +5");
  await page.screenshot({ path: join(shots, "e2e-pulse.png") });
});

await test("pause_menu_resume_replay", "S16,S19", "Esc pauses: pause panel shows, sim_tick frozen for 0.5 s; Tiếp tục resumes; P pauses again and Chơi lại Đêm restarts the night.", async (page) => {
  await page.goto(url(1, { player: { carried: 3 } }));
  await ready(page);
  await page.keyboard.down("w");
  await sleep(300);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await waitFor(page, () => window.__game.sim.paused === true);
  if (!(await visible(page, "p-pause"))) throw new Error("pause panel not shown");
  const t0 = await sim(page, "s.simTick");
  await sleep(500);
  if ((await sim(page, "s.simTick")) !== t0) throw new Error("sim_tick advanced while paused");
  await page.screenshot({ path: join(shots, "e2e-pause.png") });
  await page.click("#btn-resume");
  await waitFor(page, () => window.__game.sim.paused === false);
  await waitFor(page, (t) => window.__game.sim.simTick > t + 5, 5000, t0);
  await page.keyboard.press("p");
  await waitFor(page, () => window.__game.sim.paused === true);
  await page.click("#btn-replay");
  await waitFor(page, () => window.__game.flow === "play" && window.__game.sim.simTick < 30 && window.__game.sim.paused === false);
});

await test("settings_persist_across_reload", "S19", "Settings: volume and mouse sensitivity saved in localStorage and restored after a page reload.", async (page) => {
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitFor(page, () => window.__game);
  await page.click("#btn-menu-settings");
  await page.$eval("#set-volume", (e) => { e.value = "30"; e.dispatchEvent(new Event("input")); });
  await page.$eval("#set-sens", (e) => { e.value = "80"; e.dispatchEvent(new Event("input")); });
  await page.screenshot({ path: join(shots, "e2e-settings.png") });
  await page.reload();
  await waitFor(page, () => window.__game);
  const vals = await page.evaluate(() => [document.getElementById("set-volume").value, document.getElementById("set-sens").value]);
  if (vals[0] !== "30" || vals[1] !== "80") throw new Error("settings not restored: " + JSON.stringify(vals));
});

await test("fall_off_island_and_respawn", "S3", "Hold D from the island edge: Mây falls, loses a flame and all fireflies, then respawns at (0,0,0) invulnerable.", async (page) => {
  await page.goto(url(1, { player: { pos: [38, 0], carried: 4 } }));
  await ready(page);
  await page.keyboard.down("d");
  await waitFor(page, () => window.__game.sim.player.flames === 2, 25000);
  await page.keyboard.up("d");
  if ((await sim(page, "s.player.carried")) !== 0) throw new Error("fireflies not lost");
  await waitFor(page, () => window.__game.sim.player.fallWait === 0 && Math.abs(window.__game.sim.player.pos[0]) < 1, 25000);
  if (!(await sim(page, "s.player.invuln > 0"))) throw new Error("not invulnerable after respawn");
  await page.screenshot({ path: join(shots, "e2e-respawn.png") });
});

await test("night2_pad_to_island_b", "S13", "Night 2: standing on the pad at (20,0,18) launches Mây over the gap; she lands on island B.", async (page) => {
  await page.goto(url(2, { player: { pos: [20, 18] }, charms: [] }));
  await ready(page);
  await waitFor(page, () => window.__game.sim.player.grounded && window.__game.sim.player.pos[0] > 42, 25000);
  const [x, z] = await sim(page, "[s.player.pos[0], s.player.pos[2]]");
  if (Math.hypot(x - 70, z) > 28) throw new Error(`landed outside island B at ${x.toFixed(1)},${z.toFixed(1)}`);
  await page.screenshot({ path: join(shots, "e2e-night2-landed.png") });
});

await test("night2_drifter_steals", "S11", "Night 2: a chasing Gió Lạc touches Mây carrying 5 fireflies and steals 3 (bar goes 5 -> 2).", async (page) => {
  await page.goto(url(2, { player: { carried: 5 }, drifters: [{ pos: [4, 0], state: "chase" }], charms: [] }));
  await ready(page);
  await waitFor(page, () => window.__game.sim.player.carried === 2, 25000);
  await sleep(250);
  const on = await page.$$eval("#hud-bar .slot.on", (e) => e.length);
  if (on !== 2) throw new Error(`bar shows ${on} filled slots`);
  await page.screenshot({ path: join(shots, "e2e-drifter.png") });
});

await test("night2_charm_pickup_speed", "S12", "Walking over a Bùa Gió picks it up: charm active and run speed becomes 7.2 m/s.", async (page) => {
  await page.goto(url(2, { charms: [{ pos: [3, 0] }] }));
  await ready(page);
  await page.keyboard.down("d");
  await waitFor(page, () => window.__game.sim.player.charm > 0);
  await waitFor(page, () => Math.abs(window.__game.sim.player.vel[0] - 7.2) < 0.01, 10000);
  await page.keyboard.up("d");
  await page.screenshot({ path: join(shots, "e2e-charm.png") });
});

await test("night3_renders", "S14,S19", "Night 3 loads with its tiers, tower and 7 lanterns, and plays without console errors.", async (page) => {
  await page.goto(url(3, { time_left_s: 355 }));
  await ready(page);
  if ((await sim(page, "s.lanterns.length")) !== 7) throw new Error("expected 7 lanterns");
  await page.keyboard.down("w");
  await sleep(500);
  await page.keyboard.up("w");
  await page.screenshot({ path: join(shots, "e2e-night3.png") });
});

await test("win_night1_to_night2", "S19,S10", "Win Night 1 -> result 'Đêm 1 hoàn thành' -> 'Đêm kế tiếp' -> intro Night 2 -> play with 6 lanterns; score carried into the total.", async (page) => {
  await page.goto(url(1, { player: { pos: [0, 24], carried: 10 }, lanterns: ["L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }));
  await ready(page);
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.flow === "result");
  await sleep(200);
  if (!(await text(page, "res-title")).includes("Đêm 1 hoàn thành")) throw new Error("result title wrong");
  await page.screenshot({ path: join(shots, "e2e-win.png") });
  const total = await page.evaluate(() => window.__game.total);
  if (!(total > 500)) throw new Error("total score not accumulated: " + total);
  await page.click("#btn-next");
  if (!(await text(page, "intro-title")).includes("Đảo Cau")) throw new Error("night 2 intro expected");
  await page.click("#btn-intro-go");
  await waitFor(page, () => window.__game.flow === "play" && window.__game.night === 2 && window.__game.sim.lanterns.length === 6);
});

await test("win_night3_shows_dawn", "S19", "Win Night 3 -> 'Xem Bình Minh' -> Bình Minh screen with the total score.", async (page) => {
  await page.goto(url(3, { player: { pos: [0, 6], carried: 10 }, lanterns: ["L2", "L3", "L4", "L5", "L6", "L7"].map((id) => ({ id, lit: true })) }));
  await ready(page);
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.flow === "result");
  await page.click("#btn-next");
  if (!(await visible(page, "p-dawn"))) throw new Error("dawn screen not shown");
  const score = Number(await text(page, "dawn-score"));
  if (!(score > 500)) throw new Error("dawn total score wrong: " + score);
  await page.screenshot({ path: join(shots, "e2e-dawn.png") });
});

await test("lose_and_replay_key", "S10", "A shade next to Mây with 1 flame: 'Thua rồi'; Chơi lại Đêm restarts; R restarts during play.", async (page) => {
  await page.goto(url(1, { player: { flames: 1 }, shades: [{ id: "A", pos: [0.5, 0.5, 0] }] }));
  await waitFor(page, () => window.__game && window.__game.flow === "result", 25000);
  await sleep(200);
  if (!(await text(page, "res-title")).includes("Thua")) throw new Error("lose title wrong");
  await page.screenshot({ path: join(shots, "e2e-lose.png") });
  await page.click("#btn-res-replay");
  await waitFor(page, () => window.__game.flow === "play" && window.__game.sim.state === "playing");
  await page.keyboard.press("r");
  await waitFor(page, () => window.__game.flow === "play" && window.__game.sim.simTick < 20);
});

await browser.close();

// --- performance on the real GPU (separate browser WITHOUT the SwiftShader flags) ---
const perf = [];
{
  const perfBrowser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--ignore-gpu-blocklist", "--window-size=1280,720"],
    defaultViewport: { width: 1280, height: 720 },
  });
  for (const night of [1, 2, 3]) {
    const page = await perfBrowser.newPage();
    const scn = { random_motes: true, random_shades: false, random_drifters: false, wind_enabled: true, time_left_s: 330, player: { flames: 99, carried: 4 }, lanterns: [{ id: "L1", lit: true }, { id: "L2", lit: true }], shades: [{ id: "A", pos: [8, 0.5, 8] }, { id: "B", pos: [-8, 0.5, 8] }, { id: "C", pos: [10, 0.5, -10] }, { id: "D", pos: [-12, 0.5, -4] }] };
    await page.goto(`${base}?autostart&night=${night}&seed=3&scenario=${encodeURIComponent(JSON.stringify(scn))}`);
    await waitFor(page, () => window.__game && window.__game.sim.tick > 2);
    const r = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const gl = document.createElement("canvas").getContext("webgl2");
          const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
          const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
          let frames = 0;
          const t0 = performance.now();
          let last = t0;
          let worst = 0;
          const loop = (t) => {
            frames++;
            worst = Math.max(worst, t - last);
            last = t;
            if (t - t0 < 5000) requestAnimationFrame(loop);
            else resolve({ renderer, fps: (frames / (t - t0)) * 1000, worstFrameMs: worst });
          };
          requestAnimationFrame(loop);
        })
    );
    await page.screenshot({ path: join(shots, `e2e-perf-night${night}.png`) });
    perf.push({ night, ...r });
    console.log("perf night", night, r);
    await page.close();
  }
  await perfBrowser.close();
}
server.kill();
for (const p of perf) {
  const ok = p.fps >= 30;
  results.push({ name: `fps_night${p.night}`, covers: "S18", why: `Average >= 30 FPS at 1280x720 on the real GPU (${p.renderer}).`, ok, detail: ok ? "" : `only ${p.fps.toFixed(1)} FPS` });
}

let commit = "unknown";
let dirty = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  dirty = execSync("git status --porcelain -- . \":(exclude)docs/proof\"", { cwd: root }).toString().trim() ? " (working tree has uncommitted changes)" : "";
} catch {}
const failed = results.filter((r) => !r.ok).length;
const md = [
  "# Phase 2 end-to-end results (real browser, real key presses)",
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
  "## Performance (real GPU, 1280x720, 5 s per Night)",
  "",
  "| Night | FPS (avg) | Worst frame | Renderer |",
  "|---|---|---|---|",
  ...perf.map((p) => `| ${p.night} | ${p.fps.toFixed(1)} | ${p.worstFrameMs.toFixed(1)} ms | ${p.renderer} |`),
  "",
  "Scene: lanterns lit, 4 shades, fireflies, glow layer on. Headless simulation speed (21,600 ticks per Night) is in `results.md`.",
  "",
  "Not covered: mouse-drag camera rotation, audio output (no sound device in the test browser), long play sessions, other GPUs.",
  "",
].join("\n");
writeFileSync(join(root, "docs", "proof", "phase2", "e2e-results.md"), md);
console.log(`\n${results.length - failed}/${results.length} e2e passed`);
process.exit(failed ? 1 : 0);
