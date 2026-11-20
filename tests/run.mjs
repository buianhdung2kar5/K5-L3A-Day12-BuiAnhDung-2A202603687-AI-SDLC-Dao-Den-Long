// Runs tests/cases/cases.json against dist/headless.js and writes docs/proof/phase3/.
// Expectations are hand-computed in cases.json; this runner only compares.
import { spawnSync, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "headless.js");
const proofDir = join(root, "docs", "proof", "phase4");
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


// ---- Soak (Ticket-04): 10 Nights in one process, no crash, RSS at the end <= 1.2 x RSS at the start
{
  const soakOut = join(work, "soak.json");
  const r = spawnSync("node", [join(root, "dist", "soak.js"), "--seed", "7", "--nights", "10", "--out", soakOut], { encoding: "utf8" });
  const errs = [];
  if (r.status !== 0) errs.push(`exit ${r.status}: ${r.stderr}`);
  else {
    const j = JSON.parse(readFileSync(soakOut, "utf8"));
    if (j.nights !== 10 || j.results.length !== 10) errs.push("expected 10 Nights / 10 results");
    if (j.crashes !== 0) errs.push(`crashes = ${j.crashes}`);
    if (!(j.mem_end_mb <= 1.2 * j.mem_start_mb)) errs.push(`mem_end ${j.mem_end_mb} > 1.2 x mem_start ${j.mem_start_mb}`);
    if (!j.results.every((x) => x === "won" || x === "lost")) errs.push("results must be won/lost: " + j.results.join(","));
    for (const k of ["nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"]) if (!(k in j)) errs.push(`missing ${k}`);
    writeFileSync(join(proofDir, "soak-run.json"), JSON.stringify(j) + "\n");
    add("soak_10_nights", "U2", "node dist/soak.js --seed 7 --nights 10: 10 Nights (1->2->3 rotating) in one process, crashes 0, mem_end <= 1.2 x mem_start, all results won/lost.", errs, `mem ${j.mem_start_mb} -> ${j.mem_end_mb} MB, ${j.duration_s} s`);
  }
  if (r.status !== 0) add("soak_10_nights", "U2", "soak run", errs);
}
{
  const a = join(work, "soak-a.json");
  const b = join(work, "soak-b.json");
  spawnSync("node", [join(root, "dist", "soak.js"), "--seed", "7", "--nights", "4", "--out", a]);
  spawnSync("node", [join(root, "dist", "soak.js"), "--seed", "7", "--nights", "4", "--out", b]);
  const ja = JSON.parse(readFileSync(a, "utf8"));
  const jb = JSON.parse(readFileSync(b, "utf8"));
  const errs = JSON.stringify(ja.results) === JSON.stringify(jb.results) ? [] : ["results differ between two runs with the same seed"];
  add("soak_is_deterministic", "U2", "Same seed -> same per-Night results.", errs);
}
{
  const bad = spawnSync("node", [join(root, "dist", "soak.js"), "--seed", "x", "--nights", "2", "--out", join(work, "x.json")], { encoding: "utf8" });
  add("soak_bad_args", "U2", "Bad arguments exit with code 2.", bad.status === 2 ? [] : [`exit ${bad.status}`]);
}

