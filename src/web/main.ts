import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { parseScenario } from "../sim/scenario";
import { Sim } from "../sim/sim";
import { TUNING, WORLD } from "../sim/tuning";
import type { InputState } from "../sim/types";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

// ---------- engine / scene ----------
const canvas = $<HTMLCanvasElement>("game");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.03, 0.02, 0.07, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.05, 0.03, 0.09);
const glow = new GlowLayer("glow", scene);
glow.intensity = 0.7;
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.diffuse = new Color3(0.45, 0.4, 0.7);
hemi.groundColor = new Color3(0.08, 0.05, 0.15);

const camera = new FreeCamera("cam", new Vector3(0, 6, -10), scene);
camera.minZ = 0.1;
camera.maxZ = 200;

function mat(diffuse: Color3, emissive = Color3.Black(), alpha = 1): StandardMaterial {
  const m = new StandardMaterial("m", scene);
  m.diffuseColor = diffuse;
  m.emissiveColor = emissive;
  m.specularColor = Color3.Black();
  m.alpha = alpha;
  return m;
}

// island + cloud sea
const ground = MeshBuilder.CreateCylinder("ground", { diameter: WORLD.islandRadius * 2, height: 1, tessellation: 64 }, scene);
ground.position.y = -0.5;
ground.material = mat(new Color3(0.2, 0.26, 0.22));
const rim = MeshBuilder.CreateTorus("rim", { diameter: WORLD.islandRadius * 2, thickness: 0.6, tessellation: 64 }, scene);
rim.material = mat(new Color3(0.3, 0.22, 0.16));
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2;
  const r = 38 + (i % 4) * 7;
  const c = MeshBuilder.CreateSphere("cloud", { diameter: 14 + (i % 3) * 5, segments: 8 }, scene);
  c.scaling.y = 0.35;
  c.position.set(Math.cos(a) * r, -4 - (i % 3), Math.sin(a) * r);
  c.material = mat(new Color3(0.35, 0.33, 0.5), new Color3(0.07, 0.06, 0.12), 0.85);
}

// ---------- world objects ----------
const UNLIT = new Color3(0.05, 0.03, 0.03);
const LIT = new Color3(1, 0.68, 0.2);
// Dev/demo only: ?scenario=<urlencoded scenario JSON> uses the same scenario format as the headless mode.
const devScenario = params.has("scenario") ? parseScenario(JSON.parse(params.get("scenario")!)) : {};
let sim = new Sim(Number(params.get("seed") ?? Date.now() % 2147483647), devScenario);

interface LanternView { body: Mesh; light: PointLight; lit: boolean }
const lanternViews: LanternView[] = [];
const moteMat = mat(new Color3(1, 0.9, 0.4), new Color3(1, 0.85, 0.3));
const moteMeshes: Mesh[] = [];
const shadeMeshes = new Map<string, Mesh>();
const shadeMatChase = mat(new Color3(0.07, 0.02, 0.12), new Color3(0.28, 0.04, 0.4));
const shadeMatStun = mat(new Color3(0.2, 0.2, 0.3), new Color3(0.3, 0.3, 0.5), 0.6);

function buildLanterns(): void {
  for (const v of lanternViews) {
    v.body.dispose();
    v.light.dispose();
  }
  lanternViews.length = 0;
  for (const l of sim.lanterns) {
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.35, height: 3 }, scene);
    pole.position.set(l.pos[0], 1.5, l.pos[2]);
    pole.material = mat(new Color3(0.25, 0.16, 0.1));
    const body = MeshBuilder.CreateSphere("lantern", { diameter: 1.6, segments: 12 }, scene);
    body.position.set(l.pos[0], 3.5, l.pos[2]);
    body.material = mat(new Color3(0.4, 0.3, 0.2), UNLIT);
    const light = new PointLight("pl", new Vector3(l.pos[0], 3.6, l.pos[2]), scene);
    light.diffuse = new Color3(1, 0.7, 0.3);
    light.range = 22;
    light.intensity = 0;
    lanternViews.push({ body, light, lit: false });
  }
}
buildLanterns();

