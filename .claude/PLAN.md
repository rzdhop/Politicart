# Plan -- admin account, kart personalisation, pun names

Drafted 2026-10-19, approved the same day, **complete** (stages 1-9). The previous plan (team
multiplayer, stages 1-10) is complete and lives in git history at `06bc141`.

## Goal

1. Rename the 11 characters to puns on real French politicians.
2. One admin account, "rida", is the only one allowed to edit the cast
   (names, titles, quotes, colours, liveries, per-character kart defaults)
   and the campaign posters. Edits are held by the game server and seen by
   every player.
3. Players personalise their kart: body and accent colours, wheels, spoiler
   or body kit, race number, sticker. Anything a player has not changed
   falls back to the character's default, which the admin sets. In team
   races, every client sees each player's kart as that player styled it.

Fixed by the human on 2026-10-19:

- Admin enforcement is server-side: a server-held roster (not a browser
  password).
- The kart options are colours, wheels, spoiler/body kit, and number plus
  sticker. Character defaults apply where the player made no edit.
- The kart style is synced in multiplayer.
- The pun-name list below.
- Character ids stay unchanged: `victor`, `gege`, ... are keys in storage,
  the e2e suite and the server's `CHAR_IDS`.

| id | Name | Title (changed only where noted) |
|---|---|---|
| victor | Emmanuel Macaron | Le jeune président |
| gege | Philippe Martini | Le syndicaliste |
| maurice | Jean Lassalle-des-Fêtes | Le maire de province |
| capucine | Sandrine Ruisseau | L'écologiste à vélo-cargo |
| hubert | Gérard L'Archiduc | Le sénateur éternel |
| lulu | Jean-Luc Mélèche | **Le tribun de la rue** |
| bernadette | Marine Le Stylo | **La reine du recadrage** |
| kevin | Jordan Mortadella | L'influenceur politique |
| odile | Eva Joly-Jumper | La juge anticorruption |
| patrick | José Bovin | L'agriculteur en colère |
| lucie | Nathalie Artichaut | La candidate à 1 % |

## Architecture

- **Admin credential.** The server reads `KR_ADMIN_USER` (default `rida`)
  and `KR_ADMIN_PASSWORD_HASH`, a `scrypt$<salt>$<hash>` string made by a
  new `npm run admin-hash -w @kart-republique/server` script. These are env
  vars, set with `fly secrets set` on Fly and in an untracked `.env` locally.
  No password or hash is ever committed. If no hash is set, admin is
  disabled and the server says so on startup.
- **Session.** `POST /api/admin/login` checks the password with scrypt and
  `timingSafeEqual`. On success it issues a random 32-byte token in an
  `HttpOnly; SameSite=Strict; Path=/` cookie (`Secure` under HTTPS). The
  token is held in memory with a 12 h TTL, so a restart means logging in
  again. Login is limited to 5 failures per minute per IP. Every mutating
  request requires `Content-Type: application/json` and an `Origin` that
  matches the host (CSRF). `POST /api/admin/logout` and
  `GET /api/admin/me` complete the API.
- **Roster store.** `KR_DATA_DIR/roster.json` (default
  `apps/server/data/`, gitignored; a Fly volume at `/data` in production)
  has the shape `{chars: {<id>: {name, title, quote, suit, kart, livery,
  style}}, ads: []}`. Writes are atomic (temp file plus rename).
  `GET /api/roster` is public. `PUT /api/admin/roster` requires a session,
  validates every field (lengths, `#rrggbb`, image data URLs under a size
  cap, style enums), and has a 4 MB body cap. The server also applies the
  roster to its own `CHARACTERS`, so AI names in races match.
- **Kart style** (`engine/kartstyle.js`, DOM-free, shared by client and
  server): `{body, accent, wheels: classic|chrome|offroad|gold, spoiler:
  none|standard|wing, pods: bool, number: 0-99|null, sticker:
  none|tricolore|rosette|etoile|marianne}`. It provides
  `defaultStyle(char)`, `mergeStyle(base, partial)` and
  `cleanStyle(input)` (strict validation, drops unknown keys).
  `buildKart(def, style)` renders it on a per-kart basis and never mutates
  shared `CHARACTERS`. Wheels and spoiler apply to the standard kart.
  Colours, number and sticker also apply to the tractor and cargo bodies.
