// The pilots' props: every PROPS entry of looks.js, built from its description.
//
// Each builder takes the build context pilot.js hands it (materials, segment
// scaling, geometry helpers, the torso surface, the head and hand groups) and
// the group it hangs on, builds the prop in the design template's units, and
// returns the prop's root group. Where a prop sits follows its `at`:
//
//   body   on the torso, placed on the jacket's surface through ctx.front()
//   head   in the head group, so it moves with the head
//   hand   in the right hand's group (world-aligned, at the hand's centre)
//   kart   in a kart slot (KART_MOUNTS below), +z towards the kart's nose
//   <prop> on that prop's group (the ring light and the hearts on the selfie stick)
//
// Props that move (`live`) register what moves through ctx.live(): the parts
// that animate become separate objects that survive the merge, the rest of
// the prop merges by material like everything else (pilot.js). Glowing parts
// are emissive, never a light (PLAN 1.2 A.4).
//
// Colours: the fixed ones the descriptions name (pearls, gold, hi-vis,
// tricolore), or the candidate's own (look.tie, the kart colour), never
// another candidate's. Headless-safe: pure geometry, no DOM.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;

/**
 * Where each kart slot lands on each of the game's three bodies, in kart
 * coordinates (kart.js: +z forward, y up from the ground). Read off kart.js's
 * race bodies:
 *  - standard: the cowl top in front of the wheel (y 0.87), the engine cover
 *    behind the seat back (y 1.275), the body's top edge right of the seat,
 *    and the roll bar's crown for the roof mast;
 *  - tractor: the hood's rear deck (y 2.16, the pilot looks over it), the top
 *    of the box behind the seat, the body's right edge beside the pilot;
 *  - cargo bike: the crate lid, the rear box, the frame's right side.
 * Slot props are built in template units and scaled like the pilot.
 * `roofMast` is how far the roof mast reaches down to something solid.
 */
export const KART_MOUNTS = Object.freeze({
  standard: Object.freeze({ dash: [0, 0.87, 1.0], deck: [0, 1.275, -0.97], side: [0.66, 0.75, 0.02], roof: [0, 2.3, -1.12], roofMast: 0.98 }),
  tractor: Object.freeze({ dash: [0, 2.16, 0.55], deck: [0, 1.575, -0.95], side: [0.77, 1.4, -0.3], roof: [0, 2.5, -0.95], roofMast: 0.92 }),
  cargo: Object.freeze({ dash: [0, 1.37, 1.0], deck: [0, 1.15, -1.0], side: [0.36, 0.725, -0.3], roof: [0, 1.85, -1.0], roofMast: 0.7 }),
});

/** A heart outline (the audience), 0.1 wide, centred. */
function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.05);
  s.bezierCurveTo(-0.02, -0.03, -0.055, -0.005, -0.05, 0.02);
  s.bezierCurveTo(-0.045, 0.045, -0.012, 0.05, 0, 0.028);
  s.bezierCurveTo(0.012, 0.05, 0.045, 0.045, 0.05, 0.02);
  s.bezierCurveTo(0.055, -0.005, 0.02, -0.03, 0, -0.05);
  return s;
}

/** A rounded rectangle path (w x h, corner r), centred, on `p` (a Shape or a Path). */
export function roundRect(p, w, h, r) {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/** A sitting kitten facing -z (the pilot), body radius about 0.09; returns { g, tail }. */
function kittenBody(c, parent, pos, fur, name = 'kitten') {
  const g = c.grp(name, parent, pos), S = c.S;
  const white = c.solid(0xfaf3e6, { name: 'kitten-white', roughness: 0.85, sheen: 0.6, sheenColor: 0xffffff });
  c.mk(new THREE.SphereGeometry(0.09, S(24), S(16)), fur, 'kitten-body', g, [0, 0.085, 0], null, [0.9, 1, 1.08]);
  c.mk(new THREE.SphereGeometry(0.04, S(16), S(10)), white, 'kitten-chest', g, [0, 0.1, -0.07], null, [1, 1.2, 0.6]);
  const head = c.grp('kitten-head', g, [0, 0.205, -0.03]);
  c.mk(new THREE.SphereGeometry(0.07, S(24), S(16)), fur, 'kitten-skull', head, null, null, [1.08, 0.95, 1]);
  c.mk(new THREE.SphereGeometry(0.03, S(12), S(8)), white, 'kitten-muzzle', head, [0, -0.02, -0.055], null, [1.3, 0.8, 0.8]);
  for (const s of [-1, 1]) {
    c.mk(new THREE.ConeGeometry(0.028, 0.055, S(8, 4)), fur, 'kitten-ear', head, [s * 0.042, 0.065, 0], [0, 0, -s * 0.35]);
    if (c.fine > 0) c.mk(new THREE.SphereGeometry(0.012, S(10, 5), S(8, 4)), c.mat('iris'), 'kitten-eye', head, [s * 0.026, 0.012, -0.062]);
  }
  if (c.fine > 0) c.mk(new THREE.SphereGeometry(0.008, S(8, 4), S(6, 3)), c.trim(0xe88a9a), 'kitten-nose', head, [0, -0.012, -0.083]);
  // paws in front, the curled tail behind (its own group, so it can flick)
  for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.025, S(10, 5), S(8, 4)), white, 'kitten-paw', g, [s * 0.035, 0.015, -0.07], null, [1, 0.7, 1.2]);
  const tail = c.grp('kitten-tail', g, [0, 0.03, 0.08]);
  c.tube([[0, 0, 0], [0.04, 0.02, 0.06], [0.1, 0.06, 0.05], [0.12, 0.13, 0.0]], 0.016, fur, 'kitten-tail', tail, 12);
  return { g, tail };
}

// ---------- The builders ----------
// (c, host) => root group. `host` is the parent: the seat (body), the head,
// the hand, a kart slot, or the host prop's group.

const B = {};

// ---- body: the game's accessories

B.tie = (c, host) => {
  const g = c.grp('tie', host), y = c.ty(1.13), z = c.front(0, y) + 0.008;
  const t = new THREE.Shape(); t.moveTo(-0.022, 0); t.lineTo(0.022, 0); t.lineTo(0.042, -0.2); t.lineTo(0, -0.245); t.lineTo(-0.042, -0.2); t.closePath();
  c.mk(new THREE.ExtrudeGeometry(t, { depth: 0.012, bevelEnabled: c.fine > 0, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: c.fine > 1 ? 2 : 1, curveSegments: 1 }), c.mat('tie'), 'tie-blade', g, [0, y - 0.01, z], [-0.14, 0, 0]);
  c.mk(new THREE.SphereGeometry(0.03, c.S(16, 6), c.S(12, 4)), c.mat('tie'), 'tie-knot', g, [0, y + 0.0, z + 0.014], null, [1, 0.85, 0.6]);
  return g;
};

