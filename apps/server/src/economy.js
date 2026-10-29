// The politicoins economy over HTTP: the shop, the Politibox, friends' stats,
// and what a race pays (DEC-032..035).
//
//   POST /api/shop/char   {id}               -> { profile, bought: { kind: 'char', id, price } }
//   POST /api/shop/part   {category, value}  -> { profile, bought: { kind: 'part', key, price } }
//   POST /api/box/open    {count?: 1 | 5}    -> { profile, drops: [...], drop }   each drop = catalog.js rollBox();
//                                               count 5 is the bundle (BOX_BUNDLE.price, one charge, five rolls);
//                                               `drop` is the first, for the clients from before the bundle
//   GET  /api/stats/friends                  -> { friends: [{ id, name, level, stats, collection }] }
//
// Every route is the account's (Bearer), 401 otherwise. A POST is checked in
// this order: JSON (415), at most 1 KB (413, 400 unreadable), at most 30 shop
// and box calls a minute per account (429), then the catalogue (400 unknown,
// 409 owned, 403 level, 402 coins). Prices and rolls come from the catalogue
// only, never from the client (DEC-014); a purchase is one conditional update
// in the store (DEC-033), so two requests racing each other never charge
// twice. The admin's coin grant lives with the other levers in dashboard.js.
//
// Also the award pipeline: settleRace() pays a race (experience, coins, the
// level-up and daily bonuses, the per-account stats) for a solo report
// (accounts.js) and for every human of a team race (server.js); ownedOf() is
// the one way to read an account's inventory, seeding a pre-economy account
// once (A-029); normaliseStats() repairs a stored stats object.
//
// Per-account stats are read-modify-write (A-034): one race or purchase at a
// time per account is what the game does; only the coins are atomic.
import { CHARACTERS, TRACKS } from '../../game/src/engine/data.js';
import {
  BOX_BUNDLE, BOX_PRICE, canBuyChar, canBuyPart, cleanOwned, coinsForRace, collection, DAILY_COINS, EVERYTHING, GRADES, levelUpCoins, partKey, priceOf, rollBox,
} from '../../game/src/engine/catalog.js';
import { levelFromXp, STARTERS, unlockedIds, unlockLevel, xpForRace } from '../../game/src/engine/progress.js';
import { bearer } from './accounts.js';
import { isJson, readJsonBody } from './body.js';

const BODY_MAX = 1024;
const SHOP_WINDOW_MS = 60_000, SHOP_CALLS = 30, SHOP_CAP = 10_000;
const TRACK_IDS = TRACKS.map(t => t.id);
const CHAR_IDS = CHARACTERS.map(c => c.id);
const DROP_KINDS = ['char', 'part', 'trail', 'coins'];
/** How many of the last Politibox drops an account's stats keep (newest first). */
export const RECENT_DROPS = 10;
const COUNTERS = ['races', 'wins', 'podiums', 'finished', 'dnf', 'solo', 'team', 'teamWins', 'boxes', 'coinsEarned', 'coinsSpent'];

/** A lap or race time worth keeping: finite seconds in 5..3600, else null. */
export const seconds = v => (typeof v === 'number' && Number.isFinite(v) && v >= 5 && v <= 3600 ? v : null);

const count = v => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/** The entries of `map` under the `keys` allowed, whose value `keep` accepts. */
function table(map, keys, keep) {
  const out = {};
  if (isPlain(map)) for (const k of keys) if (Object.hasOwn(map, k) && keep(map[k])) out[k] = map[k];
  return out;
}

/** One of the last drops as the stats keep it: `{ kind, id?, grade?, amount?, at }`, from a rollBox result at time `at`. */
export function recentDrop(drop, at) {
  const e = { kind: drop.kind, at };
  if (typeof drop.id === 'string') e.id = drop.id;
  if (GRADES.includes(drop.grade)) e.grade = drop.grade;
  if (count(drop.amount) === drop.amount) e.amount = drop.amount;
  return e;
}

/** The stored ring of recent drops, cleaned: known kinds only, at most RECENT_DROPS, each field checked. */
function recentOf(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const d of list) {
    if (!isPlain(d) || !DROP_KINDS.includes(d.kind)) continue;
    out.push(recentDrop(d, Number.isFinite(d.at) && d.at > 0 ? d.at : 0));
    if (out.length === RECENT_DROPS) break;
  }
  return out;
}

