import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  InstancedMesh,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import type { NightMap } from "../sim/maps";
import { parseScenario } from "../sim/scenario";
import { Sim } from "../sim/sim";
import { K, TUNING } from "../sim/tuning";
import type { InputState, Scenario } from "../sim/types";
import { GameAudio } from "./audio";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- palette (Ticket-02 part 3, item 8)
const PAL = {
  sky: "#0E1430", mist: "#1B2350", grass: "#2F5D50", sand: "#C9B48A", wood: "#6B4A2F", sea: "#12384A",
  lampOn: "#FFB347", lampCore: "#FFE9B0", lampOff: "#5B5F6E", moteCore: "#FFF6C2", moteHalo: "#FFE58A",
  shadeBody: "#120A1A", shadeRim: "#7A3CFF", shadeStun: "#3A3450", shirt: "#E8E2D0", scarf: "#C8102E",
  gold: "#F2C14E", drifter: "#8FA3B8",
};
const C = (hex: string): Color3 => Color3.FromHexString(hex);

// ---------------------------------------------------------------- settings (persisted in localStorage)
interface Settings { volume: number; sens: number; cb: boolean }
const SETTINGS_KEY = "ddl.settings.v1";
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (s && typeof s.volume === "number" && typeof s.sens === "number") return { volume: clamp(s.volume, 0, 1), sens: clamp(s.sens, 0.05, 1), cb: s.cb === true };
  } catch { /* ignore */ }
  return { volume: 0.7, sens: 0.35, cb: false };
}
const settings = loadSettings();
const saveSettings = (): void => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
};
const audio = new GameAudio();
audio.setVolume(settings.volume);

// ---------------------------------------------------------------- engine / scene
const canvas = $<HTMLCanvasElement>("game");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = Color4.FromColor3(C(PAL.sky), 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = C(PAL.mist);
scene.fogDensity = 0.012;
const glow = new GlowLayer("glow", scene);
glow.intensity = 0.7;
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.diffuse = new Color3(0.75, 0.78, 1);
hemi.groundColor = C(PAL.sky);
const camera = new FreeCamera("cam", new Vector3(0, 6, -10), scene);
camera.minZ = 0.1;
camera.maxZ = 400;

function mat(diffuse: string, emissive = "#000000", alpha = 1, emissiveScale = 1): StandardMaterial {
  const m = new StandardMaterial("m", scene);
  m.diffuseColor = C(diffuse);
  m.emissiveColor = C(emissive).scale(emissiveScale);
  m.specularColor = Color3.Black();
  m.alpha = alpha;
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  return m;
}

// ---------------------------------------------------------------- static night geometry
let sim: Sim;
let statics: { dispose(): void }[] = [];
const reg = <T extends { dispose(): void }>(m: T): T => { statics.push(m); return m; };

function sector(r1: number, r2: number, h0: number, h1: number, a0: number, a1: number, n: number, topMat: StandardMaterial, wallMat: StandardMaterial): void {
  const build = (quads: number[][][], material: StandardMaterial) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (const q of quads) {
      const b = pos.length / 3;
      for (const p of q) pos.push(p[0], p[1], p[2]);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const nor: number[] = [];
    VertexData.ComputeNormals(pos, idx, nor);
    const mesh = new Mesh("sector", scene);
    const vd = new VertexData();
    vd.positions = pos; vd.indices = idx; vd.normals = nor;
    vd.applyToMesh(mesh);
    mesh.material = material;
    reg(mesh);
  };
  const P = (r: number, a: number, y: number) => [r * Math.cos(a), y, r * Math.sin(a)];
  const top: number[][][] = [];
  const outer: number[][][] = [];
  const inner: number[][][] = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    top.push([P(r1, t0, h1), P(r2, t0, h1), P(r2, t1, h1), P(r1, t1, h1)]);
    outer.push([P(r2, t0, h0), P(r2, t1, h0), P(r2, t1, h1), P(r2, t0, h1)]);
    inner.push([P(r1, t0, h0), P(r1, t0, h1), P(r1, t1, h1), P(r1, t1, h0)]);
  }
  const caps = [
    [P(r1, a0, h0), P(r2, a0, h0), P(r2, a0, h1), P(r1, a0, h1)],
    [P(r1, a1, h0), P(r1, a1, h1), P(r2, a1, h1), P(r2, a1, h0)],
  ];
  build(top, topMat);
  build([...outer, ...inner, ...caps], wallMat);
}

function island(cx: number, radius: number): void {
  const top = MeshBuilder.CreateCylinder("isl", { diameter: radius * 2, height: 1.2, tessellation: 72 }, scene);
  top.position.set(cx, -0.6, 0);
  top.material = mat(PAL.grass);
  const edge = MeshBuilder.CreateTorus("edge", { diameter: radius * 2, thickness: 0.9, tessellation: 72 }, scene);
  edge.position.set(cx, -0.1, 0);
  edge.material = mat(PAL.sand);
  const under = MeshBuilder.CreateCylinder("under", { diameterTop: radius * 2, diameterBottom: radius * 0.25, height: radius * 0.4, tessellation: 40 }, scene);
  under.position.set(cx, -1.2 - radius * 0.2, 0);
  under.material = mat(PAL.wood);
  reg(top); reg(edge); reg(under);
}

function padDisc(x: number, y: number, z: number): void {
  const d = MeshBuilder.CreateCylinder("pad", { diameter: 2, height: 0.12, tessellation: 32 }, scene);
  d.position.set(x, y + 0.06, z);
  d.material = mat(PAL.gold, PAL.gold, 1, 0.8);
  const ring = MeshBuilder.CreateTorus("padring", { diameter: 2.6, thickness: 0.12, tessellation: 32 }, scene);
  ring.position.set(x, y + 0.14, z);
  ring.material = mat(PAL.lampCore, PAL.lampCore, 0.9);
  reg(d); reg(ring);
}

