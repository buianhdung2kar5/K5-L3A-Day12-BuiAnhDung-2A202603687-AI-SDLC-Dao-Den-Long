import { Rng, stream } from "./rng";
import { InputError } from "./scenario";
import { TUNING, WORLD } from "./tuning";
import type { GameState, InputFrame, InputState, Scenario, SimEvent, Tuning, Vec3 } from "./types";

interface Lantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

interface Shade {
  id: string;
  pos: Vec3;
  state: "chasing" | "stunned";
  stunUntil: number;
}

const r3 = (x: number): number => {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const r3v = (v: Vec3): Vec3 => [r3(v[0]), r3(v[1]), r3(v[2])];
const hdist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * Pure, deterministic simulation. No DOM, no rendering, no wall clock.
 * One step() = 1/60 s. Step k reads inputs for tick k and produces state k+1.
 */
export class Sim {
  readonly t: Tuning;
  tick = 0;
  state: GameState = "playing";
  score = 0;

  player = { pos: [0, 0, 0] as Vec3, vy: 0, flames: 0, carried: 0 };
  lanterns: Lantern[] = [];
  shades: Shade[] = [];
  motes: Vec3[] = [];

  private startTicks: number;
  private invulnUntil = 0;
  private pulseReadyAt = 0;
  private prev = { jump: false, interact: false, pulse: false };
  private spawnAt: number | null;
  private nextShadeNum = 1;
  private rngDrop: Rng;
  private rngShade: Rng;

  constructor(seed: number, scenario: Scenario = {}, tuning: Tuning = TUNING) {
    this.t = tuning;
    const t = tuning;
    this.player.flames = t.flames;
    this.startTicks = Math.round((scenario.time_left_s ?? t.night1_duration_s) * WORLD.tps);

    // default lanterns L1..L5 on a ring
    for (let i = 0; i < t.lantern_count_night1; i++) {
      const a = (i * 2 * Math.PI) / t.lantern_count_night1;
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [WORLD.lanternRingRadius * Math.cos(a), 0, WORLD.lanternRingRadius * Math.sin(a)],
        lit: false,
        deposited: 0,
      });
    }
    for (const l of scenario.lanterns ?? []) {
      const target = this.lanterns.find((x) => x.id === l.id);
      if (!target) throw new InputError(`scenario lantern id "${l.id}" does not exist`);
      if (l.pos) target.pos = l.pos;
      if (l.lit !== undefined) {
        target.lit = l.lit;
        target.deposited = l.lit ? t.lantern_cost : 0;
      }
    }

    if (scenario.player) {
      if (scenario.player.pos) this.player.pos = [...scenario.player.pos];
      if (scenario.player.carried !== undefined) this.player.carried = scenario.player.carried;
      if (scenario.player.flames !== undefined) this.player.flames = scenario.player.flames;
    }

    // motes: explicit list replaces default; random_motes=false disables random ones
    if (scenario.motes) {
      this.motes = scenario.motes.map((m) => [...m] as Vec3);
    } else if (scenario.random_motes !== false) {
      const rng = stream(seed, 1);
      for (let i = 0; i < WORLD.moteCount; i++) {
        const a = rng.next() * 2 * Math.PI;
        const r0 = WORLD.moteMinR ** 2;
        const r1 = WORLD.moteMaxR ** 2;
        const r = Math.sqrt(r0 + rng.next() * (r1 - r0));
        this.motes.push([r * Math.cos(a), 0, r * Math.sin(a)]);
      }
    }

    for (const sh of scenario.shades ?? []) {
      const id = sh.id ?? this.freshShadeId();
      this.shades.push({ id, pos: [...sh.pos], state: "chasing", stunUntil: 0 });
    }

    this.rngDrop = stream(seed, 2);
    this.rngShade = stream(seed, 3);
    this.spawnAt = scenario.random_shades === false ? null : Math.round(WORLD.shadeFirstSpawnS * WORLD.tps);
  }

  get timeLeftS(): number {
    return (this.startTicks - this.tick) / WORLD.tps;
  }

  private freshShadeId(): string {
    while (this.shades.some((s) => s.id === `S${this.nextShadeNum}`)) this.nextShadeNum++;
    return `S${this.nextShadeNum++}`;
  }

  /** Advance one tick. Returns the events produced (stamped tick = k+1). */
  step(input: InputState): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.state !== "playing") return ev;
    const t = this.t;
    const now = this.tick + 1;
    const emit = (name: string, data: Record<string, unknown>) =>
      ev.push({ type: "event", tick: now, name, data });
    const p = this.player;

    // --- player movement
    let [mx, mz] = input.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const th = (input.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    p.pos[0] += wx * t.player_speed * WORLD.dt;
    p.pos[2] += wz * t.player_speed * WORLD.dt;
    this.clampToIsland(p.pos);

    if (input.jump && !this.prev.jump && p.pos[1] <= 0) p.vy = WORLD.jumpSpeed;
    p.vy -= WORLD.gravity * WORLD.dt;
    p.pos[1] += p.vy * WORLD.dt;
    if (p.pos[1] <= 0) {
      p.pos[1] = 0;
      p.vy = 0;
    }

    // --- pickup fireflies
    for (let i = 0; i < this.motes.length && p.carried < t.carry_capacity; ) {
      if (hdist(p.pos, this.motes[i]) <= t.pickup_radius) {
        this.motes.splice(i, 1);
        p.carried++;
        this.score += t.score.per_mote;
        emit("mote_picked", { carried: p.carried });
      } else i++;
    }

    // --- interact: deposit into nearest unlit lantern in range
    if (input.interact && !this.prev.interact && p.carried > 0) {
      let best: Lantern | null = null;
      let bd = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = hdist(p.pos, l.pos);
        if (d <= t.interact_radius && d < bd) {
          best = l;
          bd = d;
        }
      }
      if (best) {
        const amount = Math.min(p.carried, t.lantern_cost - best.deposited);
        if (amount > 0) {
          best.deposited += amount;
          p.carried -= amount;
          emit("deposit", { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= t.lantern_cost) {
            best.lit = true;
            this.score += t.score.per_lantern;
            emit("lantern_lit", { lantern_id: best.id });
          }
        }
      }
    }
    if (this.checkWin(ev, now)) return this.finish(input, ev);

    // --- pulse
    if (input.pulse && !this.prev.pulse && now >= this.pulseReadyAt && p.carried >= t.pulse_cost) {
      p.carried -= t.pulse_cost;
      this.pulseReadyAt = now + Math.round(t.pulse_cooldown_s * WORLD.tps);
      const stunned: string[] = [];
      for (const s of this.shades) {
        if (s.state === "stunned" || hdist(p.pos, s.pos) > t.pulse_radius) continue;
        s.state = "stunned";
        s.stunUntil = now + Math.round(t.pulse_stun_s * WORLD.tps);
        let dx = s.pos[0] - p.pos[0];
        let dz = s.pos[2] - p.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < 1e-9) {
          dx = 1;
          dz = 0;
        } else {
          dx /= d;
          dz /= d;
        }
        s.pos[0] += dx * t.pulse_push_m;
        s.pos[2] += dz * t.pulse_push_m;
        this.clampToIsland(s.pos);
        this.keepOutOfSafeZones(s.pos);
        this.score += t.score.per_stun;
        stunned.push(s.id);
      }
      emit("pulse", { stunned_ids: stunned });
    }

    // --- shade spawning (random)
    if (this.spawnAt !== null && now >= this.spawnAt) {
      this.spawnAt = now + Math.round(WORLD.shadeSpawnIntervalS * WORLD.tps);
      if (this.shades.length < WORLD.shadeMax) {
        const a = this.rngShade.next() * 2 * Math.PI;
        const pos: Vec3 = [WORLD.shadeSpawnRadius * Math.cos(a), WORLD.shadeY, WORLD.shadeSpawnRadius * Math.sin(a)];
        this.keepOutOfSafeZones(pos);
        const id = this.freshShadeId();
        this.shades.push({ id, pos, state: "chasing", stunUntil: 0 });
        emit("shade_spawned", { id });
      }
    }

    // --- shades: recover from stun, chase, stay out of safe zones
    for (const s of this.shades) {
      if (s.state === "stunned" && now >= s.stunUntil) s.state = "chasing";
      if (s.state !== "chasing") continue;
      const dx = p.pos[0] - s.pos[0];
      const dz = p.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 1e-9) {
        const step = Math.min(t.shade_speed * WORLD.dt, d);
        s.pos[0] += (dx / d) * step;
        s.pos[2] += (dz / d) * step;
      }
      this.clampToIsland(s.pos);
      this.keepOutOfSafeZones(s.pos);
    }

    // --- collisions
    if (now >= this.invulnUntil) {
      for (const s of this.shades) {
        if (s.state !== "chasing" || hdist(p.pos, s.pos) > t.shade_hit_radius) continue;
        p.flames--;
        const dropped = Math.floor(p.carried * t.hit_drop_ratio);
        p.carried -= dropped;
        for (let i = 0; i < dropped; i++) {
          const a = this.rngDrop.next() * 2 * Math.PI;
          const m: Vec3 = [
            p.pos[0] + WORLD.dropRingRadius * Math.cos(a),
            0,
            p.pos[2] + WORLD.dropRingRadius * Math.sin(a),
          ];
          this.clampToIsland(m);
          this.motes.push(m);
        }
        this.invulnUntil = now + Math.round(t.invuln_s * WORLD.tps);
        emit("player_hit", { by: "shade", flames: p.flames, dropped });
        break;
      }
    }

    // --- end conditions
    this.tick = now;
    if (p.flames <= 0) {
      this.end(ev, now, "lost", "no_flames");
    } else if (this.startTicks - now <= 0) {
      this.end(ev, now, "lost", "dawn");
    }
    this.prev = { jump: input.jump, interact: input.interact, pulse: input.pulse };
    return ev;
  }

  private finish(input: InputState, ev: SimEvent[]): SimEvent[] {
    this.prev = { jump: input.jump, interact: input.interact, pulse: input.pulse };
    return ev;
  }

  private checkWin(ev: SimEvent[], now: number): boolean {
    if (!this.lanterns.every((l) => l.lit)) return false;
    this.tick = now;
    this.score += this.t.score.per_second_left * Math.max(0, Math.floor(this.timeLeftS));
    this.score += this.t.score.per_flame_left * Math.max(0, this.player.flames);
    this.end(ev, now, "won", "all_lit");
    return true;
  }

  private end(ev: SimEvent[], now: number, result: "won" | "lost", reason: string): void {
    this.state = result;
    ev.push({ type: "event", tick: now, name: "game_over", data: { result, reason } });
  }

  private clampToIsland(p: Vec3): void {
    const r = Math.hypot(p[0], p[2]);
    if (r > WORLD.islandRadius) {
      p[0] *= WORLD.islandRadius / r;
      p[2] *= WORLD.islandRadius / r;
    }
  }

  /** Shades cannot enter safe_radius around any lantern: project to the boundary. */
  private keepOutOfSafeZones(p: Vec3): void {
    for (const l of this.lanterns) {
      const dx = p[0] - l.pos[0];
      const dz = p[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < this.t.safe_radius) {
        if (d < 1e-9) {
          p[0] = l.pos[0] + this.t.safe_radius;
        } else {
          p[0] = l.pos[0] + (dx / d) * this.t.safe_radius;
          p[2] = l.pos[2] + (dz / d) * this.t.safe_radius;
        }
      }
    }
  }

  snapshot(): Record<string, unknown> {
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.tick,
      state: this.state,
      time_left_s: r3(Math.max(0, this.timeLeftS)),
      score: this.score,
      player: { pos: r3v(this.player.pos), flames: this.player.flames, carried: this.player.carried },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited })),
      shades: this.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map(r3v),
    };
  }
}

/** Resolves the input state for each tick from sparse frames (fields persist). */
export class InputTrack {
  private i = 0;
  private cur: InputState = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false };
  constructor(private frames: InputFrame[]) {}
  at(tick: number): InputState {
    while (this.i < this.frames.length && this.frames[this.i].tick <= tick) {
      const f = this.frames[this.i++];
      if (f.move) this.cur.move = f.move;
      if (f.cam_yaw_deg !== undefined) this.cur.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) this.cur.jump = f.jump;
      if (f.interact !== undefined) this.cur.interact = f.interact;
      if (f.pulse !== undefined) this.cur.pulse = f.pulse;
    }
    return this.cur;
  }
}
