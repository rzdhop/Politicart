# Checkpoint

Current state only. History lives in git.

## Latest task -- 2026-10-28: the 3D character-select stage

- **Branch:** `feature/amazing-davinci-af7iw1`, cut from `main` at `b18667a`
  (PR #12, DEC-042: the live screens follow the design system's layout rules).
- **Plan:** `.claude/PLAN.md`, approved 2026-10-28 (owner answers Q1-Q11 at
  its top). DEC-043 (r128 port, stage look isolation), DEC-044 (one pilot,
  four levels, `LOOK3D`), DEC-045 (progressive portraits); A-036..A-038.
- **Stage 0 done:** plan, decisions, baseline. Baseline counts in PLAN.md
  (select 164/78 draws, race about 1,400/330, high/low). E2E in this
  container: 41 of 59 on `main`; the 18 race-start specs time out under
  software WebGL on `main` too (same set), so stages are judged against it.
  Playwright here needs `executablePath` pointed at the installed
  `/opt/pw-browsers/chromium-1243` (the repo's 1.64.1 wants build 1248).
- **Wave 1 done:** stage 1 (stage look, fabrics, geometry helpers; merged
  as `4eb65ca`), stage 2 (3D look specs for the 16 candidates; `2199f54`),
  stage 3 (design-system parts for the 3D select; `7485372`). Tier 1 on the
  tip: ui 369 + 8 skipped, game 600, server 166, typecheck clean. E2E: 40
  passed, 19 failed of 59: the baseline's 18 plus R-05 "still races after
  switching to light graphics", a countdown-timing flake that passes 1 in 5
  alone both on the tip and on stage 0 (`5ad0d14`), so not a regression.
- **Wave 2 done:** stage 4 (hemicycle stage scene; merged as `ec4c7c4`),
  stage 5 (pilot builder at four levels of detail, props; `22d3710`),
  stage 6 (kart stage profile, `kartstage.js`, race profile pinned
  hash-identical; `76dd0ae`). Tier 1 on the tip: ui 369 + 8 skipped, game
  786, server 166, typecheck clean, no flakes. E2E: 41 passed, 18 failed of
  59, exactly the baseline's 18 race-start specs (R-05 passed this run).
  Measured budgets:
  - stage 4 scene: high 14 draws / 18.7k triangles, low 12 / 7.6k.
  - stage 5 pilots: stage <= 22.3k triangles / 18-25 draws, race-high
    <= 5.5k / <= 3, race-low <= 2.1k / <= 2.
  - stage 6 stage kart: 27-40 draws.
- **Next:** owner review of the pilots' contact sheet; then stage 7 (stage
  integration on select and garage).

## Previous task -- 2026-10-27: politicoins, the Politibox, grades, parts, trails, two circuits, stats

- **Branch:** `feature/epic-turing-clj1rj`, cut from `main` at `1bbcd2e`, pushed.
- **Plan:** `.claude/PLAN.md`, all stages **done** (DEC-032..039, A-026..A-035).
  Every stage ran in its own worker agent dispatched by the session
  (DEC-039): wave 1 (catalogue, store, maps, lines, mobile), wave 2 (kart
  parts and trails, server economy, library components), then the shop and
  the Politibox, Garage locks and stats, the Garage in play.
- **Shipped:** politicoins paid per race, level-up and first race of the day;
  the Boutique (candidates by level AND price, parts by grade); the Politibox
  (120 coins, 2 % candidate, 4 % part or trail, coins otherwise, duplicates
  refunded) opened in a 3D sequence on the shared canvas; grades
  common/rare/mythic/incredible with CSS motion in `packages/ui`; six new
  kart style fields (exhaust, underglow, mast, nose, skin, trail) rendered
  with more detail and animated; five trails (lootbox-only) seen by every
  player; Montmartre and Marseille plus denser decor on the three Paris
  circuits; per-account stats and friends' stats on Compte; the admin grants
  coins from the dashboard; one LINES table with 4-6 variants per banner;
  the chase camera closer; kart cards on pause and results; no long-press
  selection on phones. Ownership is enforced on the server (DEC-035).
- **Tests:** Tier 1 green on the tip `733498e`: typecheck clean, ui 286 + 8
  skipped, game 455, server 164, audit 0. E2E: see the action log's last
  line (the container's software WebGL times out every desktop race-start
  spec, on main too; the economy, garage, dashboard, admin, mobile and
  multiplayer specs run).
- **Known flakes (pre-existing, pass alone):** `apps/server/src/race.test.js`
  "drives their kart from their input" (wall-clock, fails under load) and
  headless "knocks over a cyclist".
- **Owed by the human:** play a race on each new circuit and open a few
  Politibox on a phone; judge the grades of the parts and candidates
  (A-026, A-027) and the camera (A-033); say whether trails should also be
  sold; the first Render boot against Neon adds the three `politikart_users`
  columns (A-029: existing accounts keep what their level had unlocked).
- **Follow-ups:** the long straights of the circuits still read a little
  thin (a densification pass); per-user stats are read-modify-write
  (A-034); the two flaky timing tests deserve a looser budget; the
  `/design-sync` re-sync for the economy components and ChoiceGroup.

## Earlier task -- 2026-10-27: cast review, quieter HUD, admin dashboard and god seat

- **Branch:** `feature/relaxed-pascal-rlbpu6`, cut from `main` at `fd118b5`.
- **Shipped on the branch:** DEC-028 (three powers retuned: Déconstruction,
  Lâcher de chatons, Fauchage volontaire; Darmalin's "elle", the megaphone's
  "LULU" and Mélèche's quote fixed), DEC-029 (what a driver reads and hears
  is what landed on them; local sounds; the banner queue), DEC-030 (the
  admin's dashboard: stats, users with bans, live rooms and sockets; the god
  seat over `godJoin`, creative mode in the engine).
- **Tests:** Tier 1 green (game 254, server 118). E2E: admin, dashboard
  (R-19, R-20), garage form and mobile specs green. In this container the
  desktop solo-race specs and the multiplayer green-light check fail on the
  previous commit too (software WebGL, a slowed CPU), so they were judged
  against it, not against green.
- **Follow-up the same day (DEC-031):** the admin's absolute power. A god
  joins a running race at once; the console divine (G, or the dashboard's
  Contrôler) changes any race; lobby commands force start, circuit, teams,
  candidates and exclusions.
- **Owed by the human:** play a race and judge the banner cadence (A-021);
  say whether other powers should be retuned (A-020); try the console in a
  real team race (A-024, A-025).
- **Follow-ups:** the dashboard's user list is computed in memory from
  `listUsers` (fine for hundreds of accounts, not for hundreds of thousands);
  no e2e for a banned account's live socket beyond the lobby error line.

## Previous task -- closed 2026-10-20: cast admin, Garage and pun names, on main

- **Shipped:** `feat/cast-admin-garage` (pushed) is merged into `main` as
  `8922810`, whose tree is identical to the tested branch tip. Pages
  redeployed (bundle `index-A31GWlYp.js` carries the pun names), and Render
  (`politikart.onrender.com`) serves the new server.
- **Live checks 2026-10-20:**
  - `/api/kr` answers, with `accounts: file`, so there is no database yet.
  - `/api/roster` returns the default cast.
  - Registering `RIDA` gets 409.
  - The preflight allows PUT.
  - A roster PUT without a token gets 401.
- **Final test state:** Tier 1 green (ui 241 + 8 skipped, game 217, server
  100); `npm audit --omit=dev` 0; e2e 47/47 (the last full run was 46/47; its
  one failure was a spec-name collision, fixed and rerun 4/4).
- **Decisions:** DEC-021..027 (port onto main; E2E after every stage; pun
  names; ChoiceGroup; run every stage then push and merge; seeded admin;
  roster in the store).
- **Owed by the human:**
  - In Render > Environment, set `POLITIKART_ADMIN_PASSWORD_HASH` (made with
    `npm run -s admin-hash -w @politikart/server`). Until then nobody is
    admin and the Workshop is off.
  - Set `DATABASE_URL` (a free Neon Postgres) so accounts and the cast
    survive the free plan's sleeps.
- **Follow-ups:**
  - a `/design-sync` re-sync to upload ChoiceGroup;
  - main's per-IP login limiter trusts `X-Forwarded-For` (per-account
    limit added; see DEC-026);
  - the packages/ui story fixtures keep the old names (A-019);
  - rare flake: headless "knocks over a cyclist".
