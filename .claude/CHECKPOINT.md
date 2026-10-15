# Checkpoint

Current state only. History lives in git.

## In progress

- **Current phase:** IMPLEMENT (phases 0-4 done: LOAD, EXPLORE, CLARIFY, PLAN,
  CHECKPOINT). Plan approved by the human: all 15 stages, see `.claude/PLAN.md`.
- **Current stage:** ALL 15 STAGES DONE. Stage 15 synced `packages/ui` to
  the Claude Design project "Politicart Design System"
  (`b7586fe5-3495-4448-ab55-58afb71f3c81`, pinned in `.design-sync/config.json`):
  46 components, 45 matching their Storybook render on every story, HudLayer
  accepted as close; validate exit 0; anchor uploaded, so a re-sync skips
  unchanged components. DEC-013 records the provider choice.
- **Next action:** close-out items only the human can do: (1) switch the
  repository's Pages source to "GitHub Actions" and merge
  `feat/design-system` into `main` so the deploy runs (R-15); (2) the manual
  checks R-10..R-14 and the 60 fps check in a real race; (3) open the design
  project at https://claude.ai/design/p/b7586fe5-3495-4448-ab55-58afb71f3c81
  and spot-check a few cards. A re-sync is `/design-sync` after `npm ci`,
  staging the skill scripts into `.ds-sync/` and rebuilding the reference
  storybook (see NOTES.md, Re-sync risks).
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
- **README:** rewritten in stage 14 for the workspace layout; no longer
  stale.
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
