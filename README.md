# Kart République

*Grand Prix de l'Hémicycle* — a satirical 3D kart racer in the browser, starring a cast of fictional French politicians.

Keyboard only. Three laps, five AI opponents, no cohabitation.

## Play

The game is published from this repository to GitHub Pages: `https://rzdhop.github.io/Politicart/`.

To run it locally you need Node 26 and npm:

```sh
npm ci
npm run build -w @kart-republique/ui   # the design system the game is built from
npm run dev -w @kart-republique/game   # http://127.0.0.1:5173
```

`npm run build` builds everything; `npm run preview -w @kart-republique/game` serves the production build at `http://127.0.0.1:4173`.

## Team races (Multijoueur)

Two to six players race in two teams, Bleu and Rouge; AI candidates fill the grid to six. Every finishing place scores points for its team (10, 8, 6, 4, 2, 1) and the highest total wins. Items and powers never hit a teammate.

Team races need the game server, which serves the game and the race connection on one port. GitHub Pages is static, so the published page stays single-player and shows no Multijoueur button.

```sh
npm ci
npm run serve        # builds the design system and the game, then starts the server on port 8080
```

The server prints its addresses. Everyone on the same network opens `http://<that address>:8080/` and clicks **Multijoueur**. One player creates a room and reads out its four-letter code; the others join with it, pick a team and a candidate, and click ready. The host picks the circuit and starts.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on. |
| `HOST` | `0.0.0.0` | Interface to bind. `0.0.0.0` lets the local network in. |
| `KR_STATIC` | `apps/game/dist` | The built game to serve. |
| `KR_MAX_RACE_S` | `480` | A race ends after this many seconds even if nobody finishes. |

The server runs each race at 60 steps a second in its own worker thread and sends every player 20 snapshots a second. Each browser draws the race about 100 ms behind the server and sends its controls back 30 times a second. On a local network the delay is not noticeable. Over the internet, a player's own kart reacts with roughly half a round trip of extra lag.

### Hosting a team race online

The `Dockerfile` packages the server and the built game into one image, and `fly.toml` deploys it to [Fly.io](https://fly.io):

```sh
docker build -t kart-republique .
docker run --rm -p 8080:8080 kart-republique     # the same server, in a container

fly launch --no-deploy --copy-config             # choose your own app name and region
fly deploy
fly scale count 1                                # rooms live in memory: exactly one machine
```

Any host that runs a container and passes WebSockets through works the same way (Render, Railway, a VPS behind Caddy). Two cautions. Rooms are kept in memory, so run a single instance. A free tier that sleeps when idle drops every open race when it does.

## Controls

| Key | Action |
| --- | --- |
| ↑ / Z / W | Accelerate |
| ↓ / S | Brake, reverse |
| ← → / Q D / A D | Steer |
| Space | Drift (release for mini-turbo); in the air, do a trick |
| Ctrl / E | Use item |
| F / Shift | Special power |
| Esc | Pause (solo only: a team race cannot be paused) |
| M | Mute |

The game reads physical key codes, so the same keys work on AZERTY and QWERTY keyboards.

## Content

- **11 fictional candidates**, each with stats (speed, acceleration, handling, weight) and a signature satirical power: Grand débat, Grève générale, Rond-point surprise, Zone à faibles émissions, Amendement de dernière minute, Mégaphone, Éléments de langage, Vol d'audience, Mise en examen, Épandage, Temps de parole.
- **14 items** from golden ballot boxes, weighted by race position: 49.3 Turbo, Grève surprise, Dossier Mediapart, Motion de censure, Immunité parlementaire, Sondage truqué, Hélico présidentiel, Remaniement, Plan de relance, BRAV-M, Nuage lacrymogène, Casserolade, Dissolution, Niche fiscale.
- **3 circuits**: L'Élysée (Faubourg Saint-Honoré), Palais Bourbon (quais de Seine), Versailles (jardins du Congrès) — with ramps and tricks, pits, dash panels, chicanes and crossing traffic.
- **Workshop (admin)**: rename candidates, change colours, upload kart liveries and campaign posters. Settings are stored in the browser's `localStorage`.
- Graphics toggle (detailed with shadows / light low-poly), synthesized sound and music via WebAudio.

All characters, parties and scandals are fictional. Any resemblance to existing figures is purely electoral.

## Repository layout

An npm workspace with three packages.

| Path | What it is |
| --- | --- |
| `apps/game` | The game: a Vite app. Three.js 0.128 engine, React screens. |
| `apps/server` | The game server for team races: static files, rooms over WebSocket (`ws`), one worker thread per race running the game's own engine. |
| `packages/ui` | `@kart-republique/ui`, the design system: the game's look as React components, with Storybook. |
| `e2e` | The Playwright suite that drives the game through its screens and HUD. |
| `.github/workflows/pages.yml` | Builds, checks and publishes the game to GitHub Pages on every push to `main`. |

### The game (`apps/game`)

The engine never touches the DOM; the UI never touches the simulation. They meet at four seams.

| Path | What it holds |
| --- | --- |
| `src/engine/data.js` | The cast, the items and their rank-weighted odds, the circuits (spline points and `features`). |
| `src/engine/kart.js`, `track.js`, `primitives.js`, `textures.js` | Procedural karts, drivers, decor and tracks; cached materials; canvas-painted textures. |
| `src/engine/physics.js`, `ai.js`, `items.js`, `powers.js` | Kart physics (drift, jumps, pits, hazards), AI with rubber-banding, the 14 items, the 11 powers. |
| `src/engine/race.js` | Sets up a race, steps it one frame at a time and returns the **frame payload** the HUD shows. |
| `src/engine/machine.js` | The **state machine**: title, select, tracks, admin, countdown, race, paused, results, lobby. |
| `src/engine/teams.js` | Teams: who counts as a foe, the points table, team standings. |
| `src/engine/net.js`, `netstate.js`, `netrace.js` | Team races on the client: the server connection, the snapshot format, and drawing a race from snapshots. |
| `src/engine/events.js` | The **event queue** for the text the engine wants shown (toasts, hints). |
| `src/engine/input.js` | The **input seam**: the engine reads the controls through it. |
| `src/engine/minimap.js`, `preview.js`, `render.js`, `audio.js` | The minimap, the character showcase and thumbnails, the one renderer and camera, WebAudio. |
| `src/ui/` | The React screens and the HUD, composed from `@kart-republique/ui`; `store.ts` is what they read. |
| `src/game.js` | The per-frame HUD writer, the keyboard and the clock. |

### The design system (`packages/ui`)

Tokens, typography, panels and buttons, the roster and showcase, track cards, every HUD readout, the results table and the workshop form, extracted from the original single-file game and typed. The HUD readouts expose imperative handles so a game loop can write them at 60 fps without a React render.

```sh
npm run storybook -w @kart-republique/ui   # http://localhost:6006
```

## Checks

```sh
npm run typecheck   # TypeScript, both workspaces
npm run test        # Vitest: the design system, the engine and the server
npm run test:e2e    # Playwright, Chromium, against the production build (about three minutes)
```

The E2E suite is the regression net for the game: it drives the real build through the title, roster, circuits, a race with its HUD, pause, the workshop and the results, and asserts on the element ids the game has always had. `e2e/multiplayer.spec.ts` starts the game server too and races two browsers against each other.