- **Local leftovers:**
  - branches `feat/multiplayer` (the reference implementation) and
    `Feature/vigilant-mendel-913389` (a redundant netrace de-flake), neither
    merged;
  - kept, not deleted.

## Previous task (on main's history)

- **Task:** online team multiplayer (plan in `.claude/PLAN.md`, DEC-014).
  Branch `feat/multiplayer`, cut from `main` at `e819070`. Not pushed.
- **Current phase:** DOCUMENT, done. **All 10 stages committed**:
  8449249 (plan), e8134bc (headless engine), be8de1c (routing by kart),
  7c850d9 (teams and points), e3c8944 (snapshot codec), 7229652 (server
  lobby), 1b32d6c (race worker), ce4486b (client lobby), 053eb9c
  (networked race), 61163cd (two-browser e2e), 06bc141 (container).
- **Next action:** the human decides whether to push and merge
  `feat/multiplayer`, and owes the manual checks below.
- **Owed by hand:** R-10..R-12 in a real solo race (stage 2 rewired every
  toast and sound; the e2e suite and unit tests pass, but a full three-lap
  race with items was not played by a person). A team race on two real
  machines on the LAN.
- **Known limits:** no local-kart prediction, so your own kart answers about
  half a round trip plus 100 ms late (fine on a LAN, felt over the
  internet). Below 20 fps the chase camera trails a networked kart, because
  its easing uses frame time capped at 50 ms. Remote players' workshop edits
  are not shown (A-011). Rooms live in one process's memory.