- **Player Garage.** A new `#s-garage` screen reached from character
  select (`#b-garage`). Partial overrides are stored in
  `localStorage['kr-kart']`, with a reset. It works on Pages too.
- **Static (Pages) build.** It ships the default cast with no Workshop and
  no login. The Garage still works.

## Stages

Each stage: Tier 1 green -> ask about Tier 2 (E2E) -> commit -> log line.

### Stage 1: Rename the cast and replace the "fictional" notice with a parody notice
- **Files:** `apps/game/src/engine/data.js`, `ui/screens/TitleScreen.tsx`
  (disclaimer), `README.md`, `game.js` header comment, `engine/data.test.js`
  (new: ids unchanged, names as listed).
- **Risk:** low. Names are not used as selectors anywhere.
- **Verify:** Tier 1; E2E R-01 (select screen renders the roster).
- **Rollback:** `git revert` of the stage commit.
- **Contract at risk:** R-01, R-11.

### Stage 2: Kart style model, shared and DOM-free
- **Files:** `apps/game/src/engine/kartstyle.js` and `kartstyle.test.js`
  (new); `data.js` gains no field, because defaults are derived.
- **Risk:** low. Nothing uses it yet.
- **Verify:** Tier 1 (validation edge cases: bad hex, out-of-range number,
  prototype keys, unknown enum).
- **Rollback:** revert.
- **Contract at risk:** none.

### Stage 3: The kart mesh renders a style
- **Files:** `engine/kart.js` (accent material, four wheel variants, three
  spoiler variants, side pods, number on the plate, sticker canvas on the
  hood), `engine/race.js` (`makeKart` passes the player's merged style; AI
  karts use the default), `engine/preview.js` (the select turntable shows
  the style), and a new headless unit test `kart.test.js`.
- **Risk:** medium. `userData.{wheels, sparks, ring, driver, rotor, blades}`
  is a contract with `physics.updateKartVisual`; every variant must keep
  four wheels in the same order. This must stay DOM-free (DEC-014).
- **Verify:** Tier 1; E2E R-01, R-02, R-05; a manual look at all
  variants.
- **Rollback:** revert.
- **Contract at risk:** R-01, R-02, R-05, R-10.

### Stage 4: Player Garage screen
- **Files:** `ui/screens/GarageScreen.tsx` (new), `engine/machine.js`
  (`select <-> garage`), `ui/App.tsx`, `ui/store`, `SelectScreen.tsx`
  (`#b-garage`), `engine/garage.js` (new: localStorage `kr-kart`, wrapped
  like `custom.js`), `App.test.tsx` (new ids), and `e2e/garage.spec.ts`
  (new: edit, persist across reload, reset, falls back to defaults).
- **Risk:** medium. This adds a new state to the machine (DEC-011).
- **Verify:** Tier 1; full E2E.
- **Rollback:** revert.
- **Contract at risk:** R-01, R-03.

### Stage 5: Server admin authentication -- **riskiest stage**
- **Files:** `apps/server/src/auth.js` (new: scrypt verify, sessions, rate
  limit, cookie parse/serialise), `server.js` (POST/PUT routing, JSON body
  reader with cap, origin check, `/api/admin/login|logout|me`),
  `apps/server/scripts/admin-hash.mjs` (new), `apps/server/package.json`
  (script), `.env.example` (new), `apps/server/src/auth.test.js`, and
  `server.test.js` additions (wrong password, rate limit, bad origin,
  expired token, missing hash disables admin).
- **Risk:** high. Security-sensitive, and it opens non-GET methods on a
  server that only allowed GET/HEAD. Runs on an Opus agent.
- **Verify:** Tier 1; existing server tests; `npm audit`. No new
  dependency (node:crypto only).
- **Rollback:** revert. This stage has no client dependency yet.
- **Contract at risk:** R-16 (the server must keep serving the game and
  WS).

### Stage 6: Server roster store
- **Files:** `apps/server/src/roster.js` (new: load, validate, atomic
  save, apply to `CHARACTERS`), `server.js` (`GET /api/roster`,
  `PUT /api/admin/roster`), `main.js` (`KR_DATA_DIR`), `.gitignore`
  (`apps/server/data/`), `fly.toml` (`[mounts]` volume at `/data`,
  `KR_DATA_DIR=/data`), `Dockerfile` (data dir owned by `node`), and
  `roster.test.js`.
