// Benchmark (Ticket-04): node scripts/bench.mjs --seed 42 --duration 30 --out bench.json [--headed]
// Starts the game server, opens the standard benchmark scene in Chrome at 1280x720 (not fullscreen, vsync off),
// waits 3 s (not measured), measures exactly --duration seconds, writes bench.json and exits with code 0.
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { hasBuild, startServer } from "./server.mjs";

const processStart = Date.now() - process.uptime() * 1000;
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const die = (msg, code = 2) => {
  console.error(`error: ${msg}\nusage: bench --seed <int> --duration <seconds> --out <file.json> [--headed]`);
  process.exit(code);
};
const seed = Number(opt("--seed", 42));
const duration = Number(opt("--duration", 30));
const out = opt("--out");
if (!Number.isInteger(seed)) die("--seed must be an integer");
if (!(duration > 0)) die("--duration must be > 0");
if (!out) die("--out is required");
if (!hasBuild()) die("dist/web is missing: run `npm run build` first", 1);

const chromePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => p && existsSync(p));
if (!chromePath) die("Chrome/Chromium not found: set CHROME_PATH", 1);

/** Resident memory of the browser process tree in MB (null when it cannot be read). */
function treeRssMb(pid) {
  try {
    if (platform() === "win32") {
      const script = `$ids=@(${pid}); $all=Get-CimInstance Win32_Process; do { $n=@($all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId } | ForEach-Object ProcessId); $ids += $n } while ($n.Count -gt 0); [math]::Round((Get-Process -Id $ids -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)`;
      return Number(execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 20000 }).trim());
    }
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
    const ids = new Set([pid]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [id, parent] of rows) if (ids.has(parent) && !ids.has(id)) (ids.add(id), (grew = true));
    }
    return Math.round((rows.filter(([id]) => ids.has(id)).reduce((a, r) => a + r[2], 0) / 1024) * 10) / 10;
  } catch {
    return null;
  }
}

const { server, port } = await startServer({ port: 8300, tries: 50 });
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: argv.includes("--headed") ? false : "new",
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--window-size=1280,720", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-frame-rate-limit", "--disable-gpu-vsync", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e));
  await page.goto(`http://localhost:${port}/?bench=1&seed=${seed}&duration=${duration}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__benchResult, { timeout: (3 + duration + 120) * 1000, polling: 250 });
  const r = await page.evaluate(() => window.__benchResult);
  const start = await page.evaluate(() => window.__benchStart);
  // memory: the scene keeps running after the measurement, sample the browser process tree a few times
  const pid = browser.process()?.pid;
  const samples = pid ? [treeRssMb(pid), treeRssMb(pid), treeRssMb(pid)].filter((x) => typeof x === "number" && !Number.isNaN(x)) : [];
  const round1 = (x) => Math.round(x * 10) / 10;
  const result = {
    contract_version: "1.3",
    avg_fps: round1(r.avg_fps),
    p1_low_fps: round1(r.p1_low_fps),
    frame_ms_p95: round1(r.frame_ms_p95),
    frames: r.frames,
    load_ms: Math.round(start - processStart),
    peak_mem_mb: samples.length ? Math.max(...samples) : null,
    peak_mem_note: "Web build: RSS (working set) summed over the Chrome process tree, sampled 3 times right after the measured interval while the scene keeps running (approximation of the peak). peak_js_heap_mb is the JS heap peak during the interval.",
    peak_js_heap_mb: r.peak_js_heap_mb,
    vsync_off: true,
    vsync_note: "Chrome started with --disable-gpu-vsync --disable-frame-rate-limit.",
    renderer: `${r.renderer}; ${await browser.version()}`,
    os: `${platform()} ${release()} ${arch()}; ${cpus()[0].model}, ${cpus().length} threads; ${Math.round(totalmem() / 1073741824)} GB RAM`,
  };
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
process.exit(0);
