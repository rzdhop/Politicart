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

## DEC-010 -- The engine's event queue carries player-facing text only; sound stays a direct call

**Context.** Stage 10 moves physics, items, powers and AI out of `game.js`.
The plan said their inline `toast()` and `sfx()` calls would be replaced by
an event queue the engine emits. Roughly 45 call sites were involved: toasts
and hints that wrote straight into the HUD from inside the physics step, and
sound effects that call the WebAudio module.

**Decision.** `engine/events.js` is a FIFO of `{type, text}` events for
`toast` and `hint` only. The engine modules import `toast` and `setHint` from
it, so the moved bodies keep their original call shapes unchanged, and
`frame()` drains the queue once per frame straight after the physics step,
at the point where the text used to be written. `sfx()` keeps being called
directly from the engine. Player input reaches the engine through a second
small seam, `engine/input.js`, where the owner of the controls registers a
source once and physics reads through it.

**Consequence.** The engine makes zero HUD writes from inside the step, which
is the property stage 11 needs, and the drain point keeps the on-screen order
of toasts within a frame identical to before. Sound is not deferred because
`engine/audio.js` is already engine-side and DOM-free, and a one-frame delay
between a bump and its sound would be audible for no gain. Item and power use
triggered from the keyboard now shows its toast on the next frame rather than
synchronously, at most 16 ms later. The queue is unit-tested in isolation
(`events.test.js`, `input.test.js`), which gave `apps/game` its first vitest
setup.

## DEC-011 -- One state machine owns the game's flow; `G.state` is a read-only view of it

**Context.** The original game kept two parallel records of where it was:
`G.state`, a string assigned by hand at every transition, and the `hidden`
attribute on six screen sections toggled by `showScreen()`. Each transition
wrote both, in whichever order the call site chose, and nothing checked that
they agreed. The exploration map named this a desync bug class the port would
inherit unless the two collapsed into one source of truth.

**Decision.** `engine/machine.js` holds the current state and a transition
table of the game's real paths (title, select, tracks, admin, countdown, race,
paused, results). `transition()` throws on a move not in the table and
notifies listeners after an accepted one. The UI shows screens, the HUD and
the note banner from a single listener; nothing else toggles a section.
`G.state` stays readable for the engine code that branches on it, as a getter
over the machine, and assigning to it throws. The engine's own moves
(`startRace` into countdown, the countdown into race, `endRace` into results)
go through the same call. The engine returns one payload per frame
(`engine/payload.js`, pure and unit-tested) and the UI renders it;
`stepRace()` performs no DOM writes at all.

**Consequence.** A wrong screen is now impossible without a thrown error at
the call site, which the E2E net catches. The cost is strictness: a path the
table does not list (a double click on "start" while already counting down,
say) throws instead of silently restarting as the single file did. That is
the intended trade. The results-screen E2E spec, which DEC-009 said would
break here, now calls the engine's `endRace()` through `window.__kr`, the one
hook the game installs for the suite.

## DEC-012 -- Library components expose inner parts through explicit part props, never through ids they invent

**Context.** DEC-009 makes the game's element ids a contract: the E2E suite
drives `#r-body`, `#h-speed`, `#h-drift`, `#h-pname` and `#h-pkey`, and
several of those sit on an *inner* element of what is now one library
component -- the `<tbody>` of `ResultsTable`, the number `<span>` of
`SpeedReadout`, the fill `<i>` of `DriftGauge`, the name and key-hint lines
of `PowerGauge`. A component's own props spread onto its root, so a consumer
had no way to put an id on the part the contract names.

**Decision.** Where the contract needs an inner part addressed, the component
takes an explicit, optional props bag for that part (`bodyProps` on
`ResultsTable` in stage 12; `valueProps`, `fillProps`, `nameProps` and
`keyHintProps` on the HUD readouts in stage 13), spread onto that element.
The library never bakes in a game id, and the game never reaches into a
component's DOM to patch one in.

**Consequence.** The design system stays reusable (no ids, no game knowledge)
and the E2E suite keeps driving the game through the ids it always has, so
DEC-009 holds without a single spec selector changing. The cost is a few
extra optional props on five components, each documented as what it is for.

## DEC-013 -- The design-sync ships a `PreviewRoot` provider rather than relying on the page background

**Context.** Stage 15 synced `@kart-republique/ui` to Claude Design. The
system is dark-only: its stylesheet paints `body` and every component assumes
that canvas. The sync tool's preview cards paint their page white, and the
Storybook decorator that paints the canvas would not bundle (the preview
imports the source stylesheet, whose font files esbuild has no loader for).
Options: fork the converter's decorator bundling to add a loader, or supply
the context through the tool's provider knob.

