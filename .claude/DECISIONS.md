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
`dist/index.js` plus `dist/index.css`. Package name `@politikart/ui`.

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
`@politikart/ui`. The Three.js engine -- physics, scene building, AI, items,
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

**Context.** Stage 15 synced `@politikart/ui` to Claude Design. The
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
ships as `window.PolitikartUI.PreviewRoot` and the conventions header
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

**Decision.** The game build reads `VITE_POLITIKART_SERVER`, a remote server origin;
`net.serverUrl` and `net.probeServer` take it as an optional base and fall
back to the page's origin. The Pages workflow passes the `POLITIKART_SERVER_URL`
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
backends: a JSON file rewritten atomically (POLITIKART_DATA, default
`apps/server/data/politikart-accounts.json`, `:memory:` for tests) and Postgres
through `pg` 8.23.1 when `DATABASE_URL` is set (tables `politikart_users`,
`politikart_sessions`, `politikart_friends`, created on start). `accounts.js` serves
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

## DEC-020 -- A team race's clock waits for every driver to load, 10 s at most

**Context.** A client builds the whole circuit before its first frame. On the
larger circuits (DEC-016) that took 4-8 s in the end-to-end browsers, longer
than the 3.6 s countdown, which the server ran on regardless: a slow client
came back to a race already started and never saw the countdown or the green
light. Players on phones or weak laptops would be left on the line the same
way. This made `e2e/multiplayer.spec.ts` fail on main.

**Decision.** The race worker does not step (and so sends no snapshot) until
every human slot has sent its first controls. A client sends controls only
from its second frame of the race (netrace.js): the first frame's draw is
where the shaders compile, and it comes after the step that would send, so
the first input means the scene is built and drawn. A driver who leaves
stops counting. The wait is capped (`hold`, 10 s by default) so a client that never
loads cannot stall the room. Fast mode (tests) and an all-AI grid start at
once. Until the first snapshot, a client holds the grid in place, showing "3".

Rejected: a separate "loaded" message (the first input already says it, with
no protocol change); a longer countdown (still a guess about the slowest
device, and a longer wait for everyone).

**Consequence.** On a slow machine every driver sees the full countdown; the
start can be up to 10 s later for the others while they wait. The spec keeps
its default graphics.
## DEC-021 -- The cast admin, the Garage and the pun names reach main by porting, stage by stage

**Context.** That work was built on `feat/multiplayer` (10 commits, tip
`4ee4673`) while `main` moved on by 11 commits. Those include player
accounts (Bearer tokens, CORS `*`, a JSON or Postgres store, DEC-019), five
new candidates, phone controls and a Render deploy. A test merge gave 20
conflicting files. The branch's cookie-based admin could not work from the
Pages origin. Its file-only roster would also be wiped by Render's free
disk.

**Decision.** The human chose to rework the work onto main. A fresh branch,
`feat/cast-admin-garage`, is cut from `origin/main` (`2b14388`), and each
feature is ported in its own tested stage (PLAN.md). The admin becomes a
role on main's accounts: `rida` is a reserved name, seeded at boot from
`POLITIKART_ADMIN_PASSWORD_HASH`, and logs in through the normal Compte screen. The
cast roster is stored in main's store. The Workshop works wherever the admin
is logged in, Pages included.

