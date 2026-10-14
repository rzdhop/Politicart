# Checkpoint

Current state only. History lives in git.

## In progress

- **Current phase:** IMPLEMENT (phases 0-4 done: LOAD, EXPLORE, CLARIFY, PLAN,
  CHECKPOINT). Plan approved by the human: all 15 stages, see `.claude/PLAN.md`.
- **Current stage:** Stage 1 -- npm workspace skeleton + `packages/ui` scaffold
- **Next action:** create root `package.json` (npm workspaces), `.gitignore`,
  and `packages/ui/{package.json,tsconfig.json,vite.config.ts,src/index.ts}`;
  then `npm install`, confirm the lib build emits `dist/` and `tsc --noEmit`
  passes. Stage 1 touches no file outside `packages/` and the repo root config.
- **Open questions:** none open. A-004 resolved as DEC-008 (Pages via GitHub
  Actions). Reminder carried forward: the repository's Pages source must be
  switched to "GitHub Actions" by hand before stage 14's deploy will work.

## Checkpoint commit

- **Hash:** `f271930842fa711bc56a8ba7ef5b363877a0a19f`
- **Subject:** Add Kart Republique: single-file Three.js kart racer
- **Tree at checkpoint:** clean except untracked `.claude/` (this task's own
  artifacts, created at LOAD)
- **Unrelated changes left unstaged:** none

## Tier-1 baseline

**There is no automated check of any kind in this repo at the checkpoint.** No
`package.json`, no test runner, no type check, no linter. The Tier-1 baseline is
therefore empty by definition, not green-by-passing.

Consequence: every item in the regression contract below is UNVERIFIED at the
start of this task, and the game can only be checked by hand until the port
lands a test setup. Establishing Tier 1 (type check + unit tests for the
library) is itself part of the planned work.

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