/**
 * An account's stats, repaired field by field: every counter a whole number
 * from 0, the per-circuit best times in 5..3600 s, the per-candidate counts
 * and the Politibox drops by kind, the ring of the last RECENT_DROPS drops
 * (newest first), `lastDaily` a 'YYYY-MM-DD' (UTC) or null, `lastRaceAt` a
 * time or null. Unknown keys are dropped. Never throws.
 */
export function normaliseStats(s) {
  const src = isPlain(s) ? s : {};
  const out = {};
  for (const k of COUNTERS) out[k] = count(src[k]);
  out.drops = { char: 0, part: 0, trail: 0, coins: 0, ...table(src.drops, DROP_KINDS, v => count(v) === v) };
  out.recent = recentOf(src.recent);
  out.bestLap = table(src.bestLap, TRACK_IDS, v => seconds(v) !== null);
  out.bestTime = table(src.bestTime, TRACK_IDS, v => seconds(v) !== null);
  out.byChar = table(src.byChar, CHAR_IDS, v => count(v) === v && v > 0);
  out.lastDaily = typeof src.lastDaily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.lastDaily) ? src.lastDaily : null;
  out.lastRaceAt = Number.isFinite(src.lastRaceAt) && src.lastRaceAt > 0 ? src.lastRaceAt : null;
  return out;
}

/** The level-up bonus for going from level `from` to level `to`: levelUpCoins of every level reached, summed. */
export function levelUpBonus(from, to) {
  let sum = 0;
  for (let l = from + 1; l <= to; l++) sum += levelUpCoins(l);
  return sum;
}

/** The UTC day of a time, as 'YYYY-MM-DD' (A-028). */
export const utcDay = t => new Date(t).toISOString().slice(0, 10);

/**
 * What an account owns, for the shop, the lobby and its profile. The admin
 * owns the whole catalogue (A-031). An account from before the economy
 * (`owned` null) is seeded once with the candidates its level had unlocked
 * (A-029), and the seed is stored; anything else is the stored inventory,
 * cleaned. The account is read again first, so a stale record (a socket's)
 * never seeds twice.
 */
export async function ownedOf(store, user, { admin = false, log = console } = {}) {
  if (admin) return EVERYTHING;
  if (user.owned != null) return cleanOwned(user.owned);
  const fresh = await store.user(user.id);
  if (!fresh) return cleanOwned(null);
  if (fresh.owned != null) return cleanOwned(fresh.owned);
  const level = levelFromXp(fresh.xp).level;
  const seed = cleanOwned({ chars: unlockedIds(level).filter(id => !STARTERS.includes(id)) });
  const after = await store.setOwned(fresh.id, seed);
  if (seed.chars.length) log.info(`economy: "${fresh.name}" predates the economy; owns the ${seed.chars.length} candidates of level ${level}`);
  return after ? cleanOwned(after.owned) : seed;
}

/**
 * Pay one race to `user`: `outcome` is { rank, field, finished, teamWon,
 * trackId, bestLap, time, charId, solo }. Experience (xpForRace), then
 * politicoins: the place (coinsForRace), 100 x each level reached on the way
 * (several at once are all paid), and DAILY_COINS for the account's first
 * race of the UTC day. Then the stats: a win and a podium count only a
 * finished race, a best time only a finished one, a best lap any (times in
 * 5..3600 s, on a known circuit). `now` is the time of the race.
 * Resolves to { after, gain: { xp, coins, daily, levelUp, levelUpCoins } },
 * `after` the account as stored, or null when the account is gone.
 */
