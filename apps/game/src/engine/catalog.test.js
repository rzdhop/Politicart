// The catalogue is the shared truth of the economy: these tests pin its
// tables to kartstyle.js and data.js, and the pure rules on top of them.
import { describe, expect, it } from 'vitest';

import {
  BOX_ODDS, BOX_PRICE, canBuyChar, canBuyPart, CHAR_GRADE, CHAR_PRICE, cleanOwned, COIN_DROPS, coinsForRace, collection, DAILY_COINS,
  DNF_COINS, drivableIds, emptyOwned, EVERYTHING, GRADE_LABEL, GRADES, gradeOf, levelUpCoins, ownedStyle, ownsChar, ownsPart, ownsTrail,
  PART_CATEGORIES, PART_GRADE, PART_OPTIONS, PART_PRICE, parsePartKey, partKey, priceOf, RACE_COINS, REFUND, refundOf, rollBox,
  TEAM_WIN_COINS, TRAIL_GRADE, TRAIL_OPTIONS,
} from './catalog.js';
import { CHARACTERS } from './data.js';
import { builtinStyle, cleanStyle, EXHAUSTS, MASTS, NOSES, SKINS, SPOILERS, STICKERS, TRAILS, UNDERGLOWS, WHEELS } from './kartstyle.js';
import { STARTERS, UNLOCKS, unlockLevel } from './progress.js';

const LISTS = { wheels: WHEELS, spoiler: SPOILERS, sticker: STICKERS, exhaust: EXHAUSTS, underglow: UNDERGLOWS, mast: MASTS, nose: NOSES, skin: SKINS };
/** An rng that hands out the given draws in order (and 0 afterwards). */
const seq = (...draws) => { let i = 0; return () => (i < draws.length ? draws[i++] : 0); };
/** A seeded linear congruential generator in [0, 1). */
const lcg = seed => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const sorted = a => [...a].sort();

describe('tables', () => {
  it.each(Object.keys(LISTS))('%s: every kartstyle option has exactly one grade, and nothing else does', cat => {
    expect(sorted(Object.keys(PART_GRADE[cat]))).toEqual(sorted(LISTS[cat]));
    expect(new Set(LISTS[cat]).size).toBe(LISTS[cat].length);
    for (const g of Object.values(PART_GRADE[cat])) expect(GRADES).toContain(g);
    expect(PART_OPTIONS[cat]).toBe(LISTS[cat]);
  });

  it('knows the eight part categories in order, every one a kartstyle field', () => {
    expect(PART_CATEGORIES).toEqual(Object.keys(LISTS));
    const style = builtinStyle({ kart: 0 });
    for (const cat of PART_CATEGORIES) expect(PART_GRADE[cat][style[cat]]).toBe('common');
  });

  it('grades every trail and only the trails; the default trail is common', () => {
    expect(sorted(Object.keys(TRAIL_GRADE))).toEqual(sorted(TRAILS));
    expect(TRAIL_OPTIONS).toBe(TRAILS);
    for (const g of Object.values(TRAIL_GRADE)) expect(GRADES).toContain(g);
    expect(TRAIL_GRADE[builtinStyle({ kart: 0 }).trail]).toBe('common');
  });

  it('grades exactly the sixteen candidates of data.js, the starters common', () => {
    expect(sorted(Object.keys(CHAR_GRADE))).toEqual(sorted(CHARACTERS.map(c => c.id)));
    for (const id of STARTERS) expect(CHAR_GRADE[id]).toBe('common');
    for (const g of Object.values(CHAR_GRADE)) expect(GRADES).toContain(g);
    expect(Object.values(CHAR_GRADE).filter(g => g === 'incredible')).toHaveLength(2);
  });

  it('labels every grade in French, prices and refunds by grade', () => {
    for (const g of GRADES) {
      expect(typeof GRADE_LABEL[g]).toBe('string');
      expect(CHAR_PRICE[g]).toBeGreaterThan(0);
      expect(REFUND[g]).toBeGreaterThan(0);
    }
    expect(CHAR_PRICE).toEqual({ common: 300, rare: 800, mythic: 2000, incredible: 5000 });
    expect(PART_PRICE).toEqual({ common: 0, rare: 150, mythic: 400, incredible: 1000 });
    expect(REFUND).toEqual({ common: 50, rare: 150, mythic: 400, incredible: 1000 });
    expect(BOX_PRICE).toBe(120);
    expect(BOX_ODDS).toEqual({ char: 0.02, part: 0.04 });
    expect(COIN_DROPS.reduce((s, [, odds]) => s + odds, 0)).toBeCloseTo(1 - BOX_ODDS.char - BOX_ODDS.part, 10);
    expect([RACE_COINS, DNF_COINS, TEAM_WIN_COINS, DAILY_COINS]).toEqual([[60, 45, 35, 25, 18, 12], 5, 20, 50]);
    expect(levelUpCoins(7)).toBe(700);
  });
});

