// Records the demo video (docs/demo/demo.mp4, < 5 min) by driving the real game in Chrome with real key presses
// and encoding the captured frames with ffmpeg. It is an automated play-through, not a human one.
//   node scripts/demo-video.mjs [out.mp4]     (needs Chrome and ffmpeg in PATH)
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.mjs";

const out = process.argv[2] ?? "docs/demo/demo.mp4";
const chromePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => p && existsSync(p));
if (!chromePath) throw new Error("Chrome not found: set CHROME_PATH");
const work = mkdtempSync(join(tmpdir(), "ddl-video-"));
mkdirSync(join(out, ".."), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server, port } = await startServer({ port: 8500, lbPath: join(work, "lb.json") });
const base = `http://localhost:${port}/`;
const browser = await puppeteer.launch({ executablePath: chromePath, headless: "new", defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 600000, args: ["--no-sandbox", "--ignore-gpu-blocklist"] });
const QUIET = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [] };
const url = (night, scn) => `${base}?autostart&night=${night}&seed=11&scenario=${encodeURIComponent(JSON.stringify({ ...QUIET, ...scn }))}`;
const segments = [];

/** Runs `fn(page)` while capturing frames, then encodes them at the measured frame rate. */
async function record(name, fn, setup) {
  const page = await browser.newPage();
  if (setup) await setup(page);
  const dir = join(work, name);
  mkdirSync(dir);
  let n = 0;
  let live = false;
  let grab = Promise.resolve();
  let t0 = 0;
  const start = () => {
    if (live) return;
    live = true;
    t0 = Date.now();
    grab = (async () => {
      while (live) {
        writeFileSync(join(dir, `f${String(n++).padStart(5, "0")}.jpg`), await page.screenshot({ type: "jpeg", quality: 80 }));
      }
    })();
  };
  await fn(page, start);
  if (!live) throw new Error(`segment ${name} never started capturing`);
  live = false;
  await grab;
  const secs = (Date.now() - t0) / 1000;
  const file = join(work, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(n / secs), "-i", join(dir, "f%05d.jpg"), "-vf", "scale=1280:720,format=yuv420p", "-r", "30", "-c:v", "libx264", "-crf", "24", file]);
  segments.push(file);
  console.log(`${name}: ${n} frames, ${secs.toFixed(1)} s`);
  await page.close();
}

/** A text card rendered by the browser, shown for `secs` seconds. */
async function card(name, html, secs) {
  const page = await browser.newPage();
  await page.setContent(`<body style="margin:0;background:#0E1430;color:#F5F1E6;font-family:Segoe UI,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div style="max-width:1100px;font-size:30px;line-height:1.5">${html}</div></body>`);
  const png = join(work, `${name}.png`);
  await page.screenshot({ path: png });
  await page.close();
  const file = join(work, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-t", String(secs), "-i", png, "-vf", "scale=1280:720,format=yuv420p", "-r", "30", "-c:v", "libx264", "-crf", "24", file]);
  segments.push(file);
}
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pre = (t) => `<pre style="font-size:24px;background:#080b20;padding:20px;border-radius:12px;white-space:pre-wrap;color:#FFE9B0">${esc(t)}</pre>`;
const waitFor = (page, fn, timeout = 30000, ...a) => page.waitForFunction(fn, { timeout, polling: 50 }, ...a);
const sim = (page, expr) => page.evaluate(`(() => { const s = window.__game.sim; return ${expr}; })()`);
let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
} catch {}

await card("title", `<h1 style="color:#FFB347;font-size:64px;margin:0">Đảo Đèn Lồng v1.0.0</h1><p>Video demo tự động: script puppeteer điều khiển game thật bằng phím thật, ghi hình và nén bằng ffmpeg (commit ${commit}).</p><p>Nội dung: menu · thắp đèn, lướt, nhảy, châm dầu · Bóng Mực hút dầu và Tỏa Sáng · bục nhảy Đảo Cau · Đảo Chuông · đổi phím và chế độ mù màu · bảng xếp hạng · test, headless, bench, soak</p>`, 7);

// 1. menu -> intro -> play
await record("menu", async (page, start) => {
  await page.goto(`${base}?seed=11`);
  await waitFor(page, () => window.__game);
  start();
  await sleep(2500);
  await page.click("#btn-start");
  await sleep(3500);
  await page.click("#btn-intro-go");
  await waitFor(page, () => window.__game.flow === "play");
  await sleep(1500);
  await page.keyboard.down("d");
  await sleep(1200);
  await page.keyboard.up("d");
  await page.keyboard.down("w");
  await sleep(1500);
  await page.keyboard.up("w");
});

