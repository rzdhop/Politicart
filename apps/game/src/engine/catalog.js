// The catalogue: grades, prices, Plitibox odds and ownership of candidates,
// kart part options and trails -- the politicoins economy's shared truth
// (DEC-032).
//
// Pure and DOM-free like progress.js: the game draws the shop from it and
// the server charges from it, never trusting a price or a roll a client
// sends (DEC-014). An account's inventory (`owned`) is {chars, parts, trails}
// of ids, a part being its 'category:value' key. Commons are free and never
// stored: the default option of every part and the 'none' trail are owned
// implicitly, so an empty inventory already drives a plain kart. `owned`
// null means "no economy" (the static build): ownedStyle lets everything
// through; everywhere else null owns nothing beyond the commons.
//
// Candidates: the level makes one reachable (progress.js unlockedIds), the
// price makes it owned, a Plitibox win skips the level (DEC-034). Trails are
// never sold: the Plitibox is their only source. The option names and the
// grades are an assumption (A-026) the human may retune here, in one place.
import { EXHAUSTS, MASTS, NOSES, SKINS, SPOILERS, STICKERS, TRAILS, UNDERGLOWS, WHEELS } from './kartstyle.js';
import { drivableIds, STARTERS, unlockLevel } from './progress.js';

export { drivableIds };

export const GRADES = Object.freeze(['common', 'rare', 'mythic', 'incredible']);
export const GRADE_LABEL = Object.freeze({ common: 'Commun', rare: 'Rare', mythic: 'Mythique', incredible: 'Incroyable' });
export const CHAR_PRICE = Object.freeze({ common: 300, rare: 800, mythic: 2000, incredible: 5000 });
export const PART_PRICE = Object.freeze({ common: 0, rare: 150, mythic: 400, incredible: 1000 });
/** What a duplicate Plitibox drop pays back, by grade. */
export const REFUND = Object.freeze({ common: 50, rare: 150, mythic: 400, incredible: 1000 });

export const BOX_PRICE = 120;
/** Odds of the first draw: a candidate, a part or trail, and the rest is coins. */
export const BOX_ODDS = Object.freeze({ char: 0.02, part: 0.04 });
/** [amount, odds] of each coin drop, as a share of every opening: together they are the coins share, 1 - char - part. */
export const COIN_DROPS = Object.freeze([[5, .40], [10, .30], [50, .16], [100, .06], [500, .02]]);
/** Politicoins per finishing place, the last entry for every place beyond it. */
export const RACE_COINS = Object.freeze([60, 45, 35, 25, 18, 12]);
export const DNF_COINS = 5;
export const TEAM_WIN_COINS = 20;
/** The bonus of the first race of a (UTC) day. */
export const DAILY_COINS = 50;
/** The bonus for reaching `level`. */
export const levelUpCoins = level => 100 * level;

export const CHAR_GRADE = Object.freeze({
  victor: 'common', gege: 'common', maurice: 'common', capucine: 'common', lucie: 'common',
  patrick: 'rare', bernadette: 'rare', kevin: 'rare', gaspard: 'rare', martine: 'rare',
  odile: 'mythic', lulu: 'mythic', hubert: 'mythic', jeanmi: 'mythic',
  aymeric: 'incredible', thierry: 'incredible',
});

// option -> grade, per part category; the keys of each are exactly the
// kartstyle.js list (catalog.test.js checks both ways). Values stay English
// like every id; the French labels live in ui/kartChoices.ts.
export const PART_GRADE = Object.freeze({
  wheels: Object.freeze({ classic: 'common', chrome: 'rare', offroad: 'rare', gold: 'mythic' }),
  spoiler: Object.freeze({ none: 'common', standard: 'common', wing: 'rare' }),
  sticker: Object.freeze({ none: 'common', tricolore: 'common', rosette: 'rare', etoile: 'rare', marianne: 'mythic' }),
  exhaust: Object.freeze({ stock: 'common', double: 'rare', side: 'rare', quad: 'mythic', turbine: 'incredible' }),
  underglow: Object.freeze({ none: 'common', blue: 'rare', red: 'rare', gold: 'mythic', rainbow: 'incredible' }),
  mast: Object.freeze({ none: 'common', antenna: 'rare', tricolore: 'rare', europe: 'mythic', pirate: 'incredible' }),
  nose: Object.freeze({ stock: 'common', splitter: 'rare', wedge: 'rare', bull: 'mythic', ram: 'incredible' }),
  skin: Object.freeze({ flat: 'common', stripes: 'rare', carbon: 'rare', camo: 'mythic', flames: 'incredible' }),
});
export const TRAIL_GRADE = Object.freeze({ none: 'common', ribbon: 'rare', smoke: 'rare', sparkles: 'mythic', confetti: 'mythic', laser: 'incredible' });

