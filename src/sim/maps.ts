import type { Tuning, Vec3 } from "./types";

export interface Pad {
  pos: Vec3;
  vy: number;
  /** horizontal launch velocity (x, z) in m/s */
  hv: [number, number];
}

export interface NightMap {
  night: 1 | 2 | 3;
  name: string;
  durationS: number;
  start: Vec3;
  /** Ground height at (x, z), or null where there is nothing (void). */
  height(x: number, z: number): number | null;
  lanterns: Vec3[];
  motePoints: Vec3[];
  shadePoints: Vec3[];
  shadeMax: number;
  shadeEvery: number; // ticks
  shadeSpeed: number;
  pads: Pad[];
  charms: Vec3[];
  tower: { x: number; z: number; r: number } | null;
  drifters: boolean;
  wind: boolean;
  /** Circles used to pick random land points for Drifters: [cx, cz, r]. */
  land: [number, number, number][];
}

const DEG = Math.PI / 180;
/** (x, z) = (r cos t, r sin t), t in degrees. */
export const pol = (r: number, deg: number, cx = 0, cz = 0, y = 0): Vec3 => [
  cx + r * Math.cos(deg * DEG),
  y,
  cz + r * Math.sin(deg * DEG),
];
const ring = (n: number, r: number, startDeg: number, cx = 0, cz = 0, y = 0): Vec3[] =>
  Array.from({ length: n }, (_, i) => pol(r, startDeg + (i * 360) / n, cx, cz, y));

function unit(dx: number, dz: number): [number, number] {
  const d = Math.hypot(dx, dz);
  return [dx / d, dz / d];
}

function night1(t: Tuning): NightMap {
  return {
    night: 1,
    name: "Đảo Bến",
    durationS: t.night1_duration_s,
    start: [0, 0, 0],
    height: (x, z) => (Math.hypot(x, z) <= 40 ? 0 : null),
    lanterns: [
      [0, 0, 25],
      [23.8, 0, 7.7],
      [14.7, 0, -20.2],
      [-14.7, 0, -20.2],
      [-23.8, 0, 7.7],
    ],
    motePoints: [...ring(8, 12, 0), ...ring(16, 33, 0)],
    shadePoints: ring(12, 37, 15),
    shadeMax: 6,
    shadeEvery: 480,
    shadeSpeed: t.shade_speed,
    pads: [],
    charms: [],
    tower: null,
    drifters: false,
    wind: false,
    land: [[0, 0, 40]],
  };
}

function night2(t: Tuning): NightMap {
  const inA = (x: number, z: number) => Math.hypot(x, z) <= 28;
  const inB = (x: number, z: number) => Math.hypot(x - 70, z) <= 28;
  const bridge = (x: number, z: number) => x >= 26 && x <= 44 && Math.abs(z) <= 2;
  const padA: Vec3 = [20, 0, 18];
  const padB: Vec3 = [50, 0, -18];
  const toB = unit(70 - padA[0], 0 - padA[2]);
  const toA = unit(0 - padB[0], 0 - padB[2]);
  const island = (cx: number): Vec3[] => [
    ...[0, 90, 180, 270].map((a) => pol(10, a, cx, 0)),
    ...ring(8, 22, 0, cx, 0),
  ];
  return {
    night: 2,
    name: "Đảo Cau",
    durationS: t.night2_duration_s,
    start: [0, 0, 0],
    height: (x, z) => (inA(x, z) || inB(x, z) || bridge(x, z) ? 0 : null),
    lanterns: [
      [0, 0, 20],
      [17, 0, -10],
      [-17, 0, -10],
      [70, 0, 20],
      [87, 0, -10],
      [53, 0, -10],
    ],
    motePoints: [...island(0), ...island(70)],
    shadePoints: [...ring(8, 26, 22.5, 0, 0), ...ring(8, 26, 22.5, 70, 0)],
    shadeMax: 8,
    shadeEvery: 420,
    shadeSpeed: t.shade_speed,
    pads: [
      { pos: padA, vy: 14, hv: [toB[0] * 24, toB[1] * 24] },
      { pos: padB, vy: 14, hv: [toA[0] * 24, toA[1] * 24] },
    ],
    charms: [[35, 0, 0]],
    tower: null,
    drifters: true,
    wind: false,
    land: [
      [0, 0, 28],
      [70, 0, 28],
    ],
  };
}

const RAMP_ANGLES = [30, 150];

function night3(t: Tuning): NightMap {
  const height = (x: number, z: number): number | null => {
    const r = Math.hypot(x, z);
    if (r > 45) return null;
    let h = 0;
    if (r <= 8) h = 6;
    else if (r >= 12 && r <= 24 && z > 0) h = 3;
    for (const a of RAMP_ANGLES) {
      const ux = Math.cos(a * DEG);
      const uz = Math.sin(a * DEG);
      const s = x * ux + z * uz;
      const lat = Math.abs(-x * uz + z * ux);
      if (s >= 24 && s <= 30 && lat <= 1.5) h = Math.max(h, (3 * (30 - s)) / 6);
    }
    return h;
  };
  return {
    night: 3,
    name: "Đảo Chuông",
    durationS: t.night3_duration_s,
    start: [0, 0, -20],
    height,
    lanterns: [
      [0, 6, 6],
      [18, 3, 10],
      [-18, 3, 10],
      [35, 0, -10],
      [-35, 0, -10],
      [20, 0, -35],
      [-20, 0, -35],
    ],
    motePoints: [
      ...ring(18, 34, 0, 0, 0, 0),
      ...[20, 40, 60, 80, 100, 120, 140, 160].map((a) => pol(18, a, 0, 0, 3)),
      ...[45, 135, 225, 315].map((a) => pol(5, a, 0, 0, 6)),
    ],
    shadePoints: ring(16, 43, 0),
    shadeMax: 10,
    shadeEvery: 360,
    shadeSpeed: 4.5,
    pads: [{ pos: [0, 3, 13], vy: 12, hv: [0, -8] }],
    charms: [
      [30, 0, 25],
      [-30, 0, 25],
    ],
    tower: { x: 0, z: 0, r: 2 },
    drifters: true,
    wind: true,
    land: [[0, 0, 45]],
  };
}

export function buildMap(night: number, t: Tuning): NightMap {
  if (night === 1) return night1(t);
  if (night === 2) return night2(t);
  if (night === 3) return night3(t);
  throw new Error(`unknown night ${night}`);
}
