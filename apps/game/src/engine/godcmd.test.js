// The admin's god commands (DEC-031) on a real circuit in node.
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { drain } from './events.js';
import { applyGodCommand, GOD_COMMANDS, GOD_HAZARDS, GOD_POWERS } from './godcmd.js';
import { resetMachine, transition } from './machine.js';
import { updateKart } from './physics.js';
import { joinField, startField } from './race.js';
import { G } from './state.js';

const def = id => CHARACTERS.find(c => c.id === id);
const ids = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu'];

/** Six AI karts on circuit 0, the race running, each on its own spot of lap 0. */
function race() {
  resetMachine('tracks'); G.trackIdx = 0;
  startField(ids.map(id => ({ def: def(id), isAI: true })), { seed: 1 });   // « Visite officielle »: its obstacles stand past sample 700
  transition('race'); G.countdown = 0; G.time = 10; drain();
  G.karts.forEach((k, i) => { k.idx = 100 + i * 50; k.lap = 0; k.maxLap = 0; k.progress = k.idx / G.N; k.rank = 5 - i; });
  return G.karts;
}

beforeEach(() => { race(); });

describe('god commands', () => {
  it('know their vocabulary and refuse anything else, or any command outside a race', () => {
    expect(GOD_COMMANDS).toContain('finish');
    expect(GOD_POWERS).toContain('chatons');
    expect(GOD_HAZARDS).toContain('rondpoint');
    expect(applyGodCommand({ cmd: 'nuke' })).toMatchObject({ ok: false });
    expect(applyGodCommand(null)).toMatchObject({ ok: false });
    resetMachine('title');
    expect(applyGodCommand({ cmd: 'boost', target: 0 })).toMatchObject({ ok: false, text: 'Aucune course en cours.' });
  });

  it('stun every kart but the actor and the gods, through immunity, and tell each driver', () => {
    const [actor, god, a, b] = G.karts;
    god.god = true; a.invincible = 5; a.isAI = false; b.shield = 20;
    const r = applyGodCommand({ cmd: 'stun', target: 'all', dur: 6 }, actor);
    expect(r.ok).toBe(true);
    expect(actor.stun).toBe(0); expect(god.stun).toBe(0);
    expect(a.stun).toBe(6); expect(a.invincible).toBe(0); expect(b.stun).toBe(6); expect(b.shield).toBe(0);
    expect(drain().some(e => e.to === a && /INTERVENTION DIVINE/.test(e.text))).toBe(true);
  });

  it('slow, boost and give any item to one kart', () => {
    const k = G.karts[2];
    expect(applyGodCommand({ cmd: 'slow', target: 2 }).ok).toBe(true); expect(k.slowed).toBe(5);
    expect(applyGodCommand({ cmd: 'boost', target: 2 }).ok).toBe(true); expect(k.boost).toBe(2);
    expect(applyGodCommand({ cmd: 'give', target: 2, item: 'helico' }).ok).toBe(true); expect(k.item).toBe('helico');
    expect(applyGodCommand({ cmd: 'give', target: 2, item: 'bazooka' }).ok).toBe(false);
  });

  it('fire a kart’s own power whatever its cooldown, or make it cast any power', () => {
    const k = G.karts[0]; k.powerCd = 20;
    expect(applyGodCommand({ cmd: 'fire', target: 0 }).ok).toBe(true);
    expect(k.powerUses).toBe(1);
    const before = G.hazards.length;
    expect(applyGodCommand({ cmd: 'cast', target: 0, power: 'chatons' }).ok).toBe(true);   // Macaron throws Le Stylo's kittens
    expect(G.hazards.length - before).toBe(3);
    expect(applyGodCommand({ cmd: 'cast', target: 'all', power: 'chatons' }).ok).toBe(false);
    expect(applyGodCommand({ cmd: 'cast', target: 0, power: 'laser' }).ok).toBe(false);
  });

  it('drop a hazard ahead of a kart that catches everyone, that kart included', () => {
    const before = G.hazards.length;
    expect(applyGodCommand({ cmd: 'hazard', target: 1, type: 'barricade' }).ok).toBe(true);
    const h = G.hazards.at(-1);
    expect(G.hazards.length).toBe(before + 1);
    expect(h).toMatchObject({ type: 'barricade', owner: null, team: null });
    expect(applyGodCommand({ cmd: 'hazard', target: 1, type: 'volcan' }).ok).toBe(false);
  });

  it('send a kart to the front or the back of the field, on the road and facing it', () => {
    const [last, , , , , leader] = G.karts;
    expect(applyGodCommand({ cmd: 'front', target: 0 }).ok).toBe(true);
    expect(last.progress).toBeGreaterThan(leader.progress);
    expect(last.idx).toBe(leader.idx + 10);
    expect(applyGodCommand({ cmd: 'back', target: 0 }).ok).toBe(true);
    expect(last.progress).toBeLessThan(Math.min(...G.karts.filter(k => k !== last).map(k => k.progress)));
    expect(applyGodCommand({ cmd: 'front', target: 'all' }).ok).toBe(false);
  });

  it('swap two karts, and refuse a swap with itself', () => {
    const [a, b] = G.karts; const ia = a.idx, ib = b.idx;
    expect(applyGodCommand({ cmd: 'swap', target: 0, with: 1 }).ok).toBe(true);
    expect([a.idx, b.idx]).toEqual([ib, ia]);
    expect(applyGodCommand({ cmd: 'swap', target: 0, with: 0 }).ok).toBe(false);
  });

  it('add a lap, finishing a kart that reaches the end, and change the race’s length', () => {
    const k = G.karts[3]; k.isAI = false;
    applyGodCommand({ cmd: 'lap', target: 3, delta: 1 }); applyGodCommand({ cmd: 'lap', target: 3, delta: 1 });
    expect(k.lap).toBe(2); expect(k.finished).toBe(false);
    applyGodCommand({ cmd: 'lap', target: 3, delta: 1 });
    expect(k.finished).toBe(true); expect(k.finishTime).toBe(G.time);
    expect(G.resultsAt).toBe(G.time + 5);                    // the only human is in
    applyGodCommand({ cmd: 'lap', target: 2, delta: -1 }); expect(G.karts[2].lap).toBe(0);
    expect(applyGodCommand({ cmd: 'laps', laps: 5 }).ok).toBe(true); expect(G.laps).toBe(5);
    expect(applyGodCommand({ cmd: 'laps', laps: 0 }).ok).toBe(false);
    G.karts[2].lap = 2; applyGodCommand({ cmd: 'laps', laps: 2 });
    expect(G.karts[2].finished).toBe(true);
  });

  it('make any kart a god or a mortal, and end the race, but never during the countdown', () => {
    expect(applyGodCommand({ cmd: 'god', target: 4, on: true }).ok).toBe(true); expect(G.karts[4].god).toBe(true);
    applyGodCommand({ cmd: 'god', target: 4, on: false }); expect(G.karts[4].god).toBe(false);
    expect(applyGodCommand({ cmd: 'finish' }).ok).toBe(true); expect(G.resultsAt).toBe(G.time);
    G.resultsAt = Infinity; resetMachine('countdown');
    expect(applyGodCommand({ cmd: 'finish' }).ok).toBe(false);
  });
});

describe('a kart joining the race in progress', () => {
  it('takes the next slot, a little behind the last kart still racing, and drives from there', () => {
    const last = G.karts.reduce((m, o) => (o.progress < m.progress ? o : m));
    const k = joinField({ def: def('thierry'), isAI: false, god: true });
    expect(G.karts).toHaveLength(7); expect(G.karts[6]).toBe(k);
    expect(k.god).toBe(true); expect(k.team).toBeNull();
    expect(k.idx).toBe(last.idx - 8); expect(k.lap).toBe(last.lap);
    expect(G.scene.children).toContain(k.mesh);
    k.isAI = true; for (let n = 0; n < 30; n++) updateKart(k, 1 / 60);
    expect(Number.isFinite(k.pos.x)).toBe(true);
  });
});