- **Risk:** medium. It is a data mutation path (validation must reject
  oversized or malformed input).
- **Verify:** Tier 1.
- **Rollback:** revert.
- **Contract at risk:** R-16.

### Stage 7: Client admin flow; Workshop moves behind login
- **Files:** `engine/custom.js` (the source becomes `/api/roster`, not
  localStorage; adds per-character kart defaults), `engine/net.js` (roster
  fetch, login, logout, me), `ui/screens/LoginScreen.tsx` (new, `#s-login`,
  `#adm-user`, `#adm-pass`, `#b-login-go`), `TitleScreen.tsx` (`#b-login`
  only when the server is detected; `#b-admin` only when logged in as
  admin), `AdminScreen.tsx` (adds kart default fields and saves via PUT),
  `machine.js` (`title <-> login`), `App.test.tsx`,
  `e2e/game.spec.ts` R-06, `e2e/admin.spec.ts` (new),
  `playwright.config.ts` (server env: a test-only hash and a temp data
  dir).
- **Risk:** high. It changes the behaviour of contract item R-06 on
  purpose: the Workshop is no longer reachable on the static build. The
  R-06 specs move to the server build and log in first. This is a
  requested behaviour change, not a loosened test.
- **Verify:** Tier 1; full E2E; manual login on the LAN.
- **Rollback:** revert. Stages 5 and 6 stay valid without it.
- **Contract at risk:** R-01, R-06 (redefined), R-16.

### Stage 8: Kart style in team races
- **Files:** `apps/server/src/lobby.js` (`set` accepts `style`, cleaned by
  `cleanStyle`), `server.js` (`set` handler), `race.js` (grid carries the
  style), `engine/netrace.js` (a per-slot cloned `def` plus style),
  `ui/screens/LobbyScreen.tsx` (sends the player's style), `lobby.test.js`,
  `netrace.test.js`, and `e2e/multiplayer.spec.ts` (the second browser
  sees the first player's kart number and colour through `window.__kr`).
- **Risk:** medium. It changes the protocol, adding a field, which is
  backward compatible.
- **Verify:** Tier 1; full E2E.
- **Rollback:** revert.
- **Contract at risk:** R-16.

### Stage 9: Close-out
Update VISION, DECISIONS (DEC-015 real-figure parody, DEC-016 server-held
roster and admin auth), ASSUMPTIONS (A-011 invalidated), CHECKPOINT
(regression contract: R-06 redefined, R-17 Garage, R-18 admin), the action
log, and the README (admin setup: hash script, `fly secrets set`,
`fly volumes create`). Run `npm audit`.

## Rejected alternatives

- **A browser-only password.** It can be bypassed in DevTools, and edits
  stay in one browser. The human chose the server-held roster.
- **Admin edits committed to git** (Pages would get them too). Every edit
  would need a redeploy, and the server would need a GitHub token.
- **A database** (SQLite or Postgres). It is overkill for one small JSON
  document and adds a native dependency to the container.
- **GitHub OAuth for rida.** It removes password handling, but it adds a
  third-party app registration, callback URLs and a provider dependency for
  one user. It could replace the password later without touching stages
  6-8.
- **Renaming the character ids.** That would break saved data, the e2e
  selectors and the server's `CHAR_IDS` for no visible gain.

## Check against DECISIONS.md

- **DEC-009** (ids are a contract): all existing ids are kept; only new ids
  are added.
- **DEC-011** (one state machine): `garage` and `login` are added through
  the transition table.
- **DEC-014** (engine DOM-free): `kartstyle.js` is pure, and the mesh
  changes use the existing headless-guarded texture helpers.
- **A-011** (remote workshop edits not shown) is superseded: the roster is
  now global and styles are synced.
- **VISION's "fictional, never real figures"** is overridden by the human.
  This is recorded as DEC-015.

## Out of scope (follow-ups)

- The `packages/ui` story fixtures and design-sync previews keep the old
  fictional names. They are library examples, and changing them churns
  the library tests and the Claude Design sync.
- Local-kart prediction, and a Pages build that reads the server's roster
  (CORS, plus a hard dependency on the Fly URL).

## Needs a human hand (not automatable by me)

- Choose the admin password and generate its hash with the script.
- On Fly: run `fly volumes create kr_data --region cdg --size 1` and
  `fly secrets set KR_ADMIN_PASSWORD_HASH=...`.
