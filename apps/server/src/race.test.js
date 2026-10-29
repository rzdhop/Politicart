// A whole race through the real worker thread, stepped as fast as possible.
import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '../../game/src/engine/data.js';
import { buildKart } from '../../game/src/engine/kart.js';
import { buildPilot } from '../../game/src/engine/pilot.js';
import { Room } from './lobby.js';
import { runRace } from './race.js';

function harness() {
  const room = new Room('TEST'); room.join('alice', 'Alice'); room.join('bob', 'Bob');
  room.set('bob', { team: 'rouge' }); room.trackIdx = 0;
  const sent = []; let done;
  const finished = new Promise(ok => { done = ok; });
  const io = { send: (id, m) => sent.push([id, m]), broadcast: () => {}, done: r => done(r) };
  return { room, roster: room.roster(), sent, io, finished };
}

/** Resolve once `ok()` holds, checking every 50 ms; reject after 10 s. */
async function until(ok) {
  for (let t = 0; t < 10_000; t += 50) { if (ok()) return; await new Promise(r => setTimeout(r, 50)); }
  throw new Error('condition not met within 10 s');
}

describe('a race in a worker', () => {
  it('tells each player their slot, streams snapshots, and drives their kart from their input', async () => {
    const { room, roster, sent, io } = harness();
    const race = runRace(room, roster, io, { fast: false });
    try {
      const starts = sent.filter(([, m]) => m.t === 'race');
      expect(starts.map(([id, m]) => [id, m.you])).toEqual([['alice', 4], ['bob', 5]]);
      expect(starts[0][1].roster).toHaveLength(6);
      // the race seed (DEC-049): one per race, the same to every player
      expect(Number.isInteger(starts[0][1].seed)).toBe(true);
      expect(starts[1][1].seed).toBe(starts[0][1].seed);
      race.input('alice', { c: { throttle: true } });
      race.input('bob', { c: {} });                      // idle controls, as a client sends from its first frame
      await new Promise(r => setTimeout(r, 5000));      // 3.6 s countdown, then about a second of racing
      const snaps = sent.filter(([id, m]) => id === 'alice' && m.t === 'snap').map(([, m]) => m);
      expect(snaps.length).toBeGreaterThan(60);           // ~20 Hz for 5 s
      const last = snaps.at(-1).s;
      expect(last.st).toBe('race');
      expect(last.k).toHaveLength(6);
      expect(last.k[4].s).toBeGreaterThan(5);           // alice accelerates
      expect(Math.abs(last.k[5].s)).toBeLessThan(1);    // bob never touched the throttle
      expect(snaps.some(m => m.fx.includes('go'))).toBe(true);
    } finally { race.stop(); }
  }, 15_000);

  it('holds the clock until every driver has loaded', async () => {
    const { room, roster, sent, io } = harness();
    const race = runRace(room, roster, io, { fast: false, hold: 60_000 });
    const snaps = () => sent.filter(([id, m]) => id === 'alice' && m.t === 'snap');
    try {
      race.input('alice', { c: {} });                    // alice is up, bob is still building the circuit
      await new Promise(r => setTimeout(r, 2500));
      expect(snaps()).toHaveLength(0);                   // no tick, so no snapshot
      race.input('bob', { c: {} });
      await until(() => snaps().length > 20);            // about a second of countdown
      expect(snaps().at(-1)[1].s.st).toBe('countdown');
    } finally { race.stop(); }
  }, 15_000);

  it('starts anyway once the hold runs out, so a driver who never loads cannot stall the room', async () => {
    const { room, roster, sent, io } = harness();
    const race = runRace(room, roster, io, { fast: false, hold: 1000 });
    try {
      await until(() => sent.some(([, m]) => m.t === 'snap'));   // nobody ever reported
    } finally { race.stop(); }
  }, 15_000);

  it('lets the admin join the race in progress as a god, change it, and end it (DEC-031)', async () => {
    const { room, roster, sent, io, finished } = harness();
    const race = runRace(room, roster, io, { fast: false, hold: 0 });
    try {
      race.input('alice', { c: { throttle: true } }); race.input('bob', { c: {} });
      await until(() => sent.some(([, m]) => m.t === 'snap' && m.s.st === 'race'));
      expect(race.addGod('rida', { charId: 'thierry', name: 'Rida', style: { body: '#123456' } })).toBe(true);
      expect(race.addGod('rida', { charId: 'thierry', name: 'Rida' })).toBe(false);          // already driving
      // the others build the kart, the admin gets the grid and its slot
      expect(sent.find(([id, m]) => id === 'alice' && m.t === 'kartJoin')[1]).toMatchObject({ slot: 6, entry: { charId: 'thierry', god: true, team: null } });
      const start = sent.find(([id, m]) => id === 'rida' && m.t === 'race')[1];
      expect(start.you).toBe(6); expect(start.roster).toHaveLength(7);
      expect(start.seed).toBe(sent.find(([id, m]) => id === 'alice' && m.t === 'race')[1].seed);   // the god builds the same race
      expect(race.grid).toHaveLength(7); expect(roster).toHaveLength(7);
      await until(() => sent.some(([id, m]) => id === 'rida' && m.t === 'snap' && m.s.k.length === 7));
      const snap = sent.filter(([id, m]) => id === 'rida' && m.t === 'snap').at(-1)[1].s;
      expect(snap.k[6].gd).toBe(true); expect(snap.lp).toBe(3);

      expect(await race.god({ cmd: 'stun', target: 'all', dur: 2 }, 'rida')).toMatchObject({ ok: true });
      expect(await race.god({ cmd: 'laps', laps: 5 }, 'rida')).toMatchObject({ ok: true });
      await until(() => sent.some(([id, m]) => id === 'alice' && m.t === 'snap' && m.s.lp === 5 && m.s.k[4].stun > 0));
      expect(sent.some(([id, m]) => id === 'alice' && m.t === 'snap' && m.ev.some(([, t]) => /INTERVENTION DIVINE/.test(t)))).toBe(true);
      expect(await race.god({ cmd: 'nope' }, 'rida')).toMatchObject({ ok: false });
      expect(await race.god({ cmd: 'finish' }, null)).toMatchObject({ ok: true, text: 'Course terminée.' });
      const { ranking } = await finished;
      expect(ranking).toHaveLength(7);
      expect(ranking.find(r => r.slot === 6)).toMatchObject({ name: 'Rida', god: true, points: 0 });
      expect(await race.god({ cmd: 'boost', target: 0 })).toMatchObject({ ok: false });
    } finally { race.stop(); }
  }, 20_000);

  it('runs to the finish when the drivers hand over to the AI, and scores the teams', async () => {
    const { room, roster, io, finished } = harness();
    const race = runRace(room, roster, io, { fast: true, seed: 77 });
    race.leave('alice'); race.leave('bob');
    const { ranking, teams } = await finished;
    expect(ranking.map(r => r.rank)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ranking.filter(r => !r.isAI).map(r => r.name).sort()).toEqual(['Alice', 'Bob']);
    expect(ranking.filter(r => r.isAI).every(r => r.points === 0)).toBe(true);
    expect(teams.map(t => t.team).sort()).toEqual(['bleu', 'rouge']);
    const pts = Object.fromEntries(teams.map(t => [t.team, t.points]));
    const alice = ranking.find(r => r.name === 'Alice'), bob = ranking.find(r => r.name === 'Bob');
    expect(pts.bleu).toBe(alice.points);
    expect(pts.rouge).toBe(bob.points);
  }, 60_000);
});