interface LanternView { body: Mesh; core: Mesh; light: PointLight; zone: Mesh; bar: Mesh; fill: Mesh; cracks: Mesh[]; lit: boolean }
let lanternViews: LanternView[] = [];

function buildNight(map: NightMap): void {
  for (const s of statics) s.dispose();
  statics = [];
  for (const v of lanternViews) v.light.dispose();
  lanternViews = [];

  // cloud sea and puffs
  const cx = map.night === 2 ? 35 : 0;
  const sea = MeshBuilder.CreateCylinder("sea", { diameter: 600, height: 1, tessellation: 48 }, scene);
  sea.position.set(cx, -22, 0);
  sea.material = mat(PAL.sea, PAL.sea, 1, 0.5);
  reg(sea);
  const puff = mat("#C8D3E0", PAL.sea, 0.55, 0.6);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 55 + (i % 5) * 9;
    const c = MeshBuilder.CreateSphere("cloud", { diameter: 16 + (i % 3) * 6, segments: 8 }, scene);
    c.scaling.y = 0.32;
    c.position.set(cx + Math.cos(a) * r * (map.night === 2 ? 1.5 : 1), -9 - (i % 4) * 1.5, Math.sin(a) * r);
    c.material = puff;
    reg(c);
  }

  if (map.night === 1) island(0, 40);
  if (map.night === 2) {
    island(0, 28);
    island(70, 28);
    const bridge = MeshBuilder.CreateBox("bridge", { width: 18, height: 0.3, depth: 4 }, scene);
    bridge.position.set(35, -0.15, 0);
    bridge.material = mat(PAL.wood);
    reg(bridge);
    for (let i = 0; i < 18; i++) {
      const plank = MeshBuilder.CreateBox("plank", { width: 0.12, height: 0.34, depth: 4 }, scene);
      plank.position.set(26.5 + i, -0.14, 0);
      plank.material = mat("#4a3320");
      reg(plank);
    }
  }
  if (map.night === 3) {
    island(0, 45);
    const grass = mat(PAL.grass);
    const wood = mat(PAL.wood);
    sector(12, 24, 0, 3, 0, Math.PI, 48, grass, wood);
    const disc = MeshBuilder.CreateCylinder("tier2", { diameter: 16, height: 6, tessellation: 48 }, scene);
    disc.position.set(0, 3, 0);
    disc.material = mat(PAL.sand);
    const discTop = MeshBuilder.CreateDisc("tier2top", { radius: 8, tessellation: 48 }, scene);
    discTop.rotation.x = Math.PI / 2;
    discTop.position.set(0, 6.01, 0);
    discTop.material = grass;
    reg(disc); reg(discTop);
    const tower = MeshBuilder.CreateCylinder("tower", { diameter: 4, height: 8, tessellation: 24 }, scene);
    tower.position.set(0, 10, 0);
    tower.material = mat(PAL.sand);
    const roof = MeshBuilder.CreateCylinder("roof", { diameterTop: 0, diameterBottom: 5, height: 2.4, tessellation: 24 }, scene);
    roof.position.set(0, 15.2, 0);
    roof.material = mat(PAL.wood);
    const bell = MeshBuilder.CreateSphere("bell", { diameter: 1.4 }, scene);
    bell.position.set(0, 12.2, 2.1);
    bell.material = mat(PAL.gold, PAL.gold, 1, 0.5);
    reg(tower); reg(roof); reg(bell);
    for (const a of [30, 150]) {
      const ux = Math.cos((a * Math.PI) / 180), uz = Math.sin((a * Math.PI) / 180);
      const vx = -uz, vz = ux;
      const P = (s: number, lat: number, y: number) => new Vector3(s * ux + lat * vx, y, s * uz + lat * vz);
      const ramp = MeshBuilder.CreateRibbon("ramp", { pathArray: [[P(30, -1.5, 0.02), P(24, -1.5, 3.02)], [P(30, 1.5, 0.02), P(24, 1.5, 3.02)]], sideOrientation: Mesh.DOUBLESIDE }, scene);
      ramp.material = mat(PAL.sand);
      reg(ramp);
    }
  }
  for (const pad of map.pads) padDisc(pad.pos[0], pad.pos[1], pad.pos[2]);

  // lanterns
  const poleMat = mat(PAL.wood);
  sim.lanterns.forEach((l) => {
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.35, height: 3 }, scene);
    pole.position.set(l.pos[0], l.pos[1] + 1.5, l.pos[2]);
    pole.material = poleMat;
    const body = MeshBuilder.CreateSphere("lantern", { diameter: 1.7, segments: 12 }, scene);
    body.position.set(l.pos[0], l.pos[1] + 3.5, l.pos[2]);
    body.material = mat(PAL.lampOff);
    const core = MeshBuilder.CreateSphere("core", { diameter: 0.8, segments: 8 }, scene);
    core.position.copyFrom(body.position);
    core.material = mat(PAL.lampCore, PAL.lampCore);
    core.setEnabled(false);
    const zone = MeshBuilder.CreateTorus("zone", { diameter: TUNING.safe_radius * 2, thickness: 0.14, tessellation: 64 }, scene);
    zone.position.set(l.pos[0], l.pos[1] + 0.08, l.pos[2]);
    zone.material = mat(PAL.lampOn, PAL.lampOn, 0.5, 0.8);
    zone.setEnabled(false);
    const light = new PointLight("pl", new Vector3(l.pos[0], l.pos[1] + 3.6, l.pos[2]), scene);
    light.diffuse = C(PAL.lampOn);
    light.range = 26;
    light.intensity = 0;
    // fuel bar above a lit lantern (billboard) and torn-paper cracks on an unlit one (readable without colour)
    const bar = MeshBuilder.CreatePlane("fuelbar", { width: 1.9, height: 0.24 }, scene);
    bar.position.set(l.pos[0], l.pos[1] + 5.0, l.pos[2]);
    bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    bar.material = mat("#0c1030", "#0c1030", 0.85);
    bar.setEnabled(false);
    const fill = MeshBuilder.CreatePlane("fuelfill", { width: 1.8, height: 0.15 }, scene);
    fill.parent = bar;
    fill.position.z = -0.01;
    fill.material = mat(PAL.gold, PAL.lampOn);
    const cracks: Mesh[] = [];
    for (const [cx, cy, cz, rz] of [[0.55, 0.15, 0.6, 0.5], [-0.5, -0.1, 0.65, -0.4], [0.05, 0.3, -0.8, 0.2]] as const) {
      const c = MeshBuilder.CreateBox("crack", { width: 0.05, height: 0.6, depth: 0.05 }, scene);
      c.parent = body;
      c.position.set(cx, cy, cz);
      c.rotation.z = rz;
      c.material = mat("#15151f");
      cracks.push(c);
    }
    reg(pole); reg(body); reg(core); reg(zone); reg(bar); reg(fill);
    lanternViews.push({ body, core, light, zone, bar, fill, cracks, lit: false });
  });
}

