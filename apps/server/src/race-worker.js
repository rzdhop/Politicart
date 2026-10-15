// One race, stepped headless in its own worker thread (DEC-014).
//
// The engine keeps its state in module singletons (G, the state machine, the
// event queue), so each race gets its own thread and therefore its own copy
// of every module. The thread steps the simulation at a fixed 60 Hz, applies
// each driver's latest controls, and every third tick (20 Hz) posts a
// snapshot plus, per human slot, the messages and sounds addressed to them.
//
// workerData: { trackIdx, roster: [{ charId, team, isAI, name }], fast }
//   fast: step as fast as possible instead of in real time (tests only).
// In:  { t: 'input', slot, c: {throttle,brake,left,right,drift}, item, power }
//      { t: 'leave', slot }      the driver left; an AI takes the wheel
//      { t: 'stop' }
// Out: { t: 'snap', s, per: { [slot]: { ev: [[type, text]], fx: [name] } }, fx: [name] }
//      { t: 'done', ranking, teams }
import { parentPort, workerData } from 'node:worker_threads';

import { setSfxSink } from '../../game/src/engine/audio.js';
import { CHARACTERS } from '../../game/src/engine/data.js';
import { drain, resolveFor } from '../../game/src/engine/events.js';
import { useItem } from '../../game/src/engine/items.js';
import { getState, resetMachine } from '../../game/src/engine/machine.js';
import { encodeSnapshot } from '../../game/src/engine/netstate.js';
import { usePower } from '../../game/src/engine/powers.js';
import { endRace, raceOver, simStep, startField } from '../../game/src/engine/race.js';
import { G } from '../../game/src/engine/state.js';
import { placementPoints, teamStandings } from '../../game/src/engine/teams.js';

const STEP = 1 / 60;
const SNAP_EVERY = 3;            // 60 Hz / 3 = 20 snapshots a second
const MAX_RACE_TIME = 8 * 60;    // a race nobody can finish still ends

const { trackIdx, roster, fast } = workerData;
const IDLE = Object.freeze({ throttle: false, brake: false, left: false, right: false, drift: false });

// ---- set the race up
resetMachine('tracks');
G.trackIdx = trackIdx;
startField(roster.map(s => ({ def: CHARACTERS.find(c => c.id === s.charId), isAI: s.isAI, team: s.team })));

const humans = new Map();        // slot -> { c, item, power, usedItem, usedPower, ev, fx }
roster.forEach((s, slot) => {
  if (s.isAI) return;
  const h = { c: IDLE, item: 0, power: 0, usedItem: 0, usedPower: 0, ev: [], fx: [] };
  humans.set(slot, h);
  G.karts[slot].ctrl = () => h.c;
});
const slotOf = new Map(G.karts.map((k, i) => [k, i]));
let raceFx = [];
setSfxSink((name, k) => { if (!k) { raceFx.push(name); return; } const h = humans.get(slotOf.get(k)); if (h) h.fx.push(name); });

const bool = v => v === true;
parentPort.on('message', m => {
  if (m.t === 'input') {
    const h = humans.get(m.slot); if (!h) return;
    const c = m.c ?? {};
    h.c = { throttle: bool(c.throttle), brake: bool(c.brake), left: bool(c.left), right: bool(c.right), drift: bool(c.drift) };
    if (Number.isInteger(m.item) && m.item > h.item) h.item = m.item;
    if (Number.isInteger(m.power) && m.power > h.power) h.power = m.power;
  } else if (m.t === 'leave') {
    const k = G.karts[m.slot]; if (!k || !humans.has(m.slot)) return;
    humans.delete(m.slot); k.ctrl = null; k.isAI = true; k.itemTimer = 1;
  } else if (m.t === 'stop') {
    running = false; process.exit(0);
  }
});

// ---- the loop
let tick = 0, running = true;

function step() {
  // Item and power presses are edges: each press counts once, and only while racing, as in solo play.
  for (const [slot, h] of humans) {
    const k = G.karts[slot];
    if (h.item > h.usedItem) { h.usedItem = h.item; if (getState() === 'race') useItem(k); }
    if (h.power > h.usedPower) { h.usedPower = h.power; if (getState() === 'race') usePower(k); }
  }
  simStep(STEP); tick++;
  for (const e of drain()) {
    for (const [slot, h] of humans) { const text = resolveFor(e, G.karts[slot]); if (text) h.ev.push([e.type, text]); }
  }
  if (tick % SNAP_EVERY === 0) {
    const per = {};
    for (const [slot, h] of humans) { per[slot] = { ev: h.ev, fx: h.fx }; h.ev = []; h.fx = []; }
    parentPort.postMessage({ t: 'snap', s: encodeSnapshot(G, tick), per, fx: raceFx });
    raceFx = [];
  }
  if (raceOver() || G.time > MAX_RACE_TIME) { finish(); return false; }
  return true;
}

function finish() {
  running = false;
  endRace();
  const ranking = G.karts.map((k, slot) => ({
    slot, name: roster[slot].name, charId: roster[slot].charId, team: k.team, isAI: roster[slot].isAI,
    rank: k.rank, finished: k.finished, time: k.finished ? k.finishTime : null, bestLap: Number.isFinite(k.bestLap) ? k.bestLap : null,
    points: roster[slot].isAI || k.team == null ? 0 : placementPoints(k.rank),
  })).sort((a, b) => a.rank - b.rank);
  // Teams are scored from the grid, not the karts' live isAI flag: a driver who
  // left handed the kart to the AI, and its place still counts for the team.
  const teams = teamStandings(ranking.map(r => ({ rank: r.rank, team: r.team, isAI: r.isAI, slot: r.slot })))
    .map(t => ({ team: t.team, name: t.name, points: t.points, drivers: t.drivers.map(d => d.kart.slot) }));
  parentPort.postMessage({ t: 'done', ranking, teams });
}

if (fast) {
  const burst = () => { for (let i = 0; i < 600 && running; i++) if (!step()) return; if (running) setImmediate(burst); };
  burst();
} else {
  let last = performance.now(), acc = 0;
  const timer = setInterval(() => {
    const now = performance.now(); acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= STEP && running) { acc -= STEP; if (!step()) { clearInterval(timer); return; } }
  }, 4);
}
