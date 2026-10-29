// The race on the wire: snapshots the server sends, and what a client does
// with them (DEC-014, DEC-052).
//
// The server steps the simulation and, thirty times a second, encodes it
// with encodeSnapshot(): every kart's drawable state, the hazards and
// projectiles by id (the circuit's static obstacles by their id alone, in
// `hs`: a client built them from the seed and drops one the list stops
// naming, DEC-049), which ballot boxes are up, where the crossings are and
// where the cyclists ride ([x, z, heading, y, fallen] each). What only a
// kart's own driver needs -- the HUD's item, lap and times, and the hidden
// state a replay of its physics starts from -- goes to that player alone, in
// the private block encodeKartPrivate() makes (the `me` of their message).
// A client keeps the last few snapshots, blends the two around its render
// time with lerpKart() (bracket() runs a little past the newest, at the
// karts' own speed, when the next one is late) and writes the result into
// its kart objects with applyKart(), then poses the meshes with
// updateKartVisual(). Its own kart it predicts instead (predict.js): the
// server's motion and private block go in with applyKartMotion() and
// applyKartPrivate(), the replay runs from there, and applyKartDiscrete()
// puts the server's word on items, laps and ranks back on top.
//
// Pure: plain objects in, plain objects out, JSON-safe (Infinity travels as
// null), no Three.js. Keys are short and floats quantised -- positions to the
// millimetre, angles to 1e-4 rad, speeds and charges to 1e-2, timers to the
// millisecond -- and a field at its resting value (zero, false; one for the
// bump's power and side, 1.4 for the boost's) is left out: six karts go out
// thirty times a second to every player.
import { G as Game } from './state.js';

const q = (v, p) => Math.round((v || 0) * p) / p;
const mm = v => q(v, 1000), r4 = v => q(v, 10000), cm = v => q(v, 100), ms = v => q(v, 1000);
/** Set o[key] = v unless v is the resting value. */
const put = (o, key, v, rest = 0) => { if (v !== rest) o[key] = v; };
const flag = (o, key, v) => { if (v) o[key] = 1; };
const on = v => v === 1 || v === true;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * One kart's state as it travels to every player: what a client draws, and
 * the motion its own kart's replay starts from. `tp` counts the kart's
 * teleports (markTeleports): a client snaps the kart when it changes.
 */
export function encodeKart(k) {
  const o = { x: mm(k.pos.x), z: mm(k.pos.z), y: mm(k.y), h: r4(wrap(k.heading)), s: cm(k.speed), idx: k.idx, rk: k.rank };   // a heading is the same a turn round
  put(o, 'st', r4(k.steer)); put(o, 'vy', cm(k.vy)); flag(o, 'air', k.air); flag(o, 'tr', k.trick); put(o, 'rs', r4(k.rampSlope));
  put(o, 'fly', ms(k.fly)); put(o, 'inv', ms(k.invincible)); put(o, 'stun', ms(k.stun)); put(o, 'ph', ms(k.phantom)); put(o, 'b', ms(k.boost));
  put(o, 'bu', cm(k.bump)); put(o, 'bp', cm(k.bumpPower ?? 1), 1); put(o, 'bs', k.bumpSide || 1, 1); put(o, 'sh', ms(k.shield));
  flag(o, 'da', k.drift.active); put(o, 'dd', k.drift.dir || 0); put(o, 'dc', cm(k.drift.charge));
  flag(o, 'fin', k.finished); flag(o, 'gd', k.god === true); put(o, 'tp', k.tp || 0);
  return o;
}

/**
 * What only kart k's own driver is sent: the HUD's fields (item, roll, power
 * cooldown, lap, progress, finish time, best lap) and the state a replay of
 * its physics needs that the public kart lacks (the pit, pad and hazard
 * graces, the knock-back, the statuses, the boost's power, the ramp it is
 * on, by index in `ramps`).
 */
