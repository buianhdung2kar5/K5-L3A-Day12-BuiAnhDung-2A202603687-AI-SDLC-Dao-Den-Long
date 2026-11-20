# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## State of the repo

Lab docs (Vietnamese): README, GUIDE, CHECKPOINTS, SUBMISSION, RULES, RUBRIC. Phase 1 has started: `game.contract.json` (tuning values) and `docs/notes/phase1-assumptions.md` (assumptions A1-A19, acceptance criteria R1-R13) exist. No source code yet.

## Stack (chosen, Phase 1)

TypeScript + Node for the simulation and headless CLI; Babylon.js for rendering (web build). Commands:

- build: `npm install && npm run build` (esbuild bundles `src/headless.ts` to `dist/headless.js`); typecheck: `npm run typecheck`; tests: `npm test` (builds, runs `tests/run.mjs` over `tests/cases/cases.json`, rewrites `docs/proof/phase1/`)
- headless: `node dist/headless.js --seed <n> --night 1 --ticks <n> --out <file.jsonl> [--scenario f] [--inputs f] [--snapshot-every n]`
- e2e: `npm run e2e` drives the real web game in headless Chrome via puppeteer-core (needs Chrome; `CHROME_PATH` to override), writes `docs/proof/phase1/e2e-results.md` and `screens/e2e-*.png`. The game exposes a read-only `window.__game` handle for it.
- Expected values in `tests/cases/cases.json` are hand-computed from the contract tuning; never copy them from game output.
- web: `npm run build` also bundles `src/web/main.ts` (Babylon.js) + `index.html` into `dist/web` via `scripts/build-web.mjs`; `npm start` serves it on :8080 (`PORT` env to change). Dev/demo only: `?autostart&seed=N&scenario=<urlencoded scenario JSON>` in the URL (same format as headless scenarios); used for the screenshots in `docs/proof/phase1/screens/`.
- Layout: `src/sim/` is pure logic with no DOM or Babylon imports and is shared by the game and `src/headless.ts`; rendering only reads sim state. `src/sim/tuning.ts` imports `game.contract.json`, so tuning values and contract never diverge. Engine constants outside the contract live in `WORLD` in the same file.
- Determinism: separate seeded RNG streams per purpose (`stream(seed, salt)`); never use `Math.random` or wall-clock time in `src/sim`.

## The project

Individual lab (Day 12, AI SDLC): build a 3D third-person game, "Đảo Đèn Lồng" (Lantern Island). The player, Mây, collects fireflies to relight the Great Lanterns and avoids Ink Shadows in black fog. The work is graded by process and evidence as much as by the game.

Phases are released on the lab board (https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW) over a 4-hour lab, and later phases may change earlier requirements. Their content is not in this repo, so don't invent it:

| Phase | Input | Tag deadline |
|---|---|---|
| 1 | PRD-0 + Test Contract | `phase-1` before 1h |
| 2 | Ticket-02 | `phase-2` before 2h |
| 3 | Ticket-03 | `phase-3` before 2h30 |
| 4 | Ticket-04 | `phase-4`, Release `v1.0.0`, demo video before 4h |

## Constraints that shape the code

- **Test Contract / headless mode**: each phase defines a fixed-format headless run (fixed input and output) that hidden graders run against each tag. Read it before designing the architecture. Keep game logic separate from rendering so it runs without a window, and deterministic (same input gives the same output). Re-run old scenarios whenever the contract changes.
- **Graded at each tag**: graders check out each `phase-N` tag in a clean clone and follow the README, which must allow install and run in at most 3 commands. Evidence (tests, headless output, screenshots, measurements) must match the code at that tag.
- **Test integrity**: never write tests that always pass or hand-edit program output to match expectations (a serious violation). If a later phase invalidates an old test, fix or remove it and record why. Mark unmet requirements "chưa đạt" with the reason.
- **Git**: do not rewrite history or force-push after tagging. Do not delete harness files (AGENTS.md/CLAUDE.md, skills, hooks, MCP config). Commit small, one change per commit.
- **Assets and secrets**: characters and setting are original to the lab, so don't use existing game or film IP. External assets must be CC0/CC-BY/MIT or self-made/AI-made, and credited in `CREDITS.md`, along with a `LICENSE`. Never commit `.env`, API keys or tokens.
- **Required in the final repo**: the README starts with the demo video link (`.mp4` under 5 minutes, attached to the Release or at `docs/demo/demo.mp4`). The repo also needs per-phase assumptions, an AI usage log with token/cost estimates, and a retro. The suggested layout is `docs/notes/`, `docs/proof/` and `docs/demo/`.
- **Scope**: correctness against stated requirements beats polish. Extra creativity is scored only under rubric F and must not break requirements. Record it in a "Sáng tạo của tôi" section of the project README.
- **Repo naming** for submission: `K5-<L3A|L3B>-DAY12-<HoVaTen>-<MSSV>-AI-SDLC-Dao-Den-Long`, public.

## Working style the lab rewards

Per phase: write short acceptance criteria and note assumptions for ambiguous points, plan how to verify before coding, build in small steps, verify by actually running (not by trusting agent claims), then tag. Keep this file short, and update it when the agent repeats the same mistake.
