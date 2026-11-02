// The items' 3D props: what a thrown item and a dropped hazard look like on
// the road (DEC-071).
//
// items.js decides what an item does; this module only draws it. Every
// projectile is built facing +z (the way it flies), its root on the height
// the simulation gives it, and carries a `userData.anim(dt, t)` that moves
// its parts: the BRAV-M's wheels, beacons and lean, the Mediapart envelope's
// flap and the sheets around it, the censure stamp's pump, the fact-check
// glass's glint. poseProjectile() turns the whole prop toward where it is
// going (the solo simulation passes its direction, a networked client the
// step between two snapshots) and runs that animation, so a solo race and a
// team race show the same thing.
//
// A hazard with moving parts (the strike's burning barrel, the tear-gas
// cloud) is animated through G.animated like the fake urne: animate() hooks
// it in and unhooks it once the hazard has left the scene, so a race full
// of dropped hazards never piles up dead callbacks.
//
// Materials: the solid parts come from primitives.js's shared cache; the
// lights (headlights, beacons, flames, glints) from a small cache of
// unlit materials here, built once, so a race never compiles a program
// mid-lap for them (prebuild.js primes one of each prop during the
// countdown).
import * as THREE from 'three';

import { box, cone, cyl, mat, sph, textPlane } from './primitives.js';
import { G } from './state.js';

const glowCache = new Map();
/** An unlit material of `color` (a light, a flame), additive when `add`, cached by its look. */
function glow(color, { opacity = 1, add = false } = {}) {
  const key = color + ':' + opacity + ':' + add;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || add, opacity, depthWrite: !(opacity < 1 || add), blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    glowCache.set(key, m);
  }
  return m;
}
const glassCache = new Map();
/** A see-through standard material (a windshield, a lens). */
function glass(color, opacity) {
  const key = color + ':' + opacity;
  let m = glassCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.2, transparent: true, opacity, depthWrite: false }); glassCache.set(key, m); }
  return m;
}
const mesh = (geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); return m; };

// ---------- The projectiles ----------

/**
 * A BRAV-M motorbike: two officers in black, helmets and visors, the
 * passenger's baton up, a blue fairing with POLICE on the panniers, a
 * headlight with its beam, and blue and red beacons that flash in turn.
 */