- **Open questions:** A-008..A-011 are the defaults chosen; none blocks.
- **Known working-tree noise:** 46 files show as modified after a
  line-ending restore (empty `git diff`; see `.design-sync/NOTES.md`).

## Checkpoint commit

- **Hash:** `e819070` (the pre-task checkpoint; main and feat/design-system point here)
- **Branch tip:** `06bc141` on `feat/multiplayer`, Tier 1 green, e2e 29/29
- **Subject:** Record the line-ending trap found on the design-sync re-sync
- **Branch:** `feat/multiplayer`
- **Tree at checkpoint:** clean in content (`git diff` empty)
- **Pages:** run 38709974819 green for this commit.

## Tier-1 baseline

Measured 2026-10-15 at `e819070`, before any multiplayer change:

    npm run typecheck   # clean
    npm run test        # ui: 13 files, 235 passed + 8 skipped; game: 6 files, 52 passed
    npm audit --omit=dev  # 0 vulnerabilities

Historic, from the design-system task:

**Tier 1 as of stage 1 (green):**

    npm install            # clean, 95 packages, 0 vulnerabilities
    npm run build          # vite lib build + tsc declarations -> dist/
    npm run typecheck      # tsc --noEmit, clean
    npm run test           # vitest, 14 files / 341 tests passing
    npm run build-storybook -w @politikart/ui   # 115 stories, 46 components
    npm audit              # 0 vulnerabilities (with and without dev deps)

All four run from the repo root across workspaces. The game's regression
contract stays UNVERIFIED until stage 7 lands the Playwright suite -- that is
the stage that gives Part C its net.

## Regression contract

The game at `index.html` must keep working. No item here may break.

