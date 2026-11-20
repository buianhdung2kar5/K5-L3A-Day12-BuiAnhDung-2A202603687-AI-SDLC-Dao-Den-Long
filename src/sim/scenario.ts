import type { InputFrame, Scenario, Vec3 } from "./types";

export class InputError extends Error {}

function fail(msg: string): never {
  throw new InputError(msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${what} must be a finite number`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") fail(`${what} must be a boolean`);
  return v;
}

function intNonNeg(v: unknown, what: string): number {
  const n = num(v, what);
  if (!Number.isInteger(n) || n < 0) fail(`${what} must be a non-negative integer`);
  return n;
}

/** Accepts [x, z] (y = 0) or [x, y, z]. */
function vec(v: unknown, what: string, defaultY = 0): Vec3 {
  if (!Array.isArray(v) || (v.length !== 2 && v.length !== 3)) fail(`${what} must be [x,z] or [x,y,z]`);
  const a = v.map((c, i) => num(c, `${what}[${i}]`));
  return a.length === 2 ? [a[0], defaultY, a[1]] : [a[0], a[1], a[2]];
}

export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) fail("scenario must be a JSON object");
  const s: Scenario = {};
  if (raw.player !== undefined) {
    if (!isObj(raw.player)) fail("player must be an object");
    s.player = {};
    if (raw.player.pos !== undefined) s.player.pos = vec(raw.player.pos, "player.pos");
    if (raw.player.carried !== undefined) s.player.carried = intNonNeg(raw.player.carried, "player.carried");
    if (raw.player.flames !== undefined) s.player.flames = intNonNeg(raw.player.flames, "player.flames");
  }
  if (raw.random_motes !== undefined) s.random_motes = bool(raw.random_motes, "random_motes");
  if (raw.random_shades !== undefined) s.random_shades = bool(raw.random_shades, "random_shades");
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) fail("motes must be an array");
    s.motes = raw.motes.map((m, i) => vec(m, `motes[${i}]`));
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) fail("shades must be an array");
    s.shades = raw.shades.map((sh, i) => {
      if (!isObj(sh)) fail(`shades[${i}] must be an object`);
      const out: { id?: string; pos: Vec3 } = { pos: vec(sh.pos, `shades[${i}].pos`, 0.5) };
      if (sh.id !== undefined) {
        if (typeof sh.id !== "string" || sh.id === "") fail(`shades[${i}].id must be a non-empty string`);
        out.id = sh.id;
      }
      return out;
    });
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) fail("lanterns must be an array");
    s.lanterns = raw.lanterns.map((l, i) => {
      if (!isObj(l)) fail(`lanterns[${i}] must be an object`);
      if (typeof l.id !== "string") fail(`lanterns[${i}].id must be a string`);
      const out: { id: string; pos?: Vec3; lit?: boolean } = { id: l.id };
      if (l.pos !== undefined) out.pos = vec(l.pos, `lanterns[${i}].pos`);
      if (l.lit !== undefined) out.lit = bool(l.lit, `lanterns[${i}].lit`);
      return out;
    });
  }
  if (raw.time_left_s !== undefined) {
    const t = num(raw.time_left_s, "time_left_s");
    if (t < 0) fail("time_left_s must be >= 0");
    s.time_left_s = t;
  }
  return s;
}

export function parseInputs(raw: unknown): InputFrame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames)) fail('inputs must be an object with a "frames" array');
  let last = -1;
  return raw.frames.map((f, i) => {
    if (!isObj(f)) fail(`frames[${i}] must be an object`);
    const tick = intNonNeg(f.tick, `frames[${i}].tick`);
    if (tick <= last) fail(`frames[${i}].tick must be strictly greater than the previous frame`);
    last = tick;
    const out: InputFrame = { tick };
    if (f.move !== undefined) {
      if (!Array.isArray(f.move) || f.move.length !== 2) fail(`frames[${i}].move must be [x,z]`);
      const x = num(f.move[0], `frames[${i}].move[0]`);
      const z = num(f.move[1], `frames[${i}].move[1]`);
      if (Math.abs(x) > 1 || Math.abs(z) > 1) fail(`frames[${i}].move components must be in [-1,1]`);
      out.move = [x, z];
    }
    if (f.cam_yaw_deg !== undefined) out.cam_yaw_deg = num(f.cam_yaw_deg, `frames[${i}].cam_yaw_deg`);
    for (const k of ["jump", "interact", "pulse"] as const) {
      if (f[k] !== undefined) out[k] = bool(f[k], `frames[${i}].${k}`);
    }
    return out;
  });
}