**Consequence.** `feat/multiplayer` stays as the reference implementation and
is not merged. Its cookie admin (that branch's DEC-017), the separate login
screen and PasswordInput are dropped. The other decisions from that branch
are re-recorded under new ids as their stages land. Its action-log lines
were ported verbatim, so their DEC numbers refer to that branch.

## DEC-022 -- The E2E suite runs after every stage without asking

**Context.** The working agreement (Tier 2) says to ask the human before
each E2E run. On 2026-10-20, approving the integration plan, the human said:
"Run the E2E suite after every stage without asking me each time".

**Decision.** For this task, every stage runs the full Playwright suite once
Tier 1 is green, with no question asked. A failing E2E still blocks the
stage, exactly as before.

**Consequence.** Stages close faster, and the regression net is never
skipped. The instruction is durable for this task; a later task asks again
unless the human extends it.


## DEC-023 -- The cast parodies real politicians through pun names

**Context.** VISION described the cast as "fictional, never real named
figures". The human asked for every candidate to be renamed with a pun on a
real French politician (Marine Le Pen -> "Marine Le Stylo", Jean-Luc
Mélenchon -> "Jean-Luc Mélèche"), which overrides that. The first eleven
were approved on 2026-10-19 (on `feat/multiplayer`, recorded there as
DEC-015). Main's five newer candidates were approved on 2026-10-20.

**Decision.** All sixteen display names are pun names, matched to the
politician whose archetype each candidate already plays: Emmanuel Macaron,
Philippe Martini, Jean Lassalle-des-Fêtes, Sandrine Ruisseau, Gérard
L'Archiduc, Jean-Luc Mélèche, Marine Le Stylo, Jordan Mortadella, Eva
Joly-Jumper, José Bovin, Nathalie Artichaut, Bruno Le Maigre, Éric
Zemmoule, Gérald Darmalin, Michel Bananier and Manuel Valse. Three titles
change to fit them: lulu, bernadette and martine. Ids never change. The
title screen and README now say "parody" instead of "fictional": the names
are one pun from real people, while powers, lines and scandals stay
invented.

**Consequence.** The parody notice must stay on the title screen. Ids no
longer resemble names (`victor` is Emmanuel Macaron), which is what keeps
saved data, the e2e selectors, the server's `CHAR_IDS` and the unlock order
intact. The packages/ui story fixtures keep the old names (A-019).

## DEC-024 -- Pick-one settings are a library component, ChoiceGroup

**Context.** The Garage needs several "pick one of a few named values"
settings: wheels, spoiler, side pods and sticker. Drawing the picked option
as a primary Button broke the library's own rule (one primary per Row), and
because the Button variants differ in size, the row reflowed on every pick.
The human chose to add the pattern to the design system (2026-10-19, on
`feat/multiplayer`).

**Decision.** `ChoiceGroup` belongs to `packages/ui` (Controls): a labelled
`role=group` of `.chip` buttons with `aria-pressed`. The picked chip fills
gold, and every state keeps the same size. It ships with a story, unit tests
and CSS in `controls.css`. The Garage, and the Workshop's kart defaults in
stage 6, are built from it.

**Consequence.** The next `/design-sync` re-sync uploads it to Claude Design;
that is not run automatically. That branch's other library change, safe
centring on `.screen`, is not ported: main's `game.css` already solves the
same overflow with auto margins.

## DEC-025 -- Run every remaining stage, then push and merge, without stopping between stages

**Context.** On 2026-10-20, during stage 3, the human said: "go with all
stages, only stop when finished" and then "Push it and merge it".

**Decision.** Stages 3-9 run back to back with no go-ahead between them.
When they are done, `feat/cast-admin-garage` is pushed and merged into
`main`, and the push to main triggers the GitHub Pages and Render deploys.
The working agreement still holds inside each stage: Tier 1 and E2E must
be green; two fix attempts are allowed, then roll back and stop to report.

**Consequence.** No per-stage checkpoints with the human. The human is
asked again only for something they alone can do (Render secrets), or if a
stage cannot be made green.

## DEC-026 -- The admin is a reserved account on main's accounts, seeded from the environment

**Context.** The human wants one admin, "rida", who alone edits the cast.
Main has player accounts (Bearer tokens, CORS `*`, a JSON or Postgres
store, DEC-019) and no notion of roles. The human chose a reserved,
env-seeded account over "whoever registers rida first" (2026-10-20). This
supersedes `feat/multiplayer`'s cookie admin.

**Decision.** `apps/server/src/admin.js`:
- **Configuration.** `POLITIKART_ADMIN_USER` (default `rida`) and
  `POLITIKART_ADMIN_PASSWORD_HASH` in main's own format
  (`scrypt$<32 hex>$<128 hex>`), produced by
  `npm run -s admin-hash -w @politikart/server` from a password read on
  stdin.
- **Reserved name.** The name is reserved from sign-up, whether or not a hash
  is set. The check is accent-, case- and width-blind.
- **Seeding.** At boot `ensureAdmin` creates the account, or resets its hash
  with `setHash` (both backends), which also closes its sessions. The
  environment is always the truth.
- **Who is admin.** A user is admin only if admin is enabled, the name key
  matches and the stored hash equals the configured one. The profile carries
  `admin: true` only then, through one helper used by HTTP and WebSocket.
- **Guard.** `requireAdmin(req)` guards admin routes.
- **Login limit.** Failed logins are also limited per account (10 per 15 min,
  checked before scrypt), because main's per-IP limiter keys on the
  client-controlled `X-Forwarded-For`.

**Consequence.**
- The admin logs in through the normal Compte screen, from the server page or
  the Pages build.
- Anyone who knows the name can lock that account for 15 minutes with 10 bad
  tries. This is accepted; a long random password keeps guessing out of
  reach.
- Without the hash the Workshop is simply off.
- Known gaps, reported and not changed:
  - main's per-IP limiter still trusts `X-Forwarded-For`;
  - guests on the WebSocket may still call themselves "rida", but never get a
    profile or the flag;
  - lookalike names from other alphabets are not refused.

## DEC-027 -- The cast roster is a document in main's store, served to every client

**Context.** The admin's cast edits must reach every player: on the game
server's own page, and on the Pages build, which calls the server across
origins. They must also survive restarts where a store exists. Main's store
(DEC-019) is a JSON file or Postgres. On Render's free plan the disk is wiped
when the service sleeps, so durable storage there means Postgres.

**Decision.**
- **Storage.** The store gains `getDoc`/`putDoc` for an allowlist of keys
  (`roster`).
  - Postgres keeps them in a `politikart_docs` table (jsonb).
  - The file backend writes each doc to its own file, `politikart-docs/<key>.json`
    next to `POLITIKART_DATA`, atomically. It does not sit inside the accounts file,
    because that file is rewritten after every race's XP and the roster can
    weigh megabytes.
- **Reading.** `GET /api/roster` is public, uncached and CORS `*`.
- **Writing.** `PUT /api/admin/roster` checks, in order:
  - the admin's Bearer session (401 for everyone else, so the route says
    nothing about who is admin);
  - a JSON content type;
  - a 10 MB body;
  - strict validation, ported from `feat/multiplayer` and covering 16 ids
    (400 names the field).

  Saves then run one at a time, the server's `CHARACTERS` take the new names,
  and race workers receive the cast.