| # | Functionality | Covering test | Status |
|---|---|---|---|
| R-01 | Title -> character select -> track select -> race -> results flow | `e2e/game.spec.ts` R-01 (6 specs) + R-01b | COVERED |
| R-02 | Live HUD: position, lap, timer, speed, drift gauge, item slot, power gauge, toasts, wrong-way, countdown | `e2e/game.spec.ts` R-02 (4 specs) | COVERED |
| R-03 | Pause / resume / quit to menu | `e2e/game.spec.ts` R-03 (3 specs) | COVERED |
| R-04 | Mute toggle (button and `M` key) | `e2e/game.spec.ts` R-04 (2 specs) | COVERED |
| R-05 | Graphics toggle: detailed with shadows vs light low-poly | `e2e/game.spec.ts` R-05 (2 specs) | COVERED |
| R-06 | Workshop (admin only): rename, colours, kart defaults, livery, posters; saved on the server for every player; reset | `e2e/admin.spec.ts` R-06 workshop (3 specs) | COVERED (redefined 2026-10-20) |
| R-07 | Keyboard controls as documented in the README controls table | `e2e/game.spec.ts` R-07 (3 specs) | COVERED |
| R-08 | Minimap canvas rendering | `e2e/game.spec.ts` R-08 (1 spec) | COVERED |
| R-09 | Window resize without layout or renderer breakage | `e2e/game.spec.ts` R-09 (2 specs) | COVERED |
| R-10 | Three laps, five AI opponents, rubber-banding | none | UNVERIFIED (manual) |
| R-11 | 16 characters (pun names) with their stats and signature powers | none | UNVERIFIED (manual) |
| R-12 | 14 items with rank-weighted odds from golden ballot boxes | none | UNVERIFIED (manual) |
| R-13 | 5 circuits (Élysée, Palais Bourbon, Versailles, Montmartre, Marseille) with ramps, tricks, pits, dash panels, chicanes, crossings | `e2e/game.spec.ts` "offers the five circuits" + `engine/headless.test.js` (every circuit built and raced headless, road and mesh budget) | COVERED (redefined 2026-10-27: five cards) |
| R-14 | Synthesized WebAudio sound and music | none | UNVERIFIED (manual) |
| R-16 | Team race: an account hosts, players join by code or invitation, race on opposite teams, see team points and each other's Garage styles; the static (Pages) build without a server offers no Multijoueur | `e2e/multiplayer.spec.ts` (4 specs) + `apps/server/src/*.test.js` | COVERED 2026-10-20 |
| R-17 | Garage: style your own kart (colours, wheels, spoiler, pods, number, sticker); kept in the browser; reset; races with it | `e2e/garage.spec.ts` (4 specs) + `engine/garage.test.js`, `engine/kart.test.js` | COVERED 2026-10-20 |
| R-18 | Admin access: only the env-seeded admin account sees the Workshop; visitors, normal accounts and the static build never do; logout hides it; admin kart defaults reach players' Garage | `e2e/admin.spec.ts` access specs + `apps/server/src/admin.test.js`, `roster.test.js` | COVERED 2026-10-20 |
| R-15 | Playable from GitHub Pages at the documented URL | Pages workflow run 38699287498 + HTTP check of the published index and bundle | VERIFIED 2026-10-15 |
| R-21 | Economy: politicoins per race, the Boutique (candidates by level and price, parts by grade), the Politibox (odds, refunds) and its opening; guests see a disabled shop, the static build none | `e2e/shop.spec.ts` (5 specs) + `apps/server/src/economy.test.js`, `engine/catalog.test.js`, `engine/lootbox.test.js` | COVERED 2026-10-27 |
| R-22 | Ownership: the server drops any kart part or trail the account does not own before a room sees it; the Garage greys unowned options behind their grade badge and leads to the Boutique; the static build offers every part | `e2e/garage.spec.ts` R-22 + `e2e/multiplayer.spec.ts` (the host buys her gold wheels first) + `apps/server/src/lobby.test.js`, `engine/garage.test.js` | COVERED 2026-10-27 |
| R-23 | Six new kart part categories and five trails rendered and animated; trails and candidate grades shown in the lobby; kart cards on pause and results | `e2e/multiplayer.spec.ts` (lobby badges), `e2e/game.spec.ts` R-03 and `e2e/mobile.spec.ts` (`#pause-kart`) + `engine/kart.test.js`, `engine/trail.test.js`, `engine/headless.test.js` | COVERED 2026-10-27 |
| R-24 | Per-account stats and friends' stats on Compte; the admin credits politicoins from the dashboard; a long press on a phone selects nothing | `e2e/dashboard.spec.ts` R-24 + `e2e/mobile.spec.ts` "a long press selects nothing" + `apps/server/src/economy.test.js`, `touch.test.ts` | COVERED 2026-10-27 |

**Stage 7 maps the contract to specs** in `e2e/game.spec.ts`, whose describe
blocks are named for the items above (R-01 .. R-09, plus R-01b for the results
screen). Once that suite is green, those rows stop being UNVERIFIED. R-10..R-14
stay manual: lap counts, item odds, circuit features, procedural models and
synthesised audio are not things a DOM-level suite can assert, and R-15 is a
deployment check for stage 14.

**DEC-009 records the consequence**: the game's element ids are now a contract
the React port must preserve, because the suite drives the game through them.

R-01..R-09 are COVERED as of stage 7: `npm run test:e2e` runs 27 specs against
the real game in Chromium in about 2.8 minutes, and must be green after every
stage from 8 to 13.

R-10..R-14 stay UNVERIFIED by choice, not oversight: lap counts over a full
three-lap race, rank-weighted item odds, circuit features, procedural models
and synthesised WebAudio are not things a DOM-level suite can assert without
either minutes of automated driving per run or white-box hooks that the port
will delete. They are manual checks, to be done by hand before close-out.
R-15 is a deployment check for stage 14.
