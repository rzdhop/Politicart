# Kart République

*Grand Prix de l'Hémicycle* — a satirical 3D kart racer in the browser, starring a cast of French politicians under pun names.

Keyboard on a computer, touch on a phone or tablet, held either way. Three laps, five AI opponents, no cohabitation.

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

Team races need the game server, which serves the game and the race connection on one port. GitHub Pages is static, so the published page shows the Multijoueur button only once it is pointed at a server hosted elsewhere (see [Playing online](#playing-online-render--github-pages)).

```sh
npm ci
npm run serve        # builds the design system and the game, then starts the server on port 8080
```

The server prints its addresses. Everyone on the same network opens `http://<that address>:8080/` and clicks **Multijoueur**. A player with an account creates a room and reads out its four-letter code, or invites friends straight into it; the others join with the code (or the invitation), pick a team and a candidate, and click ready. The host picks the circuit and starts.

## Accounts, levels and friends

When a game server answers, the title screen shows **Compte**. An account is a pseudo (3 to 16 letters, digits, `-`, `_`, `.`) and a password; the server stores only a salted scrypt hash.

- **Levels.** Every race earns experience: 70 for a win down to 20 for last place, 10 for an unfinished race, plus 20 when your team wins a team race. Level 2 takes 120 XP, and each level costs 40 more than the one before.
- **Candidates.** Emmanuel Macaron, Philippe Martini, Jean Lassalle-des-Fêtes and Sandrine Ruisseau are free. Each level from 2 to 13 unlocks one more: Nathalie Artichaut, José Bovin, Marine Le Stylo, Jordan Mortadella, Eva Joly-Jumper, Jean-Luc Mélèche, Gérard L’Archiduc, Bruno Le Maigre, Éric Zemmoule, Gérald Darmalin, Michel Bananier, then Manuel Valse. Locked candidates show on the roster with the level that unlocks them.
- **Friends.** Add someone by pseudo; they accept or refuse. The list shows who is online and in which room. From your room in the lobby, **Inviter** sends an online friend an invitation that appears over their menus; **Rejoindre** takes them straight into your room.
- **Guests** (no account, or no server reachable, as on a plain GitHub Pages build) choose a pseudo and play the four starting candidates, without levels. In team races they can join a room by code or by invitation but cannot create one.

Solo races are scored by the browser and reported to the server (at most one reward a minute); team races are scored by the server. The game is not built to resist cheating.

Accounts are kept in a JSON file by default, or in Postgres when `DATABASE_URL` is set:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | unset | A Postgres connection string. The server creates its tables (`kr_users`, `kr_sessions`, `kr_friends`, and `kr_docs` for the admin's cast) on start. Hosted databases give a URL ending in `?sslmode=require`. |
| `KR_DATA` | `apps/server/data/kr-accounts.json` (`/data/kr-accounts.json` in the container) | The JSON file used without `DATABASE_URL`. `:memory:` keeps accounts in memory only. The admin's cast is kept beside it, in `kr-docs/roster.json`. |
| `KR_ADMIN_USER` | `rida` | The one admin account. Nobody can sign up under this name. |
| `KR_ADMIN_PASSWORD_HASH` | unset | The admin's password hash (see below). Unset or malformed: nobody is admin and the Workshop is off. |

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on. |
| `HOST` | `0.0.0.0` | Interface to bind. `0.0.0.0` lets the local network in. |
| `KR_STATIC` | `apps/game/dist` | The built game to serve. |
| `KR_MAX_RACE_S` | `720` | A race ends after this many seconds even if nobody finishes. |
| `DATABASE_URL`, `KR_DATA` | | Where accounts are kept; see [Accounts](#accounts-levels-and-friends). |

The game build reads one variable: `VITE_KR_SERVER`, the origin of a game server on another host (e.g. `https://kr.onrender.com`). Unset, the game looks for the server at its own origin.

The server runs each race at 60 steps a second in its own worker thread and sends every player 20 snapshots a second. Each browser draws the race about 100 ms behind the server and sends its controls back 30 times a second. On a local network the delay is not noticeable. Over the internet, a player's own kart reacts with roughly half a round trip of extra lag.

### The admin and the Workshop

One account, `rida` by default, is the admin: only it sees **Atelier** on the title screen. There it renames the candidates, sets their colours, liveries and default kart (accents, wheels, spoiler, side pods, number, sticker), and uploads campaign posters. **Enregistrer** saves the cast on the game server, and every player gets it, on the server's page and on the GitHub page alike. Players still style their own kart in the **Garage**; whatever they leave alone follows the admin's default.

The admin's password is never stored, only its hash, held in an environment variable. To set it up:

```sh
npm run -s admin-hash -w @kart-republique/server     # asks for the password twice (12 characters or more), prints the hash
```

Put the printed hash in `.env` at the repo root as `KR_ADMIN_PASSWORD_HASH='scrypt$...'` (single quotes: the hash contains `$`), or in your host's environment settings, and restart the server. At start the server creates the admin account, or resets its password to that hash, and logs whether administration is on. The admin then logs in through **Compte** like any player. Failed logins are limited per address and per account (10 every 15 minutes).

### Playing online (Render + GitHub Pages)

The free way to play team races over the internet, with no machine of your own left running:

1. **Host the server on Render.** On [render.com](https://render.com), choose **New > Blueprint**, pick this repository and apply. `render.yaml` builds the `Dockerfile` on the free plan as a single instance. The game, solo and team races, is then playable at the address Render gives, `https://<name>.onrender.com/`.
2. **Point the GitHub page at it.** In the repository's **Settings > Secrets and variables > Actions > Variables**, add `KR_SERVER_URL` = `https://<name>.onrender.com` (no trailing path), then re-run the **Deploy to GitHub Pages** workflow. `https://rzdhop.github.io/Politicart/` now shows **Multijoueur** whenever the server answers.

3. **Make yourself admin.** In the Render service's **Environment**, set `KR_ADMIN_PASSWORD_HASH` to the hash printed by `npm run -s admin-hash -w @kart-republique/server` (the Blueprint leaves it for you to fill). Render restarts the service; log in as `rida` through **Compte**.

Render's free disk is wiped whenever the service sleeps, so accounts and the admin's cast need a database there: create a free Postgres (for example on [Neon](https://neon.tech) or Supabase) and paste its URL into the service's `DATABASE_URL` variable, which the Blueprint leaves for you to fill. Without it the server still runs, but every account and every cast edit vanishes at each restart (the admin account itself is recreated from its hash).

The free plan sleeps after 15 minutes with nobody connected. The first visitor after that waits about a minute before the Multijoueur button appears, and a race in progress when it falls asleep is lost. Delete the variable and re-run the workflow to make the page solo again.

### Hosting a team race online

The `Dockerfile` packages the server and the built game into one image, and `fly.toml` deploys it to [Fly.io](https://fly.io):

```sh
docker build -t kart-republique .
docker run --rm -p 8080:8080 kart-republique     # the same server, in a container

fly launch --no-deploy --copy-config             # choose your own app name and region
fly deploy
fly volumes create kr_data --size 1              # once: the accounts file and the cast live on it (/data)
fly secrets set KR_ADMIN_PASSWORD_HASH='scrypt$...'   # the admin's hash, in single quotes
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

### On a phone or tablet

The race shows on-screen buttons as soon as the device's main pointer is a finger (or after the first touch); a driving key on a keyboard hides them again. The kart **accelerates by itself**, so the right thumb only has to brake, drift and fire.

| Button | Action |
| --- | --- |
| ◀ ▶ (bottom left) | Steer; slide from one side to the other without lifting |
| ▼ Frein | Brake, reverse while held |
| ↯ Dérapage | Drift while held (release for mini-turbo); in the air, do a trick |
| Objet | Use the item (the button shows it) |
| ★ Pouvoir | Special power (the button fills as it recharges) |
| ❚❚ / ⛶ (top) | Pause / full screen (full screen where the browser allows it: not on iPhone) |

Both orientations work: in portrait the camera widens and pulls back. Phones start on the light graphics and render at 1.5× at most, to keep the frame rate.

## Content

- **16 candidates** parodying real French politicians under pun names (Emmanuel Macaron, Marine Le Stylo, Jean-Luc Mélèche, José Bovin...), each with stats (speed, acceleration, handling, weight) and a signature satirical power: Grand débat, Grève générale, Rond-point surprise, Zone à faibles émissions, Amendement de dernière minute, Mégaphone, Éléments de langage, Vol d'audience, Mise en examen, Épandage, Temps de parole, Coup de rabot (Bruno Le Maigre, le technocrate de Bercy), Fake news (Éric Zemmoule, le populiste de plateau télé), Contrôle d'identité (Gérald Darmalin, le ministre de l'Intérieur), Directive européenne (Michel Bananier, le lobbyiste européen), Ralliement (Manuel Valse, le transfuge, who copies the power of the kart ahead).
- **19 items** from golden ballot boxes, weighted by race position: 49.3 Turbo, Grève surprise, Dossier Mediapart, Motion de censure, Immunité parlementaire, Sondage truqué, Hélico présidentiel, Remaniement, Plan de relance, BRAV-M, Nuage lacrymogène, Casserolade, Dissolution, Niche fiscale, Langue de bois (absorbs the next hit), Cumul des mandats (two items at once), Fact-checking (goes through immunity), Pantouflage (a jump down the road), Référendum (yes, no or abstention, at random).
- **3 circuits**: L'Élysée (Faubourg Saint-Honoré), Palais Bourbon (quais de Seine), Versailles (jardins du Congrès) — with ramps and tricks, pits, dash panels, chicanes and crossing traffic. Each is drawn at 3 times its original size (`scale` in `data.js`, about 3 km a lap), with its decor spread out to match. The road is 30 m wide.
- **Bike lane**: a green cycle lane runs along the right-hand edge of every circuit. Its cyclists ride where they like: they swerve into the karts' lanes, cut across the road, hop onto the pavement, stop dead or ride the wrong way. Hitting one knocks the rider over and shakes your kart.
- **Messages**: the banners during a race only concern you: what you did, and what was done to you. Nobody else's item is announced to the whole field.
- **Contact**: karts bounce off each other once per contact, with a hop, sparks and a camera shake; rubbing door to door costs about 2 % of speed, ramming the kart in front about 10 %, and the lighter kart takes more of it. A spun-out kart always straightens up along the road before it drives off.
- **Workshop (admin only)**: the administrator account (`KR_ADMIN_USER`, `rida` by default) logs in through the ordinary Compte screen and gets an **Atelier** button on the title: rename candidates, change their colours and their default kart (accents, number, wheels, spoiler, side pods, sticker), upload kart liveries and campaign posters. Saving sends the cast to the game server, so every player gets it, the GitHub Pages build included when it names a server. Nobody else sees the Workshop. Without a reachable server the game plays the default cast.
- **Garage**: every player styles their own kart from the roster (body and accent colours, wheels, spoiler, side pods, race number, sticker). It applies to whichever candidate they pick, over that candidate's default kart, and is kept in this browser's `localStorage`.
- Graphics toggle (detailed with shadows / light low-poly), synthesized sound and music via WebAudio.

The candidates are caricatures of real politicians, one pun away from their names. Their powers, lines and scandals are invented satire.

## Repository layout

An npm workspace with three packages.

| Path | What it is |
| --- | --- |
| `apps/game` | The game: a Vite app. Three.js 0.128 engine, React screens. |
| `apps/server` | The game server: static files, accounts and friends (`accounts.js`, `store.js`: a JSON file or Postgres via `pg`), rooms over WebSocket (`ws`), one worker thread per race running the game's own engine. |
| `packages/ui` | `@kart-republique/ui`, the design system: the game's look as React components, with Storybook. |
| `e2e` | The Playwright suite that drives the game through its screens and HUD. |
| `.github/workflows/pages.yml` | Builds, checks and publishes the game to GitHub Pages on every push to `main`. |

### The game (`apps/game`)

The engine never touches the DOM; the UI never touches the simulation. They meet at four seams.

| Path | What it holds |
| --- | --- |
| `src/engine/data.js` | The cast, the items and their rank-weighted odds, the circuits (spline points and `features`). |
| `src/engine/kart.js`, `track.js`, `primitives.js`, `textures.js` | Procedural karts, drivers, decor and tracks; cached materials; canvas-painted textures. |
| `src/engine/physics.js`, `ai.js`, `items.js`, `powers.js` | Kart physics (drift, jumps, pits, hazards, kart contact), AI with rubber-banding, the 19 items, the 16 powers. |
| `src/engine/race.js` | Sets up a race, steps it one frame at a time and returns the **frame payload** the HUD shows. |
| `src/engine/machine.js` | The **state machine**: title, select, tracks, admin, countdown, race, paused, results, lobby, account. |
| `src/engine/teams.js` | Teams: who counts as a foe, the points table, team standings. |
| `src/engine/cyclists.js` | The bike lane's cyclists: their whims, their run-ins with karts, and placing them from snapshots. |
| `src/engine/progress.js`, `account.js` | Levels, experience and unlocks (shared with the server); the account API client. |
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

The E2E suite is the regression net for the game: it drives the real build through the title, roster, circuits, a race with its HUD, pause, the Garage and the results, and asserts on the element ids the game has always had. `e2e/multiplayer.spec.ts` starts the game server too and races two browsers against each other, and `e2e/admin.spec.ts` drives the admin's Workshop on that server with a test-only admin account whose hash the Playwright config computes at load.
