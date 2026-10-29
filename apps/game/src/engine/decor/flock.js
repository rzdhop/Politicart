// Flocks (stage 7): pigeons on the pavements and seagulls on the quays that
// take off when a kart passes, circle up and land back where they were, and
// gulls wheeling over the water. Every bird of a build is a copy in two
// instanced batches per kind (decor/instanced.js): sitting, wings folded,
// and flying, wings spread. A bird shows one of its two copies, the other
// shrunk to nothing; so a flock costs nothing per frame while it sits, and
// a cell's birds draw in two parts whatever their number.
//
// The animator is one G.animated callback per build: it watches the karts
// near each sitting flock (16 m, any speed above a walk) and flies the
// flocks that are up with batch.move(). Its clock is its own (dt summed),
// so birds still fly during the countdown's revs. Headless it does nothing
// (life.js moving()): nobody watches the server's pigeons.
import * as THREE from 'three';

import { box, cone } from '../primitives.js';
import { G, getPoly } from '../state.js';
import { rand } from '../util.js';
import { batch, moving, peekBuild, perBuild, place } from './life.js';

/** The bird kinds and their two poses, facing +z, standing on y = 0. */
const BIRDS = {
  pigeon: {
    sit: (g, hi) => { g.add(box(0.26, 0.24, 0.42, 0x8a8a92, 0, 0.22, 0)); g.add(box(0.15, 0.15, 0.16, 0x6a6a74, 0, 0.4, 0.2)); if (hi) { g.add(box(0.2, 0.06, 0.18, 0x6a6a74, 0, 0.26, -0.26)); g.add(cone(0.035, 0.1, 0xe0a030, 0, 0.4, 0.32, 3).rotateX(Math.PI / 2)); } },
    fly: (g, hi) => { g.add(box(0.24, 0.2, 0.44, 0x8a8a92, 0, 0.22, 0)); [-1, 1].forEach(s => g.add(box(0.52, 0.03, 0.22, 0x9a9aa2, s * 0.36, 0.26, 0))); if (hi) { g.add(box(0.14, 0.14, 0.15, 0x6a6a74, 0, 0.3, 0.27)); g.add(box(0.22, 0.04, 0.2, 0x6a6a74, 0, 0.22, -0.3)); } },
    scale: [0.85, 1.15],
  },
  seagull: {
    sit: (g, hi) => { g.add(box(0.3, 0.28, 0.56, 0xffffff, 0, 0.3, 0)); [-1, 1].forEach(s => g.add(box(0.05, 0.16, 0.46, 0xa9b1ba, s * 0.16, 0.34, -0.04))); g.add(box(0.18, 0.18, 0.2, 0xffffff, 0, 0.5, 0.26)); if (hi) { g.add(box(0.05, 0.05, 0.16, 0xe0a030, 0, 0.48, 0.42)); [-0.07, 0.07].forEach(x => g.add(box(0.03, 0.16, 0.03, 0xe0a030, x, 0.08, 0))); } },
    fly: (g, hi) => { g.add(box(0.28, 0.24, 0.6, 0xffffff, 0, 0.3, 0)); [-1, 1].forEach(s => { g.add(box(0.7, 0.03, 0.3, 0xa9b1ba, s * 0.48, 0.34, 0)); if (hi) g.add(box(0.22, 0.035, 0.24, 0x222222, s * 0.94, 0.34, -0.02)); }); if (hi) { g.add(box(0.16, 0.16, 0.18, 0xffffff, 0, 0.36, 0.36)); g.add(box(0.05, 0.05, 0.14, 0xe0a030, 0, 0.34, 0.5)); } },
    scale: [1.1, 1.4],
  },
};
/** How far a kart sets a sitting flock off (metres, world), and how long the birds keep away after landing (s). */
const ALARM = 16, REST = 3;