function bravm() {
  const g = new THREE.Group(), bike = new THREE.Group(); g.add(bike);
  // the frame, the tank and the seat
  bike.add(box(0.42, 0.36, 1.5, 0x161a26, 0, 0.72, 0));
  bike.add(box(0.56, 0.3, 0.62, 0x1f3a93, 0, 1.02, 0.28));
  bike.add(box(0.58, 0.07, 0.62, 0xf6f1e4, 0, 1.05, 0.28));
  bike.add(box(0.46, 0.12, 0.95, 0x0d0f15, 0, 1.0, -0.4));
  // the fairing, its stripe and the windshield
  bike.add(box(0.74, 0.58, 0.28, 0x1f3a93, 0, 1.18, 0.86));
  bike.add(box(0.76, 0.1, 0.3, 0xf6f1e4, 0, 1.18, 0.86));
  const shield = mesh(new THREE.BoxGeometry(0.62, 0.42, 0.04), glass(0xbfe2ff, 0.45), 0, 1.6, 0.92); shield.rotation.x = -0.45; bike.add(shield);
  // the headlight and its glow
  bike.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), glow(0xfff4c0), 0, 1.04, 1.02));
  bike.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), glow(0xfff1b0, { opacity: 0.3, add: true }), 0, 1.04, 1.05));
  // the handlebar, the fork and the exhaust
  bike.add(box(0.86, 0.06, 0.06, 0x2a2a2a, 0, 1.36, 0.66));
  const fork = cyl(0.05, 0.05, 0.95, 0xb8bcc6, 0, 0.92, 0.95, 6); fork.rotation.x = 0.35; bike.add(fork);
  const pipe = cyl(0.07, 0.09, 0.8, 0x8a8f99, 0.3, 0.55, -0.62, 8); pipe.rotation.x = Math.PI / 2; bike.add(pipe);
  // the panniers, POLICE on each
  for (const s of [1, -1]) {
    bike.add(box(0.26, 0.36, 0.52, 0x1f3a93, s * 0.4, 0.82, -0.72));
    const label = textPlane(0.5, 0.17, 'POLICE', '#1f3a93', '#ffffff', 96); label.position.set(s * 0.535, 0.84, -0.72); label.rotation.y = s * Math.PI / 2; bike.add(label);
  }
  // the wheels, spun by the animation
  const wheels = [];
  const tyre = new THREE.CylinderGeometry(0.46, 0.46, 0.2, 14); tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.22, 8); hub.rotateZ(Math.PI / 2);
  for (const z of [0.95, -0.8]) {
    const w = new THREE.Group(); w.position.set(0, 0.46, z);
    w.add(mesh(tyre, mat(0x111111))); w.add(mesh(hub, mat(0xc0c4cc, 0.3)));
    w.add(box(0.23, 0.08, 0.7, 0x5a5e66, 0, 0, 0));   // a spoke bar, so the spin reads
    bike.add(w); wheels.push(w);
  }
  // the two officers
  const officer = (z, seatY, passenger) => {
    const o = new THREE.Group(); o.position.set(0, seatY, z);
    o.add(box(0.5, 0.62, 0.32, 0x1c1f27, 0, 0.36, 0));                       // the jacket
    o.add(box(0.52, 0.14, 0.34, 0x2e3340, 0, 0.12, 0));                      // the belt
    for (const s of [1, -1]) o.add(box(0.16, 0.5, 0.18, 0x15171d, s * 0.2, -0.1, 0.22));   // the thighs along the tank
    o.add(sph(0.24, 0x2a2e38, 0, 0.88, 0, 12));                              // the helmet
    o.add(box(0.36, 0.14, 0.06, 0x0b0d12, 0, 0.86, 0.22));                   // its visor
    o.add(box(0.5, 0.04, 0.05, 0xf2c14e, 0, 0.98, 0.18));                    // a gold band
    if (passenger) {
      const arm = new THREE.Group(); arm.position.set(0.28, 0.55, 0); arm.rotation.z = -0.9; o.add(arm);
      arm.add(box(0.14, 0.45, 0.14, 0x1c1f27, 0, 0.22, 0));
      arm.add(cyl(0.04, 0.04, 0.7, 0x0b0b0b, 0, 0.7, 0, 6));               // the baton
      o.userData.arm = arm;
      const back = textPlane(0.42, 0.15, 'POLICE', '#1c1f27', '#ffffff', 96); back.position.set(0, 0.42, -0.17); back.rotation.y = Math.PI; o.add(back);
    } else {
      for (const s of [1, -1]) { const a = box(0.13, 0.13, 0.55, 0x1c1f27, s * 0.3, 0.45, 0.3); a.rotation.x = 0.4; o.add(a); }   // arms to the bars
    }
    bike.add(o); return o;
  };
  officer(0.02, 1.1, false);
  const rear = officer(-0.62, 1.22, true);
  // the beacons on a bar behind the passenger
  bike.add(cyl(0.03, 0.03, 0.6, 0x333333, 0, 1.5, -1.05, 5));
  const blue = mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0x3a6bff), -0.18, 1.82, -1.05);
  const red = mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0xff3a4a), 0.18, 1.82, -1.05);
  const halo = mesh(new THREE.SphereGeometry(0.42, 10, 8), glow(0x3a6bff, { opacity: 0.35, add: true }), 0, 1.82, -1.05);
  bike.add(blue, red, halo);
  g.userData.anim = (dt, t) => {
    for (const w of wheels) w.rotation.x += dt * 26;
    const on = Math.floor(t * 8) % 2 === 0;
    blue.visible = on; red.visible = !on; halo.position.x = on ? -0.18 : 0.18;
    halo.material = glow(on ? 0x3a6bff : 0xff3a4a, { opacity: 0.35, add: true });
    bike.rotation.z = THREE.MathUtils.clamp(-(g.userData.turn || 0) * 0.12, -0.35, 0.35) + Math.sin(t * 11) * 0.02;
    bike.position.y = Math.abs(Math.sin(t * 17)) * 0.04;
    if (rear.userData.arm) rear.userData.arm.rotation.z = -0.9 + Math.sin(t * 9) * 0.35;
  };
  return g;
}

/**
 * The Mediapart dossier: a sealed envelope flying tilted toward the camera
 * behind it, MEDIAPART on its red band, a wax seal, CONFIDENTIEL stamped, its
 * flap lifting, and leaked sheets circling it.
 */
