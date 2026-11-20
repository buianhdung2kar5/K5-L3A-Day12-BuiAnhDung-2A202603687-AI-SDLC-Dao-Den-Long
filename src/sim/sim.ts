import { buildMap } from "./maps";
import type { NightMap } from "./maps";
import { Rng, stream } from "./rng";
import { InputError } from "./scenario";
import { K, TUNING } from "./tuning";
import { BUTTONS } from "./types";
import type { Button, DrifterState, GameState, InputFrame, InputState, Scenario, ShadeState, SimEvent, Tuning, Vec3 } from "./types";

export interface Lantern { id: string; pos: Vec3; lit: boolean; deposited: number; fuelU: number; everLit: boolean; relit: number }
export interface Mote { id: string; pos: Vec3; kind: "random" | "dropped"; ttl: number | null; point: number }
export interface Shade {
  id: string;
  pos: Vec3; // centre
  state: ShadeState;
  left: number; // ticks left in spawning / stunned
  pushLeft: number;
  pushDir: [number, number];
  eject: number;
  ejectFrom: Vec3 | null;
  wanderDir: [number, number];
  wanderLeft: number;
  recoilLeft: number;
  recoilDir: [number, number];
  /** lantern being drained (state drain) */
  target: string | null;
  /** lantern a wandering shade must walk to (scenario target_lantern_id) */
  fixed: string | null;
  drainTicks: number;
}
export interface Drifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  left: number;
  wanderDir: [number, number];
  wanderLeft: number;
}
export interface Charm { id: string; pos: Vec3; available: boolean; respawn: number }