// player: body, head, conical hat with a small hanging lantern
const player = new TransformNode("player", scene);
const bodyM = MeshBuilder.CreateCylinder("pbody", { diameterTop: 0.6, diameterBottom: 0.9, height: 1.1 }, scene);
bodyM.position.y = 0.55;
bodyM.material = mat(new Color3(0.35, 0.5, 0.75), new Color3(0.05, 0.07, 0.12));
bodyM.parent = player;
const head = MeshBuilder.CreateSphere("phead", { diameter: 0.6 }, scene);
head.position.y = 1.4;
head.material = mat(new Color3(0.95, 0.8, 0.65), new Color3(0.1, 0.08, 0.06));
head.parent = player;
const hat = MeshBuilder.CreateCylinder("hat", { diameterTop: 0, diameterBottom: 0.95, height: 0.9 }, scene);
hat.position.y = 2.0;
hat.material = mat(new Color3(0.55, 0.35, 0.2), new Color3(0.08, 0.05, 0.03));
hat.parent = player;
const hatLantern = MeshBuilder.CreateSphere("hatlantern", { diameter: 0.28 }, scene);
hatLantern.position.set(0.35, 1.85, 0);
hatLantern.material = mat(new Color3(1, 0.8, 0.4), new Color3(1, 0.7, 0.25));
hatLantern.parent = player;
const playerLight = new PointLight("playerlight", new Vector3(0, 2, 0), scene);
playerLight.diffuse = new Color3(1, 0.75, 0.4);
playerLight.range = 14;
playerLight.intensity = 0.9;
playerLight.parent = player;

// pulse rings
const rings: { mesh: Mesh; age: number }[] = [];
function spawnPulseRing(): void {
  const m = MeshBuilder.CreateTorus("ring", { diameter: 2, thickness: 0.12, tessellation: 48 }, scene);
  m.position.set(sim.player.pos[0], 0.3, sim.player.pos[2]);
  m.material = mat(new Color3(1, 0.8, 0.4), new Color3(1, 0.8, 0.4), 0.9);
  rings.push({ mesh: m, age: 0 });
}

// ---------- input ----------
const keys = new Set<string>();
let yawDeg = 0;
let latch = { jump: false, interact: false, pulse: false };
let started = params.has("autostart");

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.code;
  keys.add(k);
  if (k === "Space") { latch.jump = true; e.preventDefault(); }
  if (k === "KeyE") latch.interact = true;
  if (k === "KeyF") latch.pulse = true;
  if (k === "KeyR") restart();
  if ((k === "Enter" || k === "Space") && !started) start();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
let dragging = false;
canvas.addEventListener("pointerdown", () => (dragging = true));
window.addEventListener("pointerup", () => (dragging = false));
window.addEventListener("pointermove", (e) => {
  if (dragging) yawDeg += e.movementX * 0.35;
});

function readInput(dtS: number): InputState {
  if (keys.has("ArrowRight")) yawDeg += 120 * dtS;
  if (keys.has("ArrowLeft")) yawDeg -= 120 * dtS;
  const x = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const z = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: yawDeg, jump: latch.jump, interact: latch.interact, pulse: latch.pulse };
}

// ---------- HUD / overlay ----------
const overlay = $("overlay");
function showOverlay(title: string, text: string, btn: string, keysVisible: boolean): void {
  $("ov-title").textContent = title;
  $("ov-text").textContent = text;
  $("ov-btn").textContent = btn;
  $("ov-keys").style.display = keysVisible ? "" : "none";
  overlay.classList.remove("hidden");
}
function start(): void {
  started = true;
  overlay.classList.add("hidden");
  canvas.focus();
}
function restart(): void {
  if (!started) return;
  sim = new Sim(Date.now() % 2147483647);
  (window as unknown as { __game: unknown }).__game = gameHandle();
  buildLanterns();
  for (const m of shadeMeshes.values()) m.dispose();
  shadeMeshes.clear();
  latch = { jump: false, interact: false, pulse: false };
  overlay.classList.add("hidden");
  hudShown = "";
}
$("ov-btn").addEventListener("click", () => (sim.state === "playing" ? start() : restart()));
$("hud-cap").textContent = String(TUNING.carry_capacity);
$("hud-lanterns-total").textContent = String(TUNING.lantern_count_night1);

let hudShown = "";
function updateHud(): void {
  const lit = sim.lanterns.filter((l) => l.lit).length;
  const key = `${sim.player.flames}|${sim.player.carried}|${lit}|${sim.score}|${Math.ceil(sim.timeLeftS)}`;
  if (key === hudShown) return;
  hudShown = key;
  $("hud-flames").textContent = String(sim.player.flames);
  $("hud-carried").textContent = String(sim.player.carried);
  $("hud-lanterns").textContent = String(lit);
  $("hud-score").textContent = String(sim.score);
  $("hud-time").textContent = String(Math.max(0, Math.ceil(sim.timeLeftS)));
}

const flash = $("flash");
function hitFlash(): void {
  flash.classList.add("on");
  setTimeout(() => flash.classList.remove("on"), 60);
}

// Read-only handle for tests/debugging (tests/e2e.mjs).
function gameHandle() {
  return { sim, TUNING, get yaw() { return yawDeg; } };
}

