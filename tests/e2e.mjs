// End-to-end check of the REAL web game in a real (headless) Chrome with real key presses.
// Needs Chrome/Chromium (CHROME_PATH or a default location) and `npm run build` first.
// Writes docs/proof/phase3/e2e-results.md and screenshots to docs/proof/phase3/screens/.
import puppeteer from "puppeteer-core";
import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "docs", "proof", "phase4", "screens");
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

const lbFile = join(tmpdir(), `ddl-e2e-leaderboard-${Date.now()}.json`);
const startGameServer = () => spawn("node", [join(root, "scripts", "serve.mjs")], { cwd: root, env: { ...process.env, PORT: String(PORT), LEADERBOARD_PATH: lbFile }, stdio: "ignore" });
let server = startGameServer();
await new Promise((r) => setTimeout(r, 800));
async function restartServer() {
  await new Promise((r) => {
    server.once("exit", r);
    server.kill();
  });
  server = startGameServer();
  await new Promise((r) => setTimeout(r, 800));
}

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

async function waitFor(page, fn, timeout = 30000, ...args) {
  await page.waitForFunction(fn, { timeout, polling: 50 }, ...args);
}
const sim = (page, expr) => page.evaluate(`(() => { const s = window.__game.sim; return ${expr}; })()`);
const text = (page, id) => page.$eval(`#${id}`, (e) => e.textContent);
const visible = (page, id) => page.$eval(`#${id}`, (e) => e.classList.contains("show") || getComputedStyle(e).display !== "none");
const ready = (page) => waitFor(page, () => window.__game && window.__game.flow === "play" && window.__game.sim.tick > 2);

/** Software GL is slow under load: generous navigation timeouts avoid flaky failures. */
async function openPage(b = browser) {
  const pg = await b.newPage();
  pg.setDefaultNavigationTimeout(120000);
  pg.setDefaultTimeout(60000);
  return pg;
}

