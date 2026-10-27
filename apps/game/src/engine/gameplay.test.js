// Kart contact, spin-outs, and the items and powers added with the five new
// candidates, checked on a real circuit in node.
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { drain } from './events.js';
import { stunKart, updateProjectiles, useItem } from './items.js';
import { resetMachine, transition } from './machine.js';
import { BUMP_TIME, DIRECTIVE_CAP, kartCollisions, updateKart } from './physics.js';
import { GOD_COOLDOWN, usePower } from './powers.js';
import { isFoe } from './teams.js';
import { startField } from './race.js';
import { G } from './state.js';

const STEP = 1 / 60;
const def = id => CHARACTERS.find(c => c.id === id);
const ids = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu'];

/** A grid of AI karts on circuit 0 with the race running; `swap` replaces candidates by id. */
function race(swap = {}) {
  resetMachine('tracks'); G.trackIdx = 0;
  startField(ids.map(id => ({ def: def(swap[id] ?? id), isAI: true })));
  transition('race'); G.countdown = 0; drain();
  for (const k of G.karts) k.powerCd = 0;     // powers ready
  return G.karts;
}
/** Put kart k at sample i, lateral offset lat, facing down the road at speed v. */
function place(k, i, lat, v) {
  const s = G.samples[i]; k.idx = i; k.pos.x = s.x + s.sx * lat; k.pos.z = s.z + s.sz * lat; k.heading = Math.atan2(s.tx, s.tz); k.speed = v;
}
const roadDot = k => { const s = G.samples[k.idx]; return Math.sin(k.heading) * s.tx + Math.cos(k.heading) * s.tz; };

describe('kart contact', () => {
  beforeEach(() => race());

  it('bumps once per contact, shoves the karts apart and costs little speed door to door', () => {
    const [a, b] = G.karts;
    place(a, 100, -1.1, 40); place(b, 100, 1.1, 40);
    for (let n = 0; n < 20; n++) kartCollisions();     // twenty frames of overlap, one bump
    expect(a.bump).toBe(BUMP_TIME); expect(b.bump).toBe(BUMP_TIME);
    expect(a.speed).toBeGreaterThan(40 * 0.95); expect(b.speed).toBeGreaterThan(40 * 0.95);
    // the shove points each kart away from the other
    const nx = b.pos.x - a.pos.x, nz = b.pos.z - a.pos.z;
    expect(a.kx * nx + a.kz * nz).toBeLessThan(0); expect(b.kx * nx + b.kz * nz).toBeGreaterThan(0);
  });

  it('costs more when ramming the kart in front, and the lighter kart loses more', () => {
    const [a, b] = G.karts;                         // victor (1.0) rams gege (1.35) from behind
    place(a, 100, 0, 40); place(b, 101, 0, 10);
    const sa = a.speed; kartCollisions();
    const lossA = 1 - a.speed / sa;
    expect(lossA).toBeGreaterThan(0.05); expect(lossA).toBeLessThan(0.13);
  });

  it('lets the shove die out within a second', () => {
    const [a, b] = G.karts;
    place(a, 100, -1.1, 30); place(b, 100, 1.1, 30); kartCollisions();
    for (let n = 0; n < 60; n++) updateKart(a, STEP);
    expect(Math.abs(a.kx) + Math.abs(a.kz)).toBeLessThan(0.1);
  });
});

describe('spin-outs', () => {
  beforeEach(() => race());

  it('come out facing down the road', () => {
    const k = G.karts[0]; place(k, 200, 0, 30);
    expect(stunKart(k, 1.5)).toBe(true);
    for (let n = 0; n < 1.6 * 60; n++) updateKart(k, STEP);
    expect(k.stun).toBe(0);
    expect(roadDot(k)).toBeGreaterThan(0.95);
  });

  it('face the road again when an item cuts the stun short', () => {
    const k = G.karts[0]; place(k, 200, 0, 30); stunKart(k, 2);
    for (let n = 0; n < 20; n++) updateKart(k, STEP);   // mid-spin
    k.item = 'immunite'; k.itemRolling = 0; useItem(k);
    expect(k.stun).toBe(0); expect(roadDot(k)).toBeGreaterThan(0.99);
  });
});