B.bowtie = (c, host) => {
  const g = c.grp('bowtie', host, [0, c.ty(1.18), c.front(0, c.ty(1.18)) + 0.03]);
  const silk = c.solid(0xc8102e, { name: 'bowtie-silk', roughness: 0.3, sheen: 1, sheenColor: 0xff8090 });
  for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.06, c.S(20, 6), c.S(14, 4)), silk, 'bowtie-lobe', g, [s * 0.058, 0, 0], [0, 0, s * 0.15], [1.05, 0.7, 0.42]);
  c.mk(new THREE.SphereGeometry(0.025, c.S(14, 5), c.S(10, 4)), silk, 'bowtie-knot', g, [0, 0, 0.012], null, [1, 1.1, 0.8]);
  return g;
};

B.pocket = (c, host) => {
  const x = -0.17, y = c.ty(0.99), g = c.grp('pocket', host, [x, y, c.front(x, y) + 0.004]);
  const gold = c.solid(0xf2c14e, { name: 'pocket-silk', roughness: 0.35, sheen: 1, sheenColor: 0xfff0b0 });
  [-0.025, 0, 0.025].forEach((dx, i) => c.mk(new THREE.ConeGeometry(0.02, 0.07, c.S(6, 3)), gold, 'pocket-point', g, [dx, 0.025 + (i === 1 ? 0.012 : 0), 0], [0, 0, -dx * 6], [1, 1, 0.45]));
  if (c.fine > 1) c.mk(new THREE.BoxGeometry(0.09, 0.006, 0.006), c.mat('dark'), 'pocket-welt', g, [0, -0.005, 0.002]);
  return g;
};

B.scarf = (c, host) => {
  const g = c.grp('scarf', host), red = c.cloth('fleece', 0xc8102e), y = c.ty(1.24);
  c.mk(new THREE.TorusGeometry(0.14, 0.062, c.S(14, 4), c.S(40, 8)), red, 'scarf-wrap', g, [0, y, -0.28], [Math.PI / 2 - 0.12, 0, 0], [1.12, 1, 1]);
  // one end hangs down the left of the chest, lying on the jacket
  const p = c.surfPath([-0.08, c.ty(1.18)], [-0.15, c.ty(0.74)], 6, 0.03);
  c.ribbon(p.points, p.normals, p.points.map((_, i) => 0.055 - i * 0.002), red, 'scarf-end', g, 0.03);
  return g;
};

B.sash = (c, host) => {
  const g = c.grp('sash', host);
  const bands = [c.mat('blue'), c.mat('white'), c.mat('red')];
  // three bands side by side from the right shoulder to the left hip, over the belly if there is one
  bands.forEach((m, i) => {
    const d = (i - 1) * 0.05;
    const p = c.surfPath([0.27 + d * 0.7, c.ty(1.13) + d * 0.6], [-0.3 + d * 0.7, c.ty(0.5) + d * 0.7], 10, 0.012);
    c.ribbon(p.points, p.normals, p.points.map(() => 0.027), m, 'sash-band', g);
  });
  const x = -0.29, y = c.ty(0.52), gold = c.mat('gold');
  const knot = c.grp('sash-knot', g, [x, y, c.front(x, y) + 0.03]);
  c.mk(new THREE.SphereGeometry(0.035, c.S(16, 6), c.S(12, 4)), gold, 'sash-knot', knot);
  c.mk(new THREE.CylinderGeometry(0.028, 0.045, 0.09, c.S(16, 6), 1, true), gold, 'sash-fringe', knot, [0, -0.06, 0]);
  return g;
};

/** A cockade (three concentric discs) facing out of the jacket at (x, y). */
function cockade(c, g, x, y, mats, r = 0.06, name = 'cockade', sizes = [1, 0.66, 0.33]) {
  const z = c.front(x, y) + 0.006, k = c.grp(name, g, [x, y, z]);
  c.aim(k, c.normalAt(x, y).toArray());
  mats.forEach((m, i) => c.mk(new THREE.CylinderGeometry(r * sizes[i], r * sizes[i], 0.012, c.S(24, 8)), m, name + '-disc', k, [0, 0, i * 0.006], [Math.PI / 2, 0, 0]));
  return k;
}

B.rosette = (c, host) => {
  const g = c.grp('rosette', host);
  cockade(c, g, -0.17, c.ty(1.0), [c.mat('blue'), c.mat('white'), c.mat('red')], 0.055, 'rosette');
  return g;
};

B.rosettes = (c, host) => {
  const g = c.grp('rosettes', host), white = c.mat('white');
  [0x2f55c7, 0xc8102e, 0x2e8b57, 0xf2c14e, 0x7b2cbf].forEach((col, i) => {
    const x = -0.2 + i * 0.1, y = c.ty(0.96) + (i % 2) * 0.05;
    cockade(c, g, x, y, [c.trim(col), white], 0.042, 'rosettes', [1, 0.38]);
  });
  return g;
};

B.pearls = (c, host) => {
  const g = c.grp('pearls', host), pearl = c.solid(0xf6f1e4, { name: 'pearl', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.5, sheenColor: 0xffe8f0 });
  const y = c.ty(1.205), n = c.fine > 0 ? 20 : 0;
  if (!n) { c.mk(new THREE.TorusGeometry(0.155, 0.026, c.S(10, 4), c.S(48, 12)), pearl, 'pearls', g, [0, y, -0.27], [Math.PI / 2 - 0.25, 0, 0], [1.05, 1, 1]); return g; }
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = Math.sin(a) * 0.162, z = -0.27 + Math.cos(a) * 0.16;
    c.mk(new THREE.SphereGeometry(0.028, c.S(14, 6), c.S(10, 4)), pearl, 'pearl', g, [x, y - Math.max(0, Math.cos(a)) * 0.045, z + Math.max(0, Math.cos(a)) * 0.02]);
  }
  return g;
};

B.badge = (c, host) => {
  const g = c.grp('badge', host);
  cockade(c, g, -0.16, c.ty(0.98), [c.mat('white'), c.mat('red')], 0.055, 'badge');
  return g;
};

B.eurobadge = (c, host) => {
  const g = c.grp('eurobadge', host);
  const k = cockade(c, g, -0.17, c.ty(1.0), [c.trim(0x003399)], 0.055, 'eurobadge');
  if (c.fine > 0) for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.mk(new THREE.SphereGeometry(0.007, 6, 4), c.mat('gold'), 'eu-star', k, [Math.cos(a) * 0.036, Math.sin(a) * 0.036, 0.009]); }
  return g;
};

B.whistle = (c, host) => {
  const g = c.grp('whistle', host), x = 0.06, y = c.ty(0.9), z = c.front(x, y);
  const red = c.trim(0xc8102e);
  for (const s of [-1, 1]) c.tube([[s * 0.11, c.ty(1.22), -0.24], [s * 0.13, c.ty(1.12), c.front(s * 0.13, c.ty(1.12)) + 0.01], [x + s * 0.025, y + 0.04, z + 0.015]], 0.008, red, 'lanyard', g, 10);
  const w = c.grp('whistle-body', g, [x, y, z + 0.03]); w.rotation.set(0.2, 0, 0.5);
  c.mk(new THREE.CylinderGeometry(0.028, 0.028, 0.05, c.S(18, 6)), c.mat('gold'), 'whistle-barrel', w, null, [0, 0, Math.PI / 2]);
  c.mk(new THREE.BoxGeometry(0.05, 0.02, 0.025), c.mat('gold'), 'whistle-mouth', w, [0.045, 0.012, 0]);
  return g;
};