/** The part categories the economy knows, in PART_GRADE order (every one is a kartstyle.js field). */
export const PART_CATEGORIES = Object.freeze(Object.keys(PART_GRADE));
/** The options of each category in the forms' display order (kartstyle.js lists). */
export const PART_OPTIONS = Object.freeze({
  wheels: WHEELS, spoiler: SPOILERS, sticker: STICKERS, exhaust: EXHAUSTS, underglow: UNDERGLOWS, mast: MASTS, nose: NOSES, skin: SKINS,
});
/** The trails in display order (kartstyle.js). */
export const TRAIL_OPTIONS = TRAILS;

const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);

/** The inventory key of a part option: 'wheels:gold'. */
export const partKey = (category, value) => `${category}:${value}`;

/** The {category, value} of a part key, or null unless it names a known option. */
export function parsePartKey(key) {
  if (typeof key !== 'string') return null;
  const i = key.indexOf(':');
  if (i < 0) return null;
  const category = key.slice(0, i), value = key.slice(i + 1);
  return has(PART_GRADE, category) && has(PART_GRADE[category], value) ? { category, value } : null;
}

/** The grade of a catalogue item ({kind: 'char' | 'part' | 'trail', id}; a part's id is its key), or null if unknown. */
export function gradeOf({ kind, id } = {}) {
  if (kind === 'char') return has(CHAR_GRADE, id) ? CHAR_GRADE[id] : null;
  if (kind === 'part') { const p = parsePartKey(id); return p ? PART_GRADE[p.category][p.value] : null; }
  if (kind === 'trail') return has(TRAIL_GRADE, id) ? TRAIL_GRADE[id] : null;
  return null;
}

/** What the shop charges for an item, or null when it is unknown or never sold (trails). */
export function priceOf(item) {
  const grade = gradeOf(item);
  if (grade === null || item.kind === 'trail') return null;
  return item.kind === 'char' ? CHAR_PRICE[grade] : PART_PRICE[grade];
}

/** What a duplicate drop of an item refunds, or null when it is unknown. */
export function refundOf(item) {
  const grade = gradeOf(item);
  return grade === null ? null : REFUND[grade];
}

/** The inventory of an account that owns nothing beyond the commons. */
export const emptyOwned = () => ({ chars: [], parts: [], trails: [] });

// Everything an inventory can hold: the candidates that are not starters,
// the part options that are not common, the trails that are not 'none'.
const PAID_CHARS = Object.freeze(Object.keys(CHAR_GRADE).filter(id => !STARTERS.includes(id)));
const PAID_PARTS = Object.freeze(PART_CATEGORIES.flatMap(cat => Object.keys(PART_GRADE[cat]).filter(v => PART_GRADE[cat][v] !== 'common').map(v => partKey(cat, v))));
const PAID_TRAILS = Object.freeze(Object.keys(TRAIL_GRADE).filter(id => id !== 'none'));

/**
 * Keep the known, storable ids of an untrusted inventory, deduplicated:
 * non-starter candidates, non-common part keys, non-'none' trails. Never
 * throws: anything that is not a plain object cleans to emptyOwned().
 */
export function cleanOwned(input) {
  const out = emptyOwned();
  if (!isPlain(input)) return out;
  const keep = (list, pool, ids) => { for (const id of ids) if (pool.includes(id) && !list.includes(id)) list.push(id); };
  keep(out.chars, PAID_CHARS, strings(input.chars));
  keep(out.parts, PAID_PARTS, strings(input.parts));
  keep(out.trails, PAID_TRAILS, strings(input.trails));
  return out;
}

/** The whole catalogue as an inventory: what the admin owns (A-031). */
export const EVERYTHING = Object.freeze({ chars: PAID_CHARS, parts: PAID_PARTS, trails: PAID_TRAILS });

/** Whether `owned` may drive candidate `id`: a starter, or in its chars. */
export const ownsChar = (owned, id) => STARTERS.includes(id) || strings(owned?.chars).includes(id);

/** Whether `owned` may wear option `value` of part `category`: a common, or its key in its parts. */
export function ownsPart(owned, category, value) {
  const grade = gradeOf({ kind: 'part', id: partKey(category, value) });
  return grade !== null && (grade === 'common' || strings(owned?.parts).includes(partKey(category, value)));
}

/** Whether `owned` may leave trail `id`: 'none', or in its trails. */
export const ownsTrail = (owned, id) => id === 'none' || (has(TRAIL_GRADE, id) && strings(owned?.trails).includes(id));

/**
 * Why candidate `id` cannot be bought, or null when it can: 'unknown',
 * 'owned' (starters included), 'level' (below unlockLevel, checked before
 * the purse) or 'coins'.
 */
export function canBuyChar(id, { level = 0, owned = null, coins = 0 } = {}) {
  const price = priceOf({ kind: 'char', id });
  if (price === null) return 'unknown';
  if (ownsChar(owned, id)) return 'owned';
  if (unlockLevel(id) > (level || 0)) return 'level';
  return coins < price ? 'coins' : null;
}