// The server builds every kart of a grid in its race worker (DEC-014). Its
// karts are 'headless' there (PLAN R6): the race kart's every part and the
// same userData, each mesh holding a geometry stub instead of vertices, and
// a headless race pilot. The budget (PLAN 4.2) is 5 ms for the six karts,
// drivers included. Timed as the fastest of a few runs, so a busy machine
// does not fail it.
describe('building a grid headless', () => {
  const grid = ['victor', 'patrick', 'capucine', 'martine', 'thierry', 'kevin'].map(id => CHARACTERS.find(c => c.id === id));
  const fastest = (fn, runs = 8) => { let best = Infinity; for (let r = 0; r < runs; r++) { const t = performance.now(); fn(); best = Math.min(best, performance.now() - t); } return best; };

  it('seats a headless pilot in every kart: the driver contract, no geometry', () => {
    for (const def of grid) {
      const d = buildKart(def).userData.driver;
      expect(d.userData).toMatchObject({ lod: 'headless', id: def.id, driver: d });
      let meshes = 0; d.traverse(o => { if (o.isMesh) meshes++; });
      expect(meshes).toBe(0);
    }
  });

  it('builds the six karts, drivers included, in 5 ms at most', () => {
    for (let r = 0; r < 8; r++) for (const def of grid) buildKart(def);   // a race worker's first grids pay the JIT; time the steady cost
    const drivers = fastest(() => { for (const def of grid) buildPilot(def, 'headless'); });
    const karts = fastest(() => { for (const def of grid) buildKart(def); });
    let geometries = 0; for (const def of grid) buildKart(def).traverse(o => { if (o.geometry?.isBufferGeometry) geometries++; });
    expect(geometries).toBe(0);
    expect(drivers).toBeLessThan(1);         // measured 0.1 to 0.2 ms
    expect(karts).toBeLessThanOrEqual(5);    // measured 1.8 to 2.5 ms on a 4-core box at load 10 to 11 (6.7 to 7.7 ms there with the karts' geometry; 25 to 35 with the legacy drivers)
  });
});

