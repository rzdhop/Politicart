// The networked race on the client (DEC-014, DEC-052).
//
// When the server starts a race, every client builds the same scene from the
// grid it was sent (startField, its own slot as G.player). From then on it
// predicts its own kart and only draws the others. Its kart runs ahead of
// the server at the server's fixed step, from the controls of every frame
// (predict.js), and each snapshot corrects it: the server's state, the ticks
// it has not applied yet replayed on top, the difference smoothed out. Every
// other kart, and the hazards, projectiles, ballot boxes, crossings and
// cyclists, are blended between the two snapshots around a render tick a
// little behind the server's (netstate.js), the delay sized from how late
// the snapshots arrive. Then the same view half as solo play runs (camera,
// HUD payload, minimap). Its own controls go to the server every tick they
// are predicted, numbered; item and power presses travel as running counts,
// so a lost or repeated message can neither drop nor double a press. A ping
// a second measures the round trip for the HUD. Messages and sounds
// addressed to this player arrive already resolved and are replayed through
// the usual queue.
import { sfx } from './audio.js';
import { applyCyclists } from './cyclists.js';
import { CHARACTERS } from './data.js';
import { emit } from './events.js';
import { playerStyle } from './kartstyle.js';
import { readInput } from './input.js';
import { buildHazard, buildProjectileMesh } from './items.js';
import { getState, transition } from './machine.js';
import { applyKart, bracket, decodeVfx, extrapolateKart, lerpKart } from './netstate.js';
import { onKartJoin, onNet, onPong, onRace, onResults, onSnap, sendInput, sendPing } from './net.js';
import { updateKartVisual } from './physics.js';
import { blend, errorOffset, estimateDelay, lastSeq, predictTick, reconcile, recordTick, resetPrediction } from './predict.js';
import { animateCrowd, joinField, placeCrossing, startField, viewStep } from './race.js';
import { G, STEP } from './state.js';
import { receiveVfx, replayVfx } from './vfx.js';

const TICKS_PER_MS = 60 / 1000;
const START_DELAY = 6;           // the render delay before any jitter is measured: 100 ms, six 60 Hz ticks
const BUFFER = 60;               // two seconds of snapshots
const MAX_STEPS = 4;             // predicted ticks per frame at most: a slow frame shows less lead, never a jump
const PING_MS = 1000;            // a ping a second
const CLOCK_SLEW = 6;            // the render clock follows the server's at most 10 % fast or slow (6 ticks a second)...
const CLOCK_SNAP = 15;           // ...unless it is off by more than this many ticks, when it jumps
const HANDOFF_RATE = 4;          // our kart, no longer predicted past the line, eases back to the snapshots' in about a second

let active = false;
let buffer = [];
let presses = { item: 0, power: 0 };
let drawn = false;               // has a frame of this race been drawn yet?
let hazards = new Map(), projectiles = new Map();
let statics = new Map();         // the layout's own obstacles (DEC-049), id -> mesh: built with the circuit, dropped when a snapshot stops naming them (mown)
let resultsListener = null;
let lastResults = null;
// the render clock (ticks): est is the server's tick minus ours (now x 60/1000), from the least late snapshots;
// shown is what the frame uses, slewed towards it; devs is how late the recent snapshots were against est
let est = null, shown = null, devs = [], delay = START_DELAY, interval = 2;
// the local kart: predicting once the server acknowledges our ticks; lead in ticks; me is the newest private block
let acc = 0, predicting = false, lead = 0, me = null, prev = null;
let handoff = null, handoffAt = null;   // the offset easing our kart from its predicted pose to the snapshots' (the finish line)
let pingN = 0, lastPing = -Infinity, rtt = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Whether the race on screen is a networked one. */
export const isNetRace = () => active;

/** The last team race's results, as the server sent them, plus our slot. */
export const getNetResults = () => lastResults;

/** Tell `fn(results)` when a team race ends (the UI store listens). */
export function onNetResults(fn) { resultsListener = fn; }

/** Count an item or power press; the next input message carries it. */
export function pressItem() { presses.item++; }
export function pressPower() { presses.power++; }

function clearEntities() {
  // the static obstacles stay: they are part of the circuit the results screen keeps on show
  for (const m of hazards.values()) G.scene?.remove(m);
  for (const m of projectiles.values()) G.scene?.remove(m);
  hazards = new Map(); projectiles = new Map(); statics = new Map();
}

