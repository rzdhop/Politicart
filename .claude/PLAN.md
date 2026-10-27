# Plan -- politicoins, the Politibox, grades, 5 kart parts, trails, 2 circuits, stats, lines, camera, mobile

Branch `feature/epic-turing-clj1rj` (exists, == main `1bbcd2e`). Drafted 2026-10-27.

## Context

The game has a Garage (7 style fields), level-gated candidates (`engine/progress.js`), 3 circuits, one fixed banner line per item, and accounts with xp/level/friends only. The human asks for a meta-game: a currency (**politicoins**), a lootbox (**Politibox**) with a 3D opening, **grades** (common / rare / mythic / incredible) on candidates, kart parts and trails with their own motion, **5 more kart part categories** with more detail and skins, **5 trails** everyone sees, **2 more circuits** with dense decor (and denser decor on the 3 existing ones), a **per-user stats dashboard** (own + friends), **varied catch-phrases**, the kart more visible in play, and everything usable on a phone (no long-press selection).

Decisions fixed by the human (2026-10-27):

| Topic | Decision |
|---|---|
| Access | **Level gate AND price**: buying a candidate needs the level (`unlockLevel`) and the coins; a Politibox win bypasses the level. Starters free. |
| Income | Per race by rank (1st 60, 2nd 45, 3rd 35, 4th 25, 5th 18, 6th 12, DNF 5, team win +20); level-up bonus 100 × new level; daily first race +50; admin grants coins from the dashboard. |
| Politibox | 120 coins. 2 % candidate, 4 % part-or-trail, 94 % coins (5: 40 %, 10: 30 %, 50: 16 %, 100: 6 %, 500: 2 %). Duplicate → refund by grade (50 / 150 / 400 / 1000). Trails are lootbox-only. |
| Prices | Candidates 300 / 800 / 2000 / 5000. Part options: common 0 (defaults), rare 150, mythic 400, incredible 1000. |
| Char grades | common: victor, gege, maurice, capucine, lucie · rare: patrick, bernadette, kevin, gaspard, martine · mythic: odile, lulu, hubert, jeanmi · incredible: aymeric, thierry. |
| Circuits | **Montmartre** (steep cobbled climb, Sacré-Cœur, place du Tertre, funicular, cafés) and **Marseille Vieux-Port** (harbour, boats, Bonne Mère, pastis terraces, ferris wheel). |
| In play | Chase camera closer/lower, animated parts, a kart card with grade on pause and results. |
| Execution | **Every stage in its own worker agent; this session dispatches, merges and reviews.** Tier 1 + E2E per stage, one commit per stage, no stop between stages, push at the end. |

## Approach

