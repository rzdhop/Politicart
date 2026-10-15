// The networked race on the client (DEC-014).
//
// When the server starts a race, every client builds the same scene from the
// grid it was sent (startField, its own slot as G.player) and from then on
// simulates nothing: each frame it blends the two snapshots around a render
// tick ~100 ms behind the newest one (netstate.js), writes the result into
// its karts, poses the meshes, mirrors hazards, projectiles, ballot boxes and
// crossings, and runs the same view half as solo play (camera, HUD payload,
// minimap). Its own controls go to the server 30 times a second; item and
// power presses travel as running counts, so a lost or repeated message can
// neither drop nor double a press. Messages and sounds addressed to this
// player arrive already resolved and are replayed through the usual queue.
import { sfx } from './audio.js';
import { CHARACTERS } from './data.js';
import { emit } from './events.js';
import { readInput } from './input.js';
import { buildHazard, buildProjectileMesh } from './items.js';
import { getState, transition } from './machine.js';
import { applyKart, bracket, lerpKart } from './netstate.js';
import { onNet, onRace, onResults, onSnap, sendInput } from './net.js';
import { updateKartVisual } from './physics.js';
import { animateCrowd, placeCrossing, startField, viewStep } from './race.js';
import { G } from './state.js';

const DELAY_TICKS = 6;           // render 100 ms (six 60 Hz ticks) behind the newest snapshot
const BUFFER = 40;               // two seconds of snapshots
const SEND_MS = 33;              // controls 30 times a second

let active = false;
let buffer = [];
let newest = { tk: 0, at: 0 };
let presses = { item: 0, power: 0 };
let lastSent = 0, lastKey = '';
let hazards = new Map(), projectiles = new Map();
let resultsListener = null;
let lastResults = null;

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
  for (const m of [...hazards.values(), ...projectiles.values()]) G.scene?.remove(m);
  hazards = new Map(); projectiles = new Map();
}

/** Start the race the server announced: same circuit, same grid, our slot followed. */
export function beginNetRace(m) {
  G.trackIdx = m.trackIdx;
  const slots = m.roster.map((s, i) => ({ def: CHARACTERS.find(c => c.id === s.charId), isAI: s.isAI, team: s.team, local: i === m.you }));
  active = true; buffer = []; newest = { tk: 0, at: now() }; presses = { item: 0, power: 0 }; lastSent = 0; lastKey = '';
  lastResults = null; hazards = new Map(); projectiles = new Map();
  G.netSlot = m.you; G.netRoster = m.roster;
  startField(slots);          // ends with the transition into 'countdown'
}

/** File a snapshot and replay what it brought for us. */
export function receiveSnap(m) {
  if (!active) return;
  const s = m.s;
  if (buffer.length && s.tk <= buffer[buffer.length - 1].tk) return;   // out of order: drop
  buffer.push(s); if (buffer.length > BUFFER) buffer.shift();
  newest = { tk: s.tk, at: now() };
  for (const [type, text] of m.ev ?? []) emit(type, text);
  for (const name of m.fx ?? []) sfx(name);
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

function sendControls() {
  const t = now(); const i = readInput();
  const c = { throttle: !!i.throttle, brake: !!i.brake, left: !!i.left, right: !!i.right, drift: !!i.drift };
  const key = JSON.stringify(c) + presses.item + ',' + presses.power;
  if (key === lastKey && t - lastSent < SEND_MS) return;   // send on any change, else 30 times a second
  lastSent = t; lastKey = key;
  sendInput(c, presses.item, presses.power);
}

/**
 * One client frame of a networked race. Returns the HUD payload, like
 * stepRace. Before the first snapshot it only holds the grid in place.
 */
export function netStep(dt) {
  sendControls();
  const renderTick = newest.tk + (now() - newest.at) * 60 / 1000 - DELAY_TICKS;
  const br = bracket(buffer, renderTick);
  if (br) {
    const { a, b, f } = br;
    G.time = a.t + (b.t - a.t) * f; G.countdown = b.cd; G.resultsAt = b.ra ?? Infinity;
    if (b.st === 'race' && getState() === 'countdown') transition('race');
    G.karts.forEach((k, i) => {
      const ka = a.k[i], kb = b.k[i]; if (!ka || !kb) return;
      applyKart(k, lerpKart(ka, kb, f));
      updateKartVisual(k, dt, clamp(Math.abs(k.speed) / (42 * k.stats.speed), 0, 1));
    });
    syncEntities(hazards, b.h, ty => { const h = buildHazard(ty); return h.g; }, (g, e) => g.position.set(e.x, 0, e.z));
    const pa = new Map(a.p.map(p => [p.id, p]));
    syncEntities(projectiles, b.p, buildProjectileMesh, (g, e) => {
      const o = pa.get(e.id) ?? e;
      g.position.set(o.x + (e.x - o.x) * f, o.y + (e.y - o.y) * f, o.z + (e.z - o.z) * f); g.rotation.y += dt * 9;
      if (g.userData.blink) g.userData.blink.material.color.setHex(Math.floor(G.time * 10) % 2 ? 0x3a6bff : 0xff3a4a);
    });
    G.itemBoxes.forEach((bx, i) => { bx.mesh.visible = b.b[i] === '1'; });
    G.crossings.forEach((c, i) => { if (b.c[i] !== undefined) { c.t = (a.c[i] ?? b.c[i]) + (b.c[i] - (a.c[i] ?? b.c[i])) * f; placeCrossing(c); } });
  }
  for (const bx of G.itemBoxes) { bx.mesh.rotation.y += 0.03; bx.mesh.rotation.x += 0.01; }
  for (const fn of [...G.animated]) fn(dt);
  animateCrowd();
  return viewStep(dt);
}

// ---- wiring: the net client hands race traffic here.
onRace(beginNetRace);
onSnap(receiveSnap);
onResults(finishNetRace);
onNet(view => { if (active && view.status !== 'open') { emit('toast', 'CONNEXION PERDUE'); abortNetRace(); } });