describe('keys, grades and prices', () => {
  it('builds and parses part keys, refusing unknown ones', () => {
    expect(partKey('wheels', 'gold')).toBe('wheels:gold');
    expect(parsePartKey('wheels:gold')).toEqual({ category: 'wheels', value: 'gold' });
    for (const bad of ['wheels', 'wheels:square', 'hat:gold', ':gold', 'wheels:', '', null, 7, 'constructor:gold', 'wheels:constructor']) {
      expect(parsePartKey(bad)).toBeNull();
    }
  });

  it('grades a char, a part key or a trail, null for anything else', () => {
    expect(gradeOf({ kind: 'char', id: 'thierry' })).toBe('incredible');
    expect(gradeOf({ kind: 'part', id: 'wheels:gold' })).toBe('mythic');
    expect(gradeOf({ kind: 'trail', id: 'laser' })).toBe('incredible');
    expect(gradeOf({ kind: 'char', id: 'nobody' })).toBeNull();
    expect(gradeOf({ kind: 'char', id: 'constructor' })).toBeNull();
    expect(gradeOf({ kind: 'trail', id: 'toString' })).toBeNull();
    expect(gradeOf({ kind: 'hat', id: 'victor' })).toBeNull();
    expect(gradeOf()).toBeNull();
  });

  it('prices candidates and parts by grade, never trails nor unknowns', () => {
    expect(priceOf({ kind: 'char', id: 'lucie' })).toBe(300);
    expect(priceOf({ kind: 'char', id: 'aymeric' })).toBe(5000);
    expect(priceOf({ kind: 'part', id: 'wheels:classic' })).toBe(0);
    expect(priceOf({ kind: 'part', id: 'exhaust:turbine' })).toBe(1000);
    expect(priceOf({ kind: 'trail', id: 'ribbon' })).toBeNull();
    expect(priceOf({ kind: 'char', id: 'nobody' })).toBeNull();
    expect(refundOf({ kind: 'trail', id: 'laser' })).toBe(1000);
    expect(refundOf({ kind: 'part', id: 'spoiler:wing' })).toBe(150);
    expect(refundOf({ kind: 'part', id: 'spoiler:jet' })).toBeNull();
  });
});