const r3 = (x: number): number => {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3v = (v: Vec3): Vec3 => [r3(v[0]), r3(v[1]), r3(v[2])];
const hdist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const idNum = (id: string): number => {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
};
const byId = <T extends { id: string }>(a: T, b: T): number => idNum(a.id) - idNum(b.id) || a.id.localeCompare(b.id);

/** Unit vector from a to b on the XZ plane; +X when they coincide. */
function dirXZ(a: Vec3, b: Vec3): [number, number] {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const d = Math.hypot(dx, dz);
  return d < 1e-9 ? [1, 0] : [dx / d, dz / d];
}

/**
 * Pure, deterministic simulation (contract v1.1). No DOM, no rendering, no wall clock.
 * One step() = 1/60 s. Step k reads inputs for tick k and produces state k+1.
 * Order inside a step follows Ticket-02 ("Thứ tự xử lý trong một tick").
 */
export class Sim {
  readonly t: Tuning;
  readonly map: NightMap;
  night: number;
  tick = 0;
  simTick = 0;
  state: "playing" | "won" | "lost" = "playing";
  paused = false;
  score = 0;

  player = {
    pos: [0, 0, 0] as Vec3,
    vel: [0, 0] as [number, number],
    vy: 0,
    grounded: true,
    launched: false,
    launchVel: [0, 0] as [number, number],
    dashLeft: 0,
    dashDir: [0, 1] as [number, number],
    facing: [0, 1] as [number, number],
    flames: 0,
    carried: 0,
    invuln: 0,
    dashCd: 0,
    pulseCd: 0,
    charm: 0,
    fallWait: 0,
    successful: 0,
  };
  lanterns: Lantern[] = [];
  motes: Mote[] = [];
  shades: Shade[] = [];
  drifters: Drifter[] = [];
  charms: Charm[] = [];
  windActive = false;
  windDir = 0;

  private durationTicks: number;
  private started = false;
  private prev: Record<Button, boolean> = { jump: false, interact: false, pulse: false, dash: false, pause: false };
  private nextMote = 1;
  private nextShade = 1;
  private nextDrifter = 1;
  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;
  private bench: boolean;
  private rngMote: Rng;
  private rngDrop: Rng;
  private rngShade: Rng;
  private rngDrifter: Rng;
  private rngWind: Rng;
  private rngWander: Rng;

  constructor(seed: number, scenario: Scenario = {}, night = 1, tuning: Tuning = TUNING) {
    this.t = tuning;
    this.night = night;
    const map = (this.map = buildMap(night, tuning));
    const t = tuning;
    this.rngMote = stream(seed, 1);
    this.rngDrop = stream(seed, 2);
    this.rngShade = stream(seed, 3);
    this.rngDrifter = stream(seed, 4);
    this.rngWind = stream(seed, 5);
    this.rngWander = stream(seed, 6);
    this.randomMotes = scenario.random_motes !== false;
    this.randomShades = scenario.random_shades !== false;
    this.randomDrifters = scenario.random_drifters !== false;
    this.windEnabled = scenario.wind_enabled !== false;
    this.bench = scenario.bench === true;
    this.durationTicks = Math.round((scenario.time_left_s ?? map.durationS) * K.tps);

    const ground = (x: number, z: number): number => map.height(x, z) ?? 0;
    const at = (p: Vec3): Vec3 => [p[0], Number.isNaN(p[1]) ? ground(p[0], p[2]) : p[1], p[2]];

    const pl = this.player;
    pl.flames = t.flames;
    pl.pos = [...map.start];
    pl.pos[1] = ground(pl.pos[0], pl.pos[2]);
    const sp = scenario.player;
    if (sp) {
      if (sp.pos) pl.pos = at(sp.pos);
      if (sp.carried !== undefined) pl.carried = sp.carried;
      if (sp.flames !== undefined) pl.flames = sp.flames;
      if (sp.invuln_ticks !== undefined) pl.invuln = sp.invuln_ticks;
      if (sp.dash_cd_ticks !== undefined) pl.dashCd = sp.dash_cd_ticks;
      if (sp.pulse_cd_ticks !== undefined) pl.pulseCd = sp.pulse_cd_ticks;
      if (sp.charm_ticks !== undefined) pl.charm = sp.charm_ticks;
      if (sp.successful_lights !== undefined) pl.successful = sp.successful_lights;
    }

    map.lanterns.forEach((p, i) => this.lanterns.push({ id: `L${i + 1}`, pos: [...p], lit: false, deposited: 0, fuelU: 0, everLit: false, relit: 0 }));
    for (const l of scenario.lanterns ?? []) {
      const target = this.lanterns.find((x) => x.id === l.id);
      if (!target) throw new InputError(`scenario lantern id "${l.id}" does not exist`);
      if (l.pos) target.pos = at(l.pos);
      if (l.lit !== undefined) target.lit = l.lit;
      target.everLit = l.ever_lit ?? (l.lit ? true : target.everLit);
      if (target.lit) {
        target.fuelU = Math.round((l.fuel ?? t.fuel_max) * K.tps);
        target.deposited = target.everLit ? t.relight_cost : t.lantern_cost;
      } else {
        target.fuelU = 0;
        target.deposited = 0;
      }
    }

    // fireflies
    if (scenario.motes) {
      for (const m of scenario.motes) {
        const kind = m.kind ?? "random";
        this.motes.push({
          id: m.id ?? this.freshMoteId(),
          pos: at(m.pos),
          kind,
          ttl: m.ttl_s !== undefined ? Math.round(m.ttl_s * K.tps) : kind === "dropped" ? K.dropTtl : null,
          point: -1,
        });
      }
    } else if (this.randomMotes) {
      const idx = map.motePoints.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(this.rngMote.next() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      for (const pi of idx.slice(0, K.moteInitial)) {
        this.motes.push({ id: this.freshMoteId(), pos: [...map.motePoints[pi]], kind: "random", ttl: null, point: pi });
      }
    }

    for (const sh of scenario.shades ?? []) {
      const state = sh.state ?? "chase";
      const p = at(sh.pos);
      this.shades.push({
        id: sh.id ?? this.freshShadeId(),
        pos: [p[0], Number.isNaN(sh.pos[1]) ? ground(p[0], p[2]) + K.shadeCenterY : p[1], p[2]],
        state,
        left: sh.state_ticks_left ?? (state === "spawning" ? K.shadeSpawningTicks : state === "stunned" ? K.pulseStunTicks : 0),
        pushLeft: 0,
        pushDir: [1, 0],
        eject: 0,
        ejectFrom: null,
        wanderDir: [1, 0],
        wanderLeft: 0,
        recoilLeft: state === "recoil" ? (sh.state_ticks_left ?? K.recoilTicks) : 0,
        recoilDir: [1, 0],
        target: state === "drain" ? (sh.target_lantern_id ?? null) : null,
        fixed: sh.target_lantern_id ?? null,
        drainTicks: 0,
      });
    }

    if (scenario.drifters) {
      for (const d of scenario.drifters) {
        const p = at(d.pos);
        const state = d.state ?? "idle";
        this.drifters.push({
          id: d.id ?? this.freshDrifterId(),
          pos: [p[0], Number.isNaN(d.pos[1]) ? K.drifterY + ground(p[0], p[2]) : p[1], p[2]],
          state,
          stolen: d.stolen ?? 0,
          left: d.state_ticks_left ?? (state === "flee" ? K.drifterFleeTicks : 0),
          wanderDir: [1, 0],
          wanderLeft: 0,
        });
      }
    }

    if (scenario.charms) {
      scenario.charms.forEach((c, i) => {
        this.charms.push({ id: c.id ?? `C${i + 1}`, pos: at(c.pos), available: c.available ?? true, respawn: c.respawn_ticks ?? 0 });
      });
    } else {
      map.charms.forEach((p, i) => this.charms.push({ id: `C${i + 1}`, pos: [...p], available: true, respawn: 0 }));
    }
  }

  get timeLeftS(): number {
    return (this.durationTicks - this.simTick) / K.tps;
  }
  /** Carry capacity grows by 2 per successful lighting this Night, up to capacity_max. */
  get capacity(): number {
    return Math.min(this.t.capacity_max, this.t.carry_capacity + K.capacityPerLight * this.player.successful);
  }
  private zoneActive(l: Lantern): boolean {
    return l.lit && l.fuelU >= this.t.low_fuel_threshold * K.tps;
  }
  private ejectShades(l: Lantern): void {
    for (const s of this.shades) {
      if (hdist(s.pos, l.pos) < this.t.safe_radius) {
        s.eject = K.ejectTicks;
        s.ejectFrom = l.pos;
      }
    }
  }
  get snapshotState(): GameState {
    return this.paused && this.state === "playing" ? "paused" : this.state;
  }

  private freshMoteId(): string {
    return `M${this.nextMote++}`;
  }
  private freshShadeId(): string {
    while (this.shades.some((s) => s.id === `S${this.nextShade}`)) this.nextShade++;
    return `S${this.nextShade++}`;
  }
  private freshDrifterId(): string {
    while (this.drifters.some((s) => s.id === `D${this.nextDrifter}`)) this.nextDrifter++;
    return `D${this.nextDrifter++}`;
  }

  // ---------------------------------------------------------------- terrain

  private blockedAt(x: number, z: number, footY: number): boolean {
    const tw = this.map.tower;
    if (tw && Math.hypot(x - tw.x, z - tw.z) < tw.r && footY < K.towerTop - 1e-9) return true;
    const h = this.map.height(x, z);
    return h !== null && h > footY + K.stepUp;
  }

  /** Move pos by (dx, dz) with wall sliding. Returns [blockedX, blockedZ]. */
  private slide(pos: Vec3, dx: number, dz: number, blocked: (x: number, z: number) => boolean): [boolean, boolean] {
    if (!blocked(pos[0] + dx, pos[2] + dz)) {
      pos[0] += dx;
      pos[2] += dz;
      return [false, false];
    }
    let bx = false;
    let bz = false;
    if (!blocked(pos[0] + dx, pos[2])) pos[0] += dx;
    else bx = true;
    if (!blocked(pos[0], pos[2] + dz)) pos[2] += dz;
    else bz = true;
    return [bx, bz];
  }

  private moveShade(s: Shade, dx: number, dz: number): void {
    const foot = s.pos[1] - K.shadeCenterY;
    this.slide(s.pos, dx, dz, (x, z) => this.map.height(x, z) === null || this.blockedAt(x, z, foot));
    this.keepOutOfZones(s);
    const h = this.map.height(s.pos[0], s.pos[2]);
    if (h !== null) s.pos[1] = h + K.shadeCenterY;
  }

  /** Lit lanterns block shades from outside (project to the zone edge). */
  private keepOutOfZones(s: Shade): void {
    for (const l of this.lanterns) {
      if (!this.zoneActive(l)) continue;
      if (s.eject > 0 && s.ejectFrom === l.pos) continue;
      const d = hdist(s.pos, l.pos);
      if (d < this.t.safe_radius) {
        const [ux, uz] = dirXZ(l.pos, s.pos);
        s.pos[0] = l.pos[0] + ux * this.t.safe_radius;
        s.pos[2] = l.pos[2] + uz * this.t.safe_radius;
      }
    }
  }

  private shadeNextState(s: Shade): ShadeState {
    return hdist(s.pos, this.player.pos) <= K.shadeDetect ? "chase" : "wander";
  }

  /** A wandering shade heads for the nearest weak lit lantern (fuel < threshold), else the nearest unlit one. */
  private wanderTarget(s: Shade): Lantern | null {
    if (s.fixed) return this.lanterns.find((l) => l.id === s.fixed) ?? null;
    const lowU = this.t.low_fuel_threshold * K.tps;
    const nearest = (pool: Lantern[]): Lantern | null => {
      let best: Lantern | null = null;
      let bd = Infinity;
      for (const l of pool) {
        const d = hdist(s.pos, l.pos);
        if (d < bd) {
          best = l;
          bd = d;
        }
      }
      return best;
    };
    return nearest(this.lanterns.filter((l) => l.lit && l.fuelU < lowU)) ?? nearest(this.lanterns.filter((l) => !l.lit));
  }

  private wanderStep(e: { pos: Vec3; wanderDir: [number, number]; wanderLeft: number }): [number, number] {
    if (e.wanderLeft <= 0) {
      const a = this.rngWander.next() * 2 * Math.PI;
      e.wanderDir = [Math.cos(a), Math.sin(a)];
      e.wanderLeft = 60;
    }
    e.wanderLeft--;
    return e.wanderDir;
  }

  // ---------------------------------------------------------------- step

  /** Advance one tick. Returns the events produced (stamped tick = k+1). */
  step(input: InputState): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.state !== "playing") return ev;
    const t = this.t;
    const pl = this.player;
    const now = this.tick + 1;
    const emit = (name: string, data: Record<string, unknown>) => ev.push({ type: "event", tick: now, name, data });

    const e = {} as Record<Button, boolean>;
    for (const b of BUTTONS) e[b] = input[b] && !this.prev[b];
    this.prev = { jump: input.jump, interact: input.interact, pulse: input.pulse, dash: input.dash, pause: input.pause };
    this.tick = now;
    if (!this.started) {
      this.started = true;
      emit("night_start", { night: this.night });
    }

    // 1. input / pause
    if (e.pause) {
      if (!this.paused) {
        this.paused = true;
        emit("paused", {});
        return ev;
      }
      this.paused = false;
      emit("resumed", {});
    } else if (this.paused) {
      return ev;
    }
    const st = ++this.simTick;

    // 2. counters
    if (pl.pulseCd > 0) pl.pulseCd--;
    if (pl.dashCd > 0) pl.dashCd--;
    if (pl.invuln > 0) pl.invuln--;
    if (pl.charm > 0) pl.charm--;
    for (const c of this.charms) {
      if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      if (m.ttl !== null && --m.ttl < 0) this.motes.splice(i, 1);
    }
    for (const s of this.shades) {
      if ((s.state === "spawning" || s.state === "stunned") && s.left > 0 && --s.left === 0) s.state = this.shadeNextState(s);
    }
    if (pl.fallWait > 0 && --pl.fallWait === 0) {
      pl.pos = [...this.map.start];
      pl.pos[1] = this.map.height(pl.pos[0], pl.pos[2]) ?? 0;
      pl.vel = [0, 0];
      pl.vy = 0;
      pl.grounded = true;
      pl.launched = false;
      pl.dashLeft = 0;
      pl.invuln = Math.round(t.invuln_s * K.tps);
    }
    // fuel: lit lanterns lose 1/s by themselves plus 5/s per draining shade; empty lanterns go out
    const lowU = t.low_fuel_threshold * K.tps;
    const fuelMaxU = t.fuel_max * K.tps;
    const perMoteU = t.fuel_per_mote * K.tps;
    for (const l of this.lanterns) {
      if (!l.lit || this.bench) continue;
      const draining = this.shades.filter((s) => s.state === "drain" && s.target === l.id).length;
      l.fuelU -= t.fuel_decay_per_s + draining * t.drain_per_s;
      if (l.fuelU <= 0) {
        l.lit = false;
        l.fuelU = 0;
        l.deposited = 0;
        emit("lantern_out", { lantern_id: l.id });
      }
    }
    for (const s of this.shades) {
      if (s.state !== "drain" || !s.target || this.bench) continue;
      const l = this.lanterns.find((x) => x.id === s.target);
      if (!l || !l.lit) continue;
      if (++s.drainTicks % 60 === 0) emit("fuel_drain", { lantern_id: l.id, shade_id: s.id, fuel: r1(l.fuelU / K.tps) });
    }
    this.windActive = false;
    if (this.map.wind && this.windEnabled && st >= K.windFirst) {
      const k = (st - K.windFirst) % K.windEvery;
      if (k === 0) this.windDir = this.rngWind.next() * 360;
      this.windActive = k < K.windTicks;
    }

    const frozen = () => pl.fallWait > 0 || pl.flames <= 0;

    // 3. player movement
    if (!frozen()) this.movePlayer(input, e, emit);

    // 4. pickups
    if (!frozen() && !this.bench) {
      for (let i = 0; i < this.motes.length && pl.carried < this.capacity; ) {
        const m = this.motes[i];
        if (hdist(pl.pos, m.pos) <= t.pickup_radius && Math.abs(pl.pos[1] - m.pos[1]) <= K.heightTol) {
          this.motes.splice(i, 1);
          pl.carried++;
          emit("mote_picked", { carried: pl.carried });
        } else i++;
      }
      for (const c of this.charms) {
        if (c.available && hdist(pl.pos, c.pos) <= t.pickup_radius && Math.abs(pl.pos[1] - c.pos[1]) <= K.heightTol) {
          c.available = false;
          c.respawn = K.charmRespawnTicks;
          pl.charm = K.charmTicks;
          emit("charm_picked", { charm_id: c.id, charm_ticks: K.charmTicks });
        }
      }
    }

    // 5. interact: deposit into an unlit lantern, or refuel a lit one that is not full
    if (e.interact && !frozen()) {
      let best: Lantern | null = null;
      let bd = Infinity;
      for (const l of this.lanterns) {
        if (l.lit && l.fuelU >= fuelMaxU) continue;
        const d = hdist(pl.pos, l.pos);
        if (d <= t.interact_radius && d < bd) {
          best = l;
          bd = d;
        }
      }
      if (best && pl.carried > 0) {
        if (best.lit) {
          const used = Math.min(pl.carried, Math.ceil((fuelMaxU - best.fuelU) / perMoteU));
          if (used > 0) {
            const before = best.fuelU;
            best.fuelU = Math.min(fuelMaxU, best.fuelU + perMoteU * used);
            pl.carried -= used;
            this.score += t.score.per_mote * used;
            emit("refuel", { lantern_id: best.id, amount: used, fuel: r1(best.fuelU / K.tps) });
            if (before < lowU && best.fuelU >= lowU) this.ejectShades(best);
          }
        } else {
          const cost = best.everLit ? t.relight_cost : t.lantern_cost;
          const amount = Math.min(pl.carried, cost - best.deposited);
          if (amount > 0) {
            best.deposited += amount;
            pl.carried -= amount;
            this.score += t.score.per_mote * amount;
            emit("deposit", { lantern_id: best.id, amount, deposited: best.deposited });
            if (best.deposited >= cost) {
              const relight = best.everLit;
              best.lit = true;
              best.fuelU = fuelMaxU;
              best.everLit = true;
              if (relight) best.relit++;
              pl.successful++;
              this.score += relight ? t.score.per_relight : t.score.per_lantern;
              emit("lantern_lit", { lantern_id: best.id, relight });
              this.ejectShades(best);
            }
          }
        }
      }
    }

    // 6. safe zones: push shades out of freshly lit lanterns
    for (const s of this.shades) {
      if (s.eject <= 0 || !s.ejectFrom) continue;
      const d = hdist(s.pos, s.ejectFrom);
      const need = t.safe_radius - d;
      if (need <= 0) {
        s.eject = 0;
        continue;
      }
      const [ux, uz] = dirXZ(s.ejectFrom, s.pos);
      const step = need / s.eject;
      s.pos[0] += ux * step;
      s.pos[2] += uz * step;
      s.eject--;
    }

    // 7. pulse
    if (e.pulse && !frozen() && pl.pulseCd === 0 && pl.carried >= t.pulse_cost) {
      pl.carried -= t.pulse_cost;
      pl.pulseCd = Math.round(t.pulse_cooldown_s * K.tps);
      const c: Vec3 = [pl.pos[0], pl.pos[1] + K.pulseCenterY, pl.pos[2]];
      const dist3 = (p: Vec3) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      const stunned: string[] = [];
      for (const s of this.shades) {
        if (dist3(s.pos) > t.pulse_radius) continue;
        const wasDraining = s.state === "drain";
        s.state = "stunned";
        s.drainTicks = 0;
        s.left = K.pulseStunTicks;
        s.pushLeft = K.pulsePushTicks;
        s.pushDir = dirXZ(pl.pos, s.pos);
        s.recoilLeft = 0;
        this.score += wasDraining ? t.score.per_stun_drain : t.score.per_stun;
        stunned.push(s.id);
      }
      for (const d of this.drifters) {
        if ((d.state !== "chase" && d.state !== "flee") || dist3(d.pos) > t.pulse_radius) continue;
        if (d.state === "chase") {
          d.state = "flee";
          d.left = K.drifterFleeTicks;
        } else if (d.stolen > 0) {
          const amount = d.stolen;
          d.stolen = 0;
          const y = this.map.height(d.pos[0], d.pos[2]) ?? pl.pos[1];
          for (let i = 0; i < amount; i++) {
            this.motes.push({ id: this.freshMoteId(), pos: [d.pos[0], y, d.pos[2]], kind: "dropped", ttl: K.drifterDropTtl, point: -1 });
          }
          emit("drifter_drop", { drifter_id: d.id, amount });
        }
      }
      emit("pulse", { stunned_ids: stunned });
    }

    // 8. move shades and drifters
    for (const s of this.shades) {
      if (s.pushLeft > 0) {
        this.moveShade(s, s.pushDir[0] * (t.pulse_push_m / K.pulsePushTicks), s.pushDir[1] * (t.pulse_push_m / K.pulsePushTicks));
        s.pushLeft--;
      }
      if (s.eject > 0 || s.state === "stunned" || s.state === "spawning") continue;
      if (s.state === "recoil") {
        this.moveShade(s, s.recoilDir[0] * (K.recoilDist / K.recoilTicks), s.recoilDir[1] * (K.recoilDist / K.recoilTicks));
        if (--s.recoilLeft <= 0) s.state = "chase";
        continue;
      }
      const d = hdist(s.pos, pl.pos);
      if (s.state === "drain") {
        const l = s.target ? this.lanterns.find((x) => x.id === s.target) : undefined;
        if (d <= K.drainChase) {
          s.state = "chase";
          s.drainTicks = 0;
        } else if (!l || !l.lit || l.fuelU >= lowU || hdist(s.pos, l.pos) > K.drainRange) {
          s.state = "wander";
          s.drainTicks = 0;
        } else continue; // stands still and keeps draining
      }
      if (s.state === "wander" && d <= K.shadeDetect && !this.bench) s.state = "chase";
      else if (s.state === "chase" && d > K.shadeLose) s.state = "wander";
      if (s.state === "chase") {
        const [ux, uz] = dirXZ(s.pos, pl.pos);
        const step = Math.min(this.map.shadeSpeed * K.dt, d);
        this.moveShade(s, ux * step, uz * step);
      } else {
        const tl = this.wanderTarget(s);
        if (tl) {
          const dl = hdist(s.pos, tl.pos);
          if (dl <= K.drainRange) {
            if (tl.lit && tl.fuelU < lowU) {
              s.state = "drain";
              s.target = tl.id;
              s.drainTicks = 0;
            }
          } else {
            const [ux, uz] = dirXZ(s.pos, tl.pos);
            const step = Math.min(this.map.shadeSpeed * K.dt, dl);
            this.moveShade(s, ux * step, uz * step);
          }
        } else {
          const [ux, uz] = this.wanderStep(s);
          const before = [s.pos[0], s.pos[2]];
          this.moveShade(s, ux * K.shadeWanderSpeed * K.dt, uz * K.shadeWanderSpeed * K.dt);
          if (s.pos[0] === before[0] && s.pos[2] === before[1]) s.wanderLeft = 0;
        }
      }
    }
    for (const d of this.drifters) {
      if (d.state === "removed") continue;
      const near = pl.carried >= K.drifterCarryNeeded && hdist(d.pos, pl.pos) <= K.drifterDetect;
      if (d.state === "idle" && near) d.state = "chase";
      else if (d.state === "chase" && !near) d.state = "idle";
      if (d.state === "idle") {
        const [ux, uz] = this.wanderStep(d);
        d.pos[0] += ux * K.drifterSpeedIdle * K.dt;
        d.pos[2] += uz * K.drifterSpeedIdle * K.dt;
      } else if (d.state === "chase") {
        const [ux, uz] = dirXZ(d.pos, pl.pos);
        const step = Math.min(K.drifterSpeed * K.dt, hdist(d.pos, pl.pos));
        d.pos[0] += ux * step;
        d.pos[2] += uz * step;
      } else if (d.state === "flee") {
        const [ux, uz] = dirXZ(pl.pos, d.pos);
        d.pos[0] += ux * K.drifterSpeed * K.dt;
        d.pos[2] += uz * K.drifterSpeed * K.dt;
        if (--d.left <= 0) d.state = "removed";
      }
    }

    // 9. contacts: drifters steal first, then shades hit (ascending id)
    if (!frozen() && !this.bench) {
      for (const d of [...this.drifters].sort(byId)) {
        if (d.state !== "chase" || pl.carried <= 0 || hdist(d.pos, pl.pos) > K.drifterTouch) continue;
        const amount = Math.min(K.drifterSteal, pl.carried);
        pl.carried -= amount;
        d.stolen = amount;
        d.state = "flee";
        d.left = K.drifterFleeTicks;
        emit("drifter_steal", { drifter_id: d.id, amount, carried: pl.carried });
      }
      if (pl.invuln === 0) {
        for (const s of [...this.shades].sort(byId)) {
          if (s.state !== "chase" && s.state !== "wander") continue;
          if (s.eject > 0 || hdist(s.pos, pl.pos) > t.shade_hit_radius) continue;
          if (Math.abs(s.pos[1] - K.shadeCenterY - pl.pos[1]) > K.heightTol) continue;
          pl.flames--;
          const dropped = Math.floor(pl.carried * t.hit_drop_ratio);
          pl.carried -= dropped;
          for (let i = 0; i < dropped; i++) {
            const a = this.rngDrop.next() * 2 * Math.PI;
            const r = K.dropRingMin + this.rngDrop.next() * (K.dropRingMax - K.dropRingMin);
            const x = pl.pos[0] + r * Math.cos(a);
            const z = pl.pos[2] + r * Math.sin(a);
            const h = this.map.height(x, z);
            const pos: Vec3 = h === null ? [pl.pos[0], pl.pos[1], pl.pos[2]] : [x, h, z];
            this.motes.push({ id: this.freshMoteId(), pos, kind: "dropped", ttl: K.dropTtl, point: -1 });
          }
          pl.invuln = Math.round(t.invuln_s * K.tps);
          s.state = "recoil";
          s.recoilLeft = K.recoilTicks;
          s.recoilDir = dirXZ(pl.pos, s.pos);
          emit("player_hit", { by: "shade", flames: pl.flames, dropped });
          break;
        }
      }
    }

    // 10. scheduled spawns (new entities interact from the next tick)
    if (this.randomMotes && st % K.moteSpawnEvery === 0 && this.motes.length < K.moteCap) {
      const free = this.map.motePoints.map((_, i) => i).filter((i) => !this.motes.some((m) => m.point === i));
      if (free.length) {
        const pi = free[Math.floor(this.rngMote.next() * free.length)];
        this.motes.push({ id: this.freshMoteId(), pos: [...this.map.motePoints[pi]], kind: "random", ttl: null, point: pi });
      }
    }
    if (this.randomShades) {
      let count = 0;
      if (st === K.shadeSpawnFirst) count = K.shadeSpawnFirstCount;
      else if (st > K.shadeSpawnFirst && (st - K.shadeSpawnFirst) % this.map.shadeEvery === 0) count = 1;
      const used = new Set<number>();
      for (let n = 0; n < count && this.shades.length < this.map.shadeMax; n++) {
        const valid = this.map.shadePoints
          .map((_, i) => i)
          .filter((i) => !used.has(i) && hdist(this.map.shadePoints[i], pl.pos) >= K.shadeSpawnMinDist);
        if (!valid.length) break;
        const pi = valid[Math.floor(this.rngShade.next() * valid.length)];
        used.add(pi);
        const p = this.map.shadePoints[pi];
        const id = this.freshShadeId();
        this.shades.push({
          id,
          pos: [p[0], (this.map.height(p[0], p[2]) ?? 0) + K.shadeCenterY, p[2]],
          state: "spawning",
          left: K.shadeSpawningTicks,
          pushLeft: 0,
          pushDir: [1, 0],
          eject: 0,
          ejectFrom: null,
          wanderDir: [1, 0],
          wanderLeft: 0,
          recoilLeft: 0,
          recoilDir: [1, 0],
          target: null,
          fixed: null,
          drainTicks: 0,
        });
        emit("shade_spawned", { id });
      }
    }
    if (this.map.drifters && this.randomDrifters && st % K.drifterSpawnEvery === 0) {
      if (this.drifters.filter((d) => d.state !== "removed").length < K.drifterMax) {
        const [cx, cz, R] = this.map.land[Math.floor(this.rngDrifter.next() * this.map.land.length)];
        const a = this.rngDrifter.next() * 2 * Math.PI;
        const r = 0.9 * R * Math.sqrt(this.rngDrifter.next());
        const x = cx + r * Math.cos(a);
        const z = cz + r * Math.sin(a);
        this.drifters.push({
          id: this.freshDrifterId(),
          pos: [x, K.drifterY + (this.map.height(x, z) ?? 0), z],
          state: "idle",
          stolen: 0,
          left: 0,
          wanderDir: [1, 0],
          wanderLeft: 0,
        });
      }
    }

    // 11. win / lose: no early win; the Night is decided at dawn by how many lanterns are still lit
    if (this.bench) {
      // benchmark scene never ends
    } else if (pl.flames <= 0) {
      this.end(ev, now, "lost", "no_flames");
    } else if (this.durationTicks - st <= 0) {
      const lit = this.lanterns.filter((l) => l.lit);
      const need = Math.ceil(Math.round(t.win_ratio * this.lanterns.length * 1e9) / 1e9);
      if (lit.length >= need) {
        for (const l of lit) this.score += t.score.per_lit_dawn + Math.floor(l.fuelU / K.tps);
        this.score += t.score.per_second_left * Math.max(0, Math.floor(this.timeLeftS)) + t.score.per_flame_left * pl.flames;
        this.end(ev, now, "won", "dawn_survived");
      } else {
        this.end(ev, now, "lost", "dawn");
      }
    }
    return ev;
  }

  private movePlayer(input: InputState, e: Record<Button, boolean>, emit: (n: string, d: Record<string, unknown>) => void): void {
    const pl = this.player;
    const t = this.t;
    const map = this.map;

    // camera-relative input direction
    let [mx, mz] = input.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const th = (input.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-9) pl.facing = [wx / wl, wz / wl];

    const speed = pl.charm > 0 ? K.charmSpeed : t.player_speed;

    // dash
    if (e.dash && pl.dashLeft === 0 && (pl.dashCd === 0 || pl.charm > 0)) {
      pl.dashLeft = Math.round(t.dash_duration_s * K.tps);
      pl.dashDir = wl > 1e-9 ? [wx / wl, wz / wl] : [...pl.facing];
      if (pl.charm === 0) pl.dashCd = Math.round(t.dash_cooldown_s * K.tps);
      emit("dash", {});
    }
    const dashing = pl.dashLeft > 0;

    // bounce pads
    if (pl.grounded && !pl.launched) {
      for (const pad of map.pads) {
        if (hdist(pl.pos, pad.pos) <= 1 && Math.abs(pl.pos[1] - pad.pos[1]) <= 0.5) {
          pl.vy = pad.vy;
          pl.grounded = false;
          pl.launched = true;
          pl.launchVel = [...pad.hv];
          break;
        }
      }
    }

    // horizontal velocity
    if (dashing) {
      pl.vel = [pl.dashDir[0] * t.dash_speed, pl.dashDir[1] * t.dash_speed];
    } else if (pl.launched) {
      pl.vel = [...pl.launchVel];
    } else {
      const tx = wx * speed * Math.min(1, wl);
      const tz = wz * speed * Math.min(1, wl);
      const a = speed / K.accelTicks;
      const dx = tx - pl.vel[0];
      const dz = tz - pl.vel[1];
      const d = Math.hypot(dx, dz);
      if (d <= a) pl.vel = [tx, tz];
      else pl.vel = [pl.vel[0] + (dx / d) * a, pl.vel[1] + (dz / d) * a];
    }
    let mvx = pl.vel[0] * K.dt;
    let mvz = pl.vel[1] * K.dt;
    if (this.windActive) {
      mvx += Math.cos((this.windDir * Math.PI) / 180) * K.windSpeed * K.dt;
      mvz += Math.sin((this.windDir * Math.PI) / 180) * K.windSpeed * K.dt;
    }
    const [bx, bz] = this.slide(pl.pos, mvx, mvz, (x, z) => this.blockedAt(x, z, pl.pos[1]));
    if (bx) pl.vel[0] = 0;
    if (bz) pl.vel[1] = 0;

    // vertical
    const h = map.height(pl.pos[0], pl.pos[2]);
    if (dashing) {
      pl.vy = 0;
      if (pl.grounded) {
        if (h !== null && h >= pl.pos[1] - K.stepUp) pl.pos[1] = h;
        else pl.grounded = false;
      }
    } else {
      if (e.jump && pl.grounded) {
        pl.vy = K.jumpSpeed;
        pl.grounded = false;
      }
      if (pl.grounded) {
        if (h !== null && h >= pl.pos[1] - K.stepUp) {
          pl.pos[1] = h;
          pl.vy = 0;
        } else {
          pl.grounded = false;
          pl.vy = 0;
        }
      }
      if (!pl.grounded) {
        pl.vy -= K.gravity * K.dt;
        pl.pos[1] += pl.vy * K.dt;
        if (h !== null && pl.pos[1] <= h && pl.vy <= 0) {
          pl.pos[1] = h;
          pl.vy = 0;
          pl.grounded = true;
          pl.launched = false;
        }
      }
    }
    if (pl.dashLeft > 0 && --pl.dashLeft === 0) pl.vel = [pl.dashDir[0] * speed, pl.dashDir[1] * speed];

    // fell off the island (ignores invulnerability)
    if (pl.pos[1] < K.fallY) {
      const dropped = pl.carried;
      pl.carried = 0;
      pl.flames--;
      pl.vel = [0, 0];
      pl.vy = 0;
      pl.dashLeft = 0;
      if (pl.flames > 0) pl.fallWait = K.fallWaitTicks;
      emit("player_hit", { by: "fall", flames: pl.flames, dropped, lost: pl.flames <= 0 });
    }
  }

  private end(ev: SimEvent[], now: number, result: "won" | "lost", reason: string): void {
    this.state = result;
    this.paused = false;
    ev.push({ type: "event", tick: now, name: "game_over", data: { result, reason } });
  }

  snapshot(): Record<string, unknown> {
    const pl = this.player;
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.snapshotState,
      night: this.night,
      time_left_s: r3(Math.max(0, this.timeLeftS)),
      score: this.score,
      wind: { active: this.windActive, dir_deg: this.windActive ? r3(this.windDir) : 0 },
      player: {
        pos: r3v(pl.pos),
        flames: pl.flames,
        carried: pl.carried,
        vel: [r3(pl.vel[0]), r3(pl.vy), r3(pl.vel[1])],
        grounded: pl.grounded,
        invuln: pl.invuln > 0,
        dash_cd_s: r3(pl.dashCd / K.tps),
        pulse_cd_s: r3(pl.pulseCd / K.tps),
        charm_s: r3(pl.charm / K.tps),
        capacity: this.capacity,
      },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited, fuel: r1(l.fuelU / K.tps), ever_lit: l.everLit, relit_count: l.relit })),
      shades: this.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: r3v(m.pos), kind: m.kind, ttl_s: m.ttl === null ? null : r3(m.ttl / K.tps) })),
      drifters: this.drifters.map((d) => ({ id: d.id, pos: r3v(d.pos), state: d.state, stolen: d.stolen })),
      charms: this.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: r3(c.respawn / K.tps) })),
    };
  }
}

/** Resolves the input state for each tick from sparse frames (fields persist). */
export class InputTrack {
  private i = 0;
  private cur: InputState = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  constructor(private frames: InputFrame[]) {}
  at(tick: number): InputState {
    while (this.i < this.frames.length && this.frames[this.i].tick <= tick) {
      const f = this.frames[this.i++];
      if (f.move) this.cur.move = f.move;
      if (f.cam_yaw_deg !== undefined) this.cur.cam_yaw_deg = f.cam_yaw_deg;
      for (const b of BUTTONS) if (f[b] !== undefined) this.cur[b] = f[b]!;
    }
    return this.cur;
  }
}
