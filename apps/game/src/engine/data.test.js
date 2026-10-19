import { describe, expect, it } from 'vitest';

import { BASE, CHARACTERS } from './data.js';

// The pun-name cast (DEC-015). Ids are keys in saved data, in the e2e
// selectors and in the server's CHAR_IDS, so they must never follow a rename.
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
];

describe('the cast', () => {
  it('keeps the eleven ids in order and carries the pun names', () => {
    expect(CHARACTERS.map(c => [c.id, c.name])).toEqual(CAST);
  });

  it('snapshots the pun names as the workshop defaults', () => {
    expect(BASE.map(b => b.name)).toEqual(CAST.map(([, name]) => name));
  });

  it('gives the retitled candidates titles that fit them', () => {
    const title = id => CHARACTERS.find(c => c.id === id).title;
    expect(title('lulu')).toBe('Le tribun de la rue');
    expect(title('bernadette')).toBe('La reine du recadrage');
  });

  it('keeps a non-empty first word for the licence plate', () => {
    for (const c of CHARACTERS) expect(c.name.split(' ')[0].length).toBeGreaterThan(0);
  });
});
