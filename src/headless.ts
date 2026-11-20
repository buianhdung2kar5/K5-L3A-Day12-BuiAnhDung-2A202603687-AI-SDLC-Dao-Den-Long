import { readFileSync, writeFileSync } from "node:fs";
import { InputError, parseInputs, parseScenario } from "./sim/scenario";
import { InputTrack, Sim } from "./sim/sim";

const USAGE =
  "usage: headless --seed <int> --night 1 [--scenario <file>] [--inputs <file>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]";

function die(msg: string): never {
  process.stderr.write(`error: ${msg}\n${USAGE}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Map<string, string> {
  const known = new Set(["seed", "night", "scenario", "inputs", "ticks", "out", "snapshot-every"]);
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--") || !known.has(k.slice(2))) die(`unknown argument ${k}`);
    if (i + 1 >= argv.length) die(`missing value for ${k}`);
    m.set(k.slice(2), argv[i + 1]);
  }
  return m;
}

function intArg(a: Map<string, string>, key: string, min: number, dflt?: number): number {
  const v = a.get(key);
  if (v === undefined) {
    if (dflt !== undefined) return dflt;
    die(`--${key} is required`);
  }
  if (!/^-?\d+$/.test(v)) die(`--${key} must be an integer`);
  const n = Number(v);
  if (n < min) die(`--${key} must be >= ${min}`);
  return n;
}

function readJson(path: string, what: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    die(`cannot read ${what} file ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    die(`${what} file is not valid JSON: ${(e as Error).message}`);
  }
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  const seed = intArg(a, "seed", -2147483648);
  const night = intArg(a, "night", 1);
  if (night > 3) die("--night must be 1, 2 or 3");
  const ticks = intArg(a, "ticks", 0);
  const every = intArg(a, "snapshot-every", 1, 10);
  const out = a.get("out");
  if (!out) die("--out is required");

  let sim: Sim;
  let track: InputTrack;
  try {
    const scn = a.has("scenario") ? parseScenario(readJson(a.get("scenario")!, "scenario")) : {};
    const frames = a.has("inputs") ? parseInputs(readJson(a.get("inputs")!, "inputs")) : [];
    sim = new Sim(seed, scn, night);
    track = new InputTrack(frames);
  } catch (e) {
    if (e instanceof InputError) die(e.message);
    throw e;
  }

  const lines: string[] = [JSON.stringify(sim.snapshot())];
  for (let k = 0; k < ticks && sim.state === "playing"; k++) {
    for (const e of sim.step(track.at(k))) lines.push(JSON.stringify(e));
    if (sim.tick % every === 0) lines.push(JSON.stringify(sim.snapshot()));
  }
  lines.push(JSON.stringify({ type: "end", ticks: sim.tick, state: sim.state, score: sim.score }));
  writeFileSync(out, lines.join("\n") + "\n");
}

main();
