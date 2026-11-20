import { writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setFlagsFromString } from "node:v8";
import { Rng, stream } from "./sim/rng";
import { Sim } from "./sim/sim";
import type { InputState } from "./sim/types";

// Soak test (Ticket-04): N Nights back to back in ONE process, random inputs from the seed.
const USAGE = "usage: soak --seed <int> --nights <int> --out <file.json>";

function die(msg: string): never {
  process.stderr.write(`error: ${msg}\n${USAGE}\n`);
  process.exit(2);
}

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (!["--seed", "--nights", "--out"].includes(argv[i]) || i + 1 >= argv.length) die(`bad argument ${argv[i]}`);
  args.set(argv[i].slice(2), argv[i + 1]);
}
const int = (k: string): number => {
  const v = args.get(k);
  if (v === undefined || !/^-?\d+$/.test(v)) die(`--${k} must be an integer`);
  return Number(v);
};
const seed = int("seed");
const nights = int("nights");
if (nights < 1) die("--nights must be >= 1");
const out = args.get("out");
if (!out) die("--out is required");

// make full garbage collections available and keep the young generation small so RSS numbers are not noise
setFlagsFromString("--expose-gc");
setFlagsFromString("--max-semi-space-size=4");
const gc = runInNewContext("gc") as () => void;
const rssMb = (): number => {
  gc();
  gc();
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

/** Random input from the seed: new direction every 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact. */
function randomInputs(rng: Rng): () => InputState {
  let move: [number, number] = [0, 0];
  let tick = 0;
  return () => {
    if (tick++ % 30 === 0) {
      const a = rng.next() * 2 * Math.PI;
      move = rng.next() < 0.15 ? [0, 0] : [Math.cos(a), Math.sin(a)];
    }
    return { move, cam_yaw_deg: 0, jump: rng.next() < 0.05, dash: rng.next() < 0.03, pulse: rng.next() < 0.02, interact: rng.next() < 0.1, pause: false };
  };
}

/** Loading phase: compile and warm up the simulation (JIT) on throw-away Nights, so the first reading is a steady state. */
function warmUp(): void {
  for (let night = 1; night <= 3; night++) {
    const sim = new Sim(1000 + night, {}, night);
    const next = randomInputs(stream(1000 + night, 77));
    for (let t = 0; t < 1500 && sim.state === "playing"; t++) sim.step(next());
  }
}

const t0 = Date.now();
warmUp();
const results: string[] = [];
let crashes = 0;
let memStart = 0;
for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  try {
    let sim: Sim | null = new Sim(seed + i, {}, night);
    if (i === 0) memStart = rssMb(); // after the first Night is loaded
    const next = randomInputs(stream(seed + i, 77));
    let guard = 0;
    while (sim.state === "playing" && guard++ < 60 * 400) sim.step(next());
    results.push(sim.state === "playing" ? "unfinished" : sim.state);
    sim = null; // reset
  } catch (e) {
    crashes++;
    results.push("crashed");
    process.stderr.write(`night ${i + 1} crashed: ${(e as Error).stack}\n`);
  }
}
const memEnd = rssMb(); // after the last Night has been reset
const report = { nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: Math.round(((Date.now() - t0) / 1000) * 10) / 10 };
writeFileSync(out, JSON.stringify(report) + "\n");
process.exit(0);
