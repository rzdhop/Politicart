// A whole race through the real worker thread, stepped as fast as possible.
import { describe, expect, it } from 'vitest';

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

  it('runs to the finish when the drivers hand over to the AI, and scores the teams', async () => {
    const { room, roster, io, finished } = harness();
    const race = runRace(room, roster, io, { fast: true });
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
