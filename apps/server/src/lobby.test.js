import { describe, expect, it } from 'vitest';

import { cleanName, MAX_PLAYERS, newCode, Room } from './lobby.js';

describe('names and codes', () => {
  it('trims, caps and strips markup from names', () => {
    expect(cleanName('  Jean-Mi  ')).toBe('Jean-Mi');
    expect(cleanName('<b>x</b>')).toBe('bx/b');
    expect(cleanName('a'.repeat(40))).toHaveLength(16);
    expect(cleanName('   ')).toBe('Député·e');
  });

  it('makes four-letter codes without I or O, avoiding taken ones', () => {
    const seq = [0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99]; let i = 0;
    const code = newCode(new Set(['AAAA']), () => seq[i++]);
    expect(code).toBe('ZZZZ');
    expect(newCode(new Set())).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });
});

describe('a god in a room (DEC-030)', () => {
  it('seats the admin beyond the six, on no team, with every candidate open, once', () => {
    const r = new Room('ABCD');
    for (let i = 0; i < MAX_PLAYERS; i++) r.join('p' + i, 'P' + i, { userId: 'u' + i, level: 13 });
    expect(r.join('x', 'X')).toMatch(/complète/);
    const g = r.joinGod('god', 'Rida', { userId: 'admin', level: 1 });
    expect(g).toMatchObject({ god: true, team: null, allowed: expect.arrayContaining(['thierry']) });
    expect(r.players).toHaveLength(MAX_PLAYERS + 1);
    expect(r.joinGod('god2', 'Zeus')).toMatch(/déjà/);
    expect(r.set('god', { team: 'bleu' })).toMatch(/dieu/);
    expect(r.set('god', { charId: 'thierry' })).toBeNull();                 // locked for a level-1 mortal, open to a god
    expect(r.view().players.find(p => p.id === 'god')).toMatchObject({ god: true, team: null });
    expect(r.view().players.find(p => p.id === 'p0').god).toBe(false);
  });

  it('keeps the grid at six karts around the god, who is flagged in the roster and may enter mid-race', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.join('b', 'B');
    r.phase = 'race';
    expect(r.join('c', 'C')).toMatch(/commencé/);
    expect(r.joinGod('god', 'Rida')).toMatchObject({ god: true });
    r.phase = 'lobby';
    const roster = r.roster(() => 0.5);
    expect(roster).toHaveLength(MAX_PLAYERS + 1);
    expect(roster.filter(s => s.isAI)).toHaveLength(4);
    expect(roster.find(s => s.playerId === 'god')).toMatchObject({ god: true, team: null, isAI: false });
    expect(roster.filter(s => s.god)).toHaveLength(1);
  });
});

describe('a room', () => {
  it('makes the first player host and balances teams as people join', () => {
    const r = new Room('ABCD');
    const a = r.join('a', 'Alice'), b = r.join('b', 'Bob'), c = r.join('c', 'Chloé');
    expect(r.host).toBe('a');
    expect([a.team, b.team, c.team]).toEqual(['bleu', 'rouge', 'bleu']);
    expect(new Set([a.charId, b.charId, c.charId]).size).toBe(3);
  });

  it('refuses a seventh player and a taken candidate', () => {
    const r = new Room('ABCD');
    for (let i = 0; i < MAX_PLAYERS; i++) r.join('p' + i, 'P' + i, { userId: 'u' + i, level: 13 });
    expect(r.join('x', 'X')).toMatch(/complète/);
    expect(r.set('p1', { charId: r.player('p0').charId })).toMatch(/déjà pris/);
    expect(r.set('p1', { team: 'vert' })).toMatch(/inconnue/);
    expect(r.set('p1', { team: 'bleu' })).toBeNull();
  });

  it('lets only the host pick the circuit and start, once everyone else is ready', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.join('b', 'B');
    expect(r.setTrack('b', 1)).toMatch(/hôte/);
    expect(r.setTrack('a', 9)).toMatch(/inconnu/);
    expect(r.setTrack('a', 2)).toBeNull();
    expect(r.cannotStart('b')).toMatch(/hôte/);
    expect(r.cannotStart('a')).toMatch(/prêt/);
    r.set('b', { ready: true });
    expect(r.cannotStart('a')).toBeNull();
  });

  it('hands the host role on when the host leaves', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.join('b', 'B');
    r.leave('a');
    expect(r.host).toBe('b');
    r.leave('b');
    expect(r.empty).toBe(true);
  });

  it('fills the grid to six with AI candidates nobody picked, humans last', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.join('b', 'B');
    const grid = r.roster();
    expect(grid).toHaveLength(6);
    expect(grid.filter(s => s.isAI)).toHaveLength(4);
    expect(grid.slice(4).map(s => s.playerId)).toEqual(['a', 'b']);
    expect(new Set(grid.map(s => s.charId)).size).toBe(6);
    expect(grid.filter(s => s.isAI).every(s => s.team === null)).toBe(true);
  });

  it('gives guests the four starters only, and accounts what their level unlocked', () => {
    const r = new Room('ABCD');
    for (let i = 0; i < 4; i++) expect(typeof r.join('g' + i, 'G' + i)).toBe('object');
    expect(r.join('g5', 'G5')).toMatch(/Plus aucun candidat/);
    expect(new Set(r.players.map(p => p.charId))).toEqual(new Set(['victor', 'gege', 'maurice', 'capucine']));
    const a = r.join('a', 'A', { userId: 'ua', level: 3 });
    expect(a.charId).toBe('lucie');
    expect(r.set('a', { charId: 'patrick' })).toBeNull();
    expect(r.set('a', { charId: 'bernadette' })).toMatch(/débloqué/);
    r.setLevel('a', 4);
    expect(r.set('a', { charId: 'bernadette' })).toBeNull();
    expect(r.view().players.at(-1)).toMatchObject({ guest: false, level: 4 });
    expect(r.view().players[0].guest).toBe(true);
  });

  it('resets readiness after a race', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.set('a', { ready: true }); r.phase = 'race';
    expect(r.join('b', 'B')).toMatch(/commencé/);
    r.endRace();
    expect(r.phase).toBe('lobby');
    expect(r.player('a').ready).toBe(false);
  });

  it("keeps each player's kart style cleaned, in the view and on the grid, never for AI", () => {
    const r = new Room('ABCD');
    r.join('a', 'A', {}, { wheels: 'gold', number: 7, body: '#ABCDEF', junk: 1, __proto__: { sticker: 'rosette' } });
    r.join('b', 'B');
    expect(r.player('a').style).toEqual({ wheels: 'gold', number: 7, body: '#abcdef' });
    expect(r.player('b').style).toEqual({});
    expect(r.set('a', { style: { spoiler: 'wing', number: 500 } })).toBeNull();
    expect(r.player('a').style).toEqual({ spoiler: 'wing' });
    expect(r.set('b', { style: 'nope' })).toBeNull();
    expect(r.player('b').style).toEqual({});
    const view = r.view();
    expect(view.players[0].style).toEqual({ spoiler: 'wing' });
    view.players[0].style.spoiler = 'none';
    expect(r.player('a').style.spoiler).toBe('wing');
    const grid = r.roster();
    expect(grid.find(s => s.playerId === 'a').style).toEqual({ spoiler: 'wing' });
    expect(grid.filter(s => s.isAI).every(s => s.style === undefined)).toBe(true);
  });
});
