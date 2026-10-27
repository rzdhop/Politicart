import { describe, expect, it } from 'vitest';

import { EVERYTHING } from '../../game/src/engine/catalog.js';
import { cleanName, MAX_PLAYERS, newCode, Room } from './lobby.js';

// Six accounts that own enough candidates for a full room (DEC-034: the level alone unlocks nothing).
const RICH = { chars: ['lucie', 'patrick', 'bernadette', 'kevin'], parts: [], trails: [] };

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
    for (let i = 0; i < MAX_PLAYERS; i++) r.join('p' + i, 'P' + i, { userId: 'u' + i, level: 13, owned: RICH });
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

  it('lets the admin pick the circuit and move or recast anyone, whatever they unlocked (DEC-031)', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.join('b', 'B'); r.joinGod('god', 'Rida');
    expect(r.setTrack('b', 2)).toMatch(/hôte/);
    expect(r.forceTrack(2)).toBeNull(); expect(r.trackIdx).toBe(2);
    expect(r.forceTrack(99)).toMatch(/inconnu/);
    expect(r.force('a', { team: 'rouge', charId: 'thierry' })).toBeNull();               // a guest, given a level-13 candidate
    expect(r.player('a')).toMatchObject({ team: 'rouge', charId: 'thierry' });
    expect(r.force('b', { charId: 'thierry' })).toMatch(/déjà pris/);
    expect(r.force('god', { team: 'bleu' })).toMatch(/dieu/);
    expect(r.force('zz', {})).toMatch(/inconnu/);
    r.phase = 'race';
    expect(r.forceTrack(0)).toMatch(/commencé/); expect(r.force('a', { team: 'bleu' })).toMatch(/commencé/);
  });

  it('seats a god mid-race on a candidate the race does not already drive', () => {
    const r = new Room('ABCD'); r.join('a', 'A'); r.phase = 'race';
    const all = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu', 'bernadette', 'kevin', 'odile', 'patrick', 'lucie', 'gaspard', 'jeanmi', 'martine', 'aymeric'];
    expect(r.joinGod('god', 'Rida', {}, undefined, all).charId).toBe('thierry');
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
    for (let i = 0; i < MAX_PLAYERS; i++) r.join('p' + i, 'P' + i, { userId: 'u' + i, level: 13, owned: RICH });
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

  it('gives guests the four starters only, and accounts the starters plus what they own (DEC-034)', () => {
    const r = new Room('ABCD');
    for (let i = 0; i < 4; i++) expect(typeof r.join('g' + i, 'G' + i)).toBe('object');
    expect(r.join('g5', 'G5')).toMatch(/Plus aucun candidat/);
    expect(new Set(r.players.map(p => p.charId))).toEqual(new Set(['victor', 'gege', 'maurice', 'capucine']));
    expect(r.join('x', 'X', { userId: 'ux', level: 13 })).toMatch(/Plus aucun candidat/);    // a level owns nothing by itself
    const a = r.join('a', 'A', { userId: 'ua', level: 3, owned: { chars: ['lucie', 'patrick'], parts: [], trails: [] } });
    expect(a.charId).toBe('lucie');
    expect(r.set('a', { charId: 'patrick' })).toBeNull();
    expect(r.set('a', { charId: 'bernadette' })).toMatch(/débloqué/);
    r.setProfile('a', { level: 3, owned: { chars: ['lucie', 'patrick', 'thierry'], parts: [], trails: [] } });   // bought mid-lobby, below its level
    expect(r.set('a', { charId: 'thierry' })).toBeNull();
    r.setProfile('a', { level: 4, owned: { chars: ['bernadette'], parts: [], trails: [] } });
    expect(r.set('a', { charId: 'bernadette' })).toBeNull();
    expect(r.view().players.at(-1)).toMatchObject({ guest: false, level: 4 });
    expect(r.view().players[0].guest).toBe(true);
    r.setProfile('g0', { level: 9, owned: EVERYTHING });                                    // a guest has no profile to change
    expect(r.set('g0', { charId: 'hubert' })).toMatch(/invité/);
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
    r.join('a', 'A', { userId: 'ua', level: 1, owned: { chars: [], parts: ['wheels:gold', 'spoiler:wing', 'sticker:rosette'], trails: [] } }, { wheels: 'gold', number: 7, body: '#ABCDEF', junk: 1, __proto__: { sticker: 'rosette' } });
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

describe('ownership on the wire (DEC-035)', () => {
  const style = { wheels: 'gold', spoiler: 'standard', trail: 'laser', exhaust: 'turbine', body: '#123456', number: 9 };

  it('drops from a guest every part and trail beyond the commons, keeping colours and the number', () => {
    const r = new Room('ABCD');
    r.join('g', 'G', {}, style);
    expect(r.player('g').style).toEqual({ spoiler: 'standard', body: '#123456', number: 9 });
    r.join('h', 'H', { owned: EVERYTHING }, style);                                         // no account: an inventory is ignored
    expect(r.player('h').style).not.toHaveProperty('wheels');
    expect(r.set('g', { style: { wheels: 'gold', underglow: 'rainbow', wheels2: 1 } })).toBeNull();
    expect(r.player('g').style).toEqual({});
  });

  it('keeps for an account what it owns, a trail included, and nothing else', () => {
    const r = new Room('ABCD');
    r.join('a', 'A', { userId: 'ua', level: 1, owned: { chars: [], parts: ['wheels:gold'], trails: ['laser'] } }, style);
    expect(r.player('a').style).toEqual({ wheels: 'gold', spoiler: 'standard', trail: 'laser', body: '#123456', number: 9 });
    r.join('b', 'B', { userId: 'ub', level: 1 }, style);                                     // no inventory read: the commons
    expect(r.player('b').style).toEqual({ spoiler: 'standard', body: '#123456', number: 9 });
    // a purchase mid-lobby: the next style it sends keeps the new part
    r.setProfile('b', { level: 1, owned: { chars: [], parts: ['exhaust:turbine'], trails: [] } });
    expect(r.set('b', { style })).toBeNull();
    expect(r.player('b').style).toEqual({ spoiler: 'standard', exhaust: 'turbine', body: '#123456', number: 9 });
  });

  it('lets the admin, who owns everything, keep every field, as a player or as a god', () => {
    const r = new Room('ABCD');
    r.join('a', 'Rida', { userId: 'admin', level: 1, owned: EVERYTHING }, style);
    expect(r.player('a').style).toEqual({ ...style });
    expect(r.player('a').allowed).toContain('thierry');
    const s = new Room('EFGH');
    s.joinGod('god', 'Rida', { userId: 'admin', level: 1, owned: EVERYTHING }, style);
    expect(s.player('god').style).toEqual({ ...style });
    s.joinGod('god2', 'Zeus', {}, style);                                                   // refused anyway: one god per room
    const t = new Room('IJKL');
    t.joinGod('god', 'Rida', { userId: 'admin', level: 1 }, style);                          // a god the server gave no inventory owns the commons
    expect(t.player('god').style).not.toHaveProperty('trail');
    t.setProfile('god', { level: 2, owned: { chars: [], parts: [], trails: [] } });
    expect(t.player('god').allowed).toContain('thierry');                                   // a god keeps every candidate
  });

  it('never shows an inventory or the allowed list in the view', () => {
    const r = new Room('ABCD');
    r.join('a', 'A', { userId: 'ua', level: 1, owned: EVERYTHING });
    const p = r.view().players[0];
    expect(p).not.toHaveProperty('owned');
    expect(p).not.toHaveProperty('allowed');
    expect(Object.keys(p).sort()).toEqual(['charId', 'god', 'guest', 'id', 'level', 'name', 'ready', 'style', 'team', 'userId']);
  });
});