B.opencollar = (c, host) => {
  const g = c.grp('opencollar', host), shirt = c.mat('shirt'), y = c.ty(1.17);
  for (const s of [-1, 1]) {
    // the shirt collar's points spread over the lapels
    const x = s * 0.1, k = c.grp('collar-point', g, [x, y, c.front(x, y) + 0.016]);
    k.rotation.set(-0.2, s * 0.25, s * 0.55);
    const tri = new THREE.Shape(); tri.moveTo(-0.045, 0.02); tri.lineTo(0.045, 0.02); tri.lineTo(s * 0.01, -0.09); tri.closePath();
    c.mk(new THREE.ExtrudeGeometry(tri, { depth: 0.008, bevelEnabled: false, curveSegments: 1 }), shirt, 'collar-point', k);
  }
  if (c.fine > 0) c.mk(new THREE.TorusGeometry(0.075, 0.005, c.S(6, 3), c.S(32, 10), Math.PI), c.mat('gold'), 'chain', g, [0, c.ty(1.205), -0.22], [Math.PI / 2 - 0.5, 0, Math.PI], [1, 1.15, 1]);
  return g;
};

B.rabat = (c, host) => {
  const g = c.grp('rabat', host), white = c.solid(0xffffff, { name: 'rabat', roughness: 0.65, sheen: 0.4, sheenColor: 0xffffff });
  for (const s of [-1, 1]) {
    const p = c.surfPath([s * 0.026, c.ty(1.19)], [s * 0.03, c.ty(0.99)], 3, 0.014);
    c.ribbon(p.points, p.normals, [0.022, 0.024, 0.026, 0.027], white, 'rabat-band', g);
  }
  return g;
};

B.backpack = (c, host) => {
  const g = c.grp('backpack', host, [0, c.ty(0.82), -0.3 - 0.27 - 0.07]);
  const grey = c.solid(0x3a3a3a, { name: 'backpack', roughness: 0.75, sheen: 0.4, sheenColor: 0x9a9a9a });
  const flap = c.solid(c.def.kart, { name: 'backpack-flap', roughness: 0.6 });
  c.mk(new THREE.SphereGeometry(0.25, c.S(28, 8), c.S(20, 6)), grey, 'backpack-bag', g, null, null, [1.05, 1.35, 0.5]);
  c.mk(new THREE.SphereGeometry(0.25, c.S(28, 8), c.S(12, 4), 0, TAU, 0, 1.0), flap, 'backpack-flap', g, [0, 0.07, 0.0], null, [1.1, 1.3, 0.56]);
  for (const s of [-1, 1]) c.tube([[s * 0.13, 0.25, 0.09], [s * 0.2, 0.36, 0.3], [s * 0.21, 0.3, 0.5], [s * 0.23, 0.05, 0.6]], 0.016, grey, 'backpack-strap', g, 10);
  return g;
};

B.phone = (c, host) => {
  const x = -0.16, y = c.ty(0.98), g = c.grp('phone', host, [x, y + 0.05, c.front(x, y) + 0.012]);
  g.rotation.set(-0.1, 0, 0.08);
  c.mk(new THREE.BoxGeometry(0.075, 0.14, 0.012), c.mat('dark'), 'phone-body', g);
  c.mk(new THREE.PlaneGeometry(0.064, 0.125), c.mat('screen'), 'phone-screen', g, [0, 0, 0.0065]);
  if (c.fine > 1) c.mk(new THREE.BoxGeometry(0.11, 0.008, 0.008), c.mat('dark'), 'pocket-welt', host, [x, y, c.front(x, y) + 0.004]);
  c.live('phone', g, []);   // the screen shader runs on the shared clock
  return g;
};

B.stopwatch = (c, host) => {
  const g = c.grp('stopwatch', host), y = c.ty(0.86), z = c.front(0, y) + 0.03;
  const red = c.trim(0xc8102e);
  for (const s of [-1, 1]) c.tube([[s * 0.11, c.ty(1.22), -0.24], [s * 0.14, c.ty(1.08), c.front(s * 0.14, c.ty(1.08)) + 0.01], [s * 0.03, y + 0.1, z]], 0.008, red, 'lanyard', g, 10);
  const w = c.grp('stopwatch-body', g, [0, y, z]); w.rotation.x = -0.1;
  c.mk(new THREE.CylinderGeometry(0.09, 0.09, 0.03, c.S(32, 10)), c.mat('chrome'), 'stopwatch-case', w, null, [Math.PI / 2, 0, 0]);
  c.mk(new THREE.CircleGeometry(0.078, c.S(32, 10)), c.solid(0xfbf8f0, { name: 'dial', roughness: 0.3, clearcoat: 1 }), 'stopwatch-face', w, [0, 0, 0.0155]);
  c.mk(new THREE.CylinderGeometry(0.016, 0.016, 0.03, c.S(12, 5)), c.mat('chrome'), 'stopwatch-crown', w, [0, 0.105, 0]);
  if (c.fine > 1) for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.mk(new THREE.BoxGeometry(0.005, 0.014, 0.002), c.mat('dark'), 'tick', w, [Math.sin(a) * 0.066, Math.cos(a) * 0.066, 0.017], [0, 0, -a]); }
  const hand = c.grp('stopwatch-hand', w, [0, 0, 0.019]);
  c.mk(new THREE.BoxGeometry(0.008, 0.07, 0.003), c.solid(0xd62828, { name: 'watch-hand', roughness: 0.4 }), 'stopwatch-hand', hand, [0, 0.03, 0]);
  c.live('stopwatch', g, [{ obj: hand, stage: (o, r, t) => { o.rotation.z = r.rotation.z - (t % 60) / 60 * TAU * 4; } }]);
  return g;
};

// ---- head

B.straw = (c, host) => {
  const g = c.grp('straw', host), a = c.fp(0.09, -0.19, 0.34);
  c.limb(a, [a[0] + 0.24, a[1] - 0.06, a[2] + 0.1], 0.009, c.solid(0xe0c060, { name: 'straw', roughness: 0.6 }), 'straw', g, 6, 2);
  return g;
};