describe('inventories', () => {
  it('starts empty and cleans anything else to known, storable ids without duplicates', () => {
    expect(emptyOwned()).toEqual({ chars: [], parts: [], trails: [] });
    expect(emptyOwned()).not.toBe(emptyOwned());
    const dirty = {
      chars: ['lucie', 'victor', 'nobody', 'lucie', 'thierry', 7, null],
      parts: ['wheels:gold', 'wheels:classic', 'wheels:gold', 'spoiler:none', 'hat:gold', 'wheels', 'exhaust:turbine', {}],
      trails: ['none', 'laser', 'laser', 'rainbow', 'ribbon', 1],
      junk: true,
    };
    expect(cleanOwned(dirty)).toEqual({ chars: ['lucie', 'thierry'], parts: ['wheels:gold', 'exhaust:turbine'], trails: ['laser', 'ribbon'] });
    for (const v of [null, undefined, 'x', 3, [], { chars: 'lucie' }, { parts: { 0: 'wheels:gold' } }]) expect(cleanOwned(v)).toEqual(emptyOwned());
    expect(cleanOwned(JSON.parse('{"__proto__":{"chars":["lucie"]}}'))).toEqual(emptyOwned());
  });

  it('EVERYTHING holds every non-starter candidate, every paid part and every trail, frozen', () => {
    expect(sorted(EVERYTHING.chars)).toEqual(sorted(UNLOCKS));
    expect(EVERYTHING.parts).toHaveLength(27);
    expect(EVERYTHING.parts.every(k => gradeOf({ kind: 'part', id: k }) !== 'common')).toBe(true);
    expect(sorted(EVERYTHING.trails)).toEqual(sorted(TRAILS.filter(t => t !== 'none')));
    expect(Object.isFrozen(EVERYTHING) && Object.isFrozen(EVERYTHING.parts)).toBe(true);
    expect(cleanOwned(EVERYTHING)).toEqual({ chars: [...EVERYTHING.chars], parts: [...EVERYTHING.parts], trails: [...EVERYTHING.trails] });
  });

  it('owns the starters, the commons and the none trail implicitly, the rest by inventory', () => {
    const none = emptyOwned();
    expect(ownsChar(none, 'victor')).toBe(true);
    expect(ownsChar(none, 'lucie')).toBe(false);
    expect(ownsChar({ chars: ['lucie'] }, 'lucie')).toBe(true);
    expect(ownsChar(null, 'lucie')).toBe(false);
    expect(ownsPart(none, 'wheels', 'classic')).toBe(true);
    expect(ownsPart(none, 'spoiler', 'standard')).toBe(true);
    expect(ownsPart(none, 'wheels', 'gold')).toBe(false);
    expect(ownsPart({ parts: ['wheels:gold'] }, 'wheels', 'gold')).toBe(true);
    expect(ownsPart(EVERYTHING, 'wheels', 'square')).toBe(false);
    expect(ownsTrail(none, 'none')).toBe(true);
    expect(ownsTrail(none, 'laser')).toBe(false);
    expect(ownsTrail({ trails: ['laser'] }, 'laser')).toBe(true);
    expect(ownsTrail(EVERYTHING, 'rainbow')).toBe(false);
    expect(ownsTrail(undefined, 'laser')).toBe(false);
  });

  it('counts the collection over paid items only; EVERYTHING is 100 %', () => {
    expect(collection(emptyOwned())).toEqual({ have: 0, total: 44, pct: 0 });
    expect(collection(null)).toEqual({ have: 0, total: 44, pct: 0 });
    expect(collection(EVERYTHING)).toEqual({ have: 44, total: 44, pct: 100 });
    const c = collection({ chars: ['lucie', 'victor', 'lucie'], parts: ['wheels:gold', 'wheels:classic'], trails: ['none', 'laser', 'junk'] });
    expect(c).toEqual({ have: 3, total: 44, pct: 7 });
    expect(Number.isInteger(c.pct)).toBe(true);
  });
});

describe('drivable candidates', () => {
  it('are the starters plus the owned ones, whatever the level', () => {
    expect(drivableIds(13, null)).toEqual([...STARTERS]);
    expect(drivableIds(1, emptyOwned())).toEqual([...STARTERS]);
    expect(drivableIds(1, { chars: ['thierry', 'thierry', 'victor', 'nobody'] })).toEqual([...STARTERS, 'thierry']);
    expect(unlockLevel('thierry')).toBeGreaterThan(1);
  });
});

describe('buying', () => {
  it('refuses a candidate for its level before its price, once known and not owned', () => {
    expect(canBuyChar('lucie', { level: 1, owned: emptyOwned(), coins: 0 })).toBe('level');
    expect(canBuyChar('lucie', { level: 2, owned: emptyOwned(), coins: 299 })).toBe('coins');
    expect(canBuyChar('lucie', { level: 2, owned: emptyOwned(), coins: 300 })).toBeNull();
    expect(canBuyChar('lucie', { level: 1, owned: { chars: ['lucie'] }, coins: 0 })).toBe('owned');
    expect(canBuyChar('victor', { level: 1, owned: emptyOwned(), coins: 0 })).toBe('owned');
    expect(canBuyChar('thierry', { level: 99, owned: null, coins: 4999 })).toBe('coins');
    expect(canBuyChar('thierry', { level: 99, owned: null, coins: 5000 })).toBeNull();
    for (const junk of ['nobody', '', null, 'constructor']) expect(canBuyChar(junk, { level: 99, coins: 1e6 })).toBe('unknown');
    expect(canBuyChar('lucie')).toBe('level');
  });

  it('refuses a part when unknown, free already, owned or too dear', () => {
    expect(canBuyPart('wheels', 'classic', { owned: emptyOwned(), coins: 0 })).toBe('common');
    expect(canBuyPart('spoiler', 'none', { coins: 1e6 })).toBe('common');
    expect(canBuyPart('wheels', 'gold', { owned: { parts: ['wheels:gold'] }, coins: 0 })).toBe('owned');
    expect(canBuyPart('wheels', 'gold', { owned: emptyOwned(), coins: 399 })).toBe('coins');
    expect(canBuyPart('wheels', 'gold', { owned: emptyOwned(), coins: 400 })).toBeNull();
    expect(canBuyPart('exhaust', 'turbine', { owned: null, coins: 1000 })).toBeNull();
    expect(canBuyPart('wheels', 'square', { coins: 1e6 })).toBe('unknown');
    expect(canBuyPart('hat', 'gold', { coins: 1e6 })).toBe('unknown');
    expect(canBuyPart('wheels', 'gold')).toBe('coins');
  });
});

