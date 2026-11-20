import { stream } from "./rng";
import type { Scenario } from "./types";

/**
 * The standard benchmark scene (Ticket-04): Night 1, exactly 200 shades in state `wander` spread evenly over
 * the island (area-uniform, seeded), exactly 100 fireflies, L1-L3 lit with fuel 100, Mây standing at (0,0,0).
 * Everything that could change the load (spawns, damage, pickups, fuel decay, end conditions) is off (`bench: true`).
 */
export const BENCH_SHADES = 200;
export const BENCH_MOTES = 100;

export function benchScenario(seed: number): Scenario {
  const rng = stream(seed, 99);
  const lanterns = [
    [0, 25],
    [23.8, 7.7],
    [14.7, -20.2],
  ];
  const farFromLanterns = (x: number, z: number, r: number) => lanterns.every(([lx, lz]) => Math.hypot(x - lx, z - lz) > r);
  const point = (rMax: number, minFromOrigin: number, minFromLantern: number): [number, number] => {
    for (;;) {
      const a = rng.next() * 2 * Math.PI;
      const r = rMax * Math.sqrt(rng.next());
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      if (Math.hypot(x, z) >= minFromOrigin && farFromLanterns(x, z, minFromLantern)) return [x, z];
    }
  };
  const shades: NonNullable<Scenario["shades"]> = [];
  for (let i = 0; i < BENCH_SHADES; i++) { const [x, z] = point(38, 3, 7); shades.push({ id: `S${i + 1}`, pos: [x, NaN, z], state: "wander" }); }
  const motes: NonNullable<Scenario["motes"]> = [];
  for (let i = 0; i < BENCH_MOTES; i++) { const [x, z] = point(38, 2, 1); motes.push({ pos: [x, NaN, z] }); }
  return {
    bench: true,
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: false,
    player: { pos: [0, NaN, 0] },
    lanterns: [
      { id: "L1", lit: true, fuel: 100 },
      { id: "L2", lit: true, fuel: 100 },
      { id: "L3", lit: true, fuel: 100 },
    ],
    shades,
    motes,
  };
}
