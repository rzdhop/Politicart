// Accounts' progression: experience, levels, the candidates a level makes
// reachable and the ones an account may drive.
//
// Pure rules, shared by the game and the game server (which owns the
// accounts and awards the experience). Four candidates are free from the
// start -- they are also all a guest may drive -- and every level from 2 to
// 13 makes one more *reachable*: the level is the right to buy it with
// politicoins (DEC-034); what is driven is the starters plus what the
// account owns (`owned.chars`, bought or won in a Plitibox), which the
// catalogue (catalog.js) prices and grades. A level costs a little more than
// the one before it.
//
// Experience per race depends on the finishing place: a win is worth 70, the
// last place 20, an unfinished race 10, and a team race's winning team adds
// 20 on top. About three races take a new account to level 2.

/** The candidates every account (and every guest) can drive. */
export const STARTERS = Object.freeze(['victor', 'gege', 'maurice', 'capucine']);

/** The others, in unlock order: UNLOCKS[i] unlocks at level i + 2. */
export const UNLOCKS = Object.freeze(['lucie', 'patrick', 'bernadette', 'kevin', 'odile', 'lulu', 'hubert', 'gaspard', 'jeanmi', 'martine', 'aymeric', 'thierry']);

export const MAX_LEVEL = 99;

/** Experience needed to go from `level` to the next one. */
export const xpToNext = level => 120 + 40 * (level - 1);

/** The level an amount of experience reaches, and how far into the next one it is. */
export function levelFromXp(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp || 0));
  while (level < MAX_LEVEL && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, xpInto: left, xpNext: level < MAX_LEVEL ? xpToNext(level) : 0 };
}

/** The level at which candidate `charId` unlocks (1 for a starter, Infinity if unknown). */
export function unlockLevel(charId) {
  if (STARTERS.includes(charId)) return 1;
  const i = UNLOCKS.indexOf(charId);
  return i < 0 ? Infinity : i + 2;
}

/** Every candidate id a player of `level` may buy (the level gate); a guest (no level) gets the starters. */
export function unlockedIds(level) {
  if (!level) return [...STARTERS];
  return [...STARTERS, ...UNLOCKS.slice(0, Math.max(0, level - 1))];
}

/**
 * Every candidate id an account may drive: the starters plus the known ids
 * of `owned.chars`, deduplicated. `level` is accepted for symmetry with
 * unlockedIds but decides nothing (DEC-034); `owned` null or missing means
 * the starters only.
 */
export function drivableIds(level, owned) {
  const out = [...STARTERS];
  const chars = owned && typeof owned === 'object' && Array.isArray(owned.chars) ? owned.chars : [];
  for (const id of chars) if (UNLOCKS.includes(id) && !out.includes(id)) out.push(id);
  return out;
}

/** The inventory shape of an account that owns nothing beyond the commons (catalog.js emptyOwned, kept local to avoid a cycle). */
const emptyOwned = () => ({ chars: [], parts: [], trails: [] });

/**
 * Experience for one race. `rank` is 0 for the winner, `field` the number of
 * karts, `finished` whether the driver crossed the line, `teamWon` whether
 * their team won a team race.
 */
export function xpForRace({ rank, field = 6, finished = true, teamWon = false }) {
  const r = Math.max(0, Math.min(field - 1, Math.floor(rank || 0)));
  const place = finished ? 20 + Math.round(50 * (field - 1 - r) / Math.max(1, field - 1)) : 10;
  return place + (teamWon ? 20 : 0);
}

/**
 * The public view of an account: name, experience, level, `reachable` (what
 * the level lets it buy), `unlocked` (what it may drive: starters plus
 * `owned.chars`), politicoins, the inventory and the per-user stats, plus
 * `admin: true` when the server says it is the administrator (the key is
 * absent for everyone else). `owned` null is an account from before the
 * economy; the view shows it as owning nothing beyond the commons.
 */
export function profileOf(user, { admin = false, owned = null } = {}) {
  const { level, xpInto, xpNext } = levelFromXp(user.xp);
  const view = {
    id: user.id, name: user.name, xp: user.xp, level, xpInto, xpNext,
    reachable: unlockedIds(level), unlocked: drivableIds(level, owned),
    coins: Number.isFinite(user.coins) && user.coins > 0 ? Math.floor(user.coins) : 0,
    owned: owned ?? emptyOwned(),
    stats: user.stats && typeof user.stats === 'object' ? user.stats : {},
  };
  return admin === true ? { ...view, admin: true } : view;
}