/**
 * Start the race the server announced: same circuit, same seed (DEC-049),
 * same grid, our slot followed. A human slot carries that player's Garage
 * edits, laid over the candidate's default, so every client draws every kart
 * as its driver styled it; an AI slot gets the candidate's default
 * (startField's fallback). A start without a seed comes from a server older
 * than protocol 2: it is refused, since the two sides could not build the
 * same race.
 */
export function beginNetRace(m) {
  if (!Number.isInteger(m.seed)) { emit('toast', 'SERVEUR TROP ANCIEN'); return; }
  G.trackIdx = m.trackIdx;
  const slots = m.roster.map((s, i) => {
    const def = CHARACTERS.find(c => c.id === s.charId);
    return { def, isAI: s.isAI, team: s.team, god: s.god === true, local: i === m.you, ...(s.style ? { style: playerStyle(def, s.style) } : {}) };
  });
  active = true; buffer = []; presses = { item: 0, power: 0 }; drawn = false;
  lastResults = null; hazards = new Map(); projectiles = new Map(); statics = new Map();
  est = null; shown = null; devs = []; delay = START_DELAY; interval = 2;
  acc = 0; predicting = false; lead = 0; me = null; prev = null; handoff = null; handoffAt = null; lastPing = -Infinity; rtt = null;
  resetPrediction();
  G.netSlot = m.you; G.netRoster = m.roster;
  startField(slots, { seed: m.seed });          // ends with the transition into 'countdown'
  // the circuit's own obstacles, by the ids the server's identical build gave them
  for (const h of G.hazards) statics.set(h.id, h.mesh);
}

/**
 * Time a snapshot's arrival against the server clock estimate. The estimate
 * follows the least late snapshots at once and the later ones slowly (a
 * route that got longer), and every lateness is kept for estimateDelay.
 */
function clockSample(tk, at) {
  const sample = tk - at * TICKS_PER_MS;
  if (est === null) { est = sample; return; }
  if (sample > est) est = sample; else est += (sample - est) * 0.02;
  devs.push(est - sample); if (devs.length > 40) devs.shift();
}

/**
 * File a snapshot, replay what it brought for us, and correct our kart from
 * it. The green light comes from here, the newest snapshot, not from the
 * delayed render tick: the prediction must drive from the server's start.
 */
export function receiveSnap(m) {
  if (!active) return;
  const s = m.s;
  const last = buffer[buffer.length - 1];
  if (last && s.tk <= last.tk) return;   // out of order: drop
  if (last) interval += (clamp(s.tk - last.tk, 1, 12) - interval) * 0.1;
  buffer.push(s); if (buffer.length > BUFFER) buffer.shift();
  clockSample(s.tk, now());
  for (const [type, text] of m.ev ?? []) emit(type, text);
  for (const name of m.fx ?? []) sfx(name);
  receiveVfx((m.vfx ?? []).map(decodeVfx).filter(Boolean), s.tk);   // the effects (DEC-053): played when the render clock reaches this tick
  if (s.st === 'race' && getState() === 'countdown') transition('race');
  me = m.me ?? null;
  const ks = s.k[G.netSlot], was = predicting;
  // our kart: predicted while the server acknowledges our ticks (protocol 3) and until it finishes; the AI drives it after the line
  predicting = !!ks && Number.isInteger(m.ack) && Number.isInteger(m.n) && m.n > 0 && !(ks.fin === 1 || ks.fin === true);
  if (predicting) { const r = reconcile(G.player, ks, me, m.ack, m.n, s.t); lead = r.lead; prev = null; }
  else {
    lead = 0;
    // from here our kart is drawn from the snapshots, a round trip and a delay behind: ease it there from where it is on screen
    if (was) { const k = G.player, o = errorOffset(); handoffAt = { x: k.pos.x + o.x, z: k.pos.z + o.z, y: k.y + o.y, h: k.heading + o.h }; }
  }
}

/** The round trip, from the server's echo of a ping. */
export function receivePong(m) {
  if (!active || !Number.isFinite(m.at)) return;
  const sample = Math.max(0, now() - m.at);
  rtt = rtt === null ? sample : rtt + (sample - rtt) * 0.25;
}

/**
 * A kart joins the race in progress (the admin as a god, DEC-031): build it
 * like the grid's, at the slot the server named. Snapshots carry its state
 * from then on.
 */