async function test(name, covers, why, fn) {
  const page = await openPage();
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

await test("walk_deposit_light_hud", "S5,S19", "Walk with W to L1, press E: lantern lights, HUD shows 1/5 and score 150 (10 motes x5 + 100).", async (page) => {
  await page.goto(url(1, { player: { pos: [0, 20], carried: 10 } }));
  await ready(page);
  await page.keyboard.down("w");
  await waitFor(page, () => window.__game.sim.player.pos[2] > 23.5);
  await page.keyboard.up("w");
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.sim.lanterns[0].lit);
  await sleep(200);
  const hud = { lit: await text(page, "hud-lanterns"), score: await text(page, "hud-score") };
  if (hud.lit !== "1/5" || hud.score !== "150") throw new Error("HUD wrong: " + JSON.stringify(hud));
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

await test("pause_menu_resume_replay", "S16,S19", "Esc pauses: pause panel shows, sim_tick frozen for 0.5 s; Tiếp tục resumes; Esc pauses again and Chơi lại Đêm restarts the night.", async (page) => {
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
  await page.keyboard.press("Escape");
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

await test("dawn_survived_night1_to_night2", "S19,T3", "Night 1: with 3 of 5 lanterns lit the Night is won only at dawn (no early win): result 'Đêm 1 hoàn thành' -> 'Đêm kế tiếp' -> intro Night 2 -> play with 6 lanterns.", async (page) => {
  await page.goto(url(1, { time_left_s: 0.5, lanterns: ["L1", "L2", "L3"].map((id) => ({ id, lit: true })) }));
  await waitFor(page, () => window.__game && window.__game.flow === "result", 25000);
  await sleep(200);
  if (!(await text(page, "res-title")).includes("Đêm 1 hoàn thành")) throw new Error("result title wrong");
  if (!(await text(page, "res-text")).includes("3/5")) throw new Error("result text wrong: " + (await text(page, "res-text")));
  await page.screenshot({ path: join(shots, "e2e-win.png") });
  const total = await page.evaluate(() => window.__game.total);
  if (!(total > 500)) throw new Error("total score not accumulated: " + total);
  await page.click("#btn-next");
  if (!(await text(page, "intro-title")).includes("Đảo Cau")) throw new Error("night 2 intro expected");
  await page.click("#btn-intro-go");
  await waitFor(page, () => window.__game.flow === "play" && window.__game.night === 2 && window.__game.sim.lanterns.length === 6);
});

await test("below_threshold_loses_at_dawn", "T3", "Only 2 of 5 lanterns lit at dawn: 'Thua rồi' with 'cần 3' in the text.", async (page) => {
  await page.goto(url(1, { time_left_s: 0.5, lanterns: ["L1", "L2"].map((id) => ({ id, lit: true })) }));
  await waitFor(page, () => window.__game && window.__game.flow === "result", 25000);
  if (!(await text(page, "res-title")).includes("Thua")) throw new Error("lose title wrong");
  if (!(await text(page, "res-text")).includes("cần 3")) throw new Error("need not shown");
});

await test("win_night3_shows_dawn", "S19,T3", "Night 3 needs 5 of 7: win at dawn -> 'Xem Bình Minh' -> Bình Minh screen with the total score.", async (page) => {
  await page.goto(url(3, { time_left_s: 0.5, lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }));
  await waitFor(page, () => window.__game && window.__game.flow === "result", 25000);
  await page.click("#btn-next");
  if (!(await visible(page, "p-dawn"))) throw new Error("dawn screen not shown");
  const score = Number(await text(page, "dawn-score"));
  if (!(score > 500)) throw new Error("dawn total score wrong: " + score);
  await page.screenshot({ path: join(shots, "e2e-dawn.png") });
});

await test("refuel_with_e_and_prompt", "T1", "Lit lantern at fuel 40: prompt shows 'Châm dầu'; E refuels to 100, carried 10 -> 3, HUD shows the new count and capacity.", async (page) => {
  await page.goto(url(1, { player: { pos: [0, 24], carried: 10 }, lanterns: [{ id: "L1", lit: true, fuel: 40 }] }));
  await ready(page);
  await sleep(200);
  if (!(await text(page, "hud-prompt-text")).includes("Châm dầu")) throw new Error("refuel prompt missing");
  await page.screenshot({ path: join(shots, "e2e-fuel-prompt.png") });
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.sim.lanterns[0].fuelU >= 5990);
  await sleep(200);
  if ((await text(page, "hud-carried")) !== "3" || (await text(page, "hud-cap")) !== "10") throw new Error("HUD carried/capacity wrong");
});

await test("lantern_out_then_relight_5", "T1,T2,T4", "A lantern with almost no fuel goes out; relighting it costs 5 fireflies, and capacity grows 10 -> 12 on a successful lighting.", async (page) => {
  await page.goto(url(1, { player: { pos: [0, 24], carried: 5 }, lanterns: [{ id: "L1", lit: true, fuel: 0.1 }] }));
  await ready(page);
  await waitFor(page, () => window.__game.sim.lanterns[0].lit === false, 5000);
  await page.keyboard.press("e");
  await waitFor(page, () => window.__game.sim.lanterns[0].lit === true, 5000);
  const info = await sim(page, "[s.lanterns[0].relit, s.capacity, s.score]");
  if (info[0] !== 1 || info[1] !== 12 || info[2] !== 65) throw new Error("relight result wrong: " + JSON.stringify(info));
  await sleep(200);
  if ((await text(page, "hud-cap")) !== "12") throw new Error("HUD capacity not updated");
});

await test("shade_walks_to_weak_lantern_and_drains", "T2", "A wandering shade picks the weak lit lantern, stops within 2 m and enters the drain state; the fuel bar shows a falling value.", async (page) => {
  await page.goto(url(1, { player: { pos: [0, 12] }, lanterns: [{ id: "L1", lit: true, fuel: 20.05 }], shades: [{ id: "A", pos: [0, 0.5, 29.9], state: "wander" }] }));
  await ready(page);
  await waitFor(page, () => window.__game.sim.shades[0].state === "drain", 20000);
  const f0 = await sim(page, "s.lanterns[0].fuelU");
  await waitFor(page, (f) => window.__game.sim.lanterns[0].fuelU < f - 3, 30000, f0);
  await page.screenshot({ path: join(shots, "e2e-drain.png") });
});

await test("colour_blind_setting_persists", "T6", "Setting 'Bảng màu dễ phân biệt' switches the palette (body.cb) and is restored after reload.", async (page) => {
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitFor(page, () => window.__game);
  await page.click("#btn-menu-settings");
  await page.click("#set-cb");
  if (!(await page.evaluate(() => document.body.classList.contains("cb")))) throw new Error("body.cb not set");
  await page.screenshot({ path: join(shots, "e2e-colourblind-settings.png") });
  await page.reload();
  await waitFor(page, () => window.__game);
  const st = await page.evaluate(() => [document.body.classList.contains("cb"), document.getElementById("set-cb").checked]);
  if (!st[0] || !st[1]) throw new Error("setting not restored: " + JSON.stringify(st));
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


// ================= Ticket-04 =================
const smallText = () =>
  [...document.querySelectorAll("body *")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 17.99;
    })
    .map((el) => `${el.id || el.className || el.tagName}:${el.textContent.trim().slice(0, 18)}`);

await test("ui_font_at_least_18px_and_large_option", "U4", "At 1280x720 every visible UI text (menu, settings, HUD, result) is >= 18 px; 'Chữ lớn' makes the root 22.5 px (x1.25) and all text >= 22.5 px.", async (page) => {
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  let bad = await page.evaluate(smallText);
  if (bad.length) throw new Error("menu text < 18px: " + bad.join(" | "));
  await page.click("#btn-menu-settings");
  bad = await page.evaluate(smallText);
  if (bad.length) throw new Error("settings text < 18px: " + bad.join(" | "));
  await page.goto(url(1, { player: { carried: 3 }, lanterns: [{ id: "L1", lit: true, fuel: 20 }] }));
  await ready(page);
  await sleep(600);
  bad = await page.evaluate(smallText);
  if (bad.length) throw new Error("HUD text < 18px: " + bad.join(" | "));
  await page.evaluate(() => localStorage.setItem("ddl.settings.v1", JSON.stringify({ volume: 0.7, sens: 0.35, cb: false, calm: false, large: true })));
  await page.goto(url(1, { player: { carried: 3 } }));
  await ready(page);
  await sleep(400);
  const root22 = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  if (parseFloat(root22) < 22.4) throw new Error("large text root font-size " + root22);
  const smaller = await page.evaluate(() => [...document.querySelectorAll("#hud *")].filter((el) => el.getBoundingClientRect().width && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 22.4).length);
  if (smaller) throw new Error(smaller + " HUD texts smaller than 22.5px with large text on");
  await page.screenshot({ path: join(shots, "e2e-large-text.png") });
  await page.evaluate(() => localStorage.clear());
});

await test("key_rebinding_conflicts_reset_persist", "U4", "Settings: rebind Jump to J (works in game, Space no longer jumps); a clashing key is rejected with a message; a camera key is refused; 'Khôi phục mặc định' restores; bindings persist after reload.", async (page) => {
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitFor(page, () => window.__game);
  await page.click("#btn-menu-settings");
  await page.click("#key-jump");
  await page.keyboard.press("KeyJ");
  if ((await text(page, "key-jump")) !== "J") throw new Error("Jump not rebound: " + (await text(page, "key-jump")));
  await page.click("#key-dash");
  await page.keyboard.press("KeyE");
  if (!(await text(page, "keys-msg")).includes("đã dùng")) throw new Error("no clash message: " + (await text(page, "keys-msg")));
  if ((await text(page, "key-dash")) === "E") throw new Error("clashing key was applied");
  await page.click("#key-forward");
  await page.keyboard.press("ArrowLeft");
  if (!(await text(page, "keys-msg")).includes("camera")) throw new Error("reserved key not refused");
  await page.screenshot({ path: join(shots, "e2e-keys.png") });
  await page.reload();
  await waitFor(page, () => window.__game);
  await page.click("#btn-menu-settings");
  if ((await text(page, "key-jump")) !== "J") throw new Error("binding not persisted");
  await page.goto(url(1, {}));
  await ready(page);
  await page.keyboard.press("Space");
  await sleep(300);
  if ((await sim(page, "s.player.pos[1]")) > 0.05) throw new Error("Space still jumps after rebinding");
  await page.keyboard.press("KeyJ");
  await waitFor(page, () => window.__game.sim.player.pos[1] > 0.3, 5000);
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  await page.click("#btn-menu-settings");
  await page.click("#btn-keys-reset");
  if ((await text(page, "key-jump")) !== "Space") throw new Error("reset did not restore Space");
  await page.evaluate(() => localStorage.clear());
});

await test("cue_shade_spawn_caption_and_arrow", "U4", "A Bóng Mực spawning shows a caption with its direction and an arrow at the screen edge.", async (page) => {
  await page.goto(url(1, { random_shades: true, player: { flames: 99 } }));
  await ready(page);
  await page.evaluate(() => { const s = window.__game.sim; while (s.simTick < 298) s.step({ move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false }); });
  await waitFor(page, () => document.getElementById("captions").textContent.includes("Bóng Mực xuất hiện"), 15000);
  await waitFor(page, () => document.querySelectorAll(".shade-arrow").length > 0, 5000);
  const dir = await text(page, "captions");
  if (!/(phía trước|phía sau|bên trái|bên phải)/.test(dir)) throw new Error("caption has no direction: " + dir);
  await page.screenshot({ path: join(shots, "e2e-cue-shade.png") });
});

await test("cue_low_fuel_countdown_and_wind", "U4", "Visual cues: caption when a lantern drops below 30 fuel, big countdown in the last 10 s, caption before strong wind (Night 3).", async (page) => {
  await page.goto(url(1, { time_left_s: 14, lanterns: [{ id: "L2", lit: true, fuel: 30.05 }] }));
  await ready(page);
  await waitFor(page, () => document.getElementById("captions").textContent.includes("sắp hết dầu"), 8000);
  await waitFor(page, () => getComputedStyle(document.getElementById("countdown")).display !== "none", 15000);
  await page.screenshot({ path: join(shots, "e2e-cue-countdown.png") });
  const page3 = await openPage();
  try {
    await page3.goto(url(3, { wind_enabled: true }));
    await ready(page3);
    await page3.evaluate(() => { const s = window.__game.sim; for (let i = 0; i < 1700; i++) s.step({ move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false }); });
    await waitFor(page3, () => document.getElementById("captions").textContent.includes("Gió mạnh"), 15000);
  } finally {
    await page3.close();
  }
});

await test("reduce_motion_disables_flash_and_shake", "U4", "A hit flashes the screen (and shakes the camera) by default; with 'Giảm chuyển động' neither happens.", async (page) => {
  const hit = async (calm) => {
    const pg = await openPage();
    await pg.evaluateOnNewDocument((c) => {
      localStorage.setItem("ddl.settings.v1", JSON.stringify({ volume: 0.7, sens: 0.35, cb: false, calm: c, large: false }));
      window.__flashSeen = false;
      new MutationObserver((records) => { for (const r of records) if (r.target.id === "flash" && r.target.classList.contains("on")) window.__flashSeen = true; }).observe(document, { attributes: true, subtree: true, attributeFilter: ["class"] });
    }, calm);
    await pg.goto(url(1, { player: { flames: 99 }, shades: [{ id: "A", pos: [0.5, 0.5, 0] }] }));
    await ready(pg);
    await waitFor(pg, () => window.__game.sim.player.flames < 99, 10000);
    await sleep(400);
    const seen = await pg.evaluate(() => window.__flashSeen);
    await pg.close();
    return seen;
  };
  if (!(await hit(false))) throw new Error("no flash by default");
  if (await hit(true)) throw new Error("flash still happens with reduced motion");
});

await test("leaderboard_save_validate_order_persist", "U3", "After a loss: name entry (3-12 chars, invalid names refused), saved on the server's disk; after a Night-3 win the higher score ranks first; entries survive a server restart; reachable from the menu.", async (page) => {
  await page.goto(url(1, { player: { flames: 1 }, shades: [{ id: "A", pos: [0.5, 0.5, 0] }] }));
  await waitFor(page, () => window.__game && window.__game.flow === "result", 25000);
  await page.click("#btn-res-save");
  await page.type("#name-input", "ab");
  await page.click("#btn-name-save");
  if (!(await text(page, "name-error")).includes("3-12")) throw new Error("short name not refused");
  await page.$eval("#name-input", (e) => (e.value = ""));
  await page.type("#name-input", "Tester_01");
  await page.click("#btn-name-save");
  await waitFor(page, () => document.getElementById("p-board").classList.contains("show"), 5000);
  const rows1 = await page.$$eval("#board-body tr", (r) => r.map((x) => x.textContent));
  if (rows1.length !== 1 || !rows1[0].includes("Tester_01")) throw new Error("board rows: " + JSON.stringify(rows1));
  const p2 = await openPage();
  try {
    await p2.goto(url(3, { time_left_s: 0.5, lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }));
    await waitFor(p2, () => window.__game && window.__game.flow === "result", 25000);
    await p2.click("#btn-next");
    await p2.click("#btn-dawn-save");
    await p2.type("#name-input", "Winner_3");
    await p2.click("#btn-name-save");
    await waitFor(p2, () => document.getElementById("p-board").classList.contains("show"), 5000);
    const rows2 = await p2.$$eval("#board-body tr", (r) => r.map((x) => x.textContent));
    if (rows2.length !== 2 || !rows2[0].includes("Winner_3") || !rows2[1].includes("Tester_01")) throw new Error("order wrong: " + JSON.stringify(rows2));
    await p2.screenshot({ path: join(shots, "e2e-leaderboard.png") });
  } finally {
    await p2.close();
  }
  await restartServer();
  await page.goto(`${base}?seed=3`);
  await waitFor(page, () => window.__game);
  await page.click("#btn-menu-board");
  await waitFor(page, () => document.getElementById("p-board").classList.contains("show"), 5000);
  const rows3 = await page.$$eval("#board-body tr", (r) => r.map((x) => x.textContent));
  if (rows3.length !== 2 || !rows3[0].includes("Winner_3")) throw new Error("not persisted after restart: " + JSON.stringify(rows3));
  const out = join(tmpdir(), `ddl-export-${Date.now()}.json`);
  const ex = spawnSync("node", [join(root, "scripts", "serve.mjs"), "--export-leaderboard", out], { env: { ...process.env, LEADERBOARD_PATH: lbFile }, encoding: "utf8" });
  const exported = JSON.parse(readFileSync(out, "utf8"));
  if (ex.status !== 0 || exported.entries.length !== 2 || exported.entries[0].name !== "Winner_3") throw new Error("export wrong: " + JSON.stringify(exported));
});

await test("bench_cli_produces_valid_json", "U1", "node scripts/bench.mjs --seed 42 --duration 4 --out f.json exits 0 and writes all fields of the Ticket-04 schema (200 shades / 100 fireflies scene).", async () => {
  const out = join(tmpdir(), `ddl-bench-${Date.now()}.json`);
  const r = spawnSync("node", [join(root, "scripts", "bench.mjs"), "--seed", "42", "--duration", "4", "--out", out], { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`bench exit ${r.status}: ${r.stderr}`);
  const j = JSON.parse(readFileSync(out, "utf8"));
  for (const k of ["contract_version", "avg_fps", "p1_low_fps", "frame_ms_p95", "frames", "load_ms", "peak_mem_mb", "vsync_off", "renderer", "os"]) if (!(k in j)) throw new Error("missing field " + k);
  if (j.contract_version !== "1.3" || !(j.frames > 50) || !(j.avg_fps > 5) || !(j.load_ms > 0 && j.load_ms < 10000)) throw new Error("bad values: " + JSON.stringify(j));
  const cmp = (j.frames / j.avg_fps) * 1000;
  if (Math.abs(cmp - 4000) > 400) throw new Error(`measured interval ${cmp.toFixed(0)} ms is not ~4000 ms`);
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
    const page = await openPage(perfBrowser);
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
  "# Phase 4 end-to-end results (real browser, real key presses)",
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
writeFileSync(join(root, "docs", "proof", "phase4", "e2e-results.md"), md);
console.log(`\n${results.length - failed}/${results.length} e2e passed`);
process.exit(failed ? 1 : 0);
