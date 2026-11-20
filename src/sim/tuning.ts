import contract from "../../game.contract.json";
import type { Tuning } from "./types";

/** Single source of truth: values come from game.contract.json. */
export const TUNING: Tuning = contract.tuning as Tuning;

/** Engine constants fixed by Ticket-02 but not part of the contract tuning block. */
export const K = {
  dt: 1 / 60,
  tps: 60,
  gravity: 20,
  jumpSpeed: 7,
  accelTicks: 6, // speed reached in 6 ticks = 0.1 s
  stepUp: 0.5, // max ledge a walker can step up
  fallY: -10,
  fallWaitTicks: 60,
  heightTol: 1.5, // pickup / contact height tolerance
  pulseCenterY: 0.8,
  pulseStunTicks: 120,
  pulsePushTicks: 15,
  moteInitial: 20,
  moteCap: 30,
  moteSpawnEvery: 240,
  dropTtl: 480,
  dropRingMin: 1.5,
  dropRingMax: 2.5,
  shadeSpawnFirst: 300,
  shadeSpawnFirstCount: 2,
  shadeSpawnMinDist: 15,
  shadeSpawningTicks: 30,
  shadeWanderSpeed: 2,
  shadeDetect: 12,
  shadeLose: 18,
  shadeCenterY: 0.5,
  recoilTicks: 60,
  recoilDist: 2,
  ejectTicks: 30,
  charmSpeed: 7.2,
  charmTicks: 600,
  charmRespawnTicks: 2700,
  drifterSpeedIdle: 2,
  drifterSpeed: 7,
  drifterMax: 2,
  drifterSpawnEvery: 1200,
  drifterTouch: 1.2,
  drifterFleeTicks: 240,
  drifterCarryNeeded: 5,
  drifterDetect: 15,
  drifterSteal: 3,
  drifterDropTtl: 120,
  drifterY: 1.5,
  windFirst: 1800,
  windEvery: 1800,
  windTicks: 300,
  windSpeed: 2,
  towerTop: 14,
  drainRange: 2, // a shade this close (XZ) to a weak lit lantern drains it
  drainChase: 6, // a draining shade chases Mây when she is this close
  capacityPerLight: 2,
};