describe('new items', () => {
  beforeEach(() => race());

  it('Langue de bois absorbs exactly one hit', () => {
    const k = G.karts[0]; k.item = 'langue'; k.itemRolling = 0; useItem(k);
    expect(stunKart(k, 1)).toBe(false); expect(k.shield).toBe(0);
    expect(stunKart(k, 1)).toBe(true);
  });

  it('Fact-checking goes through immunity', () => {
    const [k, t] = G.karts; place(k, 100, 0, 0); place(t, 104, 0, 0); k.rank = 1; t.rank = 0; t.invincible = 6;
    k.item = 'factcheck'; k.itemRolling = 0; useItem(k);
    for (let n = 0; n < 30 && t.stun === 0; n++) updateProjectiles(STEP);
    expect(t.stun).toBeGreaterThan(0); expect(t.invincible).toBe(0);
  });

  it('Cumul des mandats uses two other items at once', () => {
    const k = G.karts[0]; k.isAI = false; k.item = 'cumul'; k.itemRolling = 0; useItem(k);
    expect(k.item).toBe(null);
    const texts = drain().map(e => e.text).filter(Boolean);
    expect(texts.some(t => /^CUMUL DES MANDATS : .+ \+ .+/.test(t))).toBe(true);
    expect(texts.some(t => /CUMUL DES MANDATS.*CUMUL DES MANDATS/.test(t))).toBe(false);
  });

  it('Pantouflage jumps the kart down the road, facing forward', () => {
    const k = G.karts[0]; place(k, 300, 0, 10); const p0 = k.progress;
    k.item = 'pantouflage'; k.itemRolling = 0; useItem(k);
    expect(k.idx).toBeGreaterThan(320); expect(k.progress).toBeGreaterThan(p0); expect(roadDot(k)).toBeGreaterThan(0.99);
  });

  it('Pantouflage across the line counts the lap', () => {
    const k = G.karts[0]; place(k, G.N - 10, 0, 10); k.lap = 0; k.maxLap = 0;
    k.item = 'pantouflage'; k.itemRolling = 0; useItem(k);
    expect(k.lap).toBe(1); expect(k.idx).toBeLessThan(40);
  });
});

describe('new powers', () => {
  it('Directive européenne caps every opponent at 110 km/h, not the lobbyist', () => {
    race({ victor: 'aymeric' }); const [k, o] = G.karts;
    usePower(k);
    expect(o.capped).toBe(3); expect(k.capped).toBe(0);
    place(o, 100, 0, 60); for (let n = 0; n < 120; n++) updateKart(o, STEP);
    expect(o.speed).toBeLessThan(DIRECTIVE_CAP + 0.5);   // eased down to the cap, not snapped
  });

  it('Coup de rabot slows every opponent for 4 s', () => {
    race({ victor: 'gaspard' }); const [k, o] = G.karts;
    usePower(k); expect(o.rabot).toBe(4); expect(k.rabot).toBe(0);
  });

  it('Fake news lays a row of fake urns ahead that its author drives through', () => {
    race({ victor: 'jeanmi' }); const k = G.karts[0];
    const before = G.hazards.length; usePower(k);
    const fakes = G.hazards.slice(before);
    expect(fakes).toHaveLength(3); expect(fakes.every(h => h.type === 'fakebox' && h.owner === k)).toBe(true);
  });

  it('Contrôle d’identité stops the two karts just behind', () => {
    race({ victor: 'martine' }); const [k, a, b, c] = G.karts;
    k.rank = 0; a.rank = 1; b.rank = 2; c.rank = 3; usePower(k);
    expect(a.stun).toBeGreaterThan(0); expect(b.stun).toBeGreaterThan(0); expect(c.stun).toBe(0);
  });

  it('Ralliement copies the power of the kart ahead', () => {
    race({ victor: 'thierry', gege: 'aymeric' }); const [k, ahead, other] = G.karts;
    k.rank = 2; ahead.rank = 1; other.rank = 0; usePower(k);
    expect(other.capped).toBe(3);                    // Aymeric's directive, played by Thierry
  });

  it('Ralliement in the lead boosts instead', () => {
    race({ victor: 'thierry' }); const k = G.karts[0];
    G.karts.forEach((o, i) => { o.rank = i; }); usePower(k);
    expect(k.boost).toBeGreaterThan(1);
  });
});