B.weathervane = (c, host) => {
  const top = c.fp(0, 0.445, -0.02), g = c.grp('weathervane', host, top), gold = c.mat('gold');
  c.mk(new THREE.CylinderGeometry(0.07, 0.09, 0.03, c.S(20, 6)), gold, 'vane-base', g, [0, 0.005, 0]);
  c.mk(new THREE.CylinderGeometry(0.012, 0.014, 0.42, c.S(10, 5)), gold, 'vane-mast', g, [0, 0.21, 0]);
  // the compass cross, with N S E W balls
  for (const ry of [0, Math.PI / 2]) c.mk(new THREE.BoxGeometry(0.3, 0.012, 0.012), gold, 'vane-cross', g, [0, 0.23, 0], [0, ry, 0]);
  if (c.fine > 0) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; c.mk(new THREE.SphereGeometry(0.018, c.S(10, 5), c.S(8, 4)), gold, 'vane-ball', g, [Math.sin(a) * 0.15, 0.23, Math.cos(a) * 0.15]); }
  const vane = c.grp('vane-arrow', g, [0, 0.4, 0]);
  c.mk(new THREE.BoxGeometry(0.36, 0.014, 0.014), gold, 'vane-shaft', vane);
  c.mk(new THREE.ConeGeometry(0.035, 0.08, c.S(12, 4)), gold, 'vane-tip', vane, [0.21, 0, 0], [0, 0, -Math.PI / 2]);
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-0.1, 0.06); fin.lineTo(-0.11, -0.04); fin.lineTo(0, -0.01); fin.closePath();
  c.mk(new THREE.ExtrudeGeometry(fin, { depth: 0.006, bevelEnabled: false, curveSegments: 1 }), gold, 'vane-fin', vane, [-0.12, 0, -0.003]);
  c.mk(new THREE.SphereGeometry(0.02, c.S(10, 5), c.S(8, 4)), gold, 'vane-hub', vane);
  // it turns slowly with the wind and swings back
  const turn = (o, r, t) => { o.rotation.y = r.rotation.y + 1.1 * Math.sin(t * 0.45) + 0.5 * Math.sin(t * 1.3 + 1); };
  c.live('weathervane', g, [{ obj: vane, stage: turn, race: turn }]);
  return g;
};

// ---- hand (the hand group is at the hand's centre, axes as the seat's)

B.megaphone = (c, host) => {
  const g = c.grp('megaphone', host, [0, 0.02, 0.04]);
  g.quaternion.setFromUnitVectors(new V3(0, 1, 0), new V3(-0.25, 0.25, 1).normalize());
  const prof = [[0.03, 0], [0.034, 0.05], [0.04, 0.09], [0.12, 0.33], [0.13, 0.34]].map(([x, y]) => new THREE.Vector2(x, y));
  const shell = c.solid(0xf4f1ea, { name: 'megaphone-shell', roughness: 0.35, clearcoat: 0.8, side: THREE.DoubleSide });
  c.mk(new THREE.LatheGeometry(prof, c.S(64, 8)), shell, 'megaphone-cone', g);
  c.mk(new THREE.TorusGeometry(0.125, 0.012, c.S(12, 4), c.S(64, 10)), c.mat('red'), 'megaphone-rim', g, [0, 0.335, 0], [Math.PI / 2, 0, 0]);
  c.mk(new THREE.BoxGeometry(0.04, 0.1, 0.04), c.mat('red'), 'megaphone-grip', g, [0, 0.04, -0.06]);
  return g;
};

B.selfie = (c, host) => {
  const g = c.grp('selfie', host);
  const tip = new V3(0.5, 0.84, 0.15).normalize().multiplyScalar(0.85);   // telescopic, not fully out: the phone beside his head
  c.limb([0, -0.02, 0], [tip.x * 0.55, tip.y * 0.55, tip.z * 0.55], 0.018, c.mat('dark'), 'selfie-stick', g, 10, 2);
  c.limb([tip.x * 0.55, tip.y * 0.55, tip.z * 0.55], [tip.x, tip.y, tip.z], 0.012, c.mat('chrome'), 'selfie-stick', g, 10, 2);
  // the phone at the tip, its screen turned towards his face
  const ph = c.grp('selfie-phone', g, [tip.x, tip.y + 0.06, tip.z]);
  const face = new V3(...c.lay.head).sub(new V3(...c.lay.handR)).add(new V3(0, 0, 0.3));
  c.aim(ph, face.sub(ph.position).toArray());
  c.mk(new THREE.BoxGeometry(0.11, 0.2, 0.016), c.mat('dark'), 'phone-body', ph);
  c.mk(new THREE.PlaneGeometry(0.096, 0.18), c.mat('screen'), 'phone-screen', ph, [0, 0, 0.0085]);
  c.mk(new THREE.PlaneGeometry(0.096, 0.18), c.mat('screen'), 'phone-screen', ph, [0, 0, -0.0085], [0, Math.PI, 0]);
  c.live('selfie', g, []);
  c.hosts.selfie = ph;
  return g;
};

B.hourglass = (c, host) => {
  const g = c.grp('hourglass', host, [0, 0.13, 0.05]);
  const pts = [[0, 0], [0.07, 0], [0.075, 0.02], [0.06, 0.06], [0.012, 0.14], [0.06, 0.22], [0.075, 0.26], [0.07, 0.28], [0, 0.28]].map(([x, y]) => new THREE.Vector2(x, y - 0.14));
  const glass = c.clear(0xe8f0ff, 0.3);
  if (glass) c.mk(new THREE.LatheGeometry(pts, c.S(48, 8)), glass, 'hourglass-glass', g).castShadow = false;
  const sand = c.solid(0xe2b664, { name: 'sand', roughness: 0.9 });
  c.mk(new THREE.ConeGeometry(0.058, 0.08, c.S(32, 8)), sand, 'sand-bottom', g, [0, -0.09, 0]);
  const top = c.grp('sand-top', g, [0, 0.04, 0]);
  c.mk(new THREE.ConeGeometry(0.03, 0.035, c.S(24, 6)), sand, 'sand-top', top, null, [Math.PI, 0, 0]);
  const stream = c.grp('sand-stream', g, [0, -0.01, 0]);
  if (c.fine > 0) c.mk(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 5), sand, 'sand-stream', stream);
  for (const y of [-0.145, 0.145]) c.mk(new THREE.CylinderGeometry(0.09, 0.09, 0.02, c.S(32, 8)), c.mat('gold'), 'hourglass-cap', g, [0, y, 0]);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; c.mk(new THREE.CylinderGeometry(0.006, 0.006, 0.27, 6), c.mat('gold'), 'hourglass-post', g, [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08]); }
  // the last grains run out, over and over: the top shrinks, the stream flickers
  c.live('hourglass', g, [
    { obj: top, stage: (o, r, t) => { const k = 1 - (t % 6) / 6; o.scale.set(r.scale.x * (0.35 + 0.65 * k), r.scale.y * (0.3 + 0.7 * k), r.scale.z * (0.35 + 0.65 * k)); } },
    { obj: stream, stage: (o, r, t) => { o.scale.y = r.scale.y * (0.8 + 0.2 * Math.sin(t * 23)); } },
  ]);
  return g;
};