export function encodeKartPrivate(k, ramps = Game.ramps) {
  const o = { lap: k.lap, pr: q(k.progress, 1e4), pc: cm(k.powerCd) };
  put(o, 'ml', k.maxLap || 0); if (k.item) o.it = k.item; put(o, 'ir', ms(k.itemRolling)); put(o, 'ft', ms(k.finishTime));
  if (Number.isFinite(k.bestLap)) o.bl = ms(k.bestLap);
  put(o, 'pg', ms(k.pitGrace)); put(o, 'dg', ms(k.padGrace)); put(o, 'hg', ms(k.hazardGrace)); put(o, 'kx', mm(k.kx)); put(o, 'kz', mm(k.kz));
  put(o, 'sl', ms(k.slowed)); put(o, 'co', ms(k.confused)); put(o, 'sp', ms(k.slip)); put(o, 'ra', ms(k.rabot)); put(o, 'ca', ms(k.capped));
  put(o, 'rl', k.relance || 0); put(o, 'rt', ms(k.relanceTimer)); put(o, 'bo', cm(k.boostPower ?? 1.4), 1.4);
  const ramp = k.rampPrev ? ramps.indexOf(k.rampPrev) : -1; if (ramp >= 0) o.rp = ramp;
  return o;
}

/** Write a travelled kart's motion into a client-side kart object: everything its physics carries from one tick to the next. */
export function applyKartMotion(k, s) {
  k.pos.x = s.x; k.pos.z = s.z; k.y = s.y; k.heading = s.h; k.speed = s.s; k.steer = s.st ?? 0; k.vy = s.vy ?? 0; k.idx = s.idx;
  k.air = on(s.air); k.trick = on(s.tr); k.rampSlope = s.rs ?? 0;
  k.fly = s.fly ?? 0; k.invincible = s.inv ?? 0; k.stun = s.stun ?? 0; k.phantom = s.ph ?? 0; k.boost = s.b ?? 0;
  k.bump = s.bu ?? 0; k.bumpPower = s.bp ?? 1; k.bumpSide = s.bs ?? 1; k.shield = s.sh ?? 0;
  k.drift.active = on(s.da); k.drift.dir = s.dd ?? 0; k.drift.charge = s.dc ?? 0;
}

/** Write kart k's private block (encodeKartPrivate) into the client's own kart: what its replay needs beyond the public motion. */
export function applyKartPrivate(k, me, ramps = Game.ramps) {
  k.powerCd = me.pc ?? 0; k.pitGrace = me.pg ?? 0; k.padGrace = me.dg ?? 0; k.hazardGrace = me.hg ?? 0; k.kx = me.kx ?? 0; k.kz = me.kz ?? 0;
  k.slowed = me.sl ?? 0; k.confused = me.co ?? 0; k.slip = me.sp ?? 0; k.rabot = me.ra ?? 0; k.capped = me.ca ?? 0;
  k.relance = me.rl ?? 0; k.relanceTimer = me.rt ?? 0; k.boostPower = me.bo ?? 1.4; k.rampPrev = me.rp === undefined ? null : ramps[me.rp] ?? null;
  k.lap = me.lap; k.maxLap = me.ml ?? 0;
}

/**
 * Write the server's word on a kart's discrete state: its rank, whether it
 * finished, whether it is a god, its teleport count, and from its private
 * block `me`, when it is ours, the item, the roll, the lap and the times. A
 * predicting client runs this after its replay (predict.js), so the replay
 * can never leave the HUD on a state the server does not hold.
 */
export function applyKartDiscrete(k, s, me) {
  k.rank = s.rk; k.finished = on(s.fin); k.god = on(s.gd); k.tp = s.tp ?? 0;
  if (!me) return;
  k.item = me.it ?? null; k.itemRolling = me.ir ?? 0; k.lap = me.lap; k.maxLap = me.ml ?? 0; k.progress = me.pr ?? k.lap;
  k.finishTime = me.ft ?? 0; k.bestLap = me.bl ?? Infinity;
}

/** Write a travelled kart state into a client-side kart object: motion and discrete state, and the private block `me` when there is one. */
export function applyKart(k, s, me) {
  applyKartMotion(k, s);
  if (me) applyKartPrivate(k, me);
  applyKartDiscrete(k, s, me);
}

/** A kart that moves farther than this in one tick was teleported: 120 m/s, a flying kart on a boost, is 2 m a tick. */
export const TELEPORT_D = 8;

/**
 * Count a teleport on every kart that moved farther since the last call than
 * a kart drives in a tick (Amendement's swap, Pantouflage's hop, a god's
 * move): its `tp` goes up by one, which tells a client to snap it rather than
 * drag it across the map. `last` is the caller's memory of the positions,
 * updated here. The server runs it after every tick (race-worker.js).
 */