export function receiveKartJoin(m) {
  if (!active || m.slot !== G.karts.length) return;
  const def = CHARACTERS.find(c => c.id === m.entry.charId); if (!def) return;
  joinField({ def, isAI: false, team: null, god: m.entry.god === true, ...(m.entry.style ? { style: playerStyle(def, m.entry.style) } : {}) });
  G.netRoster = [...(G.netRoster ?? []), m.entry];
}

/** The race is over: keep the scene on screen and show the results. */
export function finishNetRace(m) {
  lastResults = { ...m, you: G.netSlot };
  if (active) {
    active = false; clearEntities();
    if (getState() === 'countdown') transition('race');
    if (getState() === 'race') transition('results');
  }
  resultsListener?.(lastResults);
}

/** Leave the race view without results (connection lost, or we left the room). */
export function abortNetRace() {
  if (!active) return;
  active = false; clearEntities();
  if (['countdown', 'race', 'results'].includes(getState())) transition('lobby');
}

function syncEntities(map, list, build, place) {
  const seen = new Set();
  for (const e of list) {
    seen.add(e.id);
    let mesh = map.get(e.id);
    if (!mesh) { mesh = build(e.ty); map.set(e.id, mesh); G.scene.add(mesh); }
    place(mesh, e);
  }
  for (const [id, mesh] of map) if (!seen.has(id)) { G.scene.remove(mesh); map.delete(id); }
}

/** The controls of this frame, as plain booleans: every tick predicted from it uses them. */
function controls() {
  const i = readInput();
  return { throttle: !!i.throttle, brake: !!i.brake, left: !!i.left, right: !!i.right, drift: !!i.drift };
}

/**
 * Our share of a frame: the ticks it is due at 60 Hz (at most MAX_STEPS),
 * each numbered and, once the server acknowledges us, predicted; then the
 * controls to the server with the newest number, and a ping when one is due.
 */
function driveFrame(dt) {
  acc += dt;
  let steps = 0; const c = controls(), k = G.player;
  while (acc >= STEP - 5e-4 && steps < MAX_STEPS) {
    acc -= STEP; steps++;
    if (predicting) { prev = { x: k.pos.x, z: k.pos.z, y: k.y, h: k.heading }; predictTick(k, c); }
    else recordTick(c);
  }
  acc = Math.min(Math.max(acc, 0), STEP);
  if (steps) sendInput(c, presses.item, presses.power, lastSeq());
  const t = now();
  if (t - lastPing >= PING_MS) { lastPing = t; sendPing(++pingN, t); }
}

