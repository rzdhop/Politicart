# Checkpoint

Current state only. History lives in git.

## In progress

- **Current phase:** IMPLEMENT (phases 0-4 done: LOAD, EXPLORE, CLARIFY, PLAN,
  CHECKPOINT). Plan approved by the human: all 15 stages, see `.claude/PLAN.md`.
- **Current stage:** Stage 13 DONE and committed -- **Part C, the port, is
  complete.** The HUD is `ui/Hud.tsx`, composed from the library's HUD
  components, rendered once and written every frame through their imperative
  handles by `game.js` (135 lines); nothing in the HUD goes through React
  state. The minimap canvas is the engine's (`engine/minimap.js`, attached
  from the HUD's ref, drawn in `stepRace`). `SpeedReadout`, `DriftGauge` and
  `PowerGauge` gained part props and `PowerGauge` a `setKeyHint` handle
  (DEC-012). `index.html` is a 22-line shell: canvas, React root, script.
  Tier 1: 243 + 52 tests. 27/27 E2E green. Frame-time check: deferred, to be done by hand (host was low on memory); a rAF-delta script is in the action log's notes.
- **Next action:** Stage 14 -- GitHub Pages via a GitHub Actions workflow
  (DEC-008) and the README rewrite (the accepted loss of DEC-003). The
  workflow must build `packages/ui` before `apps/game` (the game resolves
  `@kart-republique/ui` from its `dist/`), run Tier 1, and deploy
  `apps/game/dist`. `base: './'` in the game's Vite config already makes the
  build work under `/Politicart/`. Reminder: the repository's Pages source
  must be switched to "GitHub Actions" by hand before the deploy works
  (R-15). Then stage 15, the design-sync run against `packages/ui`.
- **Session note (2026-10-14):** the branch ref file was found zeroed on
  resume and restored from the reflog; see the action log. Nothing was lost.
- **Plan amendment:** an unplanned **stage 5b** was inserted before stage 6 to
  self-host the two web fonts. Reason: stage 6's stories are what design-sync
  screenshots in stage 15, and the package shipped no fonts, so every preview
  would have silently fallen back to Arial Black and Segoe UI. Doing it before
  the stories exist keeps those previews honest. Kept as its own commit so it
  reverts alone.
- **Component count:** 46, not the ~30 the plan estimated. The estimate
  collapsed the HUD's twelve readouts and the workshop's nine form parts into
  single inventory lines. Same scope ("the whole surface"), more accurate count.
- **Open questions:** none open. A-004 resolved as DEC-008 (Pages via GitHub
  Actions). Reminder carried forward: the repository's Pages source must be
  switched to "GitHub Actions" by hand before stage 14's deploy will work.

## Checkpoint commit

- **Hash:** `65998b184998bc785f043ba55274cb37eabf25f7`
- **Subject:** Publish the game from a GitHub Actions workflow and rewrite the README
- **Branch:** `feat/design-system` (branched from `main` at `f271930`). `main`
  keeps serving the playable single-file game on Pages until the port merges.
- **Tree at checkpoint:** clean
- **Unrelated changes left unstaged:** none
- **KNOWN STALE:** `README.md` still describes the game as a single file with
  "No build step, no install", and still points at `index.html` at the
  repository root, which stage 8 removed. This is the accepted loss recorded in
  DEC-003; stage 14 rewrites the README. Anyone reading the branch before then
  should know the instructions are out of date, not that the game is broken.
- **Last known-good single-file game:** `f271930`. From stage 8 the game lives
  at `apps/game/` and needs a build; `183fbc2` is the last commit on this
  branch where the original single file was still intact and playable by
  double-clicking.

## Tier-1 baseline

At the task's start there was no automated check of any kind in this repo: no
`package.json`, no test runner, no type check, no linter. The Tier-1 baseline
was therefore empty by definition, not green-by-passing, and every item in the
regression contract below began UNVERIFIED.

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
| R-06 | Workshop: rename, colours, kart livery, campaign posters; localStorage persistence; reset | `e2e/game.spec.ts` R-06 (3 specs) | COVERED |
| R-07 | Keyboard controls as documented in the README controls table | `e2e/game.spec.ts` R-07 (3 specs) | COVERED |
| R-08 | Minimap canvas rendering | `e2e/game.spec.ts` R-08 (1 spec) | COVERED |
| R-09 | Window resize without layout or renderer breakage | `e2e/game.spec.ts` R-09 (2 specs) | COVERED |
| R-10 | Three laps, five AI opponents, rubber-banding | none | UNVERIFIED (manual) |
| R-11 | 11 characters with their stats and signature powers | none | UNVERIFIED (manual) |
| R-12 | 14 items with rank-weighted odds from golden ballot boxes | none | UNVERIFIED (manual) |
| R-13 | 3 circuits with ramps, tricks, pits, dash panels, chicanes, crossings | none | UNVERIFIED (manual) |
| R-14 | Synthesized WebAudio sound and music | none | UNVERIFIED (manual) |
| R-15 | Playable from GitHub Pages at the documented URL | none | UNVERIFIED (manual) |

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