export function markTeleports(karts, last) {
  karts.forEach((k, i) => {
    const p = last[i];
    if (p && (k.pos.x - p.x) ** 2 + (k.pos.z - p.z) ** 2 > TELEPORT_D * TELEPORT_D) k.tp = (k.tp || 0) + 1;
    last[i] = { x: k.pos.x, z: k.pos.z };
  });
}

/** The whole race at one server tick. */
export function encodeSnapshot(G, tick) {
  const h = [], hs = [];
  for (const x of G.hazards) {
    if (x.type === 'obstacle') hs.push(x.id);                       // built by every client from the seed: its id says it is still there
    else { const e = { id: x.id, ty: x.type, x: cm(x.x), z: cm(x.z) }; put(e, 'y', cm(x.y)); h.push(e); }
  }
  const snap = { tk: tick, t: ms(G.time), st: G.state, lp: G.laps };
  if (G.countdown > 0) snap.cd = ms(G.countdown);                     // through the countdown only
  if (Number.isFinite(G.resultsAt)) snap.ra = ms(G.resultsAt);         // once the results are on their way
  return {
    ...snap,
    k: G.karts.map(encodeKart),
    h, hs,
    p: G.projectiles.map(p => ({ id: p.id, ty: p.type, x: cm(p.x), y: cm(p.y + (p.gy || 0)), z: cm(p.z) })),
    b: G.itemBoxes.map(b => (b.active ? 1 : 0)).join(''),
    c: G.crossings.map(c => ms(c.t)),
    // [x, z, heading, y], and a 1 at the end for a rider on the ground
    cy: (G.cyclists || []).map(c => (c.fallen > 0 ? [cm(c.x), cm(c.z), cm(c.h), cm(c.y), 1] : [cm(c.x), cm(c.z), cm(c.h), cm(c.y)])),
  };
}

const mix = (a = 0, b = 0, t) => a + (b - a) * t;

/**
 * Kart state between two snapshots, `t` in [0, 1]. Continuous quantities are
 * blended (the heading the short way round); discrete ones -- ranks, flags --
 * come from the newer snapshot. A kart teleported in between (its `tp`
 * changed) is not blended: it is where the newer snapshot puts it.
 */
export function lerpKart(a, b, t) {
  if ((a.tp ?? 0) !== (b.tp ?? 0)) return { ...b };
  const abu = a.bu ?? 0, bbu = b.bu ?? 0;
  return {
    ...b,
    x: mix(a.x, b.x, t), z: mix(a.z, b.z, t), y: mix(a.y, b.y, t),
    h: a.h + wrap(b.h - a.h) * t, s: mix(a.s, b.s, t), st: mix(a.st, b.st, t), vy: mix(a.vy, b.vy, t),
    dc: mix(a.dc, b.dc, t), bu: bbu > abu ? bbu : mix(abu, bbu, t),
  };
}

/**
 * A kart state carried `sec` seconds on at its own speed and heading (the
 * drift's slide included): where a kart is when the next snapshot is late.
 */
export function extrapolateKart(s, sec) {
  const dir = s.h + (on(s.da) ? (s.dd ?? 0) * 0.35 : 0);
  return { ...s, x: s.x + Math.sin(dir) * s.s * sec, z: s.z + Math.cos(dir) * s.s * sec };
}

/** How far past the newest snapshot bracket() carries the karts on, in ticks (100 ms). */
export const EXTRAPOLATE_TICKS = 6;

/**
 * Pick the two snapshots around render tick `tick` from a buffer ordered
 * oldest first, and how far between them it falls. Keyed on the server tick,
 * not the race clock, which stands still through the countdown. Before the
 * first snapshot it clamps. Past the last it names how many seconds the
 * caller may carry the karts on at their speed (`ex`, extrapolateKart), up to
 * EXTRAPOLATE_TICKS; beyond that the karts stop where they are, which is
 * better than overshooting a wall.
 */
export function bracket(buffer, tick) {
  if (!buffer.length) return null;
  if (tick <= buffer[0].tk) return { a: buffer[0], b: buffer[0], f: 0, ex: 0 };
  for (let i = 1; i < buffer.length; i++) {
    const a = buffer[i - 1], b = buffer[i];
    if (tick <= b.tk) return { a, b, f: b.tk > a.tk ? (tick - a.tk) / (b.tk - a.tk) : 1, ex: 0 };
  }
  const last = buffer[buffer.length - 1];
  return { a: last, b: last, f: 0, ex: Math.min(tick - last.tk, EXTRAPOLATE_TICKS) / 60 };
}
