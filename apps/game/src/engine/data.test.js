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
    expect(power('capucine')).toMatchObject({ id: 'deconstruction', name: 'Déconstruction' });    // Sandrine Rousseau, not a generic ZFE
    expect(power('bernadette')).toMatchObject({ id: 'chatons', name: 'Lâcher de chatons' });       // Marine Le Pen and her cats
    expect(power('patrick')).toMatchObject({ id: 'fauchage', name: 'Fauchage volontaire' });       // José Bové the GMO mower
    expect(power('martine').desc).not.toMatch(/\belle\b/);                                        // Darmanin is a man
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

  it('keeps every feature on the lap and the item rows sorted inside it', () => {
    for (const t of TRACKS) {
      for (const f of t.features) { expect(f.f).toBeGreaterThanOrEqual(0); expect(f.f).toBeLessThan(1); expect(['ramp', 'pit', 'pad', 'crossing', 'chicane']).toContain(f.t); }
      expect(t.boxRows.length).toBeGreaterThanOrEqual(8);
      expect(t.boxRows).toEqual([...t.boxRows].sort((a, b) => a - b));
      for (const r of t.boxRows) { expect(r).toBeGreaterThan(0); expect(r).toBeLessThan(1); }
      expect(new Set(t.boxRows).size).toBe(t.boxRows.length);
    }
  });

  it('cobbles only the butte, gravels only the park', () => {
    expect(TRACKS.filter(t => t.cobble).map(t => t.id)).toEqual(['montmartre']);
    expect(TRACKS.filter(t => t.gravel).map(t => t.id)).toEqual(['versailles']);
  });
});