B.scissors = (c, host) => {
  const g = c.grp('scissors', host, [0, 0.02, 0.05]); g.rotation.set(-0.5, 0.3, 0.25);
  const gold = c.mat('gold');
  for (const s of [-1, 1]) {
    const blade = c.grp('scissors-blade', g); blade.rotation.z = s * 0.22;
    const sh = new THREE.Shape(); sh.moveTo(-0.018, 0); sh.lineTo(0.018, 0); sh.lineTo(0.004, 0.35); sh.lineTo(-0.006, 0.35); sh.closePath();
    c.mk(new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false, curveSegments: 1 }), gold, 'scissors-blade', blade, [s * 0.006, 0.03, s * 0.005]);
    c.mk(new THREE.TorusGeometry(0.045, 0.011, c.S(8, 4), c.S(24, 8)), gold, 'scissors-ring', blade, [s * 0.03, -0.04, 0]);
  }
  c.mk(new THREE.CylinderGeometry(0.012, 0.012, 0.03, c.S(10, 5)), c.mat('gold'), 'scissors-pivot', g, [0, 0.03, 0.004], [Math.PI / 2, 0, 0]);
  // the cut tricolore ribbon flutters from the blades
  ['blue', 'white', 'red'].forEach((m, i) => {
    const pts = [], nrm = [];
    for (let k = 0; k <= 6; k++) { pts.push([0.06 + k * 0.05, 0.3 - k * 0.035 + Math.sin(k * 1.4) * 0.018, (i - 1) * 0.02 + Math.cos(k * 1.2) * 0.02]); nrm.push([0, 0.3, 1]); }
    c.ribbon(pts, nrm, pts.map(() => 0.012), c.mat(m), 'ribbon', g);
  });
  return g;
};

B.spanner = (c, host) => {
  const g = c.grp('spanner', host, [0, 0.04, 0.04]); g.rotation.set(-0.25, 0, -0.18);
  const chrome = c.mat('chrome');
  const handle = roundRect(new THREE.Shape(), 0.06, 0.34, 0.025);
  c.mk(new THREE.ExtrudeGeometry(handle, { depth: 0.022, bevelEnabled: c.fine > 0, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: c.S(6, 2) }), chrome, 'spanner-handle', g, [0, 0.13, -0.011]);
  // the adjustable head: a C of jaws open upwards, and the knurled worm
  const head = c.grp('spanner-head', g, [0, 0.34, 0]);
  const jaw = new THREE.Shape(), a0 = Math.PI / 2 + 0.36;
  jaw.moveTo(Math.cos(a0) * 0.08, Math.sin(a0) * 0.08); jaw.absarc(0, 0, 0.08, a0, a0 + TAU - 0.72, false);
  jaw.lineTo(0.026, 0.012); jaw.lineTo(-0.026, 0.012); jaw.closePath();
  c.mk(new THREE.ExtrudeGeometry(jaw, { depth: 0.022, bevelEnabled: c.fine > 0, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: c.S(16, 4) }), chrome, 'spanner-jaw', head, [0, 0, -0.011]);
  c.mk(new THREE.CylinderGeometry(0.015, 0.015, 0.06, c.S(12, 5)), c.mat('dark'), 'spanner-worm', head, [0.0, -0.05, 0.016], [0, 0, Math.PI / 2]);
  return g;
};

B.calculator = (c, host) => {
  const g = c.grp('calculator', host, [0, 0.1, 0.06]); g.rotation.set(-0.45, -0.15, 0);
  c.mk(new THREE.BoxGeometry(0.16, 0.22, 0.025), c.solid(0x2b2b2b, { name: 'calc-body', roughness: 0.45 }), 'calculator-body', g);
  c.mk(new THREE.BoxGeometry(0.13, 0.04, 0.004), c.glow(0x9fd89f, 0.6), 'calculator-lcd', g, [0, 0.07, 0.0135]);
  const key = c.solid(0xe8e4da, { name: 'calc-key', roughness: 0.5 });
  if (c.fine > 0) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) c.mk(new THREE.BoxGeometry(0.024, 0.02, 0.006), k === 3 ? c.mat('red') : key, 'calculator-key', g, [-0.045 + k * 0.03, 0.025 - r * 0.033, 0.014]);
  else c.mk(new THREE.BoxGeometry(0.13, 0.13, 0.004), key, 'calculator-keys', g, [0, -0.025, 0.0135]);
  return g;
};

B.banana = (c, host) => {
  const g = c.grp('banana', host, [0, 0.06, 0.06]); g.rotation.set(-0.3, 0.2, 0.15); g.scale.setScalar(1.3);
  const yellow = c.solid(0xf5d33c, { name: 'banana', roughness: 0.45, clearcoat: 0.3 });
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = -0.75 + i / 6 * 1.5; pts.push([Math.sin(a) * 0.16, 0.1 - Math.cos(a) * 0.12 + 0.06, 0]); }
  c.tube(pts, 0.032, yellow, 'banana', g, 14);
  for (const p of [pts[0], pts[6]]) c.mk(new THREE.SphereGeometry(0.018, c.S(8, 4), c.S(6, 3)), c.solid(0x5a3a1a, { name: 'banana-tip', roughness: 0.8 }), 'banana-tip', g, p);
  // the steel ruler laid along it: the directive checks its curvature
  c.mk(new THREE.BoxGeometry(0.34, 0.03, 0.005), c.mat('chrome'), 'ruler', g, [0, 0.02, 0.04]);
  if (c.fine > 1) for (let i = 0; i < 11; i++) c.mk(new THREE.BoxGeometry(0.003, i % 5 ? 0.008 : 0.014, 0.002), c.mat('dark'), 'ruler-tick', g, [-0.15 + i * 0.03, 0.03, 0.043]);
  return g;
};

B.scythe = (c, host) => {
  const g = c.grp('scythe', host);
  const d = new V3(0.38, 0.75, -0.85).normalize();
  const a = d.clone().multiplyScalar(-0.32), b = d.clone().multiplyScalar(1.08);
  const wood = c.solid(0x8b5a2b, { name: 'snath', roughness: 0.6, clearcoat: 0.2 });
  c.limb(a.toArray(), b.toArray(), 0.022, wood, 'scythe-snath', g, 10, 2);
  c.limb(d.clone().multiplyScalar(0.25).toArray(), d.clone().multiplyScalar(0.25).add(new V3(0.1, 0.02, 0.07)).toArray(), 0.016, wood, 'scythe-grip', g, 8, 2);
  // the curved blade, sweeping out from the top of the snath
  const blade = c.grp('scythe-blade', g, b.toArray());
  c.aim(blade, d.toArray());
  const sh = new THREE.Shape(); sh.moveTo(0, 0.02); sh.quadraticCurveTo(0.3, 0.1, 0.6, -0.12); sh.quadraticCurveTo(0.3, 0.02, 0, -0.03); sh.closePath();
  const steel = c.solid(0xc9ccd2, { name: 'blade-steel', metalness: 1, roughness: 0.25 });
  c.mk(new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false, curveSegments: c.S(10, 3) }), steel, 'scythe-blade', blade, [0, 0, 0], [Math.PI / 2, 0, 0.6]);
  return g;
};