const flockSet = () => perBuild('flocks', () => {
  const batches = {};
  // the wheeling gulls get batches of their own: a cell's bounds must hold their whole circle
  const hi = getPoly() === 'high', make = (pose, pad) => batch(() => { const g = new THREE.Group(); pose(g, hi); return g; }, { pad });
  for (const [k, b] of Object.entries(BIRDS)) batches[k] = { sit: make(b.sit, 2), fly: make(b.fly, 24), wheel: null, wheeling: () => batches[k].wheel || (batches[k].wheel = make(b.fly, 90)) };
  const set = { batches, flocks: [], circles: [], birds: 0 };
  let clock = 0;
  G.animated.push(dt => {
    if (!moving()) return;
    clock += dt;
    for (const f of set.flocks) {
      if (f.up === null) {
        if (clock < f.calm) continue;
        for (const k of G.karts || []) { if (Math.abs(k.speed || 0) > 3 && (k.pos.x - f.x) ** 2 + (k.pos.z - f.z) ** 2 < ALARM * ALARM) { f.up = clock; for (const b of f.birds) { f.sit.move(b.sit, { scale: 0 }); } break; } }
        if (f.up === null) continue;
      }
      let landed = 0;
      for (const b of f.birds) {
        const u = (clock - f.up - b.delay) / b.T;
        if (u <= 0) continue;
        if (u >= 1) { if (!b.home) { f.fly.move(b.fly, { scale: 0 }); f.sit.move(b.sit, { scale: b.scale }); b.home = true; } landed++; continue; }
        b.home = false;
        const lift = Math.sin(Math.PI * u), a = b.a + b.turns * Math.PI * 2 * u, r = b.r + lift * b.R;
        f.fly.move(b.fly, { x: f.x + Math.cos(a) * r, y: b.y + Math.pow(lift, 0.6) * b.H, z: f.z + Math.sin(a) * r, rotY: Math.atan2(-Math.sin(a) * b.turns, Math.cos(a) * b.turns), tiltX: u < 0.5 ? -0.25 : 0.2, tiltZ: Math.sin(clock * 26 + b.a * 5) * 0.4, scale: b.scale });
      }
      if (landed === f.birds.length) { f.up = null; f.calm = clock + REST; for (const b of f.birds) b.home = false; }
    }
    for (const c of set.circles) {
      const a = c.a + clock * c.w;
      c.fly.move(c.i, { x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(clock * 0.7 + c.a) * 1.5, z: c.z + Math.sin(a) * c.r, rotY: Math.atan2(-Math.sin(a) * Math.sign(c.w), Math.cos(a) * Math.sign(c.w)), tiltZ: -Math.sign(c.w) * 0.35 + Math.sin(clock * 3 + c.a) * 0.1, scale: c.scale });
    }
  });
  return set;
});

/**
 * A flock of `n` birds (`kind` 'pigeon' or 'seagull') sitting round (x, z)
 * within `radius` metres, that takes off when a kart comes by. `spots`
 * (world { x, y, z } each, e.g. mooring posts) seats the birds there
 * instead. Coordinates as life.js place(): scale-1 decor coordinates by
 * default, world units with an absolute `y` if `world`. Returns the flock.
 */
export function flock(scene, x, z, { n = 8, kind = 'pigeon', radius = 3, y = 0, world = false, spots = null } = {}) {
  const set = flockSet(), b = set.batches[BIRDS[kind] ? kind : 'pigeon'], c = place(x, z, { y, world }), sc = BIRDS[BIRDS[kind] ? kind : 'pigeon'].scale;
  const f = { x: c.x, z: c.z, up: null, calm: 0, sit: b.sit, fly: b.fly, birds: [] };
  const count = spots ? spots.length : n;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), r = spots ? Math.hypot(spots[i].x - c.x, spots[i].z - c.z) : rand(0.3, radius);
    const bx = spots ? spots[i].x : c.x + Math.cos(a) * r, bz = spots ? spots[i].z : c.z + Math.sin(a) * r, by = spots ? spots[i].y : c.y, scale = rand(sc[0], sc[1]);
    const ang = spots ? Math.atan2(bz - c.z, bx - c.x) : a;
    f.birds.push({ sit: b.sit.add(bx, bz, { y: by, rotY: rand(0, 6.28), scale }), fly: b.fly.add(bx, bz, { y: by, scale: 0 }), a: ang, r, y: by, scale, turns: Math.random() < 0.5 ? 1 : -1, R: rand(6, 13), H: rand(7, 13), T: rand(4.5, 7), delay: rand(0, 0.5), home: false });
  }
  set.flocks.push(f); set.birds += count;
  return f;
}

/** `n` birds of `kind` (seagulls by default) wheeling round (x, z) at `height` metres over the ground there, `radius` metres out. Coordinates as flock(). */
export function circling(scene, x, z, { n = 6, kind = 'seagull', radius = 30, height = 18, y = 0, world = false } = {}) {
  const set = flockSet(), k = BIRDS[kind] ? kind : 'seagull', fly = set.batches[k].wheeling(), c = place(x, z, { y, world }), sc = BIRDS[k].scale;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = radius * rand(0.5, 1.1), h = c.y + height + rand(-4, 6), scale = rand(sc[0], sc[1]);
    set.circles.push({ fly, i: fly.add(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { y: h, rotY: a, scale }), x: c.x, y: h, z: c.z, r, a, w: (Math.random() < 0.5 ? 1 : -1) * rand(0.18, 0.32), scale });
  }
  set.birds += n;
}

/** How many birds the build being made holds (tests and budgets). */
export const birdCount = () => peekBuild('flocks')?.birds ?? 0;
