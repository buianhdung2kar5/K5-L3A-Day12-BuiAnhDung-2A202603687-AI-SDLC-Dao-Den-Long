import contract from "../../game.contract.json";
import type { Tuning } from "./types";

/** Single source of truth: values come from game.contract.json. */
export const TUNING: Tuning = contract.tuning as Tuning;

/** Engine constants that are not part of the contract. */
export const WORLD = {
  dt: 1 / 60,
  tps: 60,
  islandRadius: 30,
  lanternRingRadius: 15,
  gravity: 20,
  jumpSpeed: 8,
  moteCount: 40,
  moteMinR: 3,
  moteMaxR: 26,
  shadeFirstSpawnS: 5,
  shadeSpawnIntervalS: 8,
  shadeMax: 4,
  shadeSpawnRadius: 28,
  shadeY: 0.5,
  dropRingRadius: 2,
};
