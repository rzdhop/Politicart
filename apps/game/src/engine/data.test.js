import { describe, expect, it } from 'vitest';

import { BASE, CHARACTERS, TRACKS } from './data.js';

// The pun-name cast (DEC-023). Ids are keys in saved data, in the e2e
// selectors, in the server's CHAR_IDS and in the unlock order, so they must
// never follow a rename.
const CAST = [
  ['victor', 'Emmanuel Macaron'],
  ['gege', 'Philippe Martini'],
  ['maurice', 'Jean Lassalle-des-Fêtes'],
  ['capucine', 'Sandrine Ruisseau'],
  ['hubert', 'Gérard L’Archiduc'],
  ['lulu', 'Jean-Luc Mélèche'],
  ['bernadette', 'Marine Le Stylo'],
  ['kevin', 'Jordan Mortadella'],
  ['odile', 'Eva Joly-Jumper'],
  ['patrick', 'José Bovin'],
  ['lucie', 'Nathalie Artichaut'],
  ['gaspard', 'Bruno Le Maigre'],
  ['jeanmi', 'Éric Zemmoule'],
  ['martine', 'Gérald Darmalin'],
  ['aymeric', 'Michel Bananier'],
  ['thierry', 'Manuel Valse'],
];

describe('the cast', () => {
  it('keeps the sixteen ids in order and carries the pun names', () => {
    expect(CHARACTERS.map(c => [c.id, c.name])).toEqual(CAST);
  });

  it('snapshots the pun names as the workshop defaults', () => {
    expect(BASE.map(b => b.name)).toEqual(CAST.map(([, name]) => name));
  });

  it('gives the retitled candidates titles that fit them', () => {
    const title = id => CHARACTERS.find(c => c.id === id).title;
    expect(title('lulu')).toBe('Le tribun de la rue');
    expect(title('bernadette')).toBe('La reine du recadrage');
    expect(title('martine')).toBe('Le ministre de l’Intérieur');
  });

  it('gives each candidate the power of the politician parodied (DEC-028)', () => {
    const power = id => CHARACTERS.find(c => c.id === id).power;
    expect(power('capucine')).toMatchObject({ id: 'deconstruction', name: 'Déconstruction' });    // the parodied ecologist's own word, not a generic ZFE
    expect(power('bernadette')).toMatchObject({ id: 'chatons', name: 'Lâcher de chatons' });       // the parodied leader and her cats
    expect(power('patrick')).toMatchObject({ id: 'fauchage', name: 'Fauchage volontaire' });       // the parodied farmer, the GMO mower
    expect(power('martine').desc).not.toMatch(/\belle\b/);                                        // the parodied minister is a man
    const ids = CHARACTERS.map(c => c.power.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps a non-empty first word for the licence plate', () => {
    for (const c of CHARACTERS) expect(c.name.split(' ')[0].length).toBeGreaterThan(0);
  });
});

// The circuits are referenced by index (saved stats, the lobby, the server's
// byTrack), so the list only ever grows at the end: stage 3a appended
// Montmartre and Marseille after the original three.
describe('the circuits', () => {
  it('lists five circuits with unique ids, the two new ones appended', () => {
    expect(TRACKS.map(t => t.id)).toEqual(['elysee', 'bourbon', 'versailles', 'montmartre', 'marseille']);
    expect(new Set(TRACKS.map(t => t.id)).size).toBe(TRACKS.length);
  });

  it('draws every loop from 13 or 14 points at scale 3', () => {
    for (const t of TRACKS) {
      expect(t.points.length).toBeGreaterThanOrEqual(13);
      expect(t.points.length).toBeLessThanOrEqual(14);
      for (const p of t.points) { expect(p).toHaveLength(2); expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true); }
      expect(t.scale).toBe(3);
      expect(t.kerb).toHaveLength(2); expect(t.sky).toHaveLength(2);
      expect(typeof t.name).toBe('string'); expect(t.desc.length).toBeGreaterThan(20);
    }
  });

  const FEATURE_TYPES = ['ramp', 'pit', 'pad', 'crossing', 'chicane', 'obstacle', 'narrow', 'bank', 'wind', 'bump'];
  const OBSTACLES = ['sedan', 'van', 'barrier', 'stall', 'bins', 'scaffold'];
  const allFeatures = t => [...t.features, ...t.variants.flatMap(v => v.features)];

  it('keeps every feature on the lap and the item rows sorted inside it', () => {
    for (const t of TRACKS) {
      for (const f of allFeatures(t)) { expect(f.f).toBeGreaterThanOrEqual(0); expect(f.f).toBeLessThan(1); expect(FEATURE_TYPES).toContain(f.t); }
      expect(t.boxRows.length).toBeGreaterThanOrEqual(8);
      expect(t.boxRows).toEqual([...t.boxRows].sort((a, b) => a - b));
      for (const r of t.boxRows) { expect(r).toBeGreaterThan(0); expect(r).toBeLessThan(1); }
      expect(new Set(t.boxRows).size).toBe(t.boxRows.length);
    }
  });

  // The layout pool (DEC-049): a fixed skeleton with the one crossing, three
  // named variants of extra features, a cyclist range above what the bike
  // lane test expects, and climates for the look stage to apply.
  it('gives each circuit three named variants in French, one crossing in the skeleton, and a cyclist range', () => {
    for (const t of TRACKS) {
      expect(t.variants).toHaveLength(3);
      for (const v of t.variants) { expect(typeof v.name).toBe('string'); expect(v.name.length).toBeGreaterThan(3); expect(v.features.length).toBeGreaterThan(0); expect(v.features.some(f => f.t === 'crossing')).toBe(false); }
      expect(new Set(t.variants.map(v => v.name)).size).toBe(3);
      expect(t.features.filter(f => f.t === 'crossing')).toHaveLength(1);
      expect(t.cyclists.min).toBeGreaterThan(8); expect(t.cyclists.max).toBeGreaterThanOrEqual(t.cyclists.min); expect(t.cyclists.max).toBeLessThanOrEqual(28);
      expect(t.climates.length).toBeGreaterThan(0); for (const c of t.climates) expect(typeof c).toBe('string');
    }
    const names = n => TRACKS.find(t => t.id === n).variants.map(v => v.name);
    expect(names('elysee')).toEqual(['Visite officielle', 'Jour de manif', 'Travaux du Faubourg']);
    expect(names('montmartre')).toEqual(['Place du Tertre', 'Fête des vendanges', 'Nuit blanche']);
  });

  it('keeps every obstacle on the road, of a known kind, and every shaping feature well formed', () => {
    for (const t of TRACKS) for (const f of allFeatures(t)) {
      if (f.t === 'obstacle') { expect(OBSTACLES).toContain(f.kind); expect(Math.abs(f.lat)).toBeLessThanOrEqual(t.roadHalfWidth - 3); }
      if (f.t === 'narrow') { expect(f.w).toBeGreaterThanOrEqual(7); expect(f.w).toBeLessThan(t.roadHalfWidth); expect(f.len).toBeGreaterThan(10); }
      if (f.t === 'bank') { expect(Math.abs(f.a)).toBeLessThanOrEqual(0.2); expect(f.len).toBeGreaterThan(10); }
      if (f.t === 'wind') { expect(Math.abs(f.push)).toBeLessThanOrEqual(5); expect(f.len).toBeGreaterThan(10); }
      if (f.t === 'bump') { expect(f.h).toBeGreaterThan(0); expect(f.h).toBeLessThanOrEqual(1); }
    }
  });

  // Relief and width (DEC-050): each circuit's own half-width, and a closed
  // elevation profile that starts at the line and stays under A-040's 25 m.
  it('gives each circuit its width and a closed elevation profile', () => {
    const widths = Object.fromEntries(TRACKS.map(t => [t.id, t.roadHalfWidth]));
    expect(widths).toEqual({ elysee: 13, bourbon: 15, versailles: 17, montmartre: 11, marseille: 14 });
    for (const t of TRACKS) {
      expect(t.profile[0]).toEqual([0, 0]);
      const fs = t.profile.map(p => p[0]);
      expect(fs).toEqual([...fs].sort((a, b) => a - b));
      expect(new Set(fs).size).toBe(fs.length);
      for (const [f, y] of t.profile) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1); expect(Number.isFinite(y)).toBe(true); expect(Math.abs(y)).toBeLessThanOrEqual(25); }
    }
    const ys = id => TRACKS.find(t => t.id === id).profile.map(p => p[1]);
    expect(Math.max(...ys('elysee'))).toBe(0);
    expect(Math.max(...ys('montmartre'))).toBe(22);
    expect(Math.max(...ys('bourbon'))).toBe(6);
    expect(Math.max(...ys('marseille'))).toBe(14);
    expect(Math.min(...ys('versailles'))).toBe(-8);
  });

  it('cobbles only the butte, gravels only the park', () => {
    expect(TRACKS.filter(t => t.cobble).map(t => t.id)).toEqual(['montmartre']);
    expect(TRACKS.filter(t => t.gravel).map(t => t.id)).toEqual(['versailles']);
  });
});