B.mic = (c, host) => {
  const g = c.grp('mic', host, [0, 0.03, 0]); g.rotation.set(-0.35, 0, 0.12);
  c.mk(new THREE.CylinderGeometry(0.022, 0.016, 0.16, c.S(16, 6)), c.mat('dark'), 'mic-shaft', g, [0, 0.03, 0]);
  c.mk(new THREE.BoxGeometry(0.075, 0.07, 0.075), c.solid(0xc8102e, { name: 'mic-foam', roughness: 0.95, sheen: 0.5, sheenColor: 0xff8080 }), 'mic-cube', g, [0, 0.1, 0]);
  c.mk(new THREE.SphereGeometry(0.045, c.S(20, 6), c.S(14, 4)), c.mat('chrome'), 'mic-head', g, [0, 0.165, 0]);
  return g;
};

// ---- on the selfie stick

B.ringlight = (c, host) => {
  const g = c.grp('ringlight', host);
  c.mk(new THREE.TorusGeometry(0.2, 0.018, c.S(10, 4), c.S(64, 12)), c.glow(0xffffff, 2.2), 'ringlight', g, [0, 0, 0.004]);
  return g;
};

B.hearts = (c, host) => {
  const g = c.grp('hearts', host), red = c.solid(0xe0203c, { name: 'heart', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const movers = [];
  for (let i = 0; i < 3; i++) {
    const h = c.grp('heart', g, [0.2 + i * 0.05, 0.05 + i * 0.12, -0.05]);
    c.mk(new THREE.ExtrudeGeometry(heartShape(), { depth: 0.02, bevelEnabled: c.fine > 0, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: c.S(6, 2) }), red, 'heart', h, [0, 0, -0.01], null, 1.2 - i * 0.15);
    // each rises from the phone, swells and shrinks away, a third of a cycle apart
    movers.push({ obj: h, stage: (o, r, t) => { const p = (t * 0.55 + i / 3) % 1; o.position.set(r.position.x + 0.05 * Math.sin(p * 6 + i), r.position.y + p * 0.32 - i * 0.12, r.position.z); o.scale.setScalar(r.scale.x * Math.sin(p * Math.PI) * 1.3); } });
  }
  c.live('hearts', g, movers);
  return g;
};

// ---- kart slots (the slot frame: +z to the kart's nose, the pilot at -z)

B.debatemic = (c, host) => {
  const g = c.grp('debatemic', host, [0.22, 0, 0]);
  c.mk(new THREE.BoxGeometry(0.1, 0.04, 0.1), c.mat('dark'), 'mic-clamp', g, [0, 0.02, 0]);
  const neck = [[0, 0.03, 0], [0, 0.2, -0.02], [-0.03, 0.36, -0.1], [-0.08, 0.44, -0.22]];
  c.tube(neck, 0.012, c.mat('dark'), 'gooseneck', g, 14);
  const head = c.grp('mic-head', g, neck[3]); c.aim(head, [-0.2, 0.3, -1]);
  c.mk(new THREE.CylinderGeometry(0.025, 0.018, 0.09, c.S(14, 6)), c.mat('dark'), 'mic-head', head, [0, 0, 0.03], [Math.PI / 2, 0, 0]);
  const tally = c.grp('tally', g, [0, 0.065, 0.03]);
  c.mk(new THREE.SphereGeometry(0.02, c.S(12, 5), c.S(8, 4)), c.glow(0xff2a2a, 2.4), 'tally-light', tally);
  c.live('debatemic', g, [{ obj: tally, stage: (o, r, t) => { o.scale.setScalar(r.scale.x * (0.85 + 0.2 * Math.max(0, Math.sin(t * 3)))); } }]);
  return g;
};

B.thermos = (c, host) => {
  const g = c.grp('thermos', host);
  c.mk(new THREE.CylinderGeometry(0.055, 0.055, 0.26, c.S(48, 8)), c.solid(0xc9ccd2, { name: 'brushed-steel', metalness: 1, roughness: 0.32 }), 'thermos-body', g, [0, 0.13, 0]);
  c.mk(new THREE.CylinderGeometry(0.06, 0.06, 0.06, c.S(48, 8)), c.solid(0x2f5a3a, { name: 'thermos-cap', roughness: 0.5 }), 'thermos-cap', g, [0, 0.29, 0]);
  c.mk(new THREE.CylinderGeometry(0.057, 0.057, 0.03, c.S(48, 8)), c.mat('gold'), 'thermos-band', g, [0, 0.07, 0]);
  c.mk(new THREE.BoxGeometry(0.03, 0.12, 0.13), c.mat('dark'), 'thermos-clip', g, [-0.06, 0.08, 0]);
  return g;
};

B.barricade = (c, host) => {
  const g = c.grp('barricade', host, [0, 0, 0.02]);
  const wood = c.solid(0xa0784a, { name: 'pallet-wood', roughness: 0.85 });
  for (let i = 0; i < 4; i++) c.mk(new THREE.BoxGeometry(0.62, 0.07, 0.025), wood, 'pallet-board', g, [0, 0.06 + i * 0.1, 0.03]);
  for (const x of [-0.26, 0, 0.26]) c.mk(new THREE.BoxGeometry(0.07, 0.42, 0.06), wood, 'pallet-block', g, [x, 0.21, -0.015]);
  c.mk(new THREE.TorusGeometry(0.13, 0.05, c.S(12, 4), c.S(32, 8)), c.mat('rubber'), 'old-tyre', g, [0.12, 0.16, -0.12], [0.35, 0.4, 0]);
  return g;
};

B.barbecue = (c, host) => {
  const g = c.grp('barbecue', host, [0, 0.19, 0]);
  const enamel = c.solid(0x151517, { name: 'grill-enamel', roughness: 0.3, clearcoat: 1, side: THREE.DoubleSide });
  c.mk(new THREE.SphereGeometry(0.2, c.S(48, 8), c.S(24, 4), 0, TAU, Math.PI / 2, Math.PI / 2), enamel, 'grill-bowl', g);
  const coal = c.ownGlow(0xff5a1a, 2.2);
  c.mk(new THREE.CircleGeometry(0.18, c.S(32, 8)), coal.material, 'grill-coals', g, [0, -0.04, 0], [-Math.PI / 2, 0, 0]);
  c.mk(new THREE.TorusGeometry(0.195, 0.008, c.S(8, 3), c.S(48, 10)), c.mat('chrome'), 'grill-grate', g, [0, 0.005, 0], [Math.PI / 2, 0, 0]);
  if (c.fine > 0) for (let i = -3; i <= 3; i++) c.mk(new THREE.CylinderGeometry(0.004, 0.004, 2 * Math.sqrt(0.195 ** 2 - (i * 0.05) ** 2), 5), c.mat('chrome'), 'grate-bar', g, [i * 0.05, 0.005, 0], [Math.PI / 2, 0, 0]);
  const saus = c.solid(0x8a2f1c, { name: 'merguez', roughness: 0.35, clearcoat: 0.7 });
  for (let i = -1; i <= 1; i++) c.limb([i * 0.065, 0.03, -0.1], [i * 0.065 + 0.012, 0.03, 0.1], 0.024, saus, 'merguez', g, 12, 4);
  if (c.fine > 0) for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.4; c.limb([Math.cos(a) * 0.1, -0.15, Math.sin(a) * 0.1], [Math.cos(a) * 0.15, -0.19, Math.sin(a) * 0.15], 0.01, c.mat('chrome'), 'grill-leg', g, 6, 2); }
  c.live('barbecue', g, coal.anim ? [{ obj: g, stage: (o, r, t) => coal.anim(1.9 + 0.35 * Math.sin(t * 7) + 0.25 * Math.sin(t * 13.3)) }] : []);
  return g;
};

B.kitten = (c, host) => {
  const fur = c.solid(0xe08a3a, { name: 'kitten-fur', roughness: 0.8, sheen: 1, sheenColor: 0xffd0a0 });
  const { g, tail } = kittenBody(c, host, [-0.2, 0, 0], fur);
  c.live('kitten', g, [{ obj: tail, stage: (o, r, t) => { const f = Math.pow(Math.max(0, Math.sin(t * 1.7)), 6); o.rotation.set(r.rotation.x, r.rotation.y + 0.5 * f * Math.sin(t * 14), r.rotation.z + 0.15 * Math.sin(t * 1.1)); } }]);
  return g;
};

B.catbasket = (c, host) => {
  const g = c.grp('catbasket', host, [0, 0, 0.0]);
  const wicker = c.solid(0x9a6a36, { name: 'wicker', roughness: 0.85, ...c.weave() });
  c.mk(new THREE.CylinderGeometry(0.17, 0.17, 0.44, c.S(24, 8), 1, false, Math.PI / 2, Math.PI), wicker, 'basket', g, [0, 0.17, 0], [0, 0, Math.PI / 2]);
  const lid = c.grp('basket-lid', g, [0, 0.17, -0.17]); lid.rotation.x = -0.9;
  c.mk(new THREE.CylinderGeometry(0.17, 0.17, 0.44, c.S(24, 8), 1, true, -Math.PI / 2, Math.PI * 0.6), wicker, 'basket-lid', lid, [0, 0, 0.17], [0, 0, Math.PI / 2]);
  const grey = c.solid(0x8a8a90, { name: 'kitten-grey', roughness: 0.8, sheen: 1, sheenColor: 0xe0e0f0 });
  const ginger = c.solid(0xe08a3a, { name: 'kitten-fur', roughness: 0.8, sheen: 1, sheenColor: 0xffd0a0 });
  [[-0.1, grey], [0.1, ginger]].forEach(([x, fur]) => {
    const h = c.grp('basket-kitten', g, [x, 0.33, 0.0]);
    c.mk(new THREE.SphereGeometry(0.065, c.S(20, 6), c.S(14, 4)), fur, 'kitten-skull', h, null, null, [1.08, 0.95, 1]);
    for (const s of [-1, 1]) c.mk(new THREE.ConeGeometry(0.026, 0.05, c.S(8, 4)), fur, 'kitten-ear', h, [s * 0.04, 0.06, 0], [0, 0, -s * 0.35]);
    if (c.fine > 0) for (const s of [-1, 1]) c.mk(new THREE.SphereGeometry(0.011, 8, 5), c.mat('iris'), 'kitten-eye', h, [s * 0.025, 0.01, -0.058]);
  });
  return g;
};

B.dossier = (c, host) => {
  const g = c.grp('dossier', host, [0.18, 0, 0.02]);
  const buff = c.solid(0xd9c08a, { name: 'case-file', roughness: 0.85 });
  for (let i = 0; i < 4; i++) c.mk(new THREE.BoxGeometry(0.3, 0.045, 0.22), buff, 'case-file', g, [Math.sin(i * 2.1) * 0.015, 0.023 + i * 0.047, Math.cos(i * 1.7) * 0.012], [0, (i - 1.5) * 0.06, 0]);
  if (c.fine > 0) c.mk(new THREE.BoxGeometry(0.31, 0.012, 0.23), c.solid(0xf4efe0, { name: 'paper', roughness: 0.9 }), 'paper-edge', g, [0.006, 0.1, 0]);
  for (const x of [-0.07, 0.07]) c.mk(new THREE.BoxGeometry(0.03, 0.2, 0.235), c.mat('red'), 'dossier-strap', g, [x, 0.1, 0]);
  return g;
};

B.wheelclamp = (c, host) => {
  const g = c.grp('wheelclamp', host, [-0.05, 0.0, 0.0]);
  const yellow = c.solid(0xf2c14e, { name: 'clamp-yellow', roughness: 0.35, clearcoat: 0.8 });
  c.mk(new THREE.TorusGeometry(0.15, 0.03, c.S(10, 4), c.S(32, 8), Math.PI * 1.2), yellow, 'clamp-jaw', g, [0, 0.17, 0], [0, Math.PI / 2, Math.PI * 0.9]);
  c.mk(new THREE.TorusGeometry(0.12, 0.03, c.S(10, 4), c.S(32, 8), Math.PI), yellow, 'clamp-jaw', g, [0.08, 0.17, 0], [0, Math.PI / 2, -0.2]);
  c.mk(new THREE.BoxGeometry(0.06, 0.06, 0.36), yellow, 'clamp-arm', g, [0.05, 0.05, 0.05], [0.25, 0, 0]);
  c.mk(new THREE.CylinderGeometry(0.04, 0.04, 0.07, c.S(14, 5)), c.mat('chrome'), 'clamp-lock', g, [0.05, 0.1, -0.12], [Math.PI / 2, 0, 0]);
  return g;
};

B.tractormirror = (c, host) => {
  const g = c.grp('tractor-mirror', host);
  c.limb([-0.04, 0, 0], [0.2, 0.66, 0.05], 0.022, c.mat('dark'), 'mirror-stalk', g, 12, 3);
  const h = c.grp('mirror-head', g, [0.22, 0.74, 0.05]); h.rotation.set(0, -2.4, 0);
  c.mk(new THREE.TorusGeometry(0.13, 0.02, c.S(12, 4), c.S(48, 10)), c.mat('dark'), 'mirror-frame', h);
  c.mk(new THREE.CircleGeometry(0.125, c.S(48, 10)), c.solid(0xffffff, { name: 'mirror-glass', metalness: 1, roughness: 0.02 }), 'mirror-glass', h, [0, 0, 0.004]);
  c.mk(new THREE.CircleGeometry(0.13, c.S(48, 10)), c.mat('dark'), 'mirror-back', h, [0, 0, -0.004], [0, Math.PI, 0]);
  return g;
};

B.rabot = (c, host) => {
  const g = c.grp('rabot', host, [0.16, 0, 0.0]); g.rotation.y = 0.5;
  const wood = c.solid(0xb07a42, { name: 'plane-wood', roughness: 0.55, clearcoat: 0.3 });
  c.mk(new THREE.BoxGeometry(0.1, 0.07, 0.3), wood, 'plane-body', g, [0, 0.035, 0]);
  c.mk(new THREE.SphereGeometry(0.03, c.S(14, 5), c.S(10, 4)), wood, 'plane-knob', g, [0, 0.09, 0.1]);
  c.mk(new THREE.TorusGeometry(0.04, 0.014, c.S(8, 3), c.S(16, 6), Math.PI), wood, 'plane-handle', g, [0, 0.07, -0.09], [0, Math.PI / 2, 0]);
  c.mk(new THREE.BoxGeometry(0.08, 0.06, 0.012), c.mat('chrome'), 'plane-iron', g, [0, 0.085, 0.01], [-0.7, 0, 0]);
  // the shaving curls off the front, long and thin: the cuts start with his own kart
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = i / 10 * TAU * 1.4; pts.push([Math.sin(a) * 0.035, 0.1 + i * 0.008 + (1 - Math.cos(a)) * 0.03, 0.02 + i * 0.012]); }
  c.ribbon(pts, pts.map(p => [p[0], 0.3, 1]), pts.map(() => 0.022), c.solid(0xf0d6a0, { name: 'shaving', roughness: 0.7, side: THREE.DoubleSide }), 'shaving', g);
  return g;
};