**Consequence.**
- Edits persist wherever accounts persist, and on Render that means a
  `DATABASE_URL`.
- The body limit is 10 MB, not the planned 8: the image caps alone add up to
  8 MB with 16 candidates.
- No cookie means no CSRF surface. Any page may read the roster, which is
  public anyway.

## DEC-028 -- Three powers are retuned to the politician parodied

**Context.** The human asked that each candidate's catch phrase and power
be checked against the traits the parodied politician is known for, and
that a power which does not match be replaced. Three did not: Sandrine
Ruisseau's *Zone à faibles émissions* is any ecologist's policy, where
Rousseau is known for "déconstruire"; Marine Le Stylo's *Éléments de
langage* fits any politician, where Le Pen is known for her cats; José
Bovin's *Épandage* is a FNSEA protest, where Bové is the GMO "faucheur
volontaire". Two texts were wrong too: Darmalin's description said "elle"
(martine was a woman before the rename) and the megaphone still named
"LULU", the pre-rename name.

**Decision.** `deconstruction` (dispel: boost, immunity, shield, loophole,
helicopter and item of every foe within 40 m, plus a 2 s slow), `chatons` (a
soft hazard: three kittens behind her; a kart that reaches them brakes to
35 % and swerves 1.2 s, no stun, the kittens stay), `fauchage` (every hazard
in the 60 m swath ahead is removed and the foes in it spin out; a boost when
there is nothing to mow). Titles and quotes for capucine and patrick follow
("L'écoféministe à vélo-cargo", "Le faucheur volontaire"); lulu's quote
becomes his real line "La République, c'est moi !". Titles the human fixed in
the plan (martine, aymeric and the rest) are untouched; so are the character
ids and the unlock order. The other thirteen powers were judged to match.