describe('ownedStyle', () => {
  const full = cleanStyle({
    body: '#ff0000', accent: '#00ff00', number: 7, pods: false, wheels: 'gold', spoiler: 'wing', sticker: 'tricolore',
    exhaust: 'turbine', underglow: 'none', mast: 'pirate', nose: 'stock', skin: 'camo', trail: 'laser',
  });

  it('keeps the colours, the number, the pods and every common; drops what is not owned', () => {
    expect(ownedStyle(full, emptyOwned())).toEqual({ body: '#ff0000', accent: '#00ff00', number: 7, pods: false, sticker: 'tricolore', underglow: 'none', nose: 'stock' });
  });

  it('keeps an owned part and trail, and returns a new object either way', () => {
    const owned = { chars: [], parts: ['wheels:gold', 'exhaust:turbine'], trails: ['laser'] };
    const out = ownedStyle(full, owned);
    expect(out).toEqual({ ...full, spoiler: undefined, mast: undefined, skin: undefined });
    expect(Object.keys(out)).not.toContain('spoiler');
    expect(out.wheels).toBe('gold');
    expect(out.trail).toBe('laser');
    expect(out).not.toBe(full);
    expect(ownedStyle(full, EVERYTHING)).toEqual(full);
    expect(ownedStyle(full, EVERYTHING)).not.toBe(full);
  });

  it('passes everything through when there is no economy (owned null)', () => {
    expect(ownedStyle(full, null)).toEqual(full);
    expect(ownedStyle(full, null)).not.toBe(full);
    expect(ownedStyle({ wheels: 'gold' }, undefined)).toEqual({});
  });

  it('never throws', () => {
    for (const v of [null, undefined, 'x', 3, []]) {
      expect(ownedStyle(v, emptyOwned())).toEqual({});
      expect(ownedStyle(v, null)).toEqual({});
    }
    expect(ownedStyle({ wheels: 'gold' }, { parts: 'wheels:gold' })).toEqual({});
    expect(ownedStyle({ number: 3 }, 'junk')).toEqual({ number: 3 });
  });
});

describe('coinsForRace', () => {
  it('pays by place, the same beyond sixth, DNF a token and a team win on top', () => {
    expect([0, 1, 2, 3, 4, 5].map(rank => coinsForRace({ rank }))).toEqual([60, 45, 35, 25, 18, 12]);
    expect(coinsForRace({ rank: 7, field: 8 })).toBe(12);
    expect(coinsForRace({ rank: -3 })).toBe(60);
    expect(coinsForRace({ rank: 2, finished: false })).toBe(5);
    expect(coinsForRace({ rank: 1, teamWon: true })).toBe(45 + 20);
    expect(coinsForRace({ rank: 0, finished: false, teamWon: true })).toBe(5 + 20);
    expect(coinsForRace({})).toBe(60);
  });
});