// ---------- main loop ----------
(window as unknown as { __game: unknown }).__game = gameHandle();
let acc = 0;
let facing = 0;
let tNow = 0;

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  tNow += dt;

  if (started && sim.state === "playing") {
    acc += dt;
    let guard = 0;
    while (acc >= WORLD.dt && guard++ < 6) {
      acc -= WORLD.dt;
      const input = readInput(WORLD.dt);
      const mx = input.move[0], mz = input.move[1];
      if (mx !== 0 || mz !== 0) {
        const th = (yawDeg * Math.PI) / 180;
        facing = Math.atan2(mx * Math.cos(th) + mz * Math.sin(th), -mx * Math.sin(th) + mz * Math.cos(th));
      }
      const events = sim.step(input);
      latch = { jump: false, interact: false, pulse: false };
      for (const ev of events) {
        if (ev.name === "pulse") spawnPulseRing();
        if (ev.name === "player_hit") hitFlash();
        if (ev.name === "game_over") {
          const won = ev.data.result === "won";
          const reasons: Record<string, string> = {
            all_lit: "Cả 5 Đèn Lồng Lớn đã sáng. Đảo Bến được cứu!",
            no_flames: "Ngọn lửa của Mây đã tắt.",
            dawn: "Trời sáng nhưng vẫn còn đèn chưa được thắp.",
          };
          showOverlay(won ? "Chiến thắng!" : "Thua rồi", `${reasons[String(ev.data.reason)] ?? ""} Điểm: ${sim.score}.`, "Chơi lại", false);
        }
      }
    }
  }

  syncScene();
  updateHud();
  scene.render();
});

function syncScene(): void {
  const p = sim.player;
  player.position.set(p.pos[0], p.pos[1], p.pos[2]);
  player.rotation.y = facing;
  

  // lanterns
  let litCount = 0;
  sim.lanterns.forEach((l, i) => {
    const v = lanternViews[i];
    if (!v) return;
    if (l.lit) litCount++;
    if (v.lit !== l.lit) {
      v.lit = l.lit;
      (v.body.material as StandardMaterial).emissiveColor = l.lit ? LIT : UNLIT;
      v.light.intensity = l.lit ? 1.4 : 0;
    } else if (!l.lit && l.deposited > 0) {
      const f = l.deposited / TUNING.lantern_cost;
      (v.body.material as StandardMaterial).emissiveColor = Color3.Lerp(UNLIT, LIT, f * 0.6);
    }
  });
  const f = litCount / Math.max(1, sim.lanterns.length);
  scene.fogDensity = 0.03 - 0.016 * f;
  hemi.intensity = 0.7 + 0.5 * f;

  // fireflies
  while (moteMeshes.length < sim.motes.length) {
    const m = MeshBuilder.CreateSphere("mote", { diameter: 0.4, segments: 6 }, scene);
    m.material = moteMat;
    moteMeshes.push(m);
  }
  moteMeshes.forEach((m, i) => {
    const pos = sim.motes[i];
    m.setEnabled(!!pos);
    if (pos) m.position.set(pos[0], 0.9 + Math.sin(tNow * 2.5 + i) * 0.25, pos[2]);
  });

  // shades
  const alive = new Set<string>();
  for (const s of sim.shades) {
    alive.add(s.id);
    let m = shadeMeshes.get(s.id);
    if (!m) {
      m = MeshBuilder.CreateSphere("shade", { diameter: 1.5, segments: 10 }, scene);
      shadeMeshes.set(s.id, m);
    }
    m.material = s.state === "stunned" ? shadeMatStun : shadeMatChase;
    m.position.set(s.pos[0], 0.9 + Math.sin(tNow * 3) * 0.1, s.pos[2]);
    const w = 1 + Math.sin(tNow * 5 + s.pos[0]) * 0.08;
    m.scaling.set(w, 1.25 / w, w);
  }
  for (const [id, m] of shadeMeshes) {
    if (!alive.has(id)) {
      m.dispose();
      shadeMeshes.delete(id);
    }
  }

  // pulse rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.age += engine.getDeltaTime() / 1000;
    const k = Math.min(r.age / 0.45, 1);
    const s = Math.max(0.05, k * TUNING.pulse_radius);
    r.mesh.scaling.set(s, 1, s);
    (r.mesh.material as StandardMaterial).alpha = 0.9 * (1 - k);
    if (k >= 1) {
      r.mesh.dispose();
      rings.splice(i, 1);
    }
  }

  // third-person camera
  const th = (yawDeg * Math.PI) / 180;
  const fx = Math.sin(th), fz = Math.cos(th);
  camera.position.set(p.pos[0] - fx * 9, 5.5 + p.pos[1] * 0.5, p.pos[2] - fz * 9);
  camera.setTarget(new Vector3(p.pos[0] + fx * 2, 1.5, p.pos[2] + fz * 2));
}

window.addEventListener("resize", () => engine.resize());
if (started) overlay.classList.add("hidden");