function dossier() {
  const g = new THREE.Group(), env = new THREE.Group(); env.rotation.x = 1.0; g.add(env);   // the back up and toward the chasing camera
  env.add(box(1.4, 0.95, 0.06, 0xf3ead2, 0, 0, 0));
  // the back, toward the camera: the flap (hinged on the top edge), the band, the seal
  const flapShape = new THREE.Shape(); flapShape.moveTo(-0.7, 0); flapShape.lineTo(0.7, 0); flapShape.lineTo(0, -0.52); flapShape.lineTo(-0.7, 0);
  const flap = new THREE.Group(); flap.position.set(0, 0.475, -0.035); env.add(flap);
  const flapMesh = mesh(new THREE.ShapeGeometry(flapShape), new THREE.MeshStandardMaterial({ color: 0xe2d2a8, roughness: 0.9, side: THREE.DoubleSide })); flap.add(flapMesh);
  const band = textPlane(1.3, 0.22, 'MEDIAPART', '#c8102e', '#ffffff', 92); band.position.set(0, -0.3, -0.04); band.rotation.y = Math.PI; env.add(band);
  const stamp = textPlane(0.8, 0.13, 'CONFIDENTIEL', '#f3ead2', '#c8102e', 70); stamp.position.set(0.25, 0.27, -0.045); stamp.rotation.set(0, Math.PI, -0.18); env.add(stamp);
  const seal = cyl(0.17, 0.17, 0.06, 0xa50f1c, 0, 0.0, -0.05, 14); seal.rotation.x = Math.PI / 2; env.add(seal);
  env.add(sph(0.09, 0xd8303c, 0, 0.0, -0.08, 8));
  // the leaked sheets, orbiting
  const sheets = [];
  const sheetGeo = new THREE.PlaneGeometry(0.34, 0.44);
  for (let i = 0; i < 3; i++) { const s = mesh(sheetGeo, new THREE.MeshStandardMaterial({ color: i === 1 ? 0xffffff : 0xfff5dd, roughness: 0.9, side: THREE.DoubleSide })); g.add(s); sheets.push(s); }
  // a soft gold halo, so it reads at speed against the road
  const halo = mesh(new THREE.TorusGeometry(0.95, 0.05, 6, 28), glow(0xf2c14e, { opacity: 0.55, add: true }), 0, 0, -0.1); env.add(halo);
  g.userData.anim = (dt, t) => {
    env.position.y = Math.sin(t * 6) * 0.15;
    env.rotation.z = Math.sin(t * 4.3) * 0.18;
    flap.rotation.x = -0.15 - Math.abs(Math.sin(t * 5)) * 0.6;
    sheets.forEach((s, i) => {
      const a = t * 3.2 + i * (Math.PI * 2 / 3);
      s.position.set(Math.cos(a) * 1.1, 0.1 + Math.sin(t * 5 + i) * 0.25, Math.sin(a) * 0.7 - 0.2);
      s.rotation.set(t * 4 + i, a, Math.sin(t * 6 + i) * 0.8);
    });
    halo.scale.setScalar(1 + Math.sin(t * 9) * 0.06);
  };
  return g;
}

/**
 * The motion de censure: a giant rubber stamp, CENSURE on its sides, its
 * knob and neck in varnished wood, a red glow under the pad. It flies high
 * over the field and comes down on the leader, pumping as it goes.
 */
