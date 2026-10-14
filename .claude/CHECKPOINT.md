# Checkpoint

Current state only. History lives in git.

## In progress

- **Current phase:** IMPLEMENT (phases 0-4 done: LOAD, EXPLORE, CLARIFY, PLAN,
  CHECKPOINT). Plan approved by the human: all 15 stages, see `.claude/PLAN.md`.
- **Current stage:** Stage 4 DONE and committed (22 components total). Stage 5
  next -- hud, results, workshop and misc (the remaining groups).
- **Next action:** write `packages/ui/src/components/{hud,results,workshop,
  misc}/` -- HudLayer, HudCorner, PositionReadout, LapCounter, RaceTimer,
  MinimapFrame, ItemSlot, PowerGauge, HudHint, SpeedReadout, DriftGauge,
  CenterAnnounce, Toast, WrongWay, ResultsTable, AdminGrid, Field, TextInput,
  ColorSwatch, LiveryThumb, NoteBanner. Same pattern as stages 3-4. **The HUD
  group is the one with a design constraint**: per the exploration map, rank,
  lap, clock, speed, drift and the power bar are written every frame during a
  race, so these components must expose an imperative handle (a ref to the text
  node or an `updateX()` method) rather than expecting React state. Stage 13
  depends on that shape.
- **Open questions:** none open. A-004 resolved as DEC-008 (Pages via GitHub
  Actions). Reminder carried forward: the repository's Pages source must be
  switched to "GitHub Actions" by hand before stage 14's deploy will work.

## Checkpoint commit

- **Hash:** `01a9dd0f7efef5ab3f3ad184b6b43acff6a12470`
- **Subject:** Extract the game's tokens and stylesheet into @kart-republique/ui
- **Branch:** `feat/design-system` (branched from `main` at `f271930`). `main`
  keeps serving the playable single-file game on Pages until the port merges.
- **Tree at checkpoint:** clean
- **Unrelated changes left unstaged:** none
- **Last known-good game state:** `f271930` -- index.html is byte-identical to
  it on this branch and stays so until stage 8.

## Tier-1 baseline

At the task's start there was no automated check of any kind in this repo: no
`package.json`, no test runner, no type check, no linter. The Tier-1 baseline
was therefore empty by definition, not green-by-passing, and every item in the
regression contract below began UNVERIFIED.

**Tier 1 as of stage 1 (green):**

    npm install            # clean, 95 packages, 0 vulnerabilities
    npm run build          # vite lib build + tsc declarations -> dist/
    npm run typecheck      # tsc --noEmit, clean
    npm run test           # vitest, 8 files / 179 tests passing
    npm audit              # 0 vulnerabilities (with and without dev deps)

All four run from the repo root across workspaces. The game's regression
contract stays UNVERIFIED until stage 7 lands the Playwright suite -- that is
the stage that gives Part C its net.

## Regression contract

The game at `index.html` must keep working. No item here may break.

| # | Functionality | Covering test | Status |
|---|---|---|---|
| R-01 | Title -> character select -> track select -> race -> results flow | none | UNVERIFIED (manual) |
| R-02 | Live HUD: position, lap, timer, speed, drift gauge, item slot, power gauge, toasts, wrong-way, countdown | none | UNVERIFIED (manual) |
| R-03 | Pause / resume / quit to menu | none | UNVERIFIED (manual) |
| R-04 | Mute toggle (button and `M` key) | none | UNVERIFIED (manual) |
| R-05 | Graphics toggle: detailed with shadows vs light low-poly | none | UNVERIFIED (manual) |
| R-06 | Workshop: rename, colours, kart livery, campaign posters; localStorage persistence; reset | none | UNVERIFIED (manual) |
| R-07 | Keyboard controls as documented in the README controls table | none | UNVERIFIED (manual) |
| R-08 | Minimap canvas rendering | none | UNVERIFIED (manual) |
| R-09 | Window resize without layout or renderer breakage | none | UNVERIFIED (manual) |
| R-10 | Three laps, five AI opponents, rubber-banding | none | UNVERIFIED (manual) |
| R-11 | 11 characters with their stats and signature powers | none | UNVERIFIED (manual) |
| R-12 | 14 items with rank-weighted odds from golden ballot boxes | none | UNVERIFIED (manual) |
| R-13 | 3 circuits with ramps, tricks, pits, dash panels, chicanes, crossings | none | UNVERIFIED (manual) |
| R-14 | Synthesized WebAudio sound and music | none | UNVERIFIED (manual) |
| R-15 | Playable from GitHub Pages at the documented URL | none | UNVERIFIED (manual) |

Items R-01..R-15 that the planned work can cover with real tests will be given
them (Tier 3); the rest stay manual checks and are named as such at close-out.