**Decision.** A repo-owned component, `.design-sync/preview-root.jsx`, is
added to the bundle through `cfg.extraEntries` and set as `cfg.provider`. It
wraps each story in the system's background, foreground and body font, with
horizontal padding only so full-height stories fit the capture viewport. It
ships as `window.KartRepubliqueUI.PreviewRoot` and the conventions header
tells the design agent when to use it (fragments on a page that does not
carry the system's `body` rule).

**Consequence.** Config-only, no converter fork; the fix persists across
re-syncs. The bundle carries one extra export that is not part of the
package's own API, documented as such. The target project is "Politicart
Design System" (`b7586fe5-3495-4448-ab55-58afb71f3c81`), pinned in
`.design-sync/config.json`; re-syncs run from `/design-sync` and skip
unchanged components through the uploaded anchor.

## DEC-014 -- Team multiplayer runs on an authoritative Node server that reuses the engine headless

**Context.** The human asked for players to race together in teams: a local
server first, deployable to a container host later, serving the game itself.
The engine keeps truth in plain objects but was written for one player: a
global input, `G.player` checks for every message and sound, variable dt and
unseeded randomness. Options: lockstep, host-in-browser, a framework such as
Colyseus 0.18.9, or an authoritative server on `ws`.

**Decision.** The server imports the existing engine modules and steps them
at a fixed 60 Hz inside one `worker_thread` per race (`G` and the machine are
module singletons). Browser-only calls get a headless guard. Player checks
become routing by kart (`say`, `tell`, `sfxFor`), resolved locally in solo
and per socket on the server. Clients send controls and render snapshots
interpolated ~100 ms behind. Transport is `ws@8.22.0` with JSON. Teams are a
`k.team` field and an `isFoe` filter; points 10/8/6/4/2/1.

**Consequence.** One rule set for solo and multiplayer, no reimplementation.
Solo keeps its variable dt and feel. Every new engine call must stay
DOM-free or guarded, or the server stops booting. The local kart lags by
about half a round trip plus 100 ms until prediction is added.

## DEC-015 -- The Pages build can name a remote game server; Render hosts it for free

**Context.** The human wanted team races playable from the web for free. Pages
is static and DEC-014's client only looked for the server at the page's own
origin, so the published page was single-player. A temporary tunnel
(Cloudflare quick tunnel) from a cloud session was tried: the session's
network allows only an HTTPS proxy and the session itself is reclaimed when
idle, so the link could not open and would not have lasted. Fly.io, already
configured, needs a payment card.

**Decision.** The game build reads `VITE_KR_SERVER`, a remote server origin;
`net.serverUrl` and `net.probeServer` take it as an optional base and fall
back to the page's origin. The Pages workflow passes the `KR_SERVER_URL`
repository variable. The server's `/api/kr` probe sends
`access-control-allow-origin: *` so the cross-origin probe can be read; the
WebSocket needs no CORS. `render.yaml` deploys the existing `Dockerfile` on
Render's free plan, one instance.

**Consequence.** One click on Render and one repository variable make the
published page multiplayer, with no code change; unset, nothing changes. The
free instance sleeps after 15 idle minutes: a cold probe takes about a minute
and a sleeping server drops a running race. The server accepts sockets from
any origin, as it already did.

## DEC-016 -- Kart contact is one impulse per contact; circuits scale with their sample count

**Context.** The human found kart-on-kart contact flat and too costly, spun
karts often drove off backwards, and asked for bigger circuits, more items
and five new candidates. Contact multiplied both speeds by 0.97 on every
frame of overlap (a ten-frame rub cost about 26 %) and replayed the bump
sound each frame; a stun spun the kart at 11 rad/s and left it at whatever
angle it stopped. Scaling the spline points alone would have stretched the
600 samples apart and changed every distance counted in samples (feature
lengths, the AI look-ahead, power offsets, lap detection), and moved the
road under the hand-placed decor.

**Decision.** Overlap is still pushed apart every frame, but the bump --
shove, speed loss, sound, hop, sparks, camera shake -- happens once per
contact (a 0.3 s `bumpCd`). The shove goes into a decaying knock-back
velocity (`kx`, `kz`) split by weight; speed loss runs from 2 % (side by
side) to 10 % (head-on). The last 0.4 s of a stun blends the heading to the
road's tangent, and `endStun` does the same when an item cuts a stun short.
Circuits carry a `scale` (1.5) applied to their points, `CFG.samples` grows
to 900 to keep the sample spacing, and the themed decor is laid out at scale
1 in a group: pieces 14 m and wider stretch with the circuit, smaller ones
only move. Bump and shield state travel in snapshots (`bu`, `bp`, `bs`,
`sh`) so team races draw them too.

**Consequence.** Races are about 1.5 times longer. Five items (Langue de
bois, Cumul des mandats, Fact-checking, Pantouflage, Référendum) and five
candidates (Gaspard Tableur, Jean-Mi Vérité, Martine Fichet, Aymeric de
Bruxelles, Thierry Volte-Face) join; `applyPower` lets Ralliement play
another candidate's power. Big decor is stretched horizontally, not taller.

## DEC-017 -- Touch play goes through the input seam; touch mode follows the player

**Context.** The human asked for the game to be playable on phones as well
as computers. The page had no viewport meta (a phone drew it as a zoomed-out
desktop page), the controls were keyboard only, pause was Escape, and the
note told phone users to come back on a computer. The human chose ◀ ▶
buttons over a joystick or tilt, automatic acceleration, and racing in both
orientations.

**Decision.** `src/touch.ts` keeps what the on-screen buttons hold and a
"touch mode" flag: on at load for a coarse pointer, on at the first touch,
off at a driving key. game.js's one input source merges the keyboard with
it, and in touch mode throttles unless the brake is held. The buttons
(`ui/TouchControls.tsx`) ride on the HUD layer and use pointer capture, so
multi-touch works and a thumb can roll across the steering pad; item and
power taps go through the same store actions as the keys (`useItem`,
`usePower`), which already route to the server in a team race. Their item
icon and power charge are written imperatively from the HUD writer. The
camera widens and pulls back as the aspect drops below 1. On small screens
the select screen hands the preview a frame (`setPreviewFrame`) and the kart
is drawn into that rectangle only. Layout fixes live in game.css; the one
library change is the controls grid filling its panel.

**Consequence.** One input path for keyboard, touch and both together; the
engine is unchanged except the portrait camera and the preview frame.
Phones start on low-poly graphics at a 1.5 pixel ratio. Full screen is
offered where `document.fullscreenEnabled` (not on iPhone). Screens centre
with auto margins, so a screen taller than the display scrolls from its
top.


## DEC-018 -- Race messages reach only the drivers they concern

**Context.** The human found the banners noisy in a race: every item and
power another kart used was announced to everyone ("LA BRAV-M INTERVIENT !"
when the BRAV-M was nowhere near). `tell(k, mine, others)` sent `others` to
every driver but k.

**Decision.** `tell(k, mine, others, to)` sends `others` only to the karts in
`to`, the ones the move actually hit (stunned, slowed, swapped, robbed,
boosted). Without `to`, only k is told. Moves that affect nobody else
(Pantouflage, Épandage, Grève générale, Rond-point, Fake news, Temps de
parole) now use `say`. The victims' texts were rewritten in the second
person.

**Consequence.** A driver sees what they did and what was done to them,
nothing else. BRAV-M also always sends two bikes, one on each side, both at
the single kart ahead when there is only one.

## DEC-019 -- Accounts live on the game server, in a JSON file or Postgres

**Context.** The human asked for accounts, levels that unlock candidates,
friends and invitations into team races, and chose (2026-10-19): storage in
a file by default and Postgres when configured; four starting candidates
and one more per level; request-and-accept friendships; guests limited to
the four starters, no level, a pseudo of their choice, and joining rooms
but never creating them. Render's free disk does not survive a restart.

**Decision.** `apps/server/src/store.js` is one async interface with two
backends: a JSON file rewritten atomically (KR_DATA, default
`apps/server/data/kr-accounts.json`, `:memory:` for tests) and Postgres
through `pg` 8.23.1 when `DATABASE_URL` is set (tables `kr_users`,
`kr_sessions`, `kr_friends`, created on start). `accounts.js` serves
`/api/register|login|logout|me|progress` open to every origin with bearer
tokens (no cookies), scrypt hashes, and a per-address limit on sign-ups
and failed logins. The WebSocket `hello` carries the token: an
authenticated connection is that account for presence, friends, invites,
room creation and team-race experience. Levels, unlocks and experience are
pure rules in `apps/game/src/engine/progress.js`, shared by both sides; the
lobby enforces each player's unlocked candidates. Solo races are reported
by the client (at most one reward a minute), team races are scored by the
server.

Rejected: OAuth providers (a dependency and a registered app for a
showcase game), cookies (would need credentialed CORS from GitHub Pages),
SQLite (a native module in the container, and no help on Render).

**Consequence.** Accounts need a game server; the Pages build without one
plays as a guest. A logged-in player keeps a socket open from the title
screen so friends see them online and invitations arrive in any menu.
Experience from a solo race is trusted, in line with "not serious for now".