/** Why option `value` of part `category` cannot be bought, or null: 'unknown', 'common' (free already), 'owned' or 'coins'. */
export function canBuyPart(category, value, { owned = null, coins = 0 } = {}) {
  const grade = gradeOf({ kind: 'part', id: partKey(category, value) });
  if (grade === null) return 'unknown';
  if (grade === 'common') return 'common';
  if (ownsPart(owned, category, value)) return 'owned';
  return coins < PART_PRICE[grade] ? 'coins' : null;
}

/**
 * A new partial style with every catalogue field `owned` does not own
 * dropped, so it falls back to the character default (DEC-035). Colours,
 * the number and the pods always pass; `owned` null (no economy) passes the
 * whole style. Expects a style cleanStyle already validated; never throws.
 */
export function ownedStyle(style, owned) {
  const out = isPlain(style) ? { ...style } : {};
  if (owned === null) return out;
  for (const cat of PART_CATEGORIES) if (Object.hasOwn(out, cat) && !ownsPart(owned, cat, out[cat])) delete out[cat];
  if (Object.hasOwn(out, 'trail') && !ownsTrail(owned, out.trail)) delete out.trail;
  return out;
}

/**
 * Politicoins for one race: by finishing place (`rank` 0 is the winner; the
 * sixth place and beyond pay the same), DNF_COINS when not `finished`, and
 * TEAM_WIN_COINS on top for the winning team of a team race.
 */
export function coinsForRace({ rank, field = 6, finished = true, teamWon = false }) {
  const r = Math.max(0, Math.min(field - 1, RACE_COINS.length - 1, Math.floor(rank || 0)));
  return (finished ? RACE_COINS[r] : DNF_COINS) + (teamWon ? TEAM_WIN_COINS : 0);
}

// The Plitibox pools of the second draw: every non-starter candidate, and
// one flat list of every non-common part key and non-'none' trail (A-027).
const CHAR_POOL = PAID_CHARS.map(id => ({ kind: 'char', id }));
const PART_POOL = Object.freeze([...PAID_PARTS.map(id => ({ kind: 'part', id })), ...PAID_TRAILS.map(id => ({ kind: 'trail', id }))]);
// The coin tiers as cumulative thresholds over the coins share, rounded so
// that 0.4 + 0.3 is the 0.7 a test writes (doubles would say 0.7000000000000001).
const COINS_SHARE = 1 - BOX_ODDS.char - BOX_ODDS.part;
const COIN_CUM = COIN_DROPS.reduce((acc, [, odds]) => [...acc, Math.round(((acc[acc.length - 1] || 0) + odds) * 1e9) / 1e9], []);

/** One draw of `rng` clamped to [0, 1), so a careless source still lands in a pool. */
const unit = rng => { const u = Number(rng()); return u > 0 && u < 1 ? u : 0; };
const pick = (rng, pool) => pool[Math.min(pool.length - 1, Math.floor(unit(rng) * pool.length))];
const owns = (owned, { kind, id }) =>
  (kind === 'char' ? ownsChar(owned, id) : kind === 'trail' ? ownsTrail(owned, id) : ownsPart(owned, parsePartKey(id).category, parsePartKey(id).value));

/**
 * Open a Plitibox. `rng` returns numbers in [0, 1): the first draw picks the
 * kind (BOX_ODDS, the rest coins), the second picks uniformly inside the
 * pool, or walks COIN_DROPS over the coins share (so each tier lands on its
 * share of every opening). A `duplicate` is something `owned` already has,
 * refunded REFUND[grade]. Pure and deterministic given `rng`; the caller
 * charges, grants and refunds.
 */
export function rollBox(rng, owned) {
  const u = unit(rng);
  if (u < BOX_ODDS.char + BOX_ODDS.part) {
    const item = pick(rng, u < BOX_ODDS.char ? CHAR_POOL : PART_POOL);
    const grade = gradeOf(item), duplicate = owns(owned, item);
    return { kind: item.kind, id: item.id, grade, duplicate, refund: duplicate ? REFUND[grade] : 0 };
  }
  const v = unit(rng) * COINS_SHARE;
  const tier = COIN_CUM.findIndex(cum => v < cum);   // -1 only by rounding at the very top: the last tier
  return { kind: 'coins', amount: COIN_DROPS[tier < 0 ? COIN_DROPS.length - 1 : tier][0] };
}

/** How much of the catalogue `owned` holds: non-starter candidates, non-common parts and trails. */
export function collection(owned) {
  const o = cleanOwned(owned);
  const have = o.chars.length + o.parts.length + o.trails.length;
  const total = PAID_CHARS.length + PAID_PARTS.length + PAID_TRAILS.length;
  return { have, total, pct: Math.round(100 * have / total) };
}
