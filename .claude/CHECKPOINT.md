# Checkpoint

Current state only. History lives in git.

## In progress -- task 2026-10-20: cast admin, Garage and pun names onto main

- **Request:** the work from `feat/multiplayer` (admin account "rida",
  kart personalisation, pun names) should be pushed, merged and deployed.
  It is being reworked onto main (DEC-021); plan in `.claude/PLAN.md`,
  stages 0-9.
- **Branch:** `feat/cast-admin-garage`, cut from `origin/main` at
  `2b14388`, with no upstream (a push will set its own). Reference
  implementation: `feat/multiplayer` at `4ee4673` (not merged).
- **Standing instruction:** the E2E suite runs after every stage, without
  asking (DEC-022).
- **Checkpoint:** `origin/main` `2b14388`. The stage 0 commit records it.
- **Tier-1 baseline at `2b14388` (2026-10-20):** typecheck clean; ui 235 +
  8 skipped, game 138, server 30; `npm audit --omit=dev` 0.
- **E2E baseline:** 36/37. **Pre-existing flake on main:** `e2e/game.spec.ts`
  R-02 "fills the drift gauge while drifting" failed 2 of 4 runs ("drift
  gauge stayed empty"), with no change of mine applied. When a stage's run
  fails on that spec alone, it is rerun before being judged.
- **Stage 1 committed** (pun names, DEC-023): Tier 1 green (game 142),
  e2e 37/37.
- **Stage 2 committed** (kart style): Tier 1 green (game 188), e2e 36/37.
- **Synced with main `3f4d040`** (merge `3ec001c`): main now carries both
  flake fixes (drift-gauge spec; team races wait for every driver to load,
  main's DEC-020). This branch's decisions were renumbered to DEC-021..023.
  On the merged branch Tier 1 is green (ui 235, game 188, server 32) and e2e
  is 37/37.
- **Rare flake (main's):** headless.test.js "knocks over a cyclist..."
  failed once in a full parallel run, then passed 6/6 alone (here and on a
  clean main) and 3/3 in full runs.
- **Stage 3 committed** (Garage, ChoiceGroup, DEC-024): e2e 44/44.
- **Standing instruction (DEC-025):** run stages 4-9 without stopping, then
  push and merge into main.
- **Stage 4 committed** (seeded admin, DEC-026): server 52, e2e 41/41.
- **Stage 5 committed** (roster in store, DEC-027): server 98, e2e 41/41.
- **Stage 6 committed** (Workshop admin-only, R-06 redefined): game 215,
  server 99, e2e 45/46 + rerun (machine stall).
- **Current stage:** 7 (kart style in team races). **Next action:**
  implement inline.

## Previous task (on main's history)

- **Task:** online team multiplayer (plan in `.claude/PLAN.md`, DEC-014).
  Branch `feat/multiplayer`, cut from `main` at `e819070`. Not pushed.
- **Current phase:** DOCUMENT, done. **All 10 stages committed**:
  8449249 (plan), e8134bc (headless engine), be8de1c (routing by kart),
  7c850d9 (teams and points), e3c8944 (snapshot codec), 7229652 (server
  lobby), 1b32d6c (race worker), ce4486b (client lobby), 053eb9c
  (networked race), 61163cd (two-browser e2e), 06bc141 (container).
- **Next action:** the human decides whether to push and merge
  `feat/multiplayer`, and owes the manual checks below.
- **Owed by hand:** R-10..R-12 in a real solo race (stage 2 rewired every
  toast and sound; the e2e suite and unit tests pass, but a full three-lap
  race with items was not played by a person). A team race on two real
  machines on the LAN.
- **Known limits:** no local-kart prediction, so your own kart answers about
  half a round trip plus 100 ms late (fine on a LAN, felt over the
  internet). Below 20 fps the chase camera trails a networked kart, because
  its easing uses frame time capped at 50 ms. Remote players' workshop edits
  are not shown (A-011). Rooms live in one process's memory.
- **Open questions:** A-008..A-011 are the defaults chosen; none blocks.
- **Known working-tree noise:** 46 files show as modified after a
  line-ending restore (empty `git diff`; see `.design-sync/NOTES.md`).

## Checkpoint commit

- **Hash:** `e819070` (the pre-task checkpoint; main and feat/design-system point here)
- **Branch tip:** `06bc141` on `feat/multiplayer`, Tier 1 green, e2e 29/29
- **Subject:** Record the line-ending trap found on the design-sync re-sync
- **Branch:** `feat/multiplayer`
- **Tree at checkpoint:** clean in content (`git diff` empty)
- **Pages:** run 38709974819 green for this commit.

## Tier-1 baseline

Measured 2026-10-15 at `e819070`, before any multiplayer change:

    npm run typecheck   # clean
    npm run test        # ui: 13 files, 235 passed + 8 skipped; game: 6 files, 52 passed
    npm audit --omit=dev  # 0 vulnerabilities

Historic, from the design-system task:

**Tier 1 as of stage 1 (green):**

    npm install            # clean, 95 packages, 0 vulnerabilities
    npm run build          # vite lib build + tsc declarations -> dist/
    npm run typecheck      # tsc --noEmit, clean
    npm run test           # vitest, 14 files / 341 tests passing
    npm run build-storybook -w @kart-republique/ui   # 115 stories, 46 components
    npm audit              # 0 vulnerabilities (with and without dev deps)

All four run from the repo root across workspaces. The game's regression
contract stays UNVERIFIED until stage 7 lands the Playwright suite -- that is
the stage that gives Part C its net.

## Regression contract

The game at `index.html` must keep working. No item here may break.

| # | Functionality | Covering test | Status |
|---|---|---|---|
| R-01 | Title -> character select -> track select -> race -> results flow | `e2e/game.spec.ts` R-01 (6 specs) + R-01b | COVERED |
| R-02 | Live HUD: position, lap, timer, speed, drift gauge, item slot, power gauge, toasts, wrong-way, countdown | `e2e/game.spec.ts` R-02 (4 specs) | COVERED |
| R-03 | Pause / resume / quit to menu | `e2e/game.spec.ts` R-03 (3 specs) | COVERED |
| R-04 | Mute toggle (button and `M` key) | `e2e/game.spec.ts` R-04 (2 specs) | COVERED |
| R-05 | Graphics toggle: detailed with shadows vs light low-poly | `e2e/game.spec.ts` R-05 (2 specs) | COVERED |
| R-06 | Workshop (admin only): rename, colours, kart defaults, livery, posters; saved on the server for every player; reset | `e2e/admin.spec.ts` R-06 workshop (3 specs) | COVERED (redefined 2026-10-20) |
| R-07 | Keyboard controls as documented in the README controls table | `e2e/game.spec.ts` R-07 (3 specs) | COVERED |
| R-08 | Minimap canvas rendering | `e2e/game.spec.ts` R-08 (1 spec) | COVERED |
| R-09 | Window resize without layout or renderer breakage | `e2e/game.spec.ts` R-09 (2 specs) | COVERED |
| R-10 | Three laps, five AI opponents, rubber-banding | none | UNVERIFIED (manual) |
| R-11 | 16 characters (pun names) with their stats and signature powers | none | UNVERIFIED (manual) |
| R-12 | 14 items with rank-weighted odds from golden ballot boxes | none | UNVERIFIED (manual) |
| R-13 | 3 circuits with ramps, tricks, pits, dash panels, chicanes, crossings | none | UNVERIFIED (manual) |
| R-14 | Synthesized WebAudio sound and music | none | UNVERIFIED (manual) |
| R-16 | Team race: an account hosts, players join by code or invitation, race on opposite teams, see team points and each other's Garage styles; the static (Pages) build without a server offers no Multijoueur | `e2e/multiplayer.spec.ts` (4 specs) + `apps/server/src/*.test.js` | COVERED 2026-10-20 |
| R-17 | Garage: style your own kart (colours, wheels, spoiler, pods, number, sticker); kept in the browser; reset; races with it | `e2e/garage.spec.ts` (4 specs) + `engine/garage.test.js`, `engine/kart.test.js` | COVERED 2026-10-20 |
| R-18 | Admin access: only the env-seeded admin account sees the Workshop; visitors, normal accounts and the static build never do; logout hides it; admin kart defaults reach players' Garage | `e2e/admin.spec.ts` access specs + `apps/server/src/admin.test.js`, `roster.test.js` | COVERED 2026-10-20 |
| R-15 | Playable from GitHub Pages at the documented URL | Pages workflow run 38699287498 + HTTP check of the published index and bundle | VERIFIED 2026-10-15 |

**Stage 7 maps the contract to specs** in `e2e/game.spec.ts`, whose describe
blocks are named for the items above (R-01 .. R-09, plus R-01b for the results
screen). Once that suite is green, those rows stop being UNVERIFIED. R-10..R-14
stay manual: lap counts, item odds, circuit features, procedural models and
synthesised audio are not things a DOM-level suite can assert, and R-15 is a
deployment check for stage 14.

**DEC-009 records the consequence**: the game's element ids are now a contract
the React port must preserve, because the suite drives the game through them.

R-01..R-09 are COVERED as of stage 7: `npm run test:e2e` runs 27 specs against
the real game in Chromium in about 2.8 minutes, and must be green after every
stage from 8 to 13.

R-10..R-14 stay UNVERIFIED by choice, not oversight: lap counts over a full
three-lap race, rank-weighted item odds, circuit features, procedural models
and synthesised WebAudio are not things a DOM-level suite can assert without
either minutes of automated driving per run or white-box hooks that the port
will delete. They are manual checks, to be done by hand before close-out.
R-15 is a deployment check for stage 14.
