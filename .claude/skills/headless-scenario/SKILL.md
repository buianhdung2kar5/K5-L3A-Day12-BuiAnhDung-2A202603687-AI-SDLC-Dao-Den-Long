---
name: headless-scenario
description: Use when adding or changing game rules, scenarios or tests in this repo. Explains how to write a headless scenario case with hand-computed expectations and how to run the proof scripts.
---

# Writing a headless test case for Đảo Đèn Lồng

Rules live in `src/sim` (pure, deterministic, 60 ticks/s, no DOM). Numbers come from `game.contract.json` (tuning) and `src/sim/tuning.ts` (`K`, engine constants). Ticket-02 numbers are transcribed in `docs/notes/ticket-02.md`; ambiguous points and our choices are in `docs/notes/phase2-assumptions.md` (B1-B26). Read both before changing a rule.

## Add a case
1. Edit `tests/cases/cases.json` (or the generator you keep in a scratch dir). One case = `name`, `covers` (S-ids from the assumptions doc), `why`, `args {seed,ticks,night}`, optional `scenario`, `inputs`, `snapshot_every`, and `expect`.
2. **Compute the expected values by hand** from the tuning and the tick order (comments in `why` show the arithmetic, e.g. `speed 6 m/s => 0.1 m/tick, full speed after 6 ticks`). Never paste values from the game's own output: that is a serious violation (docs/RULES.md).
3. `expect.events` is the exact list (night_start is ignored unless `keep_night_start`; `event_names` filters). `expect.snapshots` is a subset match (numbers within 0.0005). `expect.checks` has geometry checks (`player_box`, `player_in_circle`, `motes_ring`, `shade_min_dist`, `wind_push`, `motes_distinct`).
4. Use the quiet scenario (`random_motes/random_shades/random_drifters` false, `wind_enabled` false, `motes: []`) so only what you test happens. Night 2 has a default charm at (35,0,0): pass `charms: []` when walking over the bridge.

## Run
- `npm test`: build + all headless cases + determinism (3 nights) + full-night timing (<= 30 s). Writes `docs/proof/phase2/results.md`.
- `npm run e2e`: real game in headless Chrome with real key presses and an FPS measurement on the GPU. Writes `docs/proof/phase2/e2e-results.md`.
- After changing a rule, break it on purpose (change a tuning value) and check that a case turns red, then restore.

## Do not
- Do not edit `docs/proof/phase1/` or move tag `phase-1`: that proof matches the Phase 1 code.
- Do not silence a failing case; fix the code or change the case with a written reason in `docs/notes/phase2-regression.md`.