**Consequence.** The hazard vocabulary gains `chatons` (snapshots carry it by
type, as every hazard). A power with nobody to hit now boosts through one
helper, `consolation`. The README's content list names the new powers.

## DEC-029 -- A driver reads and hears only what landed on them

**Context.** DEC-018 routed the banners, yet the human still found too much
on the screen. What was left: a projectile's target was warned when it was
thrown, not when it hit; finished drivers kept receiving field-wide
effects; every power, item and even every AI's mini-turbo played its sound
race-wide (`sfx`, not `sfxFor`), in solo play and, through the worker's
race-wide channel, in team races; and several toasts in one frame replaced
each other before anyone could read them.

**Decision.** The rule is "what landed on you, and what you did". `tell`
skips finished karts and every power builds its hit list from the karts it
actually affected; projectile launches tell only the thrower (the target
reads the hit); every sound in physics, items and powers goes through
`sfxFor`, the user's own and, for a hit, the victim's (`heard`), so the
only race-wide sounds left are the countdown and the green light. The HUD
writer feeds toasts to a banner queue (`engine/banner.js`): one at a time,
held 1.1 s before the next waiting one takes over, 2.2 s when nothing
follows, at most two waiting, oldest dropped first; a new race clears it.

**Consequence.** A busy race is quieter without losing anything that
concerns the player. A banner can show up to 1.1 s late. The worker's
`m.fx` carries almost nothing now.

## DEC-030 -- The admin has a dashboard and may race as a god

**Context.** The human asked for an admin dashboard (statistics, bans,
rooms) and for the admin to join players' games "as a god in creative
mode".

**Decision.**
- **Store.** Users gain `seen` and `banned` (`{ at, reason }` or null);
  `listUsers`, `setBanned`, `touchSeen`, `dropSessionsOf`; a banned
  account has no valid session (`sessionUser` answers null) and its login
  answers 403 with the reason. A `stats` document holds the race counters
  (team races, finished, solo, by circuit, the last twenty).
- **API** (`dashboard.js`, admin Bearer only, 401 otherwise): stats, users
  (search), live (sockets and rooms), ban, unban, logout (sessions only),
  close a room, kick a connection. The admin cannot ban itself.
- **God seat.** `godJoin {code}` over the socket: the lobby seats the
  admin as a seventh player (`god: true`), on no team, any candidate, in
  any phase (mid-race it waits for the next start). The grid still has six
  karts around the god. In the engine a god kart pays a 1 s cooldown,
  always has an item on the way (0.6 s), is never stunned, slowed, capped,
  confused or caught by a hazard or projectile, is everyone's foe, scores
  no points, earns no experience and does not hold the results back.
- **Client.** A `dashboard` state (title <-> dashboard -> lobby), a
  Tableau de bord screen that refreshes every 5 s, the lobby and the
  results tag the god, the HUD's power key reads "F · MODE DIEU".

**Consequence.** Postgres gets two `alter table ... add column if not
exists` on boot. The grid can now hold seven karts; every consumer already
iterated the roster. A god who enters mid-race cannot spectate: that is a
follow-up (A-022).

## DEC-031 -- The admin has absolute power over every game

**Context.** After DEC-030 the human asked that the admin be able to join
any game at any moment and change things at will: "the admin has the
absolute power over any games". DEC-030 had made a god wait for the next
start (A-022) and gave no way to change a race.