/** The render clock: towards the server's estimate, a little fast or slow; the delay towards what the jitter needs, a tick a second. */
function renderTick(dt) {
  if (est === null) return null;
  if (shown === null || Math.abs(est - shown) > CLOCK_SNAP) shown = est;
  else shown += clamp(est - shown, -CLOCK_SLEW * dt, CLOCK_SLEW * dt);
  delay += clamp(estimateDelay(devs, interval) - delay, -dt, dt);
  return now() * TICKS_PER_MS + shown - delay;
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * Move our kart to where it is drawn this frame and return where it really
 * is, for putting it back: the correction still being smoothed out, plus the
 * part of a tick the frame runs past the last predicted one (a screen faster
 * than 60 Hz would otherwise see it stand still every other frame).
 */
function lift(k) {
  const at = { x: k.pos.x, z: k.pos.z, y: k.y, h: k.heading };
  if (predicting) {
    const o = errorOffset(), f = prev ? acc / STEP : 0;
    k.pos.x += o.x + (prev ? (at.x - prev.x) * f : 0); k.pos.z += o.z + (prev ? (at.z - prev.z) * f : 0);
    k.y += o.y + (prev ? (at.y - prev.y) * f : 0); k.heading += o.h + (prev ? wrap(at.h - prev.h) * f : 0);
  } else if (handoff) { k.pos.x += handoff.x; k.pos.z += handoff.z; k.y += handoff.y; k.heading += handoff.h; }
  return at;
}
/** Put our kart back where lift() found it, to the bit. */
function land(k, at) { k.pos.x = at.x; k.pos.z = at.z; k.y = at.y; k.heading = at.h; }

/**
 * One client frame of a networked race. Returns the HUD payload, like
 * stepRace, with the connection's figures in `net`: the round trip, the
 * render delay and how far our kart runs ahead of the server, in ms. Before
 * the first snapshot it only holds the grid in place.
 */
export function netStep(dt) {
  // The server's clock waits for our first controls (DEC-020), so they wait
  // for our first frame to be drawn: that draw compiles the scene's shaders,
  // which can take seconds, and it comes after this step.
  if (drawn) driveFrame(dt); else drawn = true;
  const tick = renderTick(dt);
  const br = tick === null ? null : bracket(buffer, tick);
  const own = G.player;
  if (tick !== null) replayVfx(tick);
  if (br) {
    const { a, b, f, ex } = br;
    G.time = a.t + (b.t - a.t) * f + (b.st === 'race' ? ex : 0); G.countdown = b.cd ?? 0; G.resultsAt = b.ra ?? Infinity; if (b.lp) G.laps = b.lp;
    G.karts.forEach((k, i) => {
      if (k === own && predicting) return;            // ours is predicted
      const ka = a.k[i], kb = b.k[i]; if (!ka || !kb) return;
      const s = lerpKart(ka, kb, f);
      applyKart(k, ex ? extrapolateKart(s, ex) : s, k === own ? me : undefined);
    });
    syncEntities(hazards, b.h, ty => { const h = buildHazard(ty); return h.g; }, (g, e) => g.position.set(e.x, e.y ?? 0, e.z));
    if (b.hs) {                                        // a static obstacle the server mowed is gone here too
      const kept = new Set(b.hs);
      for (const [id, mesh] of statics) if (!kept.has(id)) { G.scene.remove(mesh); statics.delete(id); }
      if (G.hazards.length) G.hazards = G.hazards.filter(h => statics.has(h.id));
    }
    const pa = new Map(a.p.map(p => [p.id, p]));
    syncEntities(projectiles, b.p, buildProjectileMesh, (g, e) => {
      const o = pa.get(e.id) ?? e;
      g.position.set(o.x + (e.x - o.x) * f, o.y + (e.y - o.y) * f, o.z + (e.z - o.z) * f); g.rotation.y += dt * 9;
      if (g.userData.blink) g.userData.blink.material.color.setHex(Math.floor(G.time * 10) % 2 ? 0x3a6bff : 0xff3a4a);
    });
    G.itemBoxes.forEach((bx, i) => { bx.mesh.visible = b.b[i] === '1'; });
    G.crossings.forEach((c, i) => { if (b.c[i] !== undefined) { c.t = (a.c[i] ?? b.c[i]) + (b.c[i] - (a.c[i] ?? b.c[i])) * f; placeCrossing(c); } });
    applyCyclists(a.cy, b.cy, f);
  }
  // Pose every kart. Ours carries the smoothing offset for the draw, the
  // camera and the minimap, and is put back clean for the next prediction.
  blend(dt);
  if (handoffAt) { handoff = { x: handoffAt.x - own.pos.x, z: handoffAt.z - own.pos.z, y: handoffAt.y - own.y, h: wrap(handoffAt.h - own.heading) }; handoffAt = null; }
  else if (handoff) { const f = Math.exp(-HANDOFF_RATE * dt); handoff.x *= f; handoff.z *= f; handoff.y *= f; handoff.h *= f; if (Math.abs(handoff.x) + Math.abs(handoff.z) < 0.01) handoff = null; }
  const at = predicting || handoff ? lift(own) : null;
  for (const k of G.karts) updateKartVisual(k, dt, clamp(Math.abs(k.speed) / (42 * k.stats.speed), 0, 1));
  for (const bx of G.itemBoxes) { bx.mesh.rotation.y += 0.03; bx.mesh.rotation.x += 0.01; }
  for (const fn of [...G.animated]) fn(dt);
  animateCrowd();
  const payload = viewStep(dt);
  if (at) land(own, at);
  payload.net = { rtt: rtt === null ? null : Math.round(rtt), delay: Math.round(delay / TICKS_PER_MS), lead: Math.round(lead / TICKS_PER_MS) };
  return payload;
}

// ---- wiring: the net client hands race traffic here.
onRace(beginNetRace);
onSnap(receiveSnap);
onPong(receivePong);
onResults(finishNetRace);
onKartJoin(receiveKartJoin);
onNet(view => {
  if (active && view.status !== 'open') { emit('toast', 'CONNEXION PERDUE'); abortNetRace(); }
  else if (active && !view.room) abortNetRace();      // out of the room mid-race: excluded by the admin, or the room was closed
});