describe('BRAV-M and who hears about it', () => {
  beforeEach(() => race());

  it('always sends two bikes, one on each side, even with a single kart ahead', () => {
    const [a, b] = G.karts;
    for (const k of G.karts) k.finished = true;
    a.finished = false; b.finished = false; a.rank = 0; b.rank = 1;
    place(a, 200, 0, 30); place(b, 150, 0, 30);
    G.projectiles = []; b.item = 'bravm'; b.itemRolling = 0; useItem(b);
    const bikes = G.projectiles.filter(p => p.type === 'bravm');
    expect(bikes).toHaveLength(2);
    expect(bikes.every(p => p.target === a)).toBe(true);
    const s = G.samples[b.idx]; const lat = p => (p.x - b.pos.x) * s.sx + (p.z - b.pos.z) * s.sz;
    expect(Math.sign(lat(bikes[0]))).toBe(-Math.sign(lat(bikes[1])));
  });

  it('tells only the driver hit, not the bystanders', () => {
    const [a, b, c] = G.karts;
    for (const k of [a, b, c]) k.isAI = false;
    place(a, 200, 0, 30); place(b, 205, 0, 30); place(c, 600, 0, 30);   // c is far away
    a.item = 'casserolade'; a.itemRolling = 0; useItem(a);
    const events = drain().filter(e => e.type === 'toast');
    const readers = k => events.filter(e => (!e.to || e.to === k) && e.except !== k);
    expect(readers(b).length).toBeGreaterThan(0);
    expect(readers(c)).toHaveLength(0);
  });
});

describe('the retuned powers (DEC-028)', () => {
  it('Déconstruction strips the nearby karts of what props them up and slows them', () => {
    race({ victor: 'capucine' }); const [k, near, far] = G.karts;
    place(k, 100, 0, 30); place(near, 110, 2, 40); place(far, 400, 0, 40);
    near.boost = 1.5; near.invincible = 4; near.shield = 10; near.item = 'turbo'; near.fly = 2; far.boost = 1.5; far.item = 'turbo';
    usePower(k);
    expect(near).toMatchObject({ boost: 0, invincible: 0, shield: 0, item: null, fly: 0 }); expect(near.slowed).toBe(2);
    expect(far.boost).toBe(1.5); expect(far.item).toBe('turbo');     // out of range
    expect(k.boost).toBeGreaterThan(0);
  });

  it('Déconstruction with nobody in range is a boost', () => {
    race({ victor: 'capucine' }); const k = G.karts[0];
    G.karts.forEach((o, i) => place(o, 100 + i * 300, 0, 30));
    usePower(k); expect(k.boost).toBe(1.4);
  });

  it('Lâcher de chatons drops kittens behind that make a kart brake and swerve without stunning it', () => {
    race({ victor: 'bernadette' }); const [k, o] = G.karts; place(k, 300, 0, 30);
    const before = G.hazards.length; usePower(k);
    const kittens = G.hazards.slice(before);
    expect(kittens).toHaveLength(3); expect(kittens.every(h => h.type === 'chatons' && h.owner === k && h.stun === 0)).toBe(true);
    o.isAI = false; o.pos.x = kittens[0].x; o.pos.z = kittens[0].z; o.speed = 40; o.hazardGrace = 0; drain();
    updateProjectiles(STEP);
    expect(o.stun).toBe(0); expect(o.speed).toBeLessThan(15); expect(o.confused).toBeGreaterThan(1);
    expect(G.hazards).toContain(kittens[0]);                          // the kittens stay on the road
    expect(drain().some(e => e.to === o && /CHATONS/.test(e.text))).toBe(true);
  });

  it('Fauchage volontaire mows the hazards and the karts in the swath ahead, and nothing behind', () => {
    race({ victor: 'patrick' }); const [k, ahead, behind] = G.karts;
    place(k, 100, 0, 30); place(ahead, 120, 3, 30); place(behind, 80, 0, 30);
    const s1 = G.samples[115], s2 = G.samples[90];
    G.hazards = []; k.item = null;
    k.item = 'greve'; k.itemRolling = 0; useItem(k); G.hazards[0].x = s1.x; G.hazards[0].z = s1.z;
    behind.item = 'greve'; behind.itemRolling = 0; useItem(behind); G.hazards[1].x = s2.x; G.hazards[1].z = s2.z;
    usePower(k);
    expect(G.hazards).toHaveLength(1); expect(G.hazards[0].x).toBe(s2.x);
    expect(ahead.stun).toBeGreaterThan(0); expect(behind.stun).toBe(0);
  });

  it('Fauchage volontaire with nothing to mow is a boost', () => {
    race({ victor: 'patrick' }); const k = G.karts[0];
    G.karts.forEach((o, i) => place(o, 100 + i * 300, 0, 30)); G.hazards = [];
    usePower(k); expect(k.boost).toBe(1.4);
  });
});

