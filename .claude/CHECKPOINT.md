# Checkpoint

Current state only. History lives in git.

## In progress

- **Task:** online team multiplayer (plan in `.claude/PLAN.md`, DEC-014).
  Approved by the human 2026-10-15. Branch `feat/multiplayer`, cut from
  `main` at `e819070`.
- **Current phase:** IMPLEMENT. Phases 0-4 done (LOAD, EXPLORE with two
  agents plus web research, CLARIFY with two question rounds, PLAN,
  CHECKPOINT).
- **Current stage:** 1 of 10 -- headless-safe engine.
- **Next action:** stage 1: guard the browser-only calls, split `stepRace`.
- **Open questions:** none blocking. A-008..A-011 are the defaults chosen.
- **Known working-tree noise:** 46 files show as modified after a
  line-ending restore (empty `git diff`; see `.design-sync/NOTES.md`). They
  are never staged.

## Checkpoint commit

- **Hash:** `e819070` (main and feat/design-system point here)
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
| R-06 | Workshop: rename, colours, kart livery, campaign posters; localStorage persistence; reset | `e2e/game.spec.ts` R-06 (3 specs) | COVERED |
| R-07 | Keyboard controls as documented in the README controls table | `e2e/game.spec.ts` R-07 (3 specs) | COVERED |
| R-08 | Minimap canvas rendering | `e2e/game.spec.ts` R-08 (1 spec) | COVERED |
| R-09 | Window resize without layout or renderer breakage | `e2e/game.spec.ts` R-09 (2 specs) | COVERED |
| R-10 | Three laps, five AI opponents, rubber-banding | none | UNVERIFIED (manual) |
| R-11 | 11 characters with their stats and signature powers | none | UNVERIFIED (manual) |
| R-12 | 14 items with rank-weighted odds from golden ballot boxes | none | UNVERIFIED (manual) |
| R-13 | 3 circuits with ramps, tricks, pits, dash panels, chicanes, crossings | none | UNVERIFIED (manual) |
| R-14 | Synthesized WebAudio sound and music | none | UNVERIFIED (manual) |
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
