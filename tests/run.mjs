// Runs tests/cases/cases.json against dist/headless.js and writes docs/proof/phase3/.
// Expectations are hand-computed in cases.json; this runner only compares.
import { spawnSync, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "headless.js");
const proofDir = join(root, "docs", "proof", "phase3");
const runsDir = join(proofDir, "runs");
rmSync(runsDir, { recursive: true, force: true });
mkdirSync(runsDir, { recursive: true });
if (!existsSync(bin)) {
  console.error("dist/headless.js missing: run `npm run build` first");
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), "ddl-"));
const { cases } = JSON.parse(readFileSync(join(root, "tests", "cases", "cases.json"), "utf8"));

/** exp must be a subset of act (numbers within 0.0005, arrays equal length). */
function subset(exp, act, path = "") {
  if (typeof exp === "number") {
    return typeof act === "number" && Math.abs(exp - act) <= 0.0005 ? [] : [`${path}: expected ${exp}, got ${JSON.stringify(act)}`];
  }
  if (Array.isArray(exp)) {
    if (!Array.isArray(act) || act.length !== exp.length) return [`${path}: expected array of ${exp.length}, got ${JSON.stringify(act)}`];
    return exp.flatMap((e, i) => subset(e, act[i], `${path}[${i}]`));
  }
  if (exp && typeof exp === "object") {
    if (!act || typeof act !== "object") return [`${path}: expected object, got ${JSON.stringify(act)}`];
    return Object.keys(exp).flatMap((k) => subset(exp[k], act[k], `${path}.${k}`));
  }
  return exp === act ? [] : [`${path}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`];
}

const hd = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Extra geometric checks that a subset match cannot express. */
function runCheck(chk, snaps) {
  const s = snaps.get(chk.tick);
  const errs = [];
  const need = (t) => snaps.get(t) ?? errs.push(`no snapshot at tick ${t}`) ?? null;
  switch (chk.type) {
    case "motes_distinct": {
      if (!s) return [`no snapshot at tick ${chk.tick}`];
      const n = new Set(s.motes.map((m) => m.pos.join(","))).size;
      if (n !== chk.count) errs.push(`${n} distinct mote positions, expected ${chk.count}`);
      break;
    }
    case "motes_ring": {
      if (!s) return [`no snapshot at tick ${chk.tick}`];
      const ms = s.motes.filter((m) => m.kind === chk.kind);
      if (ms.length !== chk.count) errs.push(`${ms.length} ${chk.kind} motes, expected ${chk.count}`);
      for (const m of ms) {
        const d = hd(m.pos, s.player.pos);
        if (d < chk.min - 1e-3 || d > chk.max + 1e-3) errs.push(`mote ${m.id} at ${d.toFixed(3)} m, expected ${chk.min}..${chk.max}`);
      }
      break;
    }
    case "shade_min_dist": {
      if (!s) return [`no snapshot at tick ${chk.tick}`];
      if (s.shades.length !== chk.count) errs.push(`${s.shades.length} shades, expected ${chk.count}`);
      for (const sh of s.shades) {
        const d = hd(sh.pos, s.player.pos);
        if (d < chk.min - 1e-3) errs.push(`shade ${sh.id} only ${d.toFixed(3)} m away (min ${chk.min})`);
      }
      break;
    }
    case "player_box": {
      if (!s) return [`no snapshot at tick ${chk.tick}`];
      const p = s.player.pos;
      for (let i = 0; i < 3; i++) if (p[i] < chk.min[i] || p[i] > chk.max[i]) errs.push(`player pos ${JSON.stringify(p)} outside box ${JSON.stringify(chk.min)}..${JSON.stringify(chk.max)}`);
      break;
    }
    case "player_in_circle": {
      if (!s) return [`no snapshot at tick ${chk.tick}`];
      const p = s.player.pos;
      const d = Math.hypot(p[0] - chk.circle[0], p[2] - chk.circle[1]);
      if (d > chk.circle[2]) errs.push(`player at ${d.toFixed(2)} m from centre, circle radius ${chk.circle[2]}`);
      if (chk.y !== undefined && Math.abs(p[1] - chk.y) > 0.0005) errs.push(`player y=${p[1]}, expected ${chk.y}`);
      break;
    }
    case "wind_push": {
      const a = need(chk.from);
      const b = need(chk.to);
      if (!a || !b) return errs;
      const dx = b.player.pos[0] - a.player.pos[0];
      const dz = b.player.pos[2] - a.player.pos[2];
      const len = Math.hypot(dx, dz);
      if (Math.abs(len - chk.length) > 0.01) errs.push(`pushed ${len.toFixed(3)} m, expected ${chk.length}`);
      let ang = (Math.atan2(dz, dx) * 180) / Math.PI;
      if (ang < 0) ang += 360;
      const want = a.wind.dir_deg;
      const diff = Math.abs(((ang - want + 540) % 360) - 180);
      if (diff > 0.5) errs.push(`pushed toward ${ang.toFixed(2)} deg, wind.dir_deg says ${want}`);
      break;
    }
    default:
      errs.push(`unknown check ${chk.type}`);
  }
  return errs;
}

