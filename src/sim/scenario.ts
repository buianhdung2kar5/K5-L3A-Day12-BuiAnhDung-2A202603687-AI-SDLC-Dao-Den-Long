import { BUTTONS } from "./types";
import type { DrifterState, InputFrame, Scenario, ShadeState, Vec3 } from "./types";

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

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "") fail(`${what} must be a non-empty string`);
  return v;
}

/** Accepts [x, z] (y left undefined -> ground height) or [x, y, z]. */
function vec(v: unknown, what: string): Vec3 {
  if (!Array.isArray(v) || (v.length !== 2 && v.length !== 3)) fail(`${what} must be [x,z] or [x,y,z]`);
  const a = v.map((c, i) => num(c, `${what}[${i}]`));
  return a.length === 2 ? [a[0], NaN, a[1]] : [a[0], a[1], a[2]];
}

const SHADE_STATES: ShadeState[] = ["spawning", "wander", "chase", "recoil", "stunned"];
const DRIFTER_STATES: DrifterState[] = ["idle", "chase", "flee", "removed"];

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) fail(`${what} must be an array`);
  return v;
}

export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) fail("scenario must be a JSON object");
  const s: Scenario = {};
  if (raw.player !== undefined) {
    const p = raw.player;
    if (!isObj(p)) fail("player must be an object");
    s.player = {};
    if (p.pos !== undefined) s.player.pos = vec(p.pos, "player.pos");
    for (const k of ["carried", "flames", "invuln_ticks", "dash_cd_ticks", "pulse_cd_ticks", "charm_ticks"] as const) {
      if (p[k] !== undefined) s.player[k] = intNonNeg(p[k], `player.${k}`);
    }
  }
  for (const k of ["random_motes", "random_shades", "random_drifters", "wind_enabled"] as const) {
    if (raw[k] !== undefined) s[k] = bool(raw[k], k);
  }
  if (raw.motes !== undefined) {
    s.motes = list(raw.motes, "motes").map((m, i) => {
      if (Array.isArray(m)) return { pos: vec(m, `motes[${i}]`) };
      if (!isObj(m)) fail(`motes[${i}] must be a position or an object`);
      const out: NonNullable<Scenario["motes"]>[number] = { pos: vec(m.pos, `motes[${i}].pos`) };
      if (m.id !== undefined) out.id = str(m.id, `motes[${i}].id`);
      if (m.kind !== undefined) {
        if (m.kind !== "random" && m.kind !== "dropped") fail(`motes[${i}].kind must be "random" or "dropped"`);
        out.kind = m.kind;
      }
      if (m.ttl_s !== undefined) out.ttl_s = num(m.ttl_s, `motes[${i}].ttl_s`);
      return out;
    });
  }
  if (raw.shades !== undefined) {
    s.shades = list(raw.shades, "shades").map((sh, i) => {
      if (!isObj(sh)) fail(`shades[${i}] must be an object`);
      const out: NonNullable<Scenario["shades"]>[number] = { pos: vec(sh.pos, `shades[${i}].pos`) };
      if (sh.id !== undefined) out.id = str(sh.id, `shades[${i}].id`);
      if (sh.state !== undefined) {
        if (!SHADE_STATES.includes(sh.state as ShadeState)) fail(`shades[${i}].state must be one of ${SHADE_STATES.join(", ")}`);
        out.state = sh.state as ShadeState;
      }
      if (sh.state_ticks_left !== undefined) out.state_ticks_left = intNonNeg(sh.state_ticks_left, `shades[${i}].state_ticks_left`);
      return out;
    });
  }
  if (raw.drifters !== undefined) {
    s.drifters = list(raw.drifters, "drifters").map((d, i) => {
      if (!isObj(d)) fail(`drifters[${i}] must be an object`);
      const out: NonNullable<Scenario["drifters"]>[number] = { pos: vec(d.pos, `drifters[${i}].pos`) };
      if (d.id !== undefined) out.id = str(d.id, `drifters[${i}].id`);
      if (d.state !== undefined) {
        if (!DRIFTER_STATES.includes(d.state as DrifterState)) fail(`drifters[${i}].state must be one of ${DRIFTER_STATES.join(", ")}`);
        out.state = d.state as DrifterState;
      }
      if (d.stolen !== undefined) out.stolen = intNonNeg(d.stolen, `drifters[${i}].stolen`);
      if (d.state_ticks_left !== undefined) out.state_ticks_left = intNonNeg(d.state_ticks_left, `drifters[${i}].state_ticks_left`);
      return out;
    });
  }
  if (raw.charms !== undefined) {
    s.charms = list(raw.charms, "charms").map((c, i) => {
      if (!isObj(c)) fail(`charms[${i}] must be an object`);
      const out: NonNullable<Scenario["charms"]>[number] = { pos: vec(c.pos, `charms[${i}].pos`) };
      if (c.id !== undefined) out.id = str(c.id, `charms[${i}].id`);
      if (c.available !== undefined) out.available = bool(c.available, `charms[${i}].available`);
      if (c.respawn_ticks !== undefined) out.respawn_ticks = intNonNeg(c.respawn_ticks, `charms[${i}].respawn_ticks`);
      return out;
    });
  }
  if (raw.lanterns !== undefined) {
    s.lanterns = list(raw.lanterns, "lanterns").map((l, i) => {
      if (!isObj(l)) fail(`lanterns[${i}] must be an object`);
      const out: { id: string; pos?: Vec3; lit?: boolean } = { id: str(l.id, `lanterns[${i}].id`) };
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
    for (const k of BUTTONS) {
      if (f[k] !== undefined) out[k] = bool(f[k], `frames[${i}].${k}`);
    }
    return out;
  });
}