**Decision.**
- **Join at any moment.** `godJoin` mid-race seats the admin in the race
  at once: the race handle's `addGod` pushes a god entry to the grid, tells
  the other players to build it (`kartJoin`), sends the admin the grid and
  its slot as at a start, and the worker adds the kart (`joinField`, a
  little behind the last kart racing) and seats its controls. The god
  takes a candidate the race does not already drive.
- **Change at will.** `engine/godcmd.js` holds the race commands: stun
  (through immunity), slow, boost, give, fire, cast (any power, any kart),
  hazard (no owner: it catches everyone), front, back, swap, lap, laps (the
  race's own lap count, `G.laps`, carried in snapshots as `lp`), god (make
  any kart a god or a mortal, carried as `gd`), finish. One target or
  'all' (everyone racing but the gods and the actor). The same function
  runs in solo play on the admin's engine and in the race worker.
- **Lobby commands** run on the server: forced start, circuit, team,
  candidate (whatever was unlocked), exclude. The admin's own `start` and
  `track` messages are forced too, host or not.
- **Two ways in**, one server function (`godCommand`): the socket's `god
  {code?, cmd}` (the console divine on the HUD, the admin's lobby buttons)
  and `POST /api/admin/rooms/command` (the dashboard's Contrôler panel).
  Both answer only the admin.

**Consequence.** A grid can grow mid-race; every client already guarded
snapshots shorter than its field. Excluding a player mid-race returns
their client to the lobby (`room: null` aborts the net race). "Finish"
is refused during the countdown, which has no path to the results. A god
who leaves turns into an ordinary AI kart. A-022 is resolved: the god joins
the running race. The worker's safety cap (POLITIKART_MAX_RACE_S, 12 min by
default) is for three laps and scales with the laps the admin sets.

## DEC-032 -- One catalogue module is the shared truth for grades, prices, odds and the Politibox roll

**Context.** The human asked for a currency (politicoins), a lootbox (the
Politibox: 120 coins; 2 % candidate, 4 % part or trail, 94 % coins split
5/10/50/100/500), grades (common, rare, mythic, incredible) on candidates,
kart part options and trails, with prices by grade and refunds for
duplicates. The client renders the shop and the server charges, so both need
the same tables, and the server must never trust a client price or roll.

**Decision.** `apps/game/src/engine/catalog.js`, pure and DOM-free like
`progress.js`, holds every grade, price, refund, odds table, the part
options per category with their grade, the trails, `rollBox(rng, owned)`,
`ownedStyle`, `drivableIds`, `canBuyChar/canBuyPart` and `collection`. The
game and the server both import it. The box roll takes its random source as
an argument, so tests fix the sequence.

**Consequence.** One edit retunes the economy on both sides. The server
charges `priceOf()` whatever the body says; the body carries no amount. The
option names and grades are an assumption (A-026) the human may retune.

## DEC-033 -- The economy lives on `politikart_users`: coins, owned, stats; one conditional update, no transactions

**Context.** Coins and an inventory must be spent and granted safely on a
public server, on both store backends (JSON file, Postgres). The store has
never used a transaction; documents (`getDoc/putDoc`) are read-modify-write
and keyed by a fixed allowlist, so a per-user document would not do.

**Decision.** Three columns on `politikart_users`: `coins integer not null default
0`, `owned jsonb` (`{chars, parts, trails}` of item ids; null means the
account predates the economy), `stats jsonb not null default '{}'`. A
purchase is one statement: `coins = coins - price` and `owned` appended,
`where coins >= price and not already owned`; a box open is `spendCoins`
(conditional) then the roll then `grant` or a refund. The file store does
the same checks synchronously. Per-user stats are read-modify-write, one
race at a time per account (A-034).

**Consequence.** Postgres gets three `alter table ... add column if not
exists` on boot, as DEC-030 did. A crash between a spend and its grant
loses at most one box price (A-030). Commons are never stored: owning a
common option is implicit.

## DEC-034 -- `profile.unlocked` means drivable; `profile.reachable` is the level gate

**Context.** The human chose "level gate AND price": a candidate is bought
with coins once its level is reached, and a Politibox win bypasses the
level. Every consumer of `unlocked` (roster locks, the lobby's `allowed`,
the Compte counter) wants "what can I drive".

**Decision.** `profileOf` returns `unlocked = STARTERS ∪ owned.chars` and
`reachable = unlockedIds(level)`. The shop buys only what is reachable;
the Politibox grants into `owned.chars` regardless. An account from before
the economy (`owned` null) is seeded once with the candidates its level had
unlocked (A-029).

**Consequence.** Levels alone no longer unlock a candidate; they unlock the
right to buy it. Existing players keep what they had.

## DEC-035 -- Ownership is enforced wherever an economy exists

**Context.** A player's kart style is a partial object sent from the
browser (`politikart-kart`); anyone can send `wheels: 'gold'`.

**Decision.** The server filters every style a player sends on
`lobby.join`, `joinGod` and `set` through `ownedStyle(cleanStyle(style),
owned)`: an unowned field is dropped, so it falls back to the admin's
character default, which is exempt by construction. The client's
`myStyle()` filters the same way when the account is known. Without a game
server (the Pages build) there is no economy and the Garage offers every
option as before; a guest on a server owns commons only. The admin owns the
whole catalogue (A-031).

**Consequence.** No unowned part reaches a room or a race, on any client. A
stale `politikart-kart` from the static build is harmless on a server.

## DEC-036 -- The trail is a kart style field

**Context.** Five trails (lootbox-only) must show behind a kart in races and
be visible to everyone in the lobby.

**Decision.** `trail` joins `kartstyle.js FIELDS`, so it rides the style
through `view()`, the race grid, `netrace.js` and `kartJoin` with no wire
change, and is validated and ownership-filtered like any other field.
`engine/trail.js` draws it from `updateKartVisual`, in every mode.

**Consequence.** No protocol change. The admin may set a trail as a
character default. The lobby shows the trail as a named badge (A-032).

## DEC-037 -- Two machine states, `shop` and `lootbox`; the Politibox scene owns the canvas in `lootbox`

**Context.** The shop needs a screen; the Politibox opening is a 3D sequence
on the shared canvas like the turntable (`preview.js`).

**Decision.** `title → shop`, `select → shop`, `shop → title | select |
lootbox`, `lootbox → shop`. `game.js` draws the turntable in `shop` and
calls `renderLootbox` in `lootbox`. The opening is a timed phase machine
(`drop, spin, shake, burst, reveal, hold`), skippable by a tap.

**Consequence.** The frame loop stays a one-line switch per state; the E2E
never waits on an animation.

## DEC-038 -- Banner lines come from one LINES table

**Context.** Every item, power and hazard had one hard-coded line.

**Decision.** `engine/lines.js` holds 4-6 variants per line, `line(path,
vars)` picks one at use time with the engine's `pick`, and `items.js`,
`powers.js` and the cortège in `race.js` read it. A victim's text is chosen
once per call so every victim reads the same sentence.

**Consequence.** Tests that pinned a literal now check membership.

## DEC-039 -- Stages run in worker agents dispatched by the session, in parallel worktrees, merged in a fixed order

**Context.** The human asked that every stage run in a separate agent, with
the session as the dispatcher, Tier 1 and E2E after every stage, no stop
between stages. Playwright binds fixed ports (4173/4180), so two suites
cannot run at once on one machine (a lesson logged on 2026-10-20).

**Decision.** Stages with disjoint files run in parallel in git worktrees;
each worker runs Tier 1 (and E2E only when it is alone); the dispatcher
merges the worktree branches in the listed order and reruns Tier 1 and the
full E2E on the integrated tip after each merge. Money and auth stages run
on Opus agents.

**Consequence.** Every stage's green run is meaningful; the integrated tip
is verified after every merge.
