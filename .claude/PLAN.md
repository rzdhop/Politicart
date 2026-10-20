# Plan -- bring the cast admin, the Garage and the pun names onto main

Drafted 2026-10-20, **approved** the same day; all stages **done**: merged into main as 8922810 and deployed. Approved ("Plan approved. Run the E2E suite
after every stage without asking me each time"). The previous plan (admin account,
kart personalisation, pun names; 9 stages on `feat/multiplayer`) is complete
and lives in git history at `4ee4673`. That branch stays as the reference
implementation; this plan ports it onto `main`, where it has to fit main's
own account system.

## Goal

Ship to `main`, and from there to GitHub Pages and Render:

- the pun-name cast: 16 candidates, including main's 5 new ones;
- the player's Garage (their own kart style), synced in team races;
- the cast Workshop, which only the admin `rida` can use, saved on the server
  for every player.

Fixed by the human on 2026-10-19 and 2026-10-20:

- **Rework onto main**, not a mechanical merge.
- **Admin:**
  - `rida` is a **reserved account**: no one can register that name.
  - The server seeds the account at boot from `KR_ADMIN_PASSWORD_HASH`.
  - Rida logs in through main's normal **Compte** screen, and the profile
    then carries `admin: true`.
  - The separate cookie login from `feat/multiplayer` is dropped.
- **The Workshop works anywhere the admin is logged in**, including the
  Pages build, which talks to the Render server with Bearer tokens.
- **Render** is live with **no database yet**, so accounts and the cast
  reset when the free service sleeps. The admin is reseeded at every boot.
  The cast only persists once a `DATABASE_URL` is set.
- **Names for main's 5 new candidates:**

| id | Name | Title |
|---|---|---|
| gaspard | Bruno Le Maigre | Le technocrate de Bercy |
| jeanmi | Éric Zemmoule | Le populiste de plateau télé |
| martine | Gérald Darmalin | **Le ministre de l'Intérieur** |
| aymeric | Michel Bananier | Le lobbyiste européen |
| thierry | Manuel Valse | Le transfuge |

## Approach

- **A fresh branch, `feat/cast-admin-garage`, cut from `origin/main`
  (`2b14388`).** Each feature is ported in its own stage, reusing code from
  `feat/multiplayer` (`git show feat/multiplayer:<path>`) and adapting it to
  main's code. That way every stage is one committable, testable,
  revertible change.
- **Agent tiers:** stages 4-6 (auth, data mutation, client auth) run on
  Opus agents; the others run on Sonnet or inline.
- **Per stage:** Tier 1 green, then E2E, then commit, then a log line.

## Stages

### Stage 0: Checkpoint on main
- **Goal:** cut the branch and record the starting point.
  - Create the branch from `origin/main`.
  - Port the artifacts. Main already uses DEC-015..019 and A-012..015, so
    new ids continue from there. DEC-021 (this approach) and DEC-022
    (E2E after every stage) are written now. The ported decisions take the
    next ids as their stages land: pun names (stage 1), ChoiceGroup and
    safe centring (stage 3), reserved admin (stage 4). Assumptions become
    A-016..A-019. The regression rows R-17/R-18 do not collide.
  - Append my action-log lines.
  - Record the Tier-1 baseline on main, and run E2E once.
- **Files:** `.claude/*` only.
- **Risk:** none.
- **Rollback:** delete the branch.

### Stage 1: Pun names for all 16 candidates and the parody notice
- **Files:** `engine/data.js` (16 names; titles for lulu, bernadette and
  martine), `engine/data.test.js` (16 ids), the TitleScreen disclaimer,
  `README.md`, the `game.js` header.
- **Risk:** low.
- **Verify:** Tier 1, then E2E R-01.
- **Rollback:** revert.
- **Contract at risk:** R-01, R-11.