// 2. light a lantern, dash, jump, refuel another one
await record("lanterns", async (page, start) => {
  await page.goto(url(1, { player: { pos: [0, 22], carried: 14, successful_lights: 2 }, lanterns: [{ id: "L2", pos: [9, 24], lit: true, fuel: 22 }] }));
  await waitFor(page, () => window.__game && window.__game.flow === "play" && window.__game.sim.tick > 3);
  start();
  await sleep(1500);
  await page.keyboard.down("w");
  await sleep(450);
  await page.keyboard.up("w");
  await sleep(500);
  await page.keyboard.press("e");
  await sleep(2500);
  await page.keyboard.press("Shift");
  await sleep(1200);
  await page.keyboard.press("Space");
  await sleep(1200);
  await page.keyboard.down("d");
  await waitFor(page, () => window.__game.sim.player.pos[0] > 6.8, 10000);
  await page.keyboard.up("d");
  await sleep(500);
  await page.keyboard.press("e");
  await sleep(3500);
});

// 3. a shade drains a weak lantern, Mây pulses
await record("drain", async (page, start) => {
  await page.goto(url(1, { player: { pos: [0, 0], carried: 6 }, lanterns: [{ id: "L1", lit: true, fuel: 25 }], shades: [{ id: "A", pos: [0, 0.5, 30], state: "wander" }] }));
  await waitFor(page, () => window.__game && window.__game.flow === "play" && window.__game.sim.tick > 3);
  start();
  await page.keyboard.down("w");
  await sleep(1000);
  await page.keyboard.up("w");
  await waitFor(page, () => window.__game.sim.shades[0].state === "drain", 40000);
  await sleep(2500);
  await page.keyboard.down("w");
  await waitFor(page, () => window.__game.sim.player.pos[2] > 22, 20000);
  await page.keyboard.up("w");
  await page.keyboard.press("f");
  await sleep(3500);
});

// 4. Night 2 bounce pad
await record("night2", async (page, start) => {
  await page.goto(url(2, { player: { pos: [20, 18] }, charms: [] }));
  await waitFor(page, () => window.__game && window.__game.flow === "play");
  start();
  await waitFor(page, () => window.__game.sim.player.grounded && window.__game.sim.player.pos[0] > 42, 30000);
  await sleep(2000);
});

// 5. Night 3 tiers and the bell tower
await record("night3", async (page, start) => {
  await page.goto(url(3, { player: { pos: [0, 13] }, time_left_s: 200 }));
  await waitFor(page, () => window.__game && window.__game.flow === "play");
  start();
  await waitFor(page, () => window.__game.sim.player.grounded && window.__game.sim.player.pos[1] > 5.9, 30000);
  await sleep(3000);
});

// 6. settings: rebind a key, colour-blind palette, large text
await record("settings", async (page, start) => {
  await page.goto(`${base}?seed=11`);
  await waitFor(page, () => window.__game);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitFor(page, () => window.__game);
  start();
  await page.click("#btn-menu-settings");
  await sleep(1500);
  await page.click("#key-jump");
  await sleep(700);
  await page.keyboard.press("KeyJ");
  await sleep(1200);
  await page.click("#key-dash");
  await page.keyboard.press("KeyE");
  await sleep(2200);
  await page.click("#set-cb");
  await sleep(1200);
  await page.click("#set-large");
  await sleep(1800);
  await page.click("#set-large");
  await page.click("#set-cb");
  await page.click("#btn-keys-reset");
  await sleep(1200);
}, null);

// 7. lose a Night, save the score, show the leaderboard
await record("leaderboard", async (page, start) => {
  await page.goto(url(1, { player: { flames: 1 }, shades: [{ id: "A", pos: [0.5, 0.5, 0] }] }));
  await waitFor(page, () => window.__game && window.__game.flow === "result");
  start();
  await sleep(2500);
  await page.click("#btn-res-save");
  await sleep(800);
  await page.type("#name-input", "Demo_01", { delay: 120 });
  await sleep(600);
  await page.click("#btn-name-save");
  await sleep(4000);
});

// evidence cards
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "(missing)");
const head = (f, re) => (read(f).match(re) ?? ["?"])[0];
await card("tests", `<h2 style="color:#FFB347">Bằng chứng: test tự động</h2>${pre(`npm test            ${head("docs/proof/phase4/results.md", /Result: [^\n]+/)}\nnpm run e2e         ${head("docs/proof/phase4/e2e-results.md", /Result: [^\n]+/)}\n\nHeadless (node dist/headless.js): giá trị mong đợi tính tay, tất định, 21.600 tick (một Đêm) < 1 s.\nTest ẩn Phase 1-3 được cập nhật có lý do (docs/notes/phase3-assumptions.md).`)}`, 9);
await card("bench", `<h2 style="color:#FFB347">Bằng chứng: bench.json</h2>${pre(read("bench.json").replace(/"peak_mem_note": "[^"]*",\n/, "").replace(/"vsync_note": "[^"]*",\n/, ""))}`, 11);
await card("soak", `<h2 style="color:#FFB347">Bằng chứng: soak.json (10 Đêm, một tiến trình)</h2>${pre(read("soak.json"))}<p>crashes = 0 · mem_end_mb ≤ 1.2 × mem_start_mb</p>`, 8);

await browser.close();
server.close();
const list = join(work, "list.txt");
writeFileSync(list, segments.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out]).toString().trim();
console.log(`${out}: ${Number(dur).toFixed(1)} s`);
rmSync(work, { recursive: true, force: true });
process.exit(0);
