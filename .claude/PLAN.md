# Plan -- online team multiplayer ("Course en équipe")

Approved by the human on 2026-10-15 ("go !"). The previous plan (the design
system, stages 1-15) is complete and lives in git history at `e819070`.

## Goal

Several humans race each other in teams. One Node server, run locally first
(LAN), packaged so it can be deployed to Fly.io / Render / Railway later.
The server serves the built game and the WebSocket on one origin. GitHub
Pages keeps serving the single-player game, unchanged.

Fixed by the human:

- 2-6 humans, AI fills the grid to six karts.
- Team score = sum of placement points. Items and powers never hit teammates.
- Multiplayer UI appears only when the page is served by the game server.
- The game is "not serious for now": trusted players, no anti-cheat.

## Architecture (DEC-014)

- **Authoritative server, headless engine.** The server runs the existing
  engine modules in Node, unchanged in logic, at a fixed 60 Hz step. Three.js
  builds its scene graph in memory without WebGL; the only browser-only
  pieces (the renderer, `canvasTexture`, `imgTex`, the minimap base) get a
  headless guard. Each race runs in its own `worker_thread`, because `G` and
  the state machine are module singletons.
- **Thin client.** Clients send controls (30 Hz) and item/power presses; the
  server sends snapshots (20 Hz) and per-player events. Clients build the
  same scene from the roster and track, then render every kart interpolated
  ~100 ms in the past (Gambetta, entity interpolation). Local-kart prediction
  is a follow-up, not in this plan.
- **Routing instead of "is this the player".** About thirty `k === G.player`
  / `!k.isAI` checks become `say(k, text)` / `tell(k, mine, others)` and
  `sfxFor(k, name)`. In solo play they resolve exactly as before; on the
  server they address one socket.
- **Teams.** `k.team` (null in solo). `isFoe(a, b)` replaces `o !== k` in the
  item, power, hazard and bump loops. Points 10/8/6/4/2/1.
- **Transport.** `ws@8.22.0` (latest; already in the lockfile) over Node's
  `http`. JSON messages. Rooms with four-letter codes.

Rejected: **Colyseus 0.18.9** -- a framework with schema-typed state and
eight sub-packages, built around its own room state; the engine already owns
its state and only needs a pipe. **Lockstep** -- variable dt, eight unseeded
`Math.random` paths and per-frame constants would all need to become
deterministic across browsers. **Host-in-browser** -- cannot be deployed to a
container host, which the human wants later.

Checked against DECISIONS.md: DEC-009 (ids are a contract) -- new screens add
new ids only. DEC-010 (sound stays a direct call) -- kept for solo; the
server installs a sink. DEC-011 (one state machine) -- new `lobby` state goes
through the table. DEC-012 (library parts via props) -- no new library
components; the lobby composes existing ones. DEC-007 (three pinned) -- the
server pins the same 0.128.0. No conflicts.

## Stages

Every stage: Tier 1 (typecheck, unit tests) + the 27 e2e specs, then commit.

1. **Headless-safe engine.** Lazy renderer in `render.js`; `canvasTexture`,
   `imgTex`, `buildMinimapBase` guard `typeof document`. Split `stepRace`
   into `simStep(dt)` (pure simulation) and the view half (camera, wrong-way,
   payload, minimap). Test: a vitest in Node builds every track and runs 30 s
   of an all-AI race. Risk: low. Rollback: revert the commit.
2. **Per-kart routing.** `events.js` gains `say` / `tell` with a recipient;
   `audio.js` gains `sfxFor` and a sink; every player check in `items.js`,
   `powers.js`, `physics.js`, `race.js` moves to them. Per-kart controls
   (`k.ctrl`), `G.humans`, rubber-band against the best human, results timer
   once every human has finished. **Riskiest stage**: it touches every rule
   solo play depends on (R-01..R-07, R-10..R-12). Verified by unit tests of
   the routing and the full e2e suite.
3. **Teams and points.** `k.team`, `isFoe`, friendly-fire guards, points
   table, `teamStandings()`. Solo has no teams, so solo is untouched. Tests.
4. **Net state codec.** `engine/netstate.js`: pure encode/decode of kart,
   hazard, projectile, box and crossing state; mesh factories split out of
   `spawnHazard` / `spawnProjectile`; the kart visuals block extracted from
   `updateKart` into `updateKartVisual`. Tests round-trip a race.
5. **Server: lobby.** New workspace `apps/server`: static files from
   `apps/game/dist`, `/api/kr`, WebSocket rooms, join / team / character /
   ready / track / start. Tests with real sockets on port 0.
6. **Server: race worker.** One worker per race: fixed 60 Hz, inputs,
   snapshots, events, finish, results with team points, back to the lobby.
   Tests drive a whole race with bots.
7. **Client: lobby.** `engine/net.js` (transport injected), machine state
   `lobby`, store actions, `LobbyScreen`, a "Multijoueur" button shown only
   when `/api/kr` answers. Tests.
8. **Client: networked race.** Scene from the roster, snapshot buffer and
   interpolation, local controls sent, HUD and minimap from the local kart,
   events, team results. Tests.
9. **End-to-end and docs.** Playwright starts the game server too; one spec
   runs two players in two browser contexts. README section.
10. **Container.** Multi-stage `Dockerfile`, `fly.toml`, deploy notes. No
    deployment in this plan.

## Regression contract at risk

R-01..R-09 are run after every stage. Stage 2 is the one that can change
solo behaviour; R-10..R-12 (laps, AI, items) are re-checked by hand after it.