describe('rollBox', () => {
  const none = emptyOwned();

  it('draws a candidate below the char odds, the first of the pool at 0', () => {
    const r = rollBox(seq(0.019, 0), none);
    expect(r).toEqual({ kind: 'char', id: UNLOCKS[0], grade: CHAR_GRADE[UNLOCKS[0]], duplicate: false, refund: 0 });
    expect(STARTERS).not.toContain(r.id);
    const last = rollBox(seq(0, 0.9999), none);
    expect(last.kind).toBe('char');
    expect(UNLOCKS).toContain(last.id);
  });

  it('draws a part or a trail between the char and the part odds, from one flat pool', () => {
    expect(rollBox(seq(0.02, 0), none)).toEqual({ kind: 'part', id: 'wheels:chrome', grade: 'rare', duplicate: false, refund: 0 });
    expect(rollBox(seq(0.0599, 0.9999), none)).toEqual({ kind: 'trail', id: 'laser', grade: 'incredible', duplicate: false, refund: 0 });
    const n = EVERYTHING.parts.length + EVERYTHING.trails.length;
    const ids = Array.from({ length: n }, (_, i) => rollBox(seq(0.03, (i + 0.5) / n), none));
    expect(ids.map(r => r.id)).toEqual([...EVERYTHING.parts, ...EVERYTHING.trails]);
    expect(ids.map(r => r.kind)).toEqual([...EVERYTHING.parts.map(() => 'part'), ...EVERYTHING.trails.map(() => 'trail')]);
    for (const r of ids) expect(r.grade).toBe(gradeOf(r));
  });

  it('walks the coin tiers above the part odds, each tier its share of the coins share', () => {
    // The second draw spans the 94 % of coins: a tier boundary sits at its cumulative odds / 0.94.
    const amount = draw => rollBox(seq(0.5, draw), none).amount;
    expect(rollBox(seq(0.06, 0), none)).toEqual({ kind: 'coins', amount: 5 });
    expect([0.2, 0.425].map(amount)).toEqual([5, 5]);
    expect([0.426, 0.5, 0.744].map(amount)).toEqual([10, 10, 10]);
    expect([0.745, 0.8, 0.914].map(amount)).toEqual([50, 50, 50]);
    expect([0.915, 0.95, 0.978].map(amount)).toEqual([100, 100, 100]);
    expect([0.979, 0.99, 0.9999].map(amount)).toEqual([500, 500, 500]);
    expect(rollBox(seq(0.9999, 0.9999), none)).toEqual({ kind: 'coins', amount: 500 });
  });

  it('marks a duplicate and refunds it by grade', () => {
    const owned = { chars: [UNLOCKS[0]], parts: ['wheels:chrome'], trails: ['laser'] };
    expect(rollBox(seq(0.01, 0), owned)).toMatchObject({ kind: 'char', id: UNLOCKS[0], duplicate: true, refund: REFUND[CHAR_GRADE[UNLOCKS[0]]] });
    expect(rollBox(seq(0.03, 0), owned)).toMatchObject({ kind: 'part', id: 'wheels:chrome', duplicate: true, refund: 150 });
    expect(rollBox(seq(0.03, 0.9999), owned)).toMatchObject({ kind: 'trail', id: 'laser', duplicate: true, refund: 1000 });
    expect(rollBox(seq(0.03, 0.9999), EVERYTHING)).toMatchObject({ duplicate: true, refund: 1000 });
    expect(rollBox(seq(0.03, 0), none)).toMatchObject({ duplicate: false, refund: 0 });
    expect(rollBox(seq(0.5, 0.99), EVERYTHING)).toEqual({ kind: 'coins', amount: 500 });
  });

  it('is deterministic given the rng and survives a careless source', () => {
    const a = Array.from({ length: 50 }, (_, i) => rollBox(lcg(i), none));
    const b = Array.from({ length: 50 }, (_, i) => rollBox(lcg(i), none));
    expect(a).toEqual(b);
    for (const bad of [() => NaN, () => -1, () => 1, () => 2, () => 'x', () => undefined]) {
      expect(() => rollBox(bad, none)).not.toThrow();
      expect(rollBox(bad, none)).toMatchObject({ kind: 'char', id: UNLOCKS[0] });
    }
  });

  it('lands on the odds over 10 000 seeded draws: kinds within 1 %, coin tiers within 2 % of every opening', () => {
    const rng = lcg(2026), N = 10000, kinds = { char: 0, part: 0, coins: 0 }, amounts = {};
    for (let i = 0; i < N; i++) {
      const r = rollBox(rng, none);
      if (r.kind === 'coins') { kinds.coins++; amounts[r.amount] = (amounts[r.amount] || 0) + 1; } else kinds[r.kind === 'char' ? 'char' : 'part']++;
    }
    expect(Math.abs(kinds.char / N - BOX_ODDS.char)).toBeLessThan(0.01);
    expect(Math.abs(kinds.part / N - BOX_ODDS.part)).toBeLessThan(0.01);
    expect(Math.abs(kinds.coins / N - (1 - BOX_ODDS.char - BOX_ODDS.part))).toBeLessThan(0.01);
    for (const [amount, odds] of COIN_DROPS) expect(Math.abs((amounts[amount] || 0) / N - odds)).toBeLessThan(0.02);
    expect(Object.keys(amounts).map(Number).sort((a, b) => a - b)).toEqual(COIN_DROPS.map(([a]) => a));
  });
});