B.goldurn = (c, host) => {
  const g = c.grp('goldurn', host, [-0.2, 0, 0.02]); g.rotation.set(0, 0.25, 0.12);
  const gold = c.mat('gold');
  c.mk(new THREE.BoxGeometry(0.2, 0.16, 0.15), gold, 'urn-body', g, [0, 0.09, 0]);
  c.mk(new THREE.BoxGeometry(0.22, 0.025, 0.17), gold, 'urn-lid', g, [0, 0.18, 0]);
  c.mk(new THREE.BoxGeometry(0.21, 0.02, 0.16), gold, 'urn-plinth', g, [0, 0.01, 0]);
  c.mk(new THREE.BoxGeometry(0.09, 0.006, 0.016), c.mat('dark'), 'urn-slot', g, [0, 0.194, 0]);
  [['blue', -1], ['white', 0], ['red', 1]].forEach(([m, i]) => c.mk(new THREE.BoxGeometry(0.067, 0.03, 0.153), c.mat(m), 'urn-band', g, [i * 0.067, 0.09, 0]));
  return g;
};

B.gyrophare = (c, host) => {
  const mast = c.roofMast;
  const g = c.grp('gyrophare', host);
  c.mk(new THREE.CylinderGeometry(0.02, 0.025, mast, c.S(10, 5)), c.mat('dark'), 'siren-mast', host, [0, -mast / 2, 0]);
  c.mk(new THREE.BoxGeometry(0.44, 0.03, 0.1), c.mat('dark'), 'siren-bar', g, [0, -0.045, 0]);
  const blue = c.ownGlow(0x2a5bff, 2.5), red = c.ownGlow(0xff2a3a, 0.4);
  c.mk(c.capsuleGeo(0.07, 0.16, 12, 32), blue.material, 'siren-left', g, [-0.14, 0.03, 0], [0, 0, Math.PI / 2]);
  c.mk(c.capsuleGeo(0.07, 0.16, 12, 32), red.material, 'siren-right', g, [0.14, 0.03, 0], [0, 0, Math.PI / 2]);
  // blue and red flash alternately on the stage; in a race the bar spins, like a rotating beacon
  const flash = (o, r, t) => { const on = Math.sin(t * 9) > 0; blue.anim?.(on ? 0.35 : 2.6); red.anim?.(on ? 2.6 : 0.35); };
  const spin = (o, r, t) => { o.rotation.y = r.rotation.y + t * 6; };
  c.live('gyrophare', g, [{ obj: g, stage: flash, race: spin }]);
  return g;
};