export async function settleRace(store, user, outcome, { now = Date.now() } = {}) {
  const xp = xpForRace(outcome);
  const withXp = await store.addXp(user.id, xp);
  if (!withXp) return null;
  // the level before is read from the stored total, not from a record that may be stale
  const levelBefore = levelFromXp(withXp.xp - xp).level, levelAfter = levelFromXp(withXp.xp).level;
  const bonus = levelUpBonus(levelBefore, levelAfter);
  const today = utcDay(now);
  const daily = normaliseStats(withXp.stats).lastDaily !== today;
  const coins = coinsForRace(outcome) + bonus + (daily ? DAILY_COINS : 0);
  const withCoins = (await store.addCoins(user.id, coins)) ?? withXp;

  const s = normaliseStats(withCoins.stats);
  const { finished, teamWon, solo, trackId, charId } = outcome;
  const rank = Math.max(0, Math.floor(Number(outcome.rank) || 0));
  s.races++;
  if (finished) { s.finished++; if (rank === 0) s.wins++; if (rank <= 2) s.podiums++; } else s.dnf++;
  if (solo) s.solo++; else { s.team++; if (teamWon) s.teamWins++; }
  if (TRACK_IDS.includes(trackId)) {
    const lap = seconds(outcome.bestLap), time = finished ? seconds(outcome.time) : null;
    if (lap !== null) s.bestLap[trackId] = Math.min(lap, s.bestLap[trackId] ?? Infinity);
    if (time !== null) s.bestTime[trackId] = Math.min(time, s.bestTime[trackId] ?? Infinity);
  }
  if (CHAR_IDS.includes(charId)) s.byChar[charId] = (s.byChar[charId] ?? 0) + 1;
  s.coinsEarned += coins;
  s.lastDaily = today;
  s.lastRaceAt = now;
  const after = (await store.setStats(user.id, s)) ?? withCoins;
  return { after, gain: { xp, coins, daily, levelUp: levelAfter > levelBefore, levelUpCoins: bonus } };
}

/** What the shop says to each refusal of catalog.js canBuyChar / canBuyPart. */
const REFUSED = {
  owned: [409, 'Déjà à vous.'],
  coins: [402, 'Pas assez de politicoins.'],
  poor: [402, 'Pas assez de politicoins.'],
  common: [400, 'Cette option est gratuite.'],
};

/**
 * The economy routes on `store`. `profile(user)` builds the client's view of
 * an account (accounts.js, async); `onProfile(user)` is told of every change
 * of balance or inventory, so the account's sockets see it at once;
 * `isAdmin(user)` names the admin, who owns everything. `rng` draws the
 * Politibox and `now` is the clock of the rate limit, both injectable for
 * tests. Returns `handle(req, res, path)`, true for the routes above.
 */