describe('what reaches a driver (DEC-029)', () => {
  beforeEach(() => race());

  it('does not warn the target of a Motion de censure until it lands', () => {
    const [a, b] = G.karts; a.isAI = false; b.isAI = false; a.rank = 1; b.rank = 0;
    place(a, 100, 0, 30); place(b, 104, 0, 30); drain();
    a.item = 'motion'; a.itemRolling = 0; useItem(a);
    expect(drain().filter(e => e.to === b)).toHaveLength(0);
    for (let n = 0; n < 60 && b.stun === 0; n++) updateProjectiles(STEP);
    expect(b.stun).toBeGreaterThan(0);
    expect(drain().some(e => e.to === b && /RENVERSÉ/.test(e.text))).toBe(true);
  });

  it('tells nothing to a driver who has finished, even for a field-wide power', () => {
    race({ victor: 'gaspard' }); const [k, done, racing] = G.karts;
    done.isAI = false; racing.isAI = false; done.finished = true; drain();
    usePower(k);
    const texts = drain();
    expect(texts.some(e => e.to === racing)).toBe(true);
    expect(texts.some(e => e.to === done)).toBe(false);
    expect(done.rabot).toBe(0);
  });

  it('plays a power’s sound for its user and the karts it hit, never race-wide', async () => {
    const { setSfxSink } = await import('./audio.js');
    const heard = []; setSfxSink((name, k) => heard.push(k));
    try {
      race({ victor: 'lulu' }); const [k, o, far] = G.karts; place(k, 100, 0, 30); place(o, 103, 0, 30); place(far, 600, 0, 30);
      for (const x of [k, o, far]) x.isAI = false;
      usePower(k);
      expect(heard).toContain(k); expect(heard).toContain(o);
      expect(heard).not.toContain(far); expect(heard).not.toContain(null);
    } finally { setSfxSink(null); }
  });
});

describe('the god kart (DEC-030)', () => {
  function godRace() {
    resetMachine('tracks'); G.trackIdx = 0;
    startField([{ def: def('victor'), isAI: true }, { def: def('gege'), isAI: true }, { def: def('lulu'), isAI: false, god: true, local: true }]);
    transition('race'); G.countdown = 0; drain();
    for (const k of G.karts) k.powerCd = 0;
    return G.karts;
  }

  it('is never stunned, slowed or caught by a hazard, and shrugs debuffs off', () => {
    const [a, , g] = godRace(); expect(g.god).toBe(true);
    expect(stunKart(g, 2)).toBe(false); expect(g.stun).toBe(0);
    g.slowed = 3; g.confused = 2; g.capped = 3; updateKart(g, STEP);
    expect(g.slowed).toBe(0); expect(g.confused).toBe(0); expect(g.capped).toBe(0);
    place(a, 100, 0, 30); a.item = 'greve'; a.itemRolling = 0; useItem(a);
    const h = G.hazards.at(-1); g.pos.x = h.x; g.pos.z = h.z; g.hazardGrace = 0; updateProjectiles(STEP);
    expect(g.stun).toBe(0); expect(G.hazards).toContain(h);
  });

  it('pays only a token cooldown and always has an item on the way', () => {
    const [, , g] = godRace(); place(g, 100, 0, 30);
    usePower(g); expect(g.powerCd).toBe(GOD_COOLDOWN); expect(g.powerUses).toBe(1);
    g.item = null; g.pendingItem = null; g.itemRolling = 0; updateKart(g, STEP);
    expect(g.pendingItem).not.toBeNull(); expect(g.itemRolling).toBeGreaterThan(0);
  });

  it('is everyone’s foe and does not hold the results back', () => {
    const [a, b, g] = godRace();
    expect(isFoe(g, a)).toBe(true); expect(isFoe(a, g)).toBe(true);
    a.isAI = false; a.lap = 2; a.maxLap = 2; place(a, G.N - 5, 0, 30); G.time = 100;
    for (let n = 0; n < 30 && !a.finished; n++) updateKart(a, STEP);
    expect(a.finished).toBe(true); expect(G.resultsAt).toBe(G.time + 5);   // the god still racing does not matter
    expect(b.finished).toBe(false);
  });
});
