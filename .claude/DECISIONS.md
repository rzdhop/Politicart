# Decisions

Append-only. Context -> decision -> consequence. IDs never renumber.

## DEC-001 -- Extract a component library rather than sync the game as-is

**Context.** `/design-sync` was invoked on this repo. The repo held two files
(`README.md`, `index.html`) and no component package: no `package.json`, no
build, no exported components, no stories. The sync pipeline needs compiled
components to produce a bundle, prop contracts and preview cards; run against
this repo it would have produced an empty design system.

**Decision.** Build a real component library in this repo first, extracted from
the visual language already present in `index.html` (tokens, panels, buttons,
HUD readouts), then sync that package.

**Consequence.** The sync is deferred behind an implementation task. The repo
gains a `packages/ui` workspace and a build step it did not have.

## DEC-002 -- React + TypeScript + Vite for the library

**Context.** The converter needs an esbuild-bundlable package with a compiled
`dist/`. Claude Design renders React. Options weighed: React+TS, React+JS,
framework-free web components.

**Decision.** React 19 + TypeScript, Vite library build, emitting
`dist/index.js` plus `dist/index.css`. Package name `@kart-republique/ui`.

**Consequence.** TypeScript prop types become the `.d.ts` contracts the design
agent codes against -- the strongest fidelity signal available. Cost: the repo,
previously zero-dependency, acquires a toolchain. Web components were rejected
because Claude Design renders React, so the design agent would have had far less
to work with; plain JS was rejected because hand-written JSDoc yields weaker
generated contracts.

## DEC-003 -- Port the game UI layer to React

**Context.** The library could have been extracted *alongside* an untouched
`index.html` (zero risk, but the two drift apart), or the game UI could be
ported onto the library (single source of truth, much larger blast radius).
The risk of the larger path was raised explicitly with the human before
planning; they chose the port.

**Decision.** Port the DOM overlay layer (title, workshop, character select,
track select, HUD, pause, results) to React components consuming
`@kart-republique/ui`. The Three.js engine -- physics, scene building, AI, items,
audio -- is moved behind a seam, not rewritten.

**Consequence.** No drift: the game and the design system share one definition of
every button, panel and HUD readout. **Accepted loss:** `index.html` is no
longer playable by double-clicking it; the game acquires a build step, which the
current README advertises against ("No build step, no install: the whole game is
in that single file"). GitHub Pages therefore needs either a committed build
output or a CI workflow -- planned, not incidental. The 60fps HUD is the named
riskiest part of this port and is staged to keep imperative per-frame writes
rather than React state.

## DEC-004 -- Storybook in the package

**Context.** `design-sync` has two fidelity paths: with a Storybook it verifies
every generated preview against the repo own Storybook render (true screenshot
pairs); without one, previews are authored and graded on an absolute rubric.

**Decision.** Add Storybook with one story per component.

**Consequence.** Highest-fidelity preview verification, and the stories double as
the repo own component documentation. Cost: a large dev-dependency install and
a longer sync run.

## DEC-005 -- Full UI surface in scope (~30 components)

**Context.** Either the whole surface, or a ~12-component core menu kit skipping
the HUD and admin form.

**Decision.** Cover the whole surface: tokens, typography, Button, Panel,
Screen, Row, Tricolore, roster tiles, showcase, stat bars, power box, track
cards, all HUD readouts, results table, admin form fields, note banner.

**Consequence.** The HUD readouts -- the most distinctive part of the look -- are
included. The surface is small enough that cherry-picking would have saved
little.

## DEC-006 -- npm workspaces as the monorepo tool

**Context.** Only npm is installed on this machine (npm 11.13.0, Node v26.10.0);
pnpm, yarn and bun are all absent. The repo has no lockfile yet.

**Decision.** npm workspaces. A `package-lock.json` at the repo root becomes the
single lockfile, which also fixes the install command `design-sync` will detect
(`npm ci`).

**Consequence.** No new package manager to install. Node v26 is very new; if a
dev dependency rejects it, that is recorded as an assumption to revisit rather
than worked around silently.

## DEC-007 -- Pin three@0.128.0 rather than upgrade

**Context.** The game loads Three.js r128 from cdnjs as a global. Bundling the
engine means taking `three` as an npm dependency. Exploration found
`THREE.sRGBEncoding` at index.html L327, which was removed in three >= 0.152;
other r128-era APIs may be similarly affected.

**Decision.** Depend on `three@0.128.0` exactly, matching the CDN build.

**Consequence.** The port changes packaging only, not rendering behaviour. The
engine stays on a 2021 Three.js, which is a known debt. Upgrading is its own
task -- changelog review plus a full test pass -- and explicitly not a side
effect of this one.

## DEC-008 -- GitHub Pages deploys from a GitHub Actions workflow

**Context.** The React port requires a build step, so Pages can no longer serve
the repo root directly (DEC-003's accepted loss). Options: commit the build
output to `docs/`, or build in CI.

**Decision.** A GitHub Actions workflow builds on push to `main` and deploys to
Pages. Resolves assumption A-004.

**Consequence.** Build artifacts stay out of git and the published site can
never go stale from a forgotten local build. Requires the repository's Pages
source to be set to "GitHub Actions" once, by hand, in repo settings -- noted
here because the deploy will not work until that click happens.

## DEC-009 -- The game's element ids are a contract the port must keep

**Context.** Stage 7 builds the Playwright suite that is the regression net for
the whole port (stages 8-13). For that net to mean anything, it has to drive the
game the way a player does -- through the DOM and the keyboard -- rather than
through internal functions, which the port will move or delete. That makes it
depend on the game's element ids: `#s-title`, `#roster`, `#h-speed`,
`#adm-name-victor`, and the rest.

**Decision.** Treat the existing element ids as a public contract. The React
components written in stage 12 must render the same ids on the same elements.

**Consequence.** The suite keeps testing *the game* across the port instead of
testing the port's choice of markup, so a red test means a real regression. The
cost is that the React layer inherits id names it would not otherwise choose,
and ids must stay unique -- which is already why the library renamed `#hud` and
`#minimap` to classes (see `.design-sync/NOTES.md`): the components are reusable
and carry classes, while the game's instances of them carry the ids.

**One deliberate exception.** The results screen is unreachable without
white-box access: `G.resultsAt` starts at `Infinity` and the race ends only when
the player completes three laps, so reaching it by driving would take minutes of
reliable automated steering per run. That one spec calls the game's own
`showResults()` and is expected to break at stage 11 or 12, where it should be
re-pointed rather than treated as a regression. It is labelled as such in
`e2e/game.spec.ts`.
