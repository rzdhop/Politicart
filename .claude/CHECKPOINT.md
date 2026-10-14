# Checkpoint

Current state only. History lives in git.

## In progress

- **Current phase:** IMPLEMENT (phases 0-4 done: LOAD, EXPLORE, CLARIFY, PLAN,
  CHECKPOINT). Plan approved by the human: all 15 stages, see `.claude/PLAN.md`.
- **Current stage:** Stage 3 DONE and committed (13 components). Stage 4 next
  -- the select and tracks groups (8 components).
- **Next action:** write `packages/ui/src/components/{select,tracks}/` --
  SelectLayout, Roster, CharacterTile, Showcase, StatBar, PowerBox, CardGrid,
  TrackCard -- same pattern as stage 3: typed props named `<Name>Props`, class
  vocabulary from `src/styles/` with no new CSS, a vitest suite per group, and
  entries added to both `src/index.ts` and the per-component list in
  `src/dist-contract.test.ts`.
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
    npm run test           # vitest, 6 files / 156 tests passing
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