// ---------------------------------------------------------------- dynamic views
const moteBase = MeshBuilder.CreateSphere("moteBase", { diameter: 0.45, segments: 6 }, scene);
moteBase.material = mat(PAL.moteCore, PAL.moteHalo);
moteBase.setEnabled(false);
const moteViews: InstancedMesh[] = [];
const shadeMats = {
  body: mat(PAL.shadeBody, PAL.shadeRim, 1, 0.25),
  stun: mat(PAL.shadeStun, PAL.shadeStun, 0.75, 0.8),
  rim: mat(PAL.shadeRim, PAL.shadeRim, 0.3, 0.9),
  eye: mat("#000000", PAL.shadeRim),
};
/** "Bảng màu dễ phân biệt" (Ticket-03): shade rim and eyes #7A3CFF -> #00B3FF, UI warning colour -> white + warning sign. */
function applyColorMode(): void {
  const rim = settings.cb ? "#00B3FF" : PAL.shadeRim;
  shadeMats.body.emissiveColor = C(rim).scale(0.25);
  shadeMats.rim.diffuseColor = C(rim);
  shadeMats.rim.emissiveColor = C(rim).scale(0.9);
  shadeMats.eye.emissiveColor = C(rim);
  document.body.classList.toggle("cb", settings.cb);
}
applyColorMode();
interface ShadeView { root: TransformNode; body: Mesh; rim: Mesh }
const shadeViews = new Map<string, ShadeView>();
interface DrifterView { root: TransformNode; mats: StandardMaterial }
const drifterViews = new Map<string, DrifterView>();
const charmViews = new Map<string, Mesh>();

// player: shirt, scarf, head, conical hat with a small lantern
const player = new TransformNode("player", scene);
const mk = (m: Mesh, y: number, material: StandardMaterial, x = 0): Mesh => { m.position.set(x, y, 0); m.material = material; m.parent = player; return m; };
mk(MeshBuilder.CreateCylinder("pbody", { diameterTop: 0.6, diameterBottom: 0.95, height: 1.1 }, scene), 0.55, mat(PAL.shirt, "#1a1814"));
mk(MeshBuilder.CreateTorus("scarf", { diameter: 0.62, thickness: 0.2, tessellation: 20 }, scene), 1.12, mat(PAL.scarf, PAL.scarf, 1, 0.25));
mk(MeshBuilder.CreateSphere("phead", { diameter: 0.6 }, scene), 1.42, mat("#F0CDAE", "#2a2018"));
mk(MeshBuilder.CreateCylinder("hat", { diameterTop: 0, diameterBottom: 0.95, height: 0.9 }, scene), 2.0, mat(PAL.wood, "#201408"));
mk(MeshBuilder.CreateSphere("hatlantern", { diameter: 0.28 }, scene), 1.85, mat(PAL.lampCore, PAL.lampOn), 0.35);
const aura = mk(MeshBuilder.CreateSphere("aura", { diameter: 2.3, segments: 16 }, scene), 1.1, mat(PAL.scarf, PAL.gold, 0.22, 0.8));
aura.setEnabled(false);
const playerLight = new PointLight("playerlight", new Vector3(0, 2, 0), scene);
playerLight.diffuse = C(PAL.lampOn);
playerLight.range = 16;
playerLight.intensity = 1.1;
playerLight.parent = player;

// pulse rings and lantern light bursts
const rings: { mesh: Mesh; age: number }[] = [];
function spawnPulseRing(): void {
  const m = MeshBuilder.CreateTorus("ring", { diameter: 2, thickness: 0.14, tessellation: 48 }, scene);
  m.position.set(sim.player.pos[0], sim.player.pos[1] + 0.4, sim.player.pos[2]);
  m.material = mat(PAL.lampCore, PAL.lampCore, 0.9);
  rings.push({ mesh: m, age: 0 });
}
const lightBursts: { v: LanternView; age: number }[] = [];