// ---- Leaderboard server logic (Ticket-04 part 3)
{
  const lb = await import("../scripts/server.mjs");
  const file = join(work, "lb", "leaderboard.json");
  const t = (i) => new Date(Date.UTC(2026, 10, 20, 8, 0, i));
  const errs = [];
  const check = (cond, msg) => cond || errs.push(msg);
  for (const [name, score] of [["Ann", 300], ["Bob", 500], ["Cid", 300], ["Dan", 100]]) lb.addEntry({ name, score, nights_won: 1, seed: 1 }, file, t(errs.length + score));
  let e = lb.readEntries(file);
  check(e.map((x) => x.name).join() === "Bob,Ann,Cid,Dan", "order by score desc, ties: earlier first: " + e.map((x) => x.name).join());
  check(e.every((x) => /^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/.test(x.achieved_at)), "achieved_at must be ISO 8601 with timezone");
  check(e.every((x) => ["name", "score", "nights_won", "achieved_at", "seed"].every((k) => k in x)), "entry fields");
  for (let i = 0; i < 12; i++) lb.addEntry({ name: `Player${i}`, score: 1000 + i, nights_won: 3, seed: i }, file, t(100 + i));
  e = lb.readEntries(file);
  check(e.length === 10, "keeps the top 10 only, got " + e.length);
  check(e[0].score === 1011 && e[9].score === 1002, "top 10 are the highest scores");
  check(lb.readEntries(file).length === 10, "persisted on disk and readable after a 'restart'");
  const rank = lb.addEntry({ name: "Low_one", score: 5, nights_won: 0, seed: 1 }, file, t(500));
  check(rank.rank === null && rank.entries.length === 10, "score below the top 10 is not stored");
  for (const bad of ["ab", "a b c", "abcdefghijklm", "x-y_z!", "", 5]) check(lb.validateEntry({ name: bad, score: 1, nights_won: 0, seed: 1 }) !== null, `name ${JSON.stringify(bad)} must be rejected`);
  for (const good of ["abc", "Bob_12", "ABCDEFGHIJKL", "Nguyễn", "Trần_Ái9"]) check(lb.validateEntry({ name: good, score: 1, nights_won: 0, seed: 1 }) === null, `name ${good} must be accepted`);
  check(lb.validateEntry({ name: "abc", score: -1, nights_won: 0, seed: 1 }) !== null, "negative score rejected");
  check(lb.validateEntry({ name: "abc", score: 1, nights_won: 4, seed: 1 }) !== null, "nights_won 4 rejected");
  add("leaderboard_rules", "U3", "Top 10 sorted by score (ties: earlier first), ISO 8601 time with timezone, persisted on disk, names 3-12 chars [letters digits _] (Vietnamese letters accepted), invalid score/nights rejected.", errs);
}
{
  const lb = await import("../scripts/server.mjs");
  const file = join(work, "lb2", "leaderboard.json");
  const errs = [];
  const { server, port } = await lb.startServer({ port: 8350, tries: 30, lbPath: file, root: join(root, "dist", "web") });
  const post = (b) => fetch(`http://localhost:${port}/api/leaderboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  let r = await post({ name: "Hello_01", score: 250, nights_won: 2, seed: 9 });
  const j = await r.json();
  if (r.status !== 200 || j.rank !== 1) errs.push(`valid POST: ${r.status} ${JSON.stringify(j)}`);
  r = await post({ name: "no", score: 1, nights_won: 0, seed: 1 });
  if (r.status !== 400) errs.push(`invalid name must be 400, got ${r.status}`);
  const g = await (await fetch(`http://localhost:${port}/api/leaderboard`)).json();
  if (g.entries.length !== 1 || g.entries[0].name !== "Hello_01") errs.push("GET after POST: " + JSON.stringify(g));
  server.close();
  const out = join(work, "export.json");
  const x = spawnSync("node", [join(root, "scripts", "serve.mjs"), "--export-leaderboard", out], { encoding: "utf8", env: { ...process.env, LEADERBOARD_PATH: file } });
  if (x.status !== 0) errs.push(`export exit ${x.status}: ${x.stderr}`);
  else {
    const ex = JSON.parse(readFileSync(out, "utf8"));
    if (!Array.isArray(ex.entries) || ex.entries.length !== 1 || ex.entries[0].score !== 250) errs.push("export content: " + JSON.stringify(ex));
  }
  const empty = spawnSync("node", [join(root, "scripts", "serve.mjs"), "--export-leaderboard", join(work, "empty.json")], { encoding: "utf8", env: { ...process.env, LEADERBOARD_PATH: join(work, "nothing.json") } });
  if (empty.status !== 0 || JSON.stringify(JSON.parse(readFileSync(join(work, "empty.json"), "utf8"))) !== '{"entries":[]}') errs.push("empty export should be {\"entries\":[]}");
  add("leaderboard_http_and_export", "U3", "POST/GET /api/leaderboard (400 on a bad name) and `node scripts/serve.mjs --export-leaderboard out.json` writes {\"entries\":[...]} in order (and an empty list when nothing is saved).", errs);
}
// ---- Bench scenario switches (Ticket-04 part 1, simulation side)

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
