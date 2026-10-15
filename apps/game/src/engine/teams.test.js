import { beforeEach, describe, expect, it } from 'vitest';

import { useItem } from './items.js';
import { resetMachine } from './machine.js';
import { simStep, startRace } from './race.js';
import { G } from './state.js';
import { foeAhead, isFoe, leadingFoe, placementPoints, POINTS, teamStandings } from './teams.js';

const kart = (rank, team = null, isAI = false) => ({ rank, team, isAI });

describe('isFoe', () => {
  it('in solo (no teams) every other kart is a foe', () => {
    const a = kart(0), b = kart(1);
    expect(isFoe(a, b)).toBe(true);
    expect(isFoe(a, a)).toBe(false);
  });

  it('teammates are not foes; other teams and neutral AI are', () => {
    const a = kart(0, 'bleu'), mate = kart(1, 'bleu'), red = kart(2, 'rouge'), ai = kart(3, null, true);
    expect(isFoe(a, mate)).toBe(false);
    expect(isFoe(a, red)).toBe(true);
    expect(isFoe(a, ai)).toBe(true);
    expect(isFoe(ai, a)).toBe(true);
  });
});

describe('target picking', () => {
  it('foeAhead is rank - 1 in solo, and skips a teammate in a team race', () => {
    const field = [kart(0), kart(1), kart(2), kart(3)];
    expect(foeAhead(field[3], field)).toBe(field[2]);
    expect(foeAhead(field[0], field)).toBeNull();
    const team = [kart(0, 'rouge'), kart(1, 'bleu'), kart(2, 'bleu')];
    expect(foeAhead(team[2], team)).toBe(team[0]);
  });

  it('leadingFoe is the leader, or second place for the leader', () => {
    const field = [kart(0), kart(1), kart(2)];
    expect(leadingFoe(field[2], field)).toBe(field[0]);
    expect(leadingFoe(field[0], field)).toBe(field[1]);
    const team = [kart(0, 'bleu'), kart(1, 'rouge'), kart(2, 'bleu')];
    expect(leadingFoe(team[2], team)).toBe(team[1]);
  });
});

describe('scoring', () => {
  it('awards the placement table and nothing beyond it', () => {
    expect(POINTS).toEqual([10, 8, 6, 4, 2, 1]);
    expect(placementPoints(0)).toBe(10);
    expect(placementPoints(6)).toBe(0);
  });

  it('sums each team, ignores AI, and breaks ties on the best driver', () => {
    const field = [kart(0, null, true), kart(1, 'rouge'), kart(2, 'bleu'), kart(3, 'bleu'), kart(4, 'rouge'), kart(5, null, true)];
    const [first, second] = teamStandings(field);
    // rouge: 8 + 2 = 10, bleu: 6 + 4 = 10 -> tie, rouge's best driver placed higher.
    expect(first).toMatchObject({ team: 'rouge', name: 'Rouge', points: 10, best: 1 });
    expect(second).toMatchObject({ team: 'bleu', points: 10, best: 2 });
    expect(first.drivers.map(d => d.points)).toEqual([8, 2]);
  });
});

describe('friendly fire in a live race', () => {
  beforeEach(() => { resetMachine('tracks'); G.charIdx = 0; G.trackIdx = 0; startRace(); for (let n = 0; n < 4 * 60; n++) simStep(1 / 60); });

  it('a casserolade stuns the foe beside you and spares your teammate', () => {
    const [a, mate, foe] = G.karts;
    a.team = mate.team = 'bleu'; foe.team = 'rouge';
    for (const k of [mate, foe]) { k.pos.x = a.pos.x + 3; k.pos.z = a.pos.z; k.stun = 0; k.invincible = 0; k.fly = 0; }
    a.item = 'casserolade'; a.itemRolling = 0;
    useItem(a);
    expect(foe.stun).toBeGreaterThan(0);
    expect(mate.stun).toBe(0);
  });

  it('a strike barricade dropped by a team does not block its teammates', () => {
    const [a, mate, foe] = G.karts;
    a.team = mate.team = 'bleu'; foe.team = 'rouge';
    a.item = 'greve'; a.itemRolling = 0; useItem(a);
    const h = G.hazards[G.hazards.length - 1];
    expect(h.team).toBe('bleu');
    for (const k of [mate, foe]) { k.pos.x = h.x; k.pos.z = h.z; k.stun = 0; k.hazardGrace = 0; k.invincible = 0; k.fly = 0; k.y = 0; }
    simStep(1 / 60);
    expect(mate.stun).toBe(0);
    expect(foe.stun).toBeGreaterThan(0);
  });
});