// wind leaves
const leafMats = [mat(PAL.wood, "#201408"), mat(PAL.grass, "#10241d")];
const leaves = Array.from({ length: 42 }, (_, i) => {
  const m = MeshBuilder.CreatePlane("leaf", { size: 0.55 }, scene);
  m.material = leafMats[i % 2];
  m.setEnabled(false);
  return { m, ox: (Math.random() - 0.5) * 36, oz: (Math.random() - 0.5) * 36, oy: 0.5 + Math.random() * 5, ph: Math.random() * 6 };
});

// ---------------------------------------------------------------- input
const keys = new Set<string>();
let yawDeg = 0;
let latch = { jump: false, interact: false, pulse: false, dash: false, pause: false };
type Flow = "menu" | "intro" | "play" | "result" | "dawn";
let flow: Flow = "menu";
let currentNight = 1;
let totalScore = 0;
let devScenario: Scenario | undefined = params.has("scenario") ? parseScenario(JSON.parse(params.get("scenario")!)) : undefined;
let devSeed: number | undefined = params.has("seed") ? Number(params.get("seed")) : undefined;

window.addEventListener("keydown", (e) => {
  audio.ensure();
  if (e.repeat) return;
  const k = e.code;
  if (k === "Escape" || k === "KeyP") {
    if (flow === "play") latch.pause = true;
    else if ($("p-settings").classList.contains("show")) backFromSettings();
    return;
  }
  if (flow !== "play") {
    if ((k === "Enter" || k === "Space") && flow === "menu" && $("p-menu").classList.contains("show")) $("btn-start").click();
    else if ((k === "Enter" || k === "Space") && flow === "intro") $("btn-intro-go").click();
    return;
  }
  keys.add(k);
  if (k === "Space") { latch.jump = true; e.preventDefault(); }
  if (k === "KeyE") latch.interact = true;
  if (k === "KeyF") latch.pulse = true;
  if (k === "ShiftLeft" || k === "ShiftRight") latch.dash = true;
  if (k === "KeyR" && !sim.paused) replayNight();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
let dragging = false;
canvas.addEventListener("pointerdown", () => (dragging = true));
window.addEventListener("pointerup", () => (dragging = false));
window.addEventListener("pointermove", (e) => {
  if (dragging && flow === "play" && !sim.paused) yawDeg += e.movementX * settings.sens;
});

function readInput(dtS: number): InputState {
  if (keys.has("ArrowRight")) yawDeg += 120 * dtS;
  if (keys.has("ArrowLeft")) yawDeg -= 120 * dtS;
  const x = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const z = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: yawDeg, jump: latch.jump, interact: latch.interact, pulse: latch.pulse, dash: latch.dash, pause: latch.pause };
}

// ---------------------------------------------------------------- screens
const panels = ["p-menu", "p-intro", "p-pause", "p-settings", "p-result", "p-dawn"];
const overlay = $("overlay");
let settingsReturn = "p-menu";
function showPanel(id: string | null): void {
  overlay.classList.toggle("hidden", id === null);
  for (const p of panels) $(p).classList.toggle("show", p === id);
}
function backFromSettings(): void {
  audio.play("ui");
  showPanel(settingsReturn);
}
const INTRO: Record<number, { name: string; quote: string; goal: string }> = {
  1: { name: "Đảo Bến", quote: "Ông Đăng: “Cháu à, sương đen đã nuốt hết ánh sáng của Đảo Bến. Hãy gom đom đóm, thắp và giữ cho các Đèn Lồng Lớn cháy tới sáng. Bóng Mực sẽ tới hút dầu đấy.”", goal: "Giữ ít nhất 3/5 đèn sáng tới bình minh (4:00). Đèn mới cần 10 đom đóm, thắp lại chỉ cần 5. Đèn hao 1 dầu mỗi giây: nạp đom đóm để châm dầu." },
  2: { name: "Đảo Cau", quote: "Ông Đăng: “Hai hòn đảo nối nhau bằng chiếc cầu tre mong manh, không lan can đâu. Gió Lạc thích cướp đom đóm của cháu lắm, nhớ nhờ bục nhảy mà qua đảo.”", goal: "Giữ ít nhất 4/6 đèn sáng tới bình minh (4:30). Bùa Gió giúp chạy nhanh và lướt liên tục." },
  3: { name: "Đảo Chuông", quote: "Ông Đăng: “Đây là hòn đảo cuối, nơi treo chiếc chuông cổ. Cẩn thận gió mạnh và những bậc thang cheo leo. Thắp đủ bảy ngọn, bình minh sẽ đến.”", goal: "Giữ ít nhất 5/7 đèn sáng tới bình minh (5:00). Leo dốc hoặc dùng bục nhảy để lên các tầng." },
};
function enterIntro(n: number): void {
  currentNight = n;
  prepareNight(n);
  flow = "intro";
  $("hud").classList.add("hidden");
  $("intro-title").textContent = `Đêm ${n} · ${INTRO[n].name}`;
  $("intro-quote").textContent = INTRO[n].quote;
  $("intro-goal").textContent = INTRO[n].goal;
  showPanel("p-intro");
}

let nightSeed = Date.now() % 2147483647;
function prepareNight(n: number): void {
  const scn = devScenario;
  const seed = devSeed ?? (nightSeed = (nightSeed * 48271) % 2147483647);
  devScenario = undefined;
  devSeed = undefined;
  sim = new Sim(seed, scn ?? {}, n);
  buildNight(sim.map);
  for (const v of shadeViews.values()) v.root.dispose();
  shadeViews.clear();
  for (const v of drifterViews.values()) v.root.dispose();
  drifterViews.clear();
  for (const m of charmViews.values()) m.dispose();
  charmViews.clear();
  latch = { jump: false, interact: false, pulse: false, dash: false, pause: false };
  keys.clear();
  yawDeg = 0;
  hudKey = "";
  lastTickSec = -1;
  windWarned = false;
  $("hud-night").textContent = `Đêm ${n} · ${INTRO[n].name}`;
  (window as unknown as { __game: unknown }).__game = gameHandle();
}
function beginNight(): void {
  flow = "play";
  showPanel(null);
  $("hud").classList.remove("hidden");
  audio.ensure();
  audio.startMusic(currentNight);
  canvas.focus();
}
function replayNight(): void {
  prepareNight(currentNight);
  beginNight();
}
function toMenu(): void {
  flow = "menu";
  audio.stopMusic();
  totalScore = 0;
  $("hud").classList.add("hidden");
  showPanel("p-menu");
}
function showDawn(): void {
  flow = "dawn";
  audio.stopMusic();
  $("dawn-score").textContent = String(totalScore);
  showPanel("p-dawn");
}

const click = (id: string, fn: () => void) => $(id).addEventListener("click", () => { audio.ensure(); audio.play("ui"); fn(); });
click("btn-start", () => { totalScore = 0; enterIntro(1); });
click("btn-menu-settings", () => { settingsReturn = "p-menu"; showPanel("p-settings"); });
click("btn-intro-go", beginNight);
click("btn-resume", () => { latch.pause = true; });
click("btn-replay", replayNight);
click("btn-pause-settings", () => { settingsReturn = "p-pause"; showPanel("p-settings"); });
click("btn-pause-menu", toMenu);
click("btn-settings-back", () => showPanel(settingsReturn));
click("btn-next", () => { if (currentNight >= 3) showDawn(); else enterIntro(currentNight + 1); });
click("btn-res-replay", replayNight);
click("btn-res-menu", toMenu);
click("btn-dawn-menu", toMenu);
const volEl = $<HTMLInputElement>("set-volume");
const sensEl = $<HTMLInputElement>("set-sens");
volEl.value = String(Math.round(settings.volume * 100));
sensEl.value = String(Math.round(settings.sens * 100));
volEl.addEventListener("input", () => { settings.volume = Number(volEl.value) / 100; audio.setVolume(settings.volume); saveSettings(); });
sensEl.addEventListener("input", () => { settings.sens = Number(sensEl.value) / 100; saveSettings(); });
const cbEl = $<HTMLInputElement>("set-cb");
cbEl.checked = settings.cb;
cbEl.addEventListener("change", () => { settings.cb = cbEl.checked; saveSettings(); applyColorMode(); });

// ---------------------------------------------------------------- HUD
const flames = [$("fl0"), $("fl1"), $("fl2")];
const bar = $("hud-bar");
for (let i = 0; i < TUNING.capacity_max; i++) { const s = document.createElement("div"); s.className = "slot"; bar.appendChild(s); }
const slots = Array.from(bar.children) as HTMLElement[];
let hudKey = "";
let lastTickSec = -1;
let windWarned = false;
/** Lanterns that must be lit at dawn: ceil(win_ratio * total). */
const needLit = (): number => Math.ceil(Math.round(TUNING.win_ratio * sim.lanterns.length * 1e9) / 1e9);
const fmtClock = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function cooldownIcon(id: string, nid: string, frac: number, total: number, label: string, dim: boolean): void {
  const el = $(id);
  el.style.background = `conic-gradient(rgba(14,20,48,0.85) ${frac * 360}deg, rgba(242,193,78,0.35) 0deg)`;
  el.classList.toggle("ready", frac <= 0);
  el.classList.toggle("dim", dim);
  $(nid).textContent = frac > 0 ? (frac * total).toFixed(1) : label;
}

function updateHud(): void {
  const p = sim.player;
  const lit = sim.lanterns.filter((l) => l.lit).length;
  const secs = Math.max(0, Math.ceil(sim.timeLeftS));
  const dashFrac = p.charm > 0 ? 0 : p.dashCd / (TUNING.dash_cooldown_s * K.tps);
  const pulseFrac = p.pulseCd / (TUNING.pulse_cooldown_s * K.tps);
  const key = `${sim.capacity}|${p.flames}|${p.carried}|${lit}|${sim.score}|${secs}|${Math.ceil(p.dashCd / 6)}|${Math.ceil(p.pulseCd / 6)}|${p.charm > 0}`;
  if (key !== hudKey) {
    hudKey = key;
    flames.forEach((f, i) => f.classList.toggle("off", i >= p.flames));
    slots.forEach((s, i) => { s.classList.toggle("on", i < p.carried); s.classList.toggle("locked", i >= sim.capacity); });
    $("hud-carried").textContent = String(p.carried);
    $("hud-cap").textContent = String(sim.capacity);
    $("hud-need").textContent = String(needLit());
    $("hud-lanterns").textContent = `${lit}/${sim.lanterns.length}`;
    $("hud-score").textContent = String(sim.score);
    $("hud-clock").textContent = fmtClock(secs);
    $("hud-clock").classList.toggle("low", secs <= 30);
    cooldownIcon("hud-dash", "hud-dash-n", dashFrac, TUNING.dash_cooldown_s, "Shift", false);
    cooldownIcon("hud-pulse", "hud-pulse-n", pulseFrac, TUNING.pulse_cooldown_s, "F", p.carried < TUNING.pulse_cost);
  }
  // prompt for the nearest lantern Mây can use (unlit: deposit, lit but not full: refuel); arrow to the nearest unlit lantern
  let usable: { l: (typeof sim.lanterns)[number]; d: number } | null = null;
  let near: { l: (typeof sim.lanterns)[number]; d: number } | null = null;
  for (const l of sim.lanterns) {
    const d = Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]);
    if (!l.lit && (!near || d < near.d)) near = { l, d };
    if ((!l.lit || l.fuelU < TUNING.fuel_max * K.tps) && (!usable || d < usable.d)) usable = { l, d };
  }
  const prompt = $("hud-prompt");
  if (usable && usable.d <= TUNING.interact_radius) {
    prompt.style.display = "block";
    const u = usable.l;
    $("hud-prompt-text").textContent = u.lit ? "E — Châm dầu" : "E — Nạp ánh sáng";
    $("hud-prompt-x").textContent = String(u.lit ? Math.round(u.fuelU / K.tps) : u.deposited);
    $("hud-prompt-y").textContent = String(u.lit ? TUNING.fuel_max : u.everLit ? TUNING.relight_cost : TUNING.lantern_cost);
  } else prompt.style.display = "none";
  const arrow = $("hud-arrow");
  if (near) {
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const sp = Vector3.Project(new Vector3(near.l.pos[0], near.l.pos[1] + 3.5, near.l.pos[2]), Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(w, h));
    const behind = sp.z > 1 || sp.z < 0;
    const inside = !behind && sp.x > 40 && sp.x < w - 40 && sp.y > 40 && sp.y < h - 40;
    if (inside) arrow.style.display = "none";
    else {
      let dx = sp.x - w / 2, dy = sp.y - h / 2;
      if (behind) { dx = -dx; dy = -dy; }
      const ang = Math.atan2(dy, dx);
      const rx = w / 2 - 60, ry = h / 2 - 60;
      const t = 1 / Math.max(Math.abs(Math.cos(ang)) / rx, Math.abs(Math.sin(ang)) / ry);
      const sx = canvas.clientWidth / w, sy = canvas.clientHeight / h;
      arrow.style.display = "block";
      arrow.style.left = `${(w / 2 + Math.cos(ang) * t) * sx - 14}px`;
      arrow.style.top = `${(h / 2 + Math.sin(ang) * t) * sy - 15}px`;
      arrow.style.transform = `rotate(${(ang * 180) / Math.PI + 90}deg)`;
    }
  } else arrow.style.display = "none";
}