function run(c, tag = "") {
  const out = join(runsDir, `${c.name}${tag}.jsonl`);
  const args = ["--seed", String(c.args.seed), "--night", String(c.args.night ?? 1), "--ticks", String(c.args.ticks), "--out", out];
  if (c.snapshot_every) args.push("--snapshot-every", String(c.snapshot_every));
  if (c.scenario !== undefined) {
    const f = join(work, `${c.name}${tag}.scn.json`);
    writeFileSync(f, JSON.stringify(c.scenario));
    args.push("--scenario", f);
  }
  if (c.scenario_path) args.push("--scenario", c.scenario_path);
  const rawInputs = c.inputs_raw ?? (c.inputs && JSON.stringify(c.inputs));
  if (rawInputs !== undefined) {
    const f = join(work, `${c.name}${tag}.inputs.json`);
    writeFileSync(f, rawInputs);
    args.push("--inputs", f);
  }
  if (c.omit?.includes("out")) args.splice(args.indexOf("--out"), 2);
  const t0 = Date.now();
  const r = spawnSync("node", [bin, ...args], { encoding: "utf8" });
  return { r, out, ms: Date.now() - t0 };
}

const rows = [];
let failed = 0;
const add = (name, covers, why, errs, note = "") => {
  if (errs.length) failed++;
  rows.push({ name, covers, why, ok: errs.length === 0, errs, note });
  console.log(`${errs.length ? "FAIL" : "ok  "} ${name}${errs.length ? "\n     " + errs.join("\n     ") : ""}`);
};

for (const c of cases) {
  const errs = [];
  const { r, out } = run(c);
  if (c.expect_exit !== undefined) {
    if (r.status !== c.expect_exit) errs.push(`exit code ${r.status}, expected ${c.expect_exit}`);
    if (!r.stderr.trim()) errs.push("stderr is empty");
  } else if (r.status !== 0) {
    errs.push(`exit code ${r.status}: ${r.stderr}`);
  } else {
    const lines = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const ex = c.expect;
    let events = lines.filter((l) => l.type === "event").map(({ tick, name, data }) => ({ tick, name, data }));
    if (!ex.keep_night_start) events = events.filter((e) => e.name !== "night_start");
    if (ex.event_names) events = events.filter((e) => ex.event_names.includes(e.name));
    const end = lines[lines.length - 1];
    errs.push(...subset(ex.events, events, "events"));
    if (end.type !== "end") errs.push("last line is not type=end");
    errs.push(...subset(ex.end, end, "end"));
    const snaps = new Map(lines.filter((l) => l.type === "snapshot").map((l) => [l.tick, l]));
    for (const s of ex.snapshots ?? []) {
      const snap = snaps.get(s.tick);
      if (!snap) errs.push(`no snapshot at tick ${s.tick}`);
      else errs.push(...subset(s.match, snap, `snapshot@${s.tick}`));
    }
    for (const chk of ex.checks ?? []) errs.push(...runCheck(chk, snaps));
  }
  add(c.name, (c.covers ?? []).join(", "), c.why, errs);
}

// Determinism (S17): every Night, same inputs twice -> identical bytes; different seed -> different bytes.
const detInputs = { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 600, move: [-1, 0.2], jump: true, dash: true }, { tick: 601, jump: false, dash: false }, { tick: 900, interact: true, pulse: true }] };
for (const night of [1, 2, 3]) {
  const base = { args: { seed: 42, ticks: 4000, night }, scenario: { player: { flames: 1000, carried: 6 } }, inputs: detInputs };
  const a = run({ ...base, name: `determinism_n${night}_a` }).out;
  const b = run({ ...base, name: `determinism_n${night}_b` }).out;
  const c2 = run({ ...base, args: { seed: 43, ticks: 4000, night }, name: `determinism_n${night}_c` }).out;
  const errs = [];
  if (!readFileSync(a).equals(readFileSync(b))) errs.push("same seed produced different output");
  if (readFileSync(a).equals(readFileSync(c2))) errs.push("different seeds produced identical output");
  add(`determinism_night${night}`, "S17", `Night ${night}, seed 42 twice with movement/jump/dash/interact/pulse inputs for 4000 ticks: byte-identical; seed 43 differs.`, errs);
  rmSync(join(runsDir, `determinism_n${night}_b.jsonl`));
  rmSync(join(runsDir, `determinism_n${night}_c.jsonl`));
}

// Performance (S18): a full Night (21,600 ticks) must finish in <= 30 s.
for (const night of [1, 2, 3]) {
  const { r, ms } = run({ name: `perf_night${night}`, args: { seed: 5, ticks: 21600, night }, snapshot_every: 10, scenario: { player: { flames: 1000000 }, time_left_s: 100000 } });
  const errs = [];
  if (r.status !== 0) errs.push(`exit ${r.status}: ${r.stderr}`);
  if (ms > 30000) errs.push(`took ${ms} ms (> 30000)`);
  add(`perf_night${night}`, "S18", "21,600 ticks (6 minutes of play) with a snapshot every 10 ticks must finish in <= 30 s.", errs, `${ms} ms`);
  rmSync(join(runsDir, `perf_night${night}.jsonl`), { force: true });
}

let commit = "unknown";
let dirty = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  dirty = execSync("git status --porcelain -- . \":(exclude)docs/proof\"", { cwd: root }).toString().trim() ? " (working tree has uncommitted changes)" : "";
} catch {}
const md = [
  "# Phase 3 test results",
  "",
  `Generated by \`npm test\` (tests/run.mjs). Commit: ${commit}${dirty}. Node ${process.version}. ${new Date().toISOString()}.`,
  "",
  `Result: ${rows.length - failed}/${rows.length} passed.`,
  "",
  "Expected values are hand-computed in `tests/cases/cases.json` from `game.contract.json` v1.2 and Tickets 02-03; raw outputs are in `runs/`.",
  "",
  "| Case | Covers | What it proves | Result |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.covers} | ${r.why} | ${r.ok ? "pass" + (r.note ? ` (${r.note})` : "") : "FAIL: " + r.errs.join("; ")} |`),
  "",
].join("\n");
writeFileSync(join(proofDir, "results.md"), md);
rmSync(work, { recursive: true, force: true });
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exit(failed ? 1 : 0);
