// The race on the wire: snapshots the server sends, and what a client does
// with them (DEC-014).
//
// The server steps the simulation and, twenty times a second, encodes it
// with encodeSnapshot(): every kart's drawable and HUD state, the hazards and
// projectiles by id, which ballot boxes are up, where the crossings are and
// where the cyclists ride ([x, z, heading, y, fallen] each).
// A client keeps the last few, blends the two around its render time with
// lerpKart() and writes the result into its own kart objects with applyKart(),
// then poses the meshes with updateKartVisual(). Nothing here is simulated on
// the client: these are puppets.
//
// Pure: plain objects in, plain objects out, JSON-safe (Infinity travels as
// null), no Three.js. Keys are short because six karts go out twenty times a
// second to every player.

const finite = v => (Number.isFinite(v) ? v : null);
const unfinite = v => (v === null || v === undefined ? Infinity : v);

/** One kart's state as it travels. */
export function encodeKart(k) {
  return {
    x: k.pos.x, z: k.pos.z, y: k.y, h: k.heading, s: k.speed, st: k.steer || 0, vy: k.vy,
    air: k.air, tr: k.trick, rs: k.rampSlope || 0, fly: k.fly, inv: k.invincible, stun: k.stun, ph: k.phantom, b: k.boost,
    bu: k.bump || 0, bp: k.bumpPower || 1, bs: k.bumpSide || 1, sh: k.shield || 0,
    da: k.drift.active, dd: k.drift.dir, dc: k.drift.charge,
    it: k.item, ir: k.itemRolling > 0, pc: k.powerCd,
    lap: k.lap, idx: k.idx, pr: k.progress, rk: k.rank, fin: k.finished, ft: k.finishTime, bl: finite(k.bestLap),
    gd: k.god === true,
  };
}

/** Write a travelled kart state into a client-side kart object. */
export function applyKart(k, s) {
  k.pos.x = s.x; k.pos.z = s.z; k.y = s.y; k.heading = s.h; k.speed = s.s; k.steer = s.st; k.vy = s.vy;
  k.air = s.air; k.trick = s.tr; k.rampSlope = s.rs; k.fly = s.fly; k.invincible = s.inv; k.stun = s.stun; k.phantom = s.ph; k.boost = s.b;
  k.bump = s.bu ?? 0; k.bumpPower = s.bp ?? 1; k.bumpSide = s.bs ?? 1; k.shield = s.sh ?? 0;
  k.drift.active = s.da; k.drift.dir = s.dd; k.drift.charge = s.dc;
  k.item = s.it; k.itemRolling = s.ir ? 1 : 0; k.powerCd = s.pc;
  k.lap = s.lap; k.idx = s.idx; k.progress = s.pr; k.rank = s.rk; k.finished = s.fin; k.finishTime = s.ft; k.bestLap = unfinite(s.bl);
  k.god = s.gd === true;
}

/** The whole race at one server tick. */
export function encodeSnapshot(G, tick) {
  return {
    tk: tick, t: G.time, st: G.state, cd: G.countdown, ra: finite(G.resultsAt), lp: G.laps,
    k: G.karts.map(encodeKart),
    h: G.hazards.map(h => ({ id: h.id, ty: h.type, x: h.x, z: h.z })),
    p: G.projectiles.map(p => ({ id: p.id, ty: p.type, x: p.x, y: p.y, z: p.z })),
    b: G.itemBoxes.map(b => (b.active ? 1 : 0)).join(''),
    c: G.crossings.map(c => c.t),
    cy: (G.cyclists || []).map(c => [round2(c.x), round2(c.z), round2(c.h), round2(c.y), c.fallen > 0 ? 1 : 0]),
  };
}

const round2 = v => Math.round(v * 100) / 100;

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Kart state between two snapshots, `t` in [0, 1]. Continuous quantities are
 * blended (the heading the short way round); discrete ones -- items, laps,
 * ranks, flags -- come from the newer snapshot.
 */
export function lerpKart(a, b, t) {
  return {
    ...b,
    x: mix(a.x, b.x, t), z: mix(a.z, b.z, t), y: mix(a.y, b.y, t),
    h: a.h + wrap(b.h - a.h) * t, s: mix(a.s, b.s, t), st: mix(a.st, b.st, t), vy: mix(a.vy, b.vy, t),
    dc: mix(a.dc, b.dc, t), pc: mix(a.pc, b.pc, t), pr: mix(a.pr, b.pr, t), bu: a.bu === undefined || b.bu > a.bu ? b.bu : mix(a.bu, b.bu, t),
  };
}

/**
 * Pick the two snapshots around render tick `tick` from a buffer ordered
 * oldest first, and how far between them it falls. Keyed on the server tick,
 * not the race clock, which stands still through the countdown. Before the first or past
 * the last snapshot it clamps rather than extrapolating: a kart that stops
 * moving is better than one that overshoots a wall.
 */
export function bracket(buffer, tick) {
  if (!buffer.length) return null;
  if (tick <= buffer[0].tk) return { a: buffer[0], b: buffer[0], f: 0 };
  for (let i = 1; i < buffer.length; i++) {
    const a = buffer[i - 1], b = buffer[i];
    if (tick <= b.tk) return { a, b, f: b.tk > a.tk ? (tick - a.tk) / (b.tk - a.tk) : 1 };
  }
  const last = buffer[buffer.length - 1];
  return { a: last, b: last, f: 0 };
}