const flash = $("flash");
function hitFlash(): void {
  flash.classList.add("on");
  setTimeout(() => flash.classList.remove("on"), 60);
}

function handleEvents(events: ReturnType<Sim["step"]>): void {
  for (const ev of events) {
    switch (ev.name) {
      case "mote_picked": audio.play("pick"); break;
      case "deposit": audio.play("pick"); break;
      case "lantern_lit": {
        audio.play("light");
        const idx = sim.lanterns.findIndex((l) => l.id === ev.data.lantern_id);
        if (idx >= 0 && lanternViews[idx]) lightBursts.push({ v: lanternViews[idx], age: 0 });
        break;
      }
      case "pulse": audio.play("pulse"); spawnPulseRing(); break;
      case "player_hit": audio.play("hit"); hitFlash(); break;
      case "shade_spawned": audio.play("spawn"); break;
      case "dash": audio.play("dash"); break;
      case "charm_picked": audio.play("charm"); break;
      case "drifter_steal": audio.play("steal"); break;
      case "drifter_drop": audio.play("pick"); break;
      case "refuel": audio.play("pick"); break;
      case "lantern_out": audio.play("hit"); break;
      case "game_over": onGameOver(ev.data.result === "won", String(ev.data.reason)); break;
      case "paused": showPanel("p-pause"); break;
      case "resumed": showPanel(null); break;
    }
  }
}

