// Runs tests/cases/cases.json against dist/headless.js and writes docs/proof/phase1/.
// Expectations are hand-computed in cases.json; this runner only compares.
import { spawnSync, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "headless.js");
const proofDir = join(root, "docs", "proof", "phase1");
const runsDir = join(proofDir, "runs");
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

function run(c, tag = "") {
  const out = join(runsDir, `${c.name}${tag}.jsonl`);
  const args = ["--seed", String(c.args.seed), "--night", "1", "--ticks", String(c.args.ticks), "--out", out];
  if (c.snapshot_every) args.push("--snapshot-every", String(c.snapshot_every));
  if (c.scenario !== undefined) {
    const f = join(work, `${c.name}.scn.json`);
    writeFileSync(f, JSON.stringify(c.scenario));
    args.push("--scenario", f);
  }
  if (c.scenario_path) args.push("--scenario", c.scenario_path);
  for (const [key, raw] of [["inputs", c.inputs_raw ?? (c.inputs && JSON.stringify(c.inputs))]]) {
    if (raw !== undefined) {
      const f = join(work, `${c.name}.${key}.json`);
      writeFileSync(f, raw);
      args.push(`--${key}`, f);
    }
  }
  if (c.omit?.includes("out")) args.splice(args.indexOf("--out"), 2);
  const r = spawnSync("node", [bin, ...args], { encoding: "utf8" });
  return { r, out };
}

const rows = [];
let failed = 0;
for (const c of cases) {
  let errs = [];
  const { r, out } = run(c);
  if (c.expect_exit !== undefined) {
    if (r.status !== c.expect_exit) errs.push(`exit code ${r.status}, expected ${c.expect_exit}`);
    if (!r.stderr.trim()) errs.push("stderr is empty");
  } else {
    if (r.status !== 0) errs.push(`exit code ${r.status}: ${r.stderr}`);
    else {
      const lines = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      const events = lines.filter((l) => l.type === "event").map(({ tick, name, data }) => ({ tick, name, data }));
      const end = lines[lines.length - 1];
      errs.push(...subset(c.expect.events, events, "events"));
      if (end.type !== "end") errs.push("last line is not type=end");
      errs.push(...subset(c.expect.end, end, "end"));
      for (const s of c.expect.snapshots ?? []) {
        const snap = lines.find((l) => l.type === "snapshot" && l.tick === s.tick);
        if (!snap) errs.push(`no snapshot at tick ${s.tick}`);
        else errs.push(...subset(s.match, snap, `snapshot@${s.tick}`));
      }
    }
  }
  if (errs.length) failed++;
  rows.push({ name: c.name, covers: (c.covers ?? []).join(", "), why: c.why, ok: errs.length === 0, errs });
  console.log(`${errs.length ? "FAIL" : "ok  "} ${c.name}${errs.length ? "\n     " + errs.join("\n     ") : ""}`);
}

// Determinism (R1): same inputs twice -> identical bytes; different seed -> different bytes.
const det = { name: "determinism", why: "Default scenario with random motes and shades, 4000 ticks: seed 42 twice must be byte-identical; seed 43 must differ." };
const base = { args: { seed: 42, ticks: 4000 }, inputs: { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 600, move: [-1, 0.2], jump: true }, { tick: 601, jump: false }] } };
const a = run({ ...base, name: "determinism_a" }).out;
const b = run({ ...base, name: "determinism_b" }).out;
const c2 = run({ ...base, args: { seed: 43, ticks: 4000 }, name: "determinism_c" }).out;
const same = readFileSync(a).equals(readFileSync(b));
const differs = !readFileSync(a).equals(readFileSync(c2));
const detErrs = [];
if (!same) detErrs.push("same seed produced different output");
if (!differs) detErrs.push("different seeds produced identical output");
if (detErrs.length) failed++;
rows.push({ name: det.name, covers: "R1", why: det.why, ok: detErrs.length === 0, errs: detErrs });
console.log(`${detErrs.length ? "FAIL" : "ok  "} determinism ${detErrs.join("; ")}`);
rmSync(join(runsDir, "determinism_b.jsonl"));
rmSync(join(runsDir, "determinism_c.jsonl"));

let commit = "unknown";
let dirty = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  dirty = execSync("git status --porcelain -- . \":(exclude)docs/proof\"", { cwd: root }).toString().trim() ? " (working tree has uncommitted changes)" : "";
} catch {}
const md = [
  "# Phase 1 test results",
  "",
  `Generated by \`npm test\` (tests/run.mjs). Commit: ${commit}${dirty}. Node ${process.version}. ${new Date().toISOString()}.`,
  "",
  `Result: ${rows.length - failed}/${rows.length} passed.`,
  "",
  "Expected values are hand-computed in `tests/cases/cases.json` from `game.contract.json`; raw outputs are in `runs/`.",
  "",
  "| Case | Covers | What it proves | Result |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.covers} | ${r.why} | ${r.ok ? "pass" : "FAIL: " + r.errs.join("; ")} |`),
  "",
].join("\n");
writeFileSync(join(proofDir, "results.md"), md);
rmSync(work, { recursive: true, force: true });
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exit(failed ? 1 : 0);