export function economyApi(store, { profile, onProfile = () => {}, isAdmin = () => false, rng = Math.random, now = Date.now, log = console } = {}) {
  const reply = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, [status, error]) => reply(res, status, { error });
  const owned = user => ownedOf(store, user, { admin: isAdmin(user), log });

  // ---- shop and box calls per account (user id -> { n, since }), fixed window
  const calls = new Map();
  /** Count one call of account `id`; true once it is over the limit for this minute. */
  const limited = id => {
    const t = now(); const c = calls.get(id);
    if (c && t - c.since <= SHOP_WINDOW_MS) return ++c.n > SHOP_CALLS;
    calls.delete(id); calls.set(id, { n: 1, since: t });
    if (calls.size > SHOP_CAP) {               // never grows without bound: expired entries first, then everyone
      for (const [k, v] of calls) if (t - v.since > SHOP_WINDOW_MS) calls.delete(k);
      if (calls.size > SHOP_CAP) { calls.clear(); calls.set(id, { n: 1, since: t }); }
    }
    return false;
  };

  /** Write the account's stats changed by `change`, and tell its sockets. */
  const recordAndTell = async (user, change) => {
    const s = normaliseStats(user.stats); change(s);
    const after = (await store.setStats(user.id, s)) ?? user;
    onProfile(after);
    return after;
  };

  const routes = {
    'POST /api/shop/char': async (res, user, b) => {
      const id = b.id;
      const why = canBuyChar(id, { level: levelFromXp(user.xp).level, owned: await owned(user), coins: user.coins });
      if (why === 'unknown') return fail(res, [400, 'Candidat inconnu.']);
      if (why === 'level') return fail(res, [403, `Niveau ${unlockLevel(id)} requis.`]);
      if (why) return fail(res, REFUSED[why]);
      const price = priceOf({ kind: 'char', id });
      const r = await store.buy(user.id, { kind: 'chars', item: id, price });
      if (r === null) return reply(res, 401, { error: 'Session expirée.' });
      if (typeof r === 'string') return fail(res, REFUSED[r]);          // another request was faster
      const after = await recordAndTell(r, s => { s.coinsSpent += price; });
      reply(res, 200, { profile: await profile(after), bought: { kind: 'char', id, price } });
    },
    'POST /api/shop/part': async (res, user, b) => {
      const { category, value } = b;
      if (category === 'trail') return fail(res, [400, 'Les traînées ne s’achètent pas.']);
      if (typeof category !== 'string' || typeof value !== 'string') return fail(res, [400, 'Option inconnue.']);
      const why = canBuyPart(category, value, { owned: await owned(user), coins: user.coins });
      if (why === 'unknown') return fail(res, [400, 'Option inconnue.']);
      if (why) return fail(res, REFUSED[why]);
      const key = partKey(category, value), price = priceOf({ kind: 'part', id: key });
      const r = await store.buy(user.id, { kind: 'parts', item: key, price });
      if (r === null) return reply(res, 401, { error: 'Session expirée.' });
      if (typeof r === 'string') return fail(res, REFUSED[r]);
      const after = await recordAndTell(r, s => { s.coinsSpent += price; });
      reply(res, 200, { profile: await profile(after), bought: { kind: 'part', key, price } });
    },
    'POST /api/box/open': async (res, user, b) => {
      const n = b.count === undefined ? 1 : b.count;
      if (n !== 1 && n !== BOX_BUNDLE.count) return fail(res, [400, 'Nombre d’ouvertures inconnu.']);
      const price = n === 1 ? BOX_PRICE : BOX_BUNDLE.price;
      const mine = await owned(user);           // seeds a pre-economy account before anything is granted
      const paid = await store.spendCoins(user.id, price);   // one charge for the whole bundle: short of it, nothing is rolled
      if (!paid) return fail(res, REFUSED.coins);
      // the bundle's later rolls see what its earlier ones granted, so a second copy inside it is a duplicate
      const held = { chars: [...mine.chars], parts: [...mine.parts], trails: [...mine.trails] };
      const drops = [], at = now();
      let after = paid, earned = 0;
      for (let i = 0; i < n; i++) {
        const drop = rollBox(rng, held);
        drops.push(drop);
        if (drop.kind === 'coins') earned += drop.amount;
        else if (drop.duplicate) earned += drop.refund;
        else { after = (await store.grant(user.id, { kind: drop.kind + 's', item: drop.id })) ?? after; held[drop.kind + 's'].push(drop.id); }
      }
      if (earned) after = (await store.addCoins(user.id, earned)) ?? after;
      after = await recordAndTell(after, s => {
        s.boxes += n; for (const d of drops) s.drops[d.kind]++;
        s.coinsSpent += price; s.coinsEarned += earned;
        s.recent = [...drops.map(d => recentDrop(d, at)).reverse(), ...s.recent].slice(0, RECENT_DROPS);   // newest first
      });
      reply(res, 200, { profile: await profile(after), drop: drops[0], drops });
    },
    'GET /api/stats/friends': async (res, user) => {
      const links = (await store.links(user.id)).filter(l => l.status === 'friend');
      const friends = (await Promise.all(links.map(async l => {
        const f = await store.user(l.id); if (!f) return null;
        return { id: f.id, name: f.name, level: levelFromXp(f.xp).level, stats: normaliseStats(f.stats), collection: collection(await owned(f)) };
      }))).filter(Boolean);
      reply(res, 200, { friends });
    },
  };

  async function handle(req, res, path) {
    const route = routes[req.method + ' ' + path]; if (!route) return false;
    const post = req.method === 'POST';
    // A refused POST is answered before its body is read; `connection: close` stops an upload nobody will read.
    const close = post ? { connection: 'close' } : {};
    try {
      const user = await store.sessionUser(bearer(req));
      if (!user) { reply(res, 401, { error: 'Session expirée.' }, close); return true; }
      let body = null;
      if (post) {
        if (!isJson(req)) { reply(res, 415, { error: 'Le contenu doit être du JSON.' }, close); return true; }
        const b = await readJsonBody(req, BODY_MAX);
        if (!b.ok) { reply(res, b.status, { error: b.status === 413 ? 'Requête trop lourde.' : 'Requête illisible.' }, b.close ? close : {}); return true; }
        if (!isPlain(b.value)) { reply(res, 400, { error: 'Requête illisible.' }); return true; }
        if (limited(user.id)) { reply(res, 429, { error: 'Doucement sur la caisse.' }); return true; }
        body = b.value;
      }
      await route(res, user, body);
    } catch (e) { log.error('economy API failed:', e); if (!res.headersSent) reply(res, 500, { error: 'Erreur du serveur.' }); }
    return true;
  }
  return handle;
}