- **One DOM-free catalogue, `apps/game/src/engine/catalog.js`** (like `progress.js`): grades, prices, odds, the pure `rollBox(rng, owned)`, `ownedStyle`, `drivableIds`. Game and server import the same truth; the server never trusts a client price or roll (DEC-014).
- **The economy lives on `kr_users`** as three columns (`coins`, `owned` jsonb, `stats` jsonb) in both backends. A purchase is **one conditional update** (`coins >= price and not already owned`), no transaction; the file store checks-then-mutates synchronously. `owned = null` marks a pre-economy account, seeded once with what its level had unlocked.
- **Ownership is enforced wherever an economy exists**: the server filters every style a player sends (`lobby.join/joinGod/set`) through `ownedStyle` (unowned fields are *dropped*, so they fall back to the admin's character default, which is exempt by construction); the client's `myStyle()` filters the same way when the account is known. Without a game server (Pages build) there is no economy: the Garage offers everything and the shop is not rendered.
- **The trail is a style field** (`kartstyle.js FIELDS`), so it rides lobby `view()` → race grid → `netrace.js` → `kartJoin` with no wire change.
- **Politibox and grade motion on the shared canvas** `#c` with their own scene, like `preview.js`; grade badges and reveal flashes are the repo's first CSS `@keyframes`, in `packages/ui`.
- **Waves of parallel worker agents in git worktrees** for disjoint files; the dispatcher merges in a fixed order and reruns Tier 1 + E2E on the integrated tip after each merge (Playwright binds 4173/4180, so E2E never runs in two trees at once). Money/auth stages run on Opus.
- Ids are a contract (DEC-009): every new screen/button gets a stable id (listed per stage).

## Shared data design (every worker reads this)

### `engine/catalog.js` (new, pure, tested)
```js
export const GRADES = ['common', 'rare', 'mythic', 'incredible'];
export const GRADE_LABEL = { common: 'Commun', rare: 'Rare', mythic: 'Mythique', incredible: 'Incroyable' };
export const CHAR_PRICE = { common: 300, rare: 800, mythic: 2000, incredible: 5000 };
export const PART_PRICE = { common: 0, rare: 150, mythic: 400, incredible: 1000 };
export const REFUND     = { common: 50, rare: 150, mythic: 400, incredible: 1000 };
export const BOX_PRICE = 120; export const BOX_ODDS = { char: 0.02, part: 0.04 };            // rest = coins
export const COIN_DROPS = [[5, .40], [10, .30], [50, .16], [100, .06], [500, .02]];
export const RACE_COINS = [60, 45, 35, 25, 18, 12]; export const DNF_COINS = 5; export const TEAM_WIN_COINS = 20; export const DAILY_COINS = 50;
export const levelUpCoins = level => 100 * level;
export const CHAR_GRADE = { victor:'common', gege:'common', maurice:'common', capucine:'common', lucie:'common', patrick:'rare', bernadette:'rare', kevin:'rare', gaspard:'rare', martine:'rare', odile:'mythic', lulu:'mythic', hubert:'mythic', jeanmi:'mythic', aymeric:'incredible', thierry:'incredible' };
// option -> grade; keys == kartstyle.js lists (tested both ways). Values stay English like today's ids; labels are French in kartChoices.ts.
export const PART_GRADE = {
  wheels:    { classic:'common', chrome:'rare', offroad:'rare', gold:'mythic' },
  spoiler:   { none:'common', standard:'common', wing:'rare' },
  sticker:   { none:'common', tricolore:'common', rosette:'rare', etoile:'rare', marianne:'mythic' },
  exhaust:   { stock:'common', double:'rare', side:'rare', quad:'mythic', turbine:'incredible' },      // NEW
  underglow: { none:'common', blue:'rare', red:'rare', gold:'mythic', rainbow:'incredible' },          // NEW
  mast:      { none:'common', antenna:'rare', tricolore:'rare', europe:'mythic', pirate:'incredible' }, // NEW flag/antenna
  nose:      { stock:'common', splitter:'rare', wedge:'rare', bull:'mythic', ram:'incredible' },        // NEW front kit
  skin:      { flat:'common', stripes:'rare', carbon:'rare', camo:'mythic', flames:'incredible' },      // NEW body pattern
};
export const TRAIL_GRADE = { none:'common', ribbon:'rare', smoke:'rare', sparkles:'mythic', confetti:'mythic', laser:'incredible' };
```
Functions: `partKey(cat, val)`/`parsePartKey`; `gradeOf({kind,id})`, `priceOf`; `emptyOwned() → {chars:[], parts:[], trails:[]}`, `cleanOwned(untrusted)` (known ids only; commons and `none` are never stored, they are implicitly owned), `EVERYTHING` (admin, A-031); `ownsChar/ownsPart/ownsTrail`; `drivableIds(level, owned) = STARTERS ∪ owned.chars`; `canBuyChar(id, {level, owned, coins}) → null | 'unknown' | 'owned' | 'level' | 'coins'`, `canBuyPart(cat, val, …) → null | 'unknown' | 'common' | 'owned' | 'coins'`; `ownedStyle(style, owned)` (drops unowned catalogue fields; `body/accent/number/pods` always pass; `owned === null` → untouched); `coinsForRace({rank, finished, teamWon})`; `rollBox(rng, owned)` → `{kind:'coins', amount}` | `{kind:'char'|'part'|'trail', id, grade, duplicate, refund}` (draw 1 picks the kind, draw 2 uniform inside the pool — non-starter chars / non-common parts + non-none trails, A-027; deterministic given `rng`); `collection(owned) → {have, total, pct}`.

### `engine/kartstyle.js`
New lists `EXHAUSTS, UNDERGLOWS, MASTS, NOSES, SKINS, TRAILS` (catalog imports them, never the reverse); `FIELDS` gains the six `oneOf`s; `builtinStyle` gains `exhaust:'stock', underglow:'none', mast:'none', nose:'stock', skin:'flat', trail:'none'`. `ui/types.ts KartStyle` and `ui/kartChoices.ts` mirror them (French labels). `roster.js` accepts them as admin defaults unchanged.

### `engine/progress.js`
`profileOf(user, {admin=false, owned=null})` → `{ id, name, xp, level, xpInto, xpNext, reachable: unlockedIds(level), unlocked: drivableIds(level, owned), coins, owned, stats, admin? }`. **`unlocked` keeps its name and consumers but now means drivable** (DEC-034); `reachable` is the level gate the shop reads.

### Server store (`apps/server/src/store.js`, both backends)
User: `{ id, name, hash, xp, created, seen, banned, coins, owned, stats }`; old rows read `coins 0 / owned null / stats {}`.
```sql
alter table kr_users add column if not exists coins integer not null default 0;
alter table kr_users add column if not exists owned jsonb;
alter table kr_users add column if not exists stats jsonb not null default '{}'::jsonb;
```
| method | Postgres | file |
|---|---|---|
| `addCoins(id, n)` → user | `set coins = coins + $2` | `u.coins += n` |
| `spendCoins(id, n)` → user \| null | `set coins = coins - $2 where id=$1 and coins >= $2 returning *` | check then mutate |
| `buy(id, {kind, item, price})` → user \| `'owned'` \| `'poor'` \| null | one statement: `set coins = coins - $4, owned = jsonb_set(coalesce(owned,'{"chars":[],"parts":[],"trails":[]}'), $2::text[], coalesce(owned #> $2,'[]') \|\| to_jsonb($3::text)) where id=$1 and coins >= $4 and not (coalesce(owned #> $2,'[]') ? $3) returning *`; no row → a `select` tells `'owned'`/`'poor'`/null | synchronous equivalent |
| `grant(id, {kind, item})` → user | same `jsonb_set` without the coin clause, idempotent | push if absent |
| `setOwned(id, owned)`, `setStats(id, stats)` → user | plain updates | assign |
`listUsers` adds `coins`; `row()` maps the three columns. `store.test.js`: a "coins and ownership" `describe.each` block (spend short → null and balance intact; `buy` twice → `'owned'` and one charge; `buy` beyond balance → `'poor'`; `grant` idempotent; `setStats` round-trip; an old row reads the defaults) plus fake-Pool SQL-text tests. The drop list is unchanged (columns only).

### `apps/server/src/economy.js` (new)
```
POST /api/shop/char  {id}               Bearer → {profile, bought:{kind:'char', id, price}}
POST /api/shop/part  {category, value}  Bearer → {profile, bought:{kind:'part', key, price}}
POST /api/box/open   {}                 Bearer → {profile, drop:{kind, id?|amount?, grade?, duplicate?, refund?}}
GET  /api/stats/friends                 Bearer → {friends:[{id, name, level, stats, collection}]}
POST /api/admin/coins {id, amount}      admin  → {user}      (in dashboard.js beside ban/unban)
```
Guards in order: `sessionUser` → 401; `isJson` → 415; `readJsonBody(req, 1024)` → 413/400; per-user limiter (30 shop+box calls/min → 429); catalogue check (400 unknown, 409 `Déjà à vous.`, 403 `Niveau N requis.`, 402 `Pas assez de politicoins.`). Prices come from the catalogue only. `openBox`: `spendCoins(BOX_PRICE)` → `rollBox(rng, owned)` → `addCoins` / `grant` / refund → stats (`boxes`, `drops[kind]`, `coinsSpent`, `coinsEarned`) → `setStats` → `onProfile`. `rng` injectable. `settleRace(store, user, {rank, field, finished, teamWon, trackId, bestLap, solo, now})` → `{after, gain:{xp, coins, daily, levelUp, levelUpCoins}}`: `xpForRace`, `coinsForRace` + level-up bonus + daily (UTC day, A-028) → `addXp`, `addCoins`, stats (`races, wins, podiums, finished, dnf, solo, team, teamWins, bestLap[trackId], bestTime[trackId], byChar, coinsEarned, lastDaily`). `ownedOf(user)`: `owned === null` → seed `cleanOwned({chars: unlockedIds(level) \ STARTERS})` with `setOwned` once (A-029); admin → `EVERYTHING`. `accounts.js /api/progress` body gains `trackId` (a `TRACKS` id), `charId`, `time`, `bestLap` (5..3600 s else null) and calls `settleRace`; `server.js award()` does the same per human from `results.ranking`; `updateProfile` sends `{t:'profile', profile, gained, coins, bonus}`.

### Ownership on the wire
`server.js enter/godJoin/set` pass `who.owned` (`ownedOf(user)`, or `emptyOwned()` for a guest); `lobby.js` does `style: ownedStyle(cleanStyle(style), who.owned)`, `allowed = drivableIds(level, owned)`, `setLevel` → `setProfile(id, {level, owned})` (a purchase mid-lobby unlocks at once). `view()` shape unchanged; the client derives grades from `charId`/style via the catalogue. `race.js`/`netrace.js` need no change.

### Machine
`STATES` += `shop`, `lootbox`; `NEXT`: `title → shop`, `select → shop`, `shop → title | select | lootbox`, `lootbox → shop`. Touches `machine.test.js FLOWS`, `store.ts GameState`, `game.js` menu list (`shop` draws the turntable, `lootbox` calls `renderLootbox(dt)`), `preview.js`, `App.tsx`, `App.test.tsx CONTRACT_IDS`.

## Stages

Per stage: worker agent → Tier 1 (`npm run typecheck && npm run test && npm audit --omit=dev`; `npm run build -w @kart-republique/ui` first when the library changed) → `npm run test:e2e` (judged against the baseline for this container's known software-WebGL failures) → one commit → a `claude-action.log` line. Two fix attempts, then roll back the stage and report. Worktree stages are merged by the dispatcher in the listed order; after every merge the dispatcher reruns Tier 1 + full E2E on the integrated tip.

### Stage 0: Environment, baseline, artifacts (dispatcher)
- **Environment:** no `node_modules` in this container (Node v22.22, npm 10.9): `npm ci`, `npm run build -w @kart-republique/ui`, Tier-1 baseline. Playwright browsers are pre-installed under `/opt/pw-browsers` (chromium-1243): run E2E with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; if `@playwright/test ^1.64.1` does not find them, set `executablePath: '/opt/pw-browsers/chromium'` (never `playwright install`). Record the E2E baseline on `1bbcd2e` (47 specs) once.
- `.claude/PLAN.md` ← this plan; `DECISIONS.md` DEC-032..039; `ASSUMPTIONS.md` A-026..A-034; `CHECKPOINT.md` current-task block.

### Wave 1 (parallel worktrees): 1 ∥ 2 ∥ 3a ∥ 3b ∥ 3c — no shared files

**Stage 1 — Catalogue and style vocabulary.** `engine/catalog.js` + `catalog.test.js` (every list has exactly one grade per value and vice versa; `CHAR_GRADE` covers all 16; `rollBox` with a fixed rng hits every branch and over 10 000 seeded draws lands within ±1 % of the odds; `ownedStyle`, `drivableIds`, `canBuyChar` order `'level'` before `'coins'`, `collection`); `kartstyle.js` + test; `progress.js` + `account.test.js` (`reachable`, `unlocked` = drivable); `ui/types.ts`, `ui/kartChoices.ts`; `roster.test.js` (an admin default may carry `trail`/`exhaust`). `kart.js` ignores unknown style keys, so nothing visible changes. Risk low. Verify Tier 1; E2E garage (the stored `kr-kart` holds only edited fields, unchanged).

**Stage 2 — Store economy methods (Opus).** `store.js` (columns, `row()`, six methods both backends, header contract), `store.test.js`. The Postgres leg runs only with `KR_TEST_DATABASE_URL`: the worker tries a Neon scratch branch (`neon.ts`; 7-day TTL); if the container cannot reach Neon, the fake-Pool SQL-text tests cover the statements and the log line says so (the human verifies on the first Render boot). Risk medium. Rollback: revert; additive columns are harmless.

**Stage 3a — Montmartre, Marseille, denser decor.** `data.js TRACKS` **append** indices 3 (`montmartre`: `cobble: true` road, a loop with two long "climb" straights made of ramps in series, A-030) and 4 (`marseille`: blue/white kerbs, harbour sky). `track.js`: `buildMontmartre` (Sacré-Cœur domes + campanile on a stepped mound, `cafe()` terraces with parasols, `easel()` ×12 on the place du Tertre with painters, `funicular()` two cabins on a rail in `G.animated`, stairs, vines, a Métro entrance, a carousel, tourists), `buildMarseille` (harbour water with `map.offset` scroll, `boat()` ×14 bobbing in `G.animated` + a ferry, pontoons, Bonne Mère = basilica + tower + gilded figure on a hill, `ferrisWheel()` torus + 12 gondolas rotating, pastis terraces, fish stalls, palms, a fort, cranes); +30–50 % decor on the three existing circuits in their idiom (Élysée: bus stops, Métro entrances, café terraces, Wallace fountains, more sedans/pedestrians; Bourbon: more bouquinistes, péniches, joggers, a second bridge; Versailles: more statues/topiary/parterres, swans, an orangery). The `if` chain becomes `BUILDERS[track.id]`; road texture via `roadTexOf(track)`. Repeated small pieces use shared geometry + `mat()` caches or `InstancedMesh` (r109+; no `three/examples/jsm`, DEC-007); budget ≤ ~600 extra meshes per circuit on `high`, halved on `low`; the worker logs the mesh count per track. Tests: `data.test.js` (5 ids, unique, 13–14 points, features `f ∈ [0,1)`, `boxRows` sorted); `headless.test.js` already `it.each(TRACKS)` races every circuit 30 s headless (the real gate on point lists); `e2e/game.spec.ts` R-13 "three circuits" → five (`#trackcards .card` count 5, a requested change). Risk medium (AI stalls, phone draw calls; mobile spec must still reach the countdown).

**Stage 3b — Lines table.** `engine/lines.js`: `LINES = { item: {turbo:{use}, motion:{use, hit}, …19}, power: {debat:{use, hit}, …16}, hazard: {chatons, lisier, rondpoint, fakebox, greve, cortege:{hit}}, shield:{parry} }`, 4–6 ALL-CAPS French variants each (variant 0 = today's literal), `line(path, vars)` → `pick()` + `${n}`/`${name}` substitution, `setLineRng(fn)`; `items.js`, `powers.js` literals replaced (`tell`'s `others` chosen once per call so every victim reads the same sentence); `lines.test.js` (leaves non-empty, distinct, upper-case; required vars per path supplied by call sites; deterministic with a fixed rng); `gameplay.test.js` literal assertions → membership. Does not touch `race.js`/`physics.js` (stage 7). Risk low.

**Stage 3c — Mobile: no selection, callout or context menu.** `game.css`: `#ui, #ui .screen, #ui button, #ui .tile, #ui .chip, #ui .card { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; touch-action:manipulation }`, `#ui input, #ui textarea { user-select:text }`; `touch.ts installNoContextMenu(doc)` (prevents `contextmenu` unless on an input/textarea), called from `mount.tsx`; `touch.test.ts`; `e2e/mobile.spec.ts`: a CDP long press (touchStart, 900 ms, touchEnd) on a roster tile → `contextmenu` `defaultPrevented`, `getSelection().toString() === ''`, screen unchanged. Risk low.

Merge order: 1, 2, 3a, 3b, 3c.

### Wave 2 (parallel worktrees): 4 ∥ 5 ∥ 6a — no shared files

**Stage 4 — Kart parts, skins, detail, trails, animated parts.** `kart.js` standard branch renders per style: `exhaust` (chrome pipes; `quad` four, `turbine` a cone with a pulsing heat sprite on `k.boost`), `underglow` (a `PlaneGeometry(2,3.2)` additive plane at y 0.06; `rainbow` cycles `setHSL`), `mast` (pole + waving tricolore/europe/pirate strips driven by sin, or an antenna ball), `nose` (`splitter` blade, `wedge`, `bull` bars, `ram` spike kept inside the shield radius 2.3), `skin` (`skinTexture(skin, body, accent)` via `canvasTexture`, headless-safe, mapped on the body boxes); **more detail on every variant**: seat cushion + harness, side mirrors, brake lights, number roundels on the pods, wing bolts, steering-wheel rim, bevelled body (stacked boxes), higher `seg()` cylinders on `high`. Tractor and cargo get exhaust/underglow/mast/trail (nose on the hood, skin on the crate). `userData` gains `anim` (array of `(dt, t) => void`) and `trail` (null here) → **`kart.test.js` pin extended to 10 keys** with per-option cases. `engine/trail.js` (new, DOM-free): `buildTrail(kind) → {group, update(k, dt)}`, a pool of 24 meshes per kart (`ribbon` three tricolore boxes, `smoke` grey spheres growing/fading, `sparkles` gold octahedra, `confetti` tumbling quads, `laser` two thin red beams with glow), one spawn per 0.04 s at the rear (z −1.5 in kart space), speed-gated, preallocated, recycled; `race.js makeKart` attaches it and adds `group` to `G.scene` (DOM-free, so no guard needed); `physics.js updateKartVisual` ends with `for (const f of u.anim) f(dt, G.time); if (u.trail) u.trail.update(k, dt);`; `preview.js` runs `anim` on the turntable; `netrace.js` builds trails from each slot's style (through `makeKart`, already). Tests: `kart.test.js`, `trail.test.js` (pool size, recycling, positions behind the kart), `headless.test.js` (a 10 s race with every kart styled `{exhaust:'turbine', underglow:'rainbow', mast:'tricolore', trail:'confetti'}`), `garage.test.js`. Risk medium (particles ×7 karts bounded at 24 meshes each; phone budget on `low`). Verify E2E R-01, R-02, R-05 both poly levels, R-17.

**Stage 5 — Server economy, award pipeline, ownership (Opus).** `economy.js` + `economy.test.js` (route by route on `startServer` with a memory store and injected rng: 401/415/413/400; 402 at 119 coins, 200 at 120; 409 on a second buy; 403 below the level, 200 at it; duplicate refunds by grade; 429 at the 31st call; `/api/stats/friends` lists friends only; admin grant admin-only, integer 0..100 000); `accounts.js` (`/api/progress` → `settleRace`, new body fields validated); `server.js` (route chain, `owned` into `enter/godJoin/set`, `award()` → `settleRace`, `updateProfile` with coins/bonus); `lobby.js` + test (guest sending `wheels:'gold'` lands without the key; owner keeps it; admin default untouched; `setProfile`); `dashboard.js` + test (`POST /api/admin/coins`, `coins` in users); `server.test.js` (team race awards xp + coins + stats; god earns nothing; daily paid once per UTC day with injected `now`); `engine/account.js` client calls (`shop.buyChar/buyPart/openBox/friendStats`, `dashboard.grantCoins`, `reportRace` extra fields) + `account.test.js`; README API list. Risk high (money, auth). Verify Tier 1 + audit; E2E admin, dashboard, multiplayer (a level-1 account still drives the four starters).

**Stage 6a — Library components and grade motion (packages/ui).** New group `components/economy/`: `GradeBadge` (`grade`, `label?`; `.grade.grade-rare`…), `CoinCount`, `ShopCard` (title, price, grade, `owned`, `locked` reason, `onBuy`), `KartCard` (name, style, grade per part, trail), `RevealStage` (full-screen overlay; `grade` drives the keyframe class; `children` = result text) — each with a story and a test (`economy.test.tsx`, satisfying `coverage.test.ts`); `ChoiceOption` gains `disabled?` and `badge?: ReactNode` (DEC-012); `styles/tokens.css` `--grade-common/-rare/-mythic/-incredible`; `styles/fx.css` (first `@keyframes`: `kr-shimmer` rare, `kr-pulse` mythic, `kr-rainbow` incredible conic sweep + `kr-sparkle`, `kr-flash`, `kr-rise`; all off under `prefers-reduced-motion`), imported in `styles.css` (order is load-bearing); `dist-contract.test.ts` updated with the new exports. Risk low. Verify Tier 1 (ui) + build.

Merge order: 4, 5, 6a.

### Stage 6b — Shop and Politibox (Opus, serial)
- **Store (`ui/store.ts`):** `Profile` gains `reachable, coins, owned, stats`; `Gain` gains `coins, daily, levelUpCoins`; `ownedOf(ui)`: `null` when `!ui.netAvailable`, `profile.owned` signed in, `emptyOwned()` for a guest on a server; `shop: {from, busy, error, notice, drop}`; actions `openShop(from)`, `closeShop`, `buyChar`, `buyPart`, `openBox` (POST → `transition('lootbox')` → `playOpening(drop)`), `boxDone`. `takeProfile` calls `garage.setOwned(profile.owned)`; sign-out on a server → `emptyOwned()`.
- **Garage (`engine/garage.js`):** `setOwned(owned)`; `myStyle(char) = playerStyle(char, ownedStyle(EDITS, OWNED))` so a stale `kr-kart` never leaks an unowned part into a race on a server; `setGarage` still stores any valid value (the lock is in the UI). `garage.test.js`.
- **`engine/lootbox.js` + `screens/LootboxScreen.tsx` (`#s-lootbox`):** own `THREE.Scene` on the shared renderer (`ensureBoxScene`, `playOpening(drop)`, `renderLootbox(dt)`, `boxPhase()`, `skipOpening()`); the **Politibox** = a gold ballot urn with a tricolore band and a slot; timeline: `drop` (0.6 s, `easeOutBounce`) → `spin` (1.2 s, accelerating, camera dolly) → `shake` (1.6 s, growing amplitude, grade-coloured light leaking through the slot) → `burst` (lid flies, 120 particle meshes in the grade colour + confetti ribbons, DOM flash via `RevealStage`) → `reveal` (pedestal rises with the prize: `buildKart(def)` turning for a candidate, the part on a bare chassis with a glowing ring around it, a kart circling with its trail, or a stack of spinning coins) → `hold`. Easings (`easeOutBack`, `easeOutBounce`, `easeInOutCubic`) in `util.js`. Any tap skips to `reveal`. Screen: `#box-result`, `#box-grade`, `#b-box-again` (disabled under 120), `#b-box-back`. `lootbox.test.js` runs the timeline headless with a fake clock (phases in order; skip jumps to reveal).
- **`screens/ShopScreen.tsx` (`#s-shop`):** `#coins`, tabs `#shop-tab-box | -chars | -parts`; `#shop-char-<id>` + `#b-buy-char-<id>` (disabled with the reason: level or coins; "Acquis" when owned); `#shop-part-<cat>-<val>` + `#b-buy-part-<cat>-<val>`; `#b-open-box`; `#shop-error`/`#shop-notice` (`role=status`); `#b-shop-back`. Not rendered when `!netAvailable`; a guest on a server sees `#shop-guest` and every buy disabled. Title `#b-shop` (with `CoinCount`, server only); a locked roster tile click opens the shop on that candidate; results gain a shop button `#b-results-shop`.
- **Machine/App:** as in the design section. Tests: `machine.test.js`, `App.test.tsx` (ids `s-shop, coins, shop-tab-chars, shop-char-lucie, b-buy-char-lucie, shop-part-wheels-gold, b-buy-part-wheels-gold, b-open-box, b-shop-back, s-lootbox, box-result, b-box-back`; fake server asserts bodies carry no price; shop absent on the static build; guest disabled), `Lobby.test.tsx`, `account.test.js`.
- **E2E `e2e/shop.spec.ts`** (server 4180): account at 0 coins → `#b-open-box` disabled; after a 15 s team race `#acc-coins ≥ 60` (+50 daily); admin grants 1000 through `POST /api/admin/coins` with the `request` fixture; buy `lucie` → "Acquis", roster tile unlocked; buy `patrick` → level reason; buy `wheels:gold` → Garage `#g-wheels-gold` enabled, `#g-wheels-chrome` disabled with badge; `#b-open-box` → `#s-lootbox` → tap → `#box-result` non-empty → back → coins decreased by 120 minus refund; guest sees `#shop-guest`.
- Risk high (new states, auth-bearing calls, canvas sharing). Verify Tier 1; full E2E; screenshots desktop + phone portrait of both screens.

### Stage 6c — Garage locks and the stats panel (serial)
- `GarageScreen.tsx`: `ChoiceGroup`s for `exhaust, underglow, mast, nose, skin, trail` (`#g-exhaust-<v>` … `#g-trail-<v>`); an unowned option is `disabled` with a `GradeBadge` whose tap opens the shop on it (`#g-buy-<cat>-<v>`); all enabled on the static build. `AdminScreen.tsx` kart defaults get the same groups (any option). `AccountScreen.tsx`: `Stats` panel `#acc-stats` (`Figure` cards like `DashboardScreen`: races, wins, podiums, DNF, boxes, coins earned/spent, collection %; `#acc-bestlaps` over `TRACKS`), `#acc-coins`; friends rows get `#b-friend-stats-<id>` → `GET /api/stats/friends` → `#acc-friend-stats`. `DashboardScreen.tsx`: grant form `#dash-grant-coins`, `#b-grant-<id>`. Tests: `App.test.tsx`, `e2e/garage.spec.ts` (new chips enabled on the static build; `g-trail-laser` persists; a locked chip stays unpressed on the server and the stored JSON unchanged), `e2e/dashboard.spec.ts` (grant → `#acc-coins`). Risk low-medium.

### Stage 7 — The Garage in play (serial)
`race.js updateCamera` (`back` 12 → 10.5, `ty` 6.2 → 5.6, lookAt height 1.2 → 1.0, phone `narrow` terms unchanged, A-033); `race.js simStep` cortège line → `line('hazard.cortege.hit')`; `PauseScreen.tsx` `#pause-kart` and `ResultsScreen.tsx` `#r-kart` render `KartCard` from `G.player.def/style` (solo) or the net grid slot; `#r-xp` adds `+N politicoins`, daily and level-up bonuses; `LobbyScreen.tsx` rows gain `#lobby-trail-<id>` (trail name + grade badge from `p.style.trail`, `—` for none) and the candidate's grade badge. Tests: `App.test.tsx`, `Lobby.test.tsx`, `e2e/game.spec.ts` R-03 (`#pause-kart` visible), `e2e/shop.spec.ts` (second browser sees the host's trail badge and `__kr.karts()[i].style.trail`). Risk low-medium (camera feel: portrait screenshot for the human).

### Stage 8 — Docs, close-out, push (dispatcher)
`README.md` (economy, shop, Politibox, grades, five circuits, stats, API list, `DATABASE_URL` columns, "existing accounts keep what their level unlocked"), `.claude/VISION.md`, `CHECKPOINT.md` (R-13 five circuits; R-21 economy, R-22 ownership, R-23 trails/kart card, R-24 stats; R-10 long-press), `PLAN.md` done, `claude-action.log`. No deploy config change (no new env). Final Tier 1 + full E2E + secret scan of the diff, then `git push -u origin feature/epic-turing-clj1rj` (retries per the git rules). No PR unless asked.

### Parallelism summary
| wave | stages | tier |
|---|---|---|
| 1 | 1 ∥ 2 ∥ 3a ∥ 3b ∥ 3c | 2 on Opus |
| 2 | 4 ∥ 5 ∥ 6a | 5 on Opus |
| 3 | 6b | Opus |
| 4 | 6c | Sonnet |
| 5 | 7 | Sonnet |
| 6 | 8 | dispatcher |

## Rejected alternatives
- Coins replace levels — the human chose level AND price.
- Separate `kr_items`/`kr_wallet` tables or a per-user document — both need a transaction or a read-modify-write for the spend; three columns give atomicity in one statement.
- Keeping `unlocked` as the level gate — every consumer wants "what can I drive"; the gate gets the new name `reachable`.
- A `trail` wire field — a style field already rides everywhere, admin defaults included.
- GSAP or another tween/scroll library — the engine has none, DEC-007 keeps r128 with no new runtime deps; six easings in `util.js` suffice.
- Parallel agents on one checkout, or E2E in parallel worktrees — fixed ports; worktrees + ordered merges keep every green run meaningful.
- Enforcing ownership on the static build — nothing can be bought there; the server enforces the moment a style reaches a room.

## Decisions to record (DEC-032..039)
DEC-032 one catalogue module is the shared truth for grades, prices, odds and the roll · DEC-033 the economy lives on `kr_users` (coins/owned/stats), one conditional update, no transactions · DEC-034 `profile.unlocked` means drivable, `reachable` is the level gate; a lootbox candidate bypasses it · DEC-035 ownership enforced wherever an economy exists (server on every player style; client `myStyle`; never on roster defaults; not without a server) · DEC-036 the trail is a style field · DEC-037 `shop` and `lootbox` states; the Politibox scene owns the canvas in `lootbox` · DEC-038 lines come from one LINES table · DEC-039 independent stages run in parallel worker agents in worktrees, merged in a fixed order, the tip re-verified after each merge.

## Assumptions (A-026..A-034)
A-026 option names and grades per category/trail · A-027 uniform pools inside a kind (chars: the 12 non-starters) · A-028 daily bonus day = UTC · A-029 a pre-economy account (`owned` null) is seeded once with what its level had unlocked · A-030 Montmartre's climb is ramps in series + stair decor (no elevation model) · A-031 the admin owns the whole catalogue · A-032 the lobby shows the trail as a named badge, the 3D trail in races and on the turntable · A-033 camera retune values · A-034 per-user stats are read-modify-write (one race at a time per account); only coins are atomic.

## Verification (end to end)
1. `npm run build -w @kart-republique/ui && npm run typecheck && npm run test && npm audit --omit=dev` green (ui 241+, game ≥ 254, server ≥ 118, plus new suites: catalog, trail, lines, lootbox, economy, store block).
2. `npm run test:e2e`: R-01..R-20 + `shop.spec.ts` + extended game/garage/multiplayer/mobile/dashboard specs; the five-circuit and `#pause-kart` changes are requested behaviour changes.
3. Manual on `npm run serve`: register → race solo → coins and stats in Compte; admin grants 1000; open 3 boxes (desktop + phone portrait: full sequence, tap-skip); buy a rare part and see it in a race and in a two-browser team race (trail visible to the other player, lobby badge); race Montmartre and Marseille on `low` and `high`; a long press on buttons/tiles/chips on a phone selects nothing.