### Stage 2: Kart style model and mesh
- **Files:**
  - `engine/kartstyle.js` and its test.
  - `engine/kart.js`: style rendering on top of main's mesh, which adds
    `bumpSparks` and `shield` to `userData`.
  - `race.js`: slots take a style.
  - `payload.js`: the minimap colour follows the style.
  - `kart.test.js`: the `userData` contract now includes the new keys; also
    check that the big wing clears the shield at radius 2.3.
- **Risk:** medium (the physics `userData` contract; DOM-free per DEC-014).
- **Verify:** Tier 1, then E2E R-01, R-02, R-05.
- **Rollback:** revert.
- **Contract at risk:** R-02, R-05, R-10.

### Stage 3: Garage, ChoiceGroup and safe centring
- **Files:**
  - `engine/garage.js` and its test.
  - `GarageScreen.tsx` and `kartChoices.ts`.
  - `machine.js`: the `garage` state, alongside main's `account`.
  - `preview.js`: main's phone `renderPreview` path; `showcaseBand` reads
    `#g-showcase`.
  - Game CSS: phone rules for `#s-garage`, matching main's `#s-select`
    rules.
  - The SelectScreen button.
  - `packages/ui`: ChoiceGroup and the `.screen` safe-centring fix
    (new decision ids as the stage lands).
  - `App.test.tsx` and `e2e/garage.spec.ts`. Main has 16 candidates, and
    the Garage on a locked candidate is not reachable.
- **Risk:** medium (machine; phone layout).
- **Verify:** Tier 1; full E2E; screenshots on desktop and in phone
  portrait.
- **Rollback:** revert.
- **Contract at risk:** R-01, R-03, R-17.

### Stage 4: Reserved, seeded admin on main's accounts -- **riskiest stage**
- **Server:**
  - `KR_ADMIN_USER` (default `rida`) and `KR_ADMIN_PASSWORD_HASH`, in
    main's `scrypt$salt$hex` format.
  - `/api/register` refuses that name (case- and accent-blind via
    `nameKey`).
  - At boot, `ensureAdmin` creates the account, or resets its password
    hash to the env value, so the env is always the truth.
  - `profileOf` gains `admin` for that account only.
  - `requireAdmin(req)` sits on top of the Bearer session.
  - Without a hash: the name stays reserved and nobody is admin.
- **Script:** `npm run -s admin-hash -w @kart-republique/server` emits
  main's format.
- **Files:** `apps/server/src/accounts.js`, `store.js` (a `setHash` method
  on both backends), `main.js`, `scripts/admin-hash.mjs`,
  `engine/progress.js` (`profileOf`), `.env.example`, and tests.
- **Risk:** high: authentication on a public server. This stage runs on an
  Opus agent.
- **Verify:** Tier 1; `npm audit`.
- **Rollback:** revert. Nothing depends on it yet.
- **Contract at risk:** R-16; main's account specs.

### Stage 5: Cast roster in main's store
- **Store:** `getDoc` / `putDoc` on the file backend (a top-level `docs`
  key) and on Postgres (`create table if not exists kr_docs`).
- **Roster:** port `validateRoster` from `feat/multiplayer`, covering 16
  ids, strict validation, and image magic bytes.
- **Endpoints:**
  - `GET /api/roster` is public, with CORS `*`.
  - `PUT /api/admin/roster` requires a Bearer admin session, accepts a body
    of up to 8 MB, and is added to the preflight methods.
- **Apply the cast to the server's `CHARACTERS`** and pass it to the race
  worker.
- **Files:** `apps/server/src/roster.js` and its test, `accounts.js` or
  `server.js` routing, `store.js` and its test, `race.js`,
  `race-worker.js`.
- **Risk:** high: a data-mutation path. Runs on an Opus agent.
- **Verify:** Tier 1.
- **Rollback:** revert.
- **Contract at risk:** R-16.

### Stage 6: Client: the cast from the server, and the Workshop for the admin only
- **Cast:** `custom.js` loads the roster from `<base>/api/roster`, using
  main's `remoteServer` base, so Pages works too. The legacy `kr-custom` key
  is deleted.