function onGameOver(won: boolean, reason: string): void {
  flow = "result";
  audio.stopMusic();
  audio.play(won ? "win" : "lose");
  const litNow = sim.lanterns.filter((l) => l.lit).length;
  const why: Record<string, string> = {
    dawn_survived: `Bình minh đã tới! Đảo còn ${litNow}/${sim.lanterns.length} đèn sáng.`,
    no_flames: "Ngọn Lửa của Mây đã tắt.",
    dawn: `Trời sáng nhưng chỉ còn ${litNow}/${sim.lanterns.length} đèn sáng (cần ${needLit()}).`,
  };
  if (won) totalScore += sim.score;
  $("res-title").textContent = won ? `Đêm ${currentNight} hoàn thành!` : "Thua rồi";
  $("res-text").textContent = `${why[reason] ?? ""} Điểm đêm này: ${sim.score}.${won ? ` Tổng điểm: ${totalScore}.` : ""}`;
  $("btn-next").style.display = won ? "block" : "none";
  $("btn-next").textContent = currentNight >= 3 ? "Xem Bình Minh" : "Đêm kế tiếp";
  showPanel("p-result");
}

// ---------------------------------------------------------------- main loop
function gameHandle() {
  return { sim, TUNING, get yaw() { return yawDeg; }, get flow() { return flow; }, get night() { return currentNight; }, get total() { return totalScore; } };
}
let acc = 0;
let tNow = 0;

engine.runRenderLoop(() => {
  if (!sim) return;
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  tNow += dt;

  if (flow === "play" && sim.state === "playing") {
    acc += dt;
    let guard = 0;
    while (acc >= K.dt && guard++ < 6) {
      acc -= K.dt;
      const input = readInput(K.dt);
      if (input.jump && sim.player.grounded && !sim.paused) audio.play("jump");
      const events = sim.step(input);
      latch = { jump: false, interact: false, pulse: false, dash: false, pause: false };
      handleEvents(events);
      if (flow !== "play") break;
    }
  }

  syncScene(dt);
  if (flow === "play" || flow === "result") updateHud();
  const secs = Math.ceil(sim.timeLeftS);
  if (flow === "play" && !sim.paused && secs <= 10 && secs > 0 && secs !== lastTickSec) { lastTickSec = secs; audio.play("tick"); }
  scene.render();
});