B.briefcase = (c, host) => {
  const g = c.grp('briefcase', host, [0, 0, 0.02]); g.rotation.y = 0.15;
  const leather = c.solid(0x6b3e1e, { name: 'briefcase-leather', roughness: 0.45, clearcoat: 0.4, sheen: 0.4, sheenColor: 0xc08050 });
  c.mk(new THREE.BoxGeometry(0.44, 0.11, 0.3), leather, 'briefcase-body', g, [0, 0.055, 0]);
  c.mk(new THREE.BoxGeometry(0.446, 0.014, 0.306), c.mat('gold'), 'briefcase-band', g, [0, 0.085, 0]);
  for (const x of [-0.12, 0.12]) c.mk(new THREE.BoxGeometry(0.04, 0.03, 0.02), c.mat('gold'), 'briefcase-clasp', g, [x, 0.08, 0.155]);
  c.mk(new THREE.TorusGeometry(0.04, 0.01, c.S(6, 3), c.S(16, 6), Math.PI), leather, 'briefcase-handle', g, [0, 0.112, 0.15], [0, 0, 0]);
  const paper = c.solid(0xf4efe0, { name: 'paper', roughness: 0.9 });
  if (c.fine > 0) [[-0.1, 0.2], [0.04, -0.15], [0.13, 0.1]].forEach(([x, r]) => c.mk(new THREE.BoxGeometry(0.12, 0.004, 0.16), paper, 'paper', g, [x, 0.07, -0.16], [0.3, r, 0]));
  for (const x of [-0.16, 0.16]) c.mk(new THREE.BoxGeometry(0.03, 0.13, 0.32), c.mat('dark'), 'briefcase-strap', g, [x, 0.06, 0]);
  return g;
};

/** Every PROPS entry's builder, by name: `(ctx, host) => Group`. */
export const PROP_BUILDERS = Object.freeze(B);

/**
 * Build a pilot's props in order: body and head props on their groups, the
 * hand prop in the hand, kart props in their slots, then props that sit on
 * another prop once their host exists. Returns { name: group }.
 */
export function buildProps(ctx, names, defs) {
  const out = {}, later = [];
  for (const name of names) {
    const d = defs[name], build = B[name];
    if (!d || !build) throw new Error('props: no builder for "' + name + '"');
    if (d.at === 'body') out[name] = build(ctx, ctx.seat);
    else if (d.at === 'head') out[name] = build(ctx, ctx.head);
    else if (d.at === 'hand') out[name] = build(ctx, ctx.hand);
    else if (d.at === 'kart') out[name] = build(ctx, ctx.slot(d.slot));
    else later.push(name);
  }
  for (const name of later) {
    const host = ctx.hosts[defs[name].at] || out[defs[name].at];
    if (!host) throw new Error('props: "' + name + '" needs its host "' + defs[name].at + '"');
    out[name] = B[name](ctx, host);
  }
  return out;
}