- **Workshop:** gated on `ui.account.profile.admin`, with the kart-default
  fields. Saving sends a PUT with the Bearer token; the response names the
  bad field on a 400, and a 401 sends the admin back to Compte.
- **Title:** main's `#b-admin` is shown only to the admin.
- **Files:** `engine/custom.js` and its test; `engine/account.js` (`roster`
  and `saveRoster` calls); `store.ts`; `TitleScreen.tsx`;
  `AdminScreen.tsx`; `App.test.tsx`; `e2e/admin.spec.ts`;
  `playwright.config.ts` (a test-only admin hash computed at load, and
  `KR_DATA=:memory:`).
- **R-06 is redefined:** the Workshop moves behind the admin login. This is
  a requested behaviour change, not a loosened test.
- **Risk:** high. Runs on an Opus agent.
- **Verify:** Tier 1; full E2E; screenshots.
- **Rollback:** revert.
- **Contract at risk:** R-01, R-06, R-16, R-18.

### Stage 7: Kart style in team races
- **Server:**
  - `lobby.js`: `join(id, name, who, style)`. `view()` shows main's fields
    plus a cleaned style, and never leaks `allowed`.
  - `create`, `join` and `set` carry the style. `create` keeps main's
    account guard.
- **Client:** `netrace.js` renders each slot with its style. A read-only
  `__kr.karts()` hook lets the suite inspect it.
- **Tests:** `lobby.test.js`, `net.test.js`, `netrace.test.js`,
  `Lobby.test.tsx`, and `e2e/multiplayer.spec.ts` (with an account-hosted
  room).
- **Risk:** medium.
- **Verify:** Tier 1; full E2E.
- **Rollback:** revert.
- **Contract at risk:** R-16.

### Stage 8: Deploy config and docs
- **`render.yaml`:** add `KR_ADMIN_USER` and `KR_ADMIN_PASSWORD_HASH`
  (`sync: false`).
- **`Dockerfile` / `fly.toml`:** check them against main.
- **README:** admin setup; the Render steps, including a free Postgres
  (Neon) for `DATABASE_URL`; the Garage.
- **Artifacts:** VISION, ASSUMPTIONS, CHECKPOINT (R-06 redefined; R-17,
  R-18).
- **Risk:** low.

### Stage 9: Push, pull request, merge, deploy
- **Push** `feat/cast-admin-garage`. I'll ask first; this machine has no
  `gh` CLI.
- **You** open the PR and merge it on GitHub. I give you the link and the
  description.
- **The merge deploys:** Pages from Actions, Render from `autoDeploy`.
- **You, in the Render dashboard:** set `KR_ADMIN_PASSWORD_HASH` (and
  `DATABASE_URL` when ready).
- **I verify the live site:** `/api/kr`, `/api/roster`, the Pages bundle.
- **Clean up:** drop the `feat/multiplayer` de-flake branch.

## Rejected alternatives

- **Merge main into `feat/multiplayer`:** 20 conflicting files resolved in
  one untestable merge commit. The cookie admin would sit beside main's
  accounts, and its file-only roster is wiped on Render's free disk.
- **Rebase the 10 commits onto main:** every commit conflicts, and the
  intermediate commits would never have been tested.
- **A normal account that the env names as admin:** whoever registers
  `rida` first on a fresh database becomes admin. The human chose a reserved
  name instead.
- **Keep the separate cookie login:** two login systems, and a
  `SameSite=Strict` cookie that cannot work from the Pages origin.

## Check against DECISIONS.md (main's, 001-019)

- DEC-009 (ids are a contract): kept; only new ids are added.
- DEC-011 (one machine): `garage` joins `account` through the table.
- DEC-014 (engine DOM-free): kept.
- DEC-015 (Pages names a remote server): the roster and the admin reuse
  its base URL.
- DEC-019 (accounts live in a JSON file or Postgres): the roster is stored
  there too, as a document.
- Supersedes my branch's DEC-017 (cookie admin). Its replacement is
  recorded as a new decision.
- Otherwise checked: no conflicts.