function syncScene(dt: number): void {
  const p = sim.player;
  const map = sim.map;
  player.position.set(p.pos[0], p.pos[1], p.pos[2]);
  player.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  player.scaling.z = p.dashLeft > 0 ? 1.45 : 1;
  aura.setEnabled(p.charm > 0);
  if (p.charm > 0) aura.scaling.setAll(1 + Math.sin(tNow * 8) * 0.05);
  player.setEnabled(!(p.fallWait > 0));

  // lanterns; ambient light = 0.15 + 0.55 * lit / total
  const litCount = sim.lanterns.filter((l) => l.lit).length;
  hemi.intensity = 0.15 + 0.55 * (litCount / Math.max(1, sim.lanterns.length));
  const blinkOn = Math.floor(tNow * 2) % 2 === 0; // 1 Hz
  sim.lanterns.forEach((l, i) => {
    const v = lanternViews[i];
    if (!v) return;
    const bm = v.body.material as StandardMaterial;
    const fuel = l.fuelU / K.tps;
    const low = l.lit && fuel < TUNING.low_fuel_threshold;
    if (v.lit !== l.lit) {
      v.lit = l.lit;
      bm.diffuseColor = C(l.lit ? PAL.lampOn : PAL.lampOff);
      bm.emissiveColor = C(l.lit ? PAL.lampOn : "#000000");
      v.core.setEnabled(l.lit);
    } else if (!l.lit && l.deposited > 0) {
      bm.emissiveColor = Color3.Lerp(C("#000000"), C(PAL.lampOn), (l.deposited / (l.everLit ? TUNING.relight_cost : TUNING.lantern_cost)) * 0.6);
    }
    v.body.scaling.y = l.lit ? 1 : 0.8; // an unlit lantern is squashed to 80%
    v.cracks.forEach((c) => c.setEnabled(!l.lit));
    v.zone.setEnabled(l.lit && fuel >= TUNING.low_fuel_threshold);
    v.bar.setEnabled(l.lit && (!low || blinkOn));
    v.body.visibility = low && !blinkOn ? 0.35 : 1;
    v.fill.scaling.x = Math.max(0.02, fuel / TUNING.fuel_max);
    v.fill.position.x = -0.9 * (1 - v.fill.scaling.x);
    (v.fill.material as StandardMaterial).emissiveColor = C(low ? PAL.scarf : PAL.lampOn);
    v.light.intensity = l.lit ? 0.5 + 1.0 * (fuel / TUNING.fuel_max) : 0;
  });
  for (let i = lightBursts.length - 1; i >= 0; i--) {
    const b = lightBursts[i];
    b.age += dt;
    b.v.light.intensity += Math.max(0, 1 - b.age / 0.8) * 5;
    if (b.age > 0.8) lightBursts.splice(i, 1);
  }

  // fireflies
  while (moteViews.length < sim.motes.length) moteViews.push(moteBase.createInstance("mote"));
  moteViews.forEach((m, i) => {
    const mo = sim.motes[i];
    let on = !!mo;
    if (mo) {
      if (mo.kind === "dropped" && mo.ttl !== null && mo.ttl < 90 && Math.floor(tNow * 8) % 2 === 0) on = false;
      m.position.set(mo.pos[0], mo.pos[1] + 0.9 + Math.sin(tNow * 2.5 + i) * 0.25, mo.pos[2]);
      m.scaling.setAll(mo.kind === "dropped" ? 0.8 : 1);
    }
    m.setEnabled(on);
  });

  // charms
  for (const c of sim.charms) {
    let m = charmViews.get(c.id);
    if (!m) {
      m = MeshBuilder.CreateSphere("charm", { diameter: 1, segments: 10 }, scene);
      m.scaling.set(0.55, 0.08, 0.9);
      m.material = mat(PAL.scarf, PAL.scarf, 1, 0.6);
      const rim = MeshBuilder.CreateTorus("charmrim", { diameter: 0.95, thickness: 0.07, tessellation: 24 }, scene);
      rim.material = mat(PAL.gold, PAL.gold);
      rim.parent = m;
      rim.scaling.set(1.8, 12, 1.1);
      charmViews.set(c.id, m);
    }
    m.setEnabled(c.available);
    m.position.set(c.pos[0], c.pos[1] + 1.1 + Math.sin(tNow * 2) * 0.15, c.pos[2]);
    m.rotation.y = tNow * 1.5;
  }

  // shades
  const aliveS = new Set<string>();
  for (const s of sim.shades) {
    aliveS.add(s.id);
    let v = shadeViews.get(s.id);
    if (!v) {
      const root = new TransformNode("shade", scene);
      const body = MeshBuilder.CreateSphere("sbody", { diameter: 1.5, segments: 10 }, scene);
      const rim = MeshBuilder.CreateSphere("srim", { diameter: 1.9, segments: 10 }, scene);
      body.parent = root;
      rim.parent = root;
      rim.material = shadeMats.rim;
      for (const ex of [-0.28, 0.28]) {
        const eye = MeshBuilder.CreateSphere("eye", { diameter: 0.3 }, scene);
        eye.position.set(ex, 0.18, 0.66);
        eye.material = shadeMats.eye;
        eye.parent = root;
      }
      v = { root, body, rim };
      shadeViews.set(s.id, v);
    }
    v.body.material = s.state === "stunned" ? shadeMats.stun : shadeMats.body;
    v.rim.setEnabled(s.state !== "stunned");
    v.root.position.set(s.pos[0], s.pos[1] + 0.4 + Math.sin(tNow * 3 + s.pos[0]) * 0.1, s.pos[2]);
    const w = 1 + Math.sin(tNow * 5 + s.pos[0]) * 0.08;
    const grow = s.state === "spawning" ? 0.35 + 0.65 * (1 - s.left / K.shadeSpawningTicks) : 1;
    v.root.scaling.set(w * grow, (1.25 / w) * grow, w * grow);
    v.root.rotation.y = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);
    v.rim.scaling.setAll(s.state === "drain" ? 1 + 0.12 * Math.sin(tNow * 10) : 1);
  }
  for (const [id, v] of shadeViews) if (!aliveS.has(id)) { v.root.dispose(); shadeViews.delete(id); }

  // drifters
  const aliveD = new Set<string>();
  for (const d of sim.drifters) {
    aliveD.add(d.id);
    let v = drifterViews.get(d.id);
    if (!v) {
      const root = new TransformNode("drifter", scene);
      const m = mat(PAL.drifter, PAL.drifter, 0.8, 0.5);
      for (let i = 0; i < 4; i++) {
        const seg = MeshBuilder.CreateSphere("dseg", { diameter: 0.9 - i * 0.18, segments: 8 }, scene);
        seg.material = m;
        seg.parent = root;
        seg.position.z = -i * 0.65;
        seg.scaling.set(1, 0.4, 1.3);
      }
      v = { root, mats: m };
      drifterViews.set(d.id, v);
    }
    v.root.setEnabled(d.state !== "removed");
    v.root.position.set(d.pos[0], d.pos[1] + Math.sin(tNow * 3 + d.pos[0]) * 0.2, d.pos[2]);
    v.root.getChildMeshes().forEach((c, i) => (c.position.x = Math.sin(tNow * 6 - i) * 0.35));
    v.mats.emissiveColor = C(d.stolen > 0 ? PAL.gold : PAL.drifter).scale(0.6);
    const dx = d.state === "flee" ? d.pos[0] - p.pos[0] : p.pos[0] - d.pos[0];
    const dz = d.state === "flee" ? d.pos[2] - p.pos[2] : p.pos[2] - d.pos[2];
    if (d.state !== "idle") v.root.rotation.y = Math.atan2(dx, dz);
    else v.root.rotation.y += dt * 0.8;
  }
  for (const [id, v] of drifterViews) if (!aliveD.has(id)) { v.root.dispose(); drifterViews.delete(id); }

  // pulse rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.age += dt;
    const k = Math.min(r.age / 0.45, 1);
    const s = Math.max(0.05, k * TUNING.pulse_radius);
    r.mesh.scaling.set(s, 1, s);
    (r.mesh.material as StandardMaterial).alpha = 0.9 * (1 - k);
    if (k >= 1) { r.mesh.dispose(); rings.splice(i, 1); }
  }

  // wind: warning 2 s before, leaves while blowing
  let warn = false;
  if (map.wind && !sim.windActive) {
    const nextStart = sim.simTick < K.windFirst ? K.windFirst : K.windFirst + K.windEvery * Math.ceil((sim.simTick - K.windFirst + 1) / K.windEvery);
    const until = nextStart - sim.simTick;
    warn = until <= 120 && until > 0;
    if (warn && !windWarned) { windWarned = true; audio.play("wind"); }
    if (!warn && until > 120) windWarned = false;
  }
  $("warn").style.display = warn || sim.windActive ? "block" : "none";
  $("warn").textContent = sim.windActive ? "Gió mạnh đang thổi!" : "Gió mạnh sắp tới!";
  const leavesOn = warn || sim.windActive;
  const wdx = Math.cos((sim.windDir * Math.PI) / 180), wdz = Math.sin((sim.windDir * Math.PI) / 180);
  for (const lf of leaves) {
    lf.m.setEnabled(leavesOn);
    if (!leavesOn) continue;
    if (sim.windActive) { lf.ox += wdx * 9 * dt; lf.oz += wdz * 9 * dt; }
    else { lf.ox += Math.sin(tNow + lf.ph) * 1.5 * dt; lf.oz += Math.cos(tNow * 0.8 + lf.ph) * 1.5 * dt; }
    if (lf.ox > 18) lf.ox -= 36;
    if (lf.ox < -18) lf.ox += 36;
    if (lf.oz > 18) lf.oz -= 36;
    if (lf.oz < -18) lf.oz += 36;
    lf.m.position.set(p.pos[0] + lf.ox, p.pos[1] + lf.oy + Math.sin(tNow * 2 + lf.ph) * 0.4, p.pos[2] + lf.oz);
    lf.m.rotation.set(tNow * 2 + lf.ph, tNow * 3, 0);
  }

  // third-person camera (follows height, so the tiers of Night 3 work)
  const th = (yawDeg * Math.PI) / 180;
  const fx = Math.sin(th), fz = Math.cos(th);
  camera.position.set(p.pos[0] - fx * 9, p.pos[1] + 5.5, p.pos[2] - fz * 9);
  camera.setTarget(new Vector3(p.pos[0] + fx * 2, p.pos[1] + 1.5, p.pos[2] + fz * 2));
}

window.addEventListener("resize", () => engine.resize());

// ---------------------------------------------------------------- boot
if (params.has("autostart")) {
  currentNight = Number(params.get("night") ?? 1);
  prepareNight(currentNight);
  beginNight();
} else {
  prepareNight(1);
  showPanel("p-menu");
}