function motion() {
  const g = new THREE.Group(), st = new THREE.Group(); g.add(st);
  st.add(sph(0.38, 0x8b5a2b, 0, 1.75, 0, 14));
  st.add(cyl(0.16, 0.2, 0.85, 0x6b4423, 0, 1.2, 0, 10));
  st.add(box(1.7, 0.36, 1.05, 0x7a0f1a, 0, 0.62, 0));
  st.add(box(1.76, 0.08, 1.1, 0xf2c14e, 0, 0.82, 0));
  st.add(box(1.6, 0.14, 0.95, 0xc8102e, 0, 0.37, 0));
  for (const [z, ry] of [[0.53, 0], [-0.53, Math.PI]]) { const s = textPlane(1.5, 0.3, 'CENSURE', '#7a0f1a', '#ffffff', 110); s.position.set(0, 0.62, z); s.rotation.y = ry; st.add(s); }
  for (const [x, ry] of [[0.86, Math.PI / 2], [-0.86, -Math.PI / 2]]) { const s = textPlane(0.95, 0.3, '49.3', '#7a0f1a', '#f2c14e', 120); s.position.set(x, 0.62, 0); s.rotation.y = ry; st.add(s); }
  const pad = mesh(new THREE.PlaneGeometry(1.5, 0.85), glow(0xff3a4a, { opacity: 0.7, add: true }), 0, 0.29, 0); pad.rotation.x = Math.PI / 2; st.add(pad);
  const ring = mesh(new THREE.TorusGeometry(1.25, 0.07, 6, 28), glow(0xff3a4a, { opacity: 0.45, add: true }), 0, 0.3, 0); ring.rotation.x = Math.PI / 2; st.add(ring);
  g.userData.anim = (dt, t) => {
    st.rotation.y += dt * 2.4;
    st.position.y = -0.3 + Math.abs(Math.sin(t * 5)) * 0.35;
    ring.scale.setScalar(1 + (t * 2 % 1) * 0.6);
  };
  return g;
}

/**
 * The fact-check: a brass magnifying glass carried lens first, a glint
 * sweeping its glass, a cyan halo pulsing round it, VRAI / FAUX turning
 * inside the lens.
 */
function factcheck() {
  const g = new THREE.Group(), glassG = new THREE.Group(); g.add(glassG);
  const rim = mesh(new THREE.TorusGeometry(0.62, 0.11, 8, 28), mat(0xc9a227, 0.35)); glassG.add(rim);
  glassG.add(mesh(new THREE.CircleGeometry(0.56, 24), glass(0x9fd8ff, 0.4)));
  const glint = mesh(new THREE.PlaneGeometry(0.12, 1.0), glow(0xffffff, { opacity: 0.7, add: true }), 0, 0, 0.02); glassG.add(glint);
  const verdict = textPlane(0.7, 0.26, 'FAUX', '#ffffff', '#c8102e', 150); verdict.position.z = -0.03; verdict.rotation.y = Math.PI; glassG.add(verdict);
  const handle = cyl(0.08, 0.11, 0.95, 0x6b4a2b, 0, -1.05, 0, 8); glassG.add(handle);
  glassG.add(cyl(0.12, 0.12, 0.14, 0xc9a227, 0, -0.62, 0, 8));
  const halo = mesh(new THREE.TorusGeometry(0.85, 0.04, 6, 28), glow(0x9fd8ff, { opacity: 0.6, add: true })); glassG.add(halo);
  g.userData.anim = (dt, t) => {
    glassG.rotation.z = Math.sin(t * 5) * 0.35;
    glassG.position.y = Math.sin(t * 7) * 0.12;
    glint.rotation.z = t * 3; glint.position.x = Math.sin(t * 4) * 0.25;
    halo.scale.setScalar(1 + Math.sin(t * 10) * 0.08);
  };
  return g;
}

const PROJECTILES = { bravm, dossier, motion, factcheck };

/** The prop of a projectile of `type`, facing +z, unplaced; an unknown type gets the censure stamp, as before. */
export function buildProjectileMesh(type) {
  return (PROJECTILES[type] ?? motion)();
}

/**
 * Turn projectile prop `g` toward (dx, dz) -- eased, so a homing turn
 * sweeps -- note how fast it turns (the BRAV-M leans into it), and run its
 * animation. A null or zero direction keeps the heading it has.
 */
export function poseProjectile(g, dx, dz, dt, t) {
  const u = g.userData;
  if (dx || dz) {
    const want = Math.atan2(dx, dz);
    if (u.yaw === undefined) u.yaw = want;
    let d = want - u.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const step = d * Math.min(1, dt * 12);
    u.turn = dt > 0 ? step / dt : 0;
    u.yaw += step;
    g.rotation.y = u.yaw;
  }
  if (u.anim) u.anim(dt, t);
}

// ---------- The hazards ----------

/** Run `tick(dt, t)` every frame while `g` is in a scene; drop it once `g` has been taken out. */
export function animate(g, tick) {
  let seen = false;
  const f = dt => {
    if (g.parent) { seen = true; tick(dt, G.time); return; }
    if (seen) { const i = G.animated.indexOf(f); if (i >= 0) G.animated.splice(i, 1); }
  };
  G.animated.push(f);
  return f;
}

/**
 * The strike's barricade (Grève générale): the red and white barrier, a
 * stack of tyres, a pallet, a GRÈVE ! placard and a barrel burning.
 */
export function barricade(g) {
  g.add(box(2.6, 0.5, 0.25, 0xc8102e, 0, 1.0, 0)); [-0.9, 0, 0.9].forEach(o => g.add(box(0.5, 0.5, 0.27, 0xffffff, o, 1.0, 0)));
  [-1.0, 1.0].forEach(o => { g.add(box(0.15, 1.3, 0.15, 0x333333, o, 0.65, 0.25)); g.add(box(0.15, 1.3, 0.15, 0x333333, o, 0.65, -0.25)); });
  // the placard, both ways
  g.add(cyl(0.05, 0.05, 2.4, 0x8b5a2b, 0.4, 1.2, -0.45, 6));
  for (const [dz, ry] of [[-0.01, 0], [0.01, Math.PI]]) { const sign = textPlane(1.3, 0.6, 'GRÈVE !', '#f6f1e4', '#c8102e', 150); sign.position.set(0.4, 2.3, -0.45 + dz); sign.rotation.y = ry; g.add(sign); }   // back to back: it reads from both ways
  // the tyres
  const tyre = new THREE.TorusGeometry(0.42, 0.18, 8, 16); tyre.rotateX(Math.PI / 2);
  for (let i = 0; i < 3; i++) g.add(mesh(tyre, mat(0x151515), -1.7, 0.18 + i * 0.34, 0.5));
  // the pallet
  for (let i = 0; i < 3; i++) g.add(box(1.1, 0.08, 0.2, 0xb08850, 1.7, 0.06, -0.4 + i * 0.4));
  g.add(box(1.1, 0.12, 1.0, 0x8b6a3e, 1.7, 0.16, 0));
  // the burning barrel
  g.add(cyl(0.35, 0.35, 0.9, 0x4a4f57, 1.7, 0.67, 0, 12));
  g.add(cyl(0.37, 0.37, 0.06, 0x2d3036, 1.7, 0.85, 0, 12));
  const flames = [];
  for (const [x, z, s, c] of [[0, 0, 1, 0xff7a1a], [0.12, 0.08, 0.7, 0xffd34d], [-0.12, -0.06, 0.75, 0xff3a1a]]) {
    const f = mesh(new THREE.ConeGeometry(0.26 * s, 0.9 * s, 8), glow(c, { opacity: 0.9, add: true }), 1.7 + x, 1.55, z); g.add(f); flames.push(f);
  }
  animate(g, (dt, t) => flames.forEach((f, i) => { const k = 1 + Math.sin(t * (13 + i * 4) + i) * 0.22; f.scale.set(1, k, 1); f.rotation.y = t * (2 + i); }));
}

/** The tear gas: a grenade on the road, still smoking, under a churning pale cloud. */
export function lacrymo(g) {
  const can = new THREE.Group(); can.position.set(0.6, 0.15, 0.4); can.rotation.z = Math.PI / 2; g.add(can);
  can.add(cyl(0.14, 0.14, 0.42, 0x5f6670, 0, 0, 0, 10)); can.add(cyl(0.145, 0.145, 0.08, 0xf2c14e, 0, 0.08, 0, 10));
  const puffs = [];
  const main = mesh(new THREE.SphereGeometry(3.4, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd4dcb2, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false }), 0, 1.5, 0); main.scale.y = 0.65; g.add(main);
  for (let i = 0; i < 6; i++) {
    const p = mesh(new THREE.SphereGeometry(1.2 + (i % 3) * 0.35, 8, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe2e6c8 : 0xc7d29a, transparent: true, opacity: 0.42, roughness: 1, depthWrite: false }));
    g.add(p); puffs.push(p);
  }
  animate(g, (dt, t) => {
    main.scale.set(1 + Math.sin(t * 1.3) * 0.06, 0.65 + Math.sin(t * 1.7) * 0.05, 1 + Math.cos(t * 1.1) * 0.06);
    puffs.forEach((p, i) => {
      const a = t * (0.6 + i * 0.07) + i * 1.05, r = 1.8 + (i % 3) * 0.5;
      p.position.set(Math.cos(a) * r, 1.2 + Math.sin(t * 1.4 + i) * 0.5 + (i % 2) * 0.6, Math.sin(a) * r);
    });
  });
}
