// Kart and driver meshes.
//
// One procedural politician and one kart per candidate, built from the cached
// primitives. Three kart bodies exist (the standard kart, the tractor and the
// cargo bike) and the driver's hair, accessories and belly come from the
// character's look definition, so every candidate is recognisable at a glance
// without any image assets.
//
// buildKart returns a Group whose userData carries the parts the physics and
// item code animate every frame: wheels, sparks, the invincibility ring, the
// driver, the helicopter rotor, the `anim` functions of the parts that move
// on their own (flags, the rainbow underglow, the turbine's heat) and the
// `trail` slot the race fills (trail.js). Those names are a contract with
// physics.js updateKartVisual.
//
// The kart's look comes from a full kart style (kartstyle.js): body and accent
// colours, wheels, spoiler, side pods, race number, sticker, exhaust,
// underglow, mast, nose and skin. Every variant keeps its wheels (four, three
// on the cargo bike) in the same order, front pair first, because physics
// steers wheels 0 and 1. The nose is the standard kart's alone; the tractor
// and the cargo bike take every other part.
//
// Two profiles (DEC-043, PLAN 3.4). 'race', the default, is the kart the
// races have always drawn, from primitives.mat() and per-kart basic
// materials; kart.test.js pins it to the pre-stage build hash for hash. 'stage'
// is the same kart for the select podium: every material from stagelook.js's
// own factory (never a mat() instance, since r128 bakes tone mapping into a
// program at first compile), and on the standard body the design template's
// shapes where a Garage option maps to one (kartstage.js). Both profiles run
// one code path wherever they can: the parts ask a palette for a material by
// role ('chrome', 'leather', the body...), the race palette answers with
// exactly the material it always used, the stage palette with its own. The
// stage kart is then merged by material (geo.js), wheels, driver and the
// animated parts kept apart, to stay within its draw budget.
//
// `pilot: false` leaves the driver out: userData.driver is then an empty seat
// anchor at the driver's place, for stage 5's buildPilot (seatPilot below).
//
// The seat contract (stage 7, one for every body): stage 5's pilot IS the
// driver. It is built at MOUNT with its per-body seat offset and the 1.45
// scale inside it, and it carries the steering wheel (the cargo bike's
// handlebar) its hands are posed on. So a kart that takes one is built with
// `pilot: false, steering: false` and seatPilot() puts the pilot in the
// anchor's place as it is: one wheel, the hands on it, scaled once. The
// kart's own template steering (`steering: true`, the default) is only for a
// kart shown without any pilot.
import * as THREE from 'three';

import { surfaceSpec, textureTier } from './fabric.js';
import { mergeByMaterial } from './geo.js';
import { blade, capsuleMesh, hullGeometry, rimParts, roundedBoxGeometry, seat, stagePalette, stageTexture, strut, surfaceHit, tubeBumper, tyreGeometry } from './kartstage.js';
import { defaultStyle } from './kartstyle.js';
import { LOOK3D } from './looks.js';
import { box, canvasTexture, cone, cyl, imgTex, mat, sph, tag, torus } from './primitives.js';
import { stageMat } from './stagelook.js';
import { getPoly, SHADOWS, seg } from './state.js';

// ---------- Driver (procedural politician, more detail in 'high') ----------
function buildDriver(def) {
  const g = new THREE.Group(); const L = def.look; const S = seg();
  g.add(box(0.9, 0.9, 0.6, L.suit, 0, 0.45, 0));                        // torso
  g.add(box(0.34, 0.7, 0.08, L.shirt, 0, 0.5, 0.32));                   // shirt front
  [-0.2, 0.2].forEach(x => { const lap = box(0.16, 0.6, 0.05, L.suit, x, 0.55, 0.35); lap.rotation.z = x > 0 ? 0.25 : -0.25; g.add(lap); }); // lapels
  g.add(box(0.5, 0.1, 0.12, L.shirt, 0, 0.9, 0.26));                    // collar
  [-0.47, 0.47].forEach(x => g.add(sph(0.2, L.suit, x, 0.82, 0, S)));   // shoulders
  if (L.belly) g.add(sph(0.46, L.suit, 0, 0.42, 0.18, S));             // belly
  g.add(box(0.95, 0.12, 0.62, 0x222222, 0, 0.02, 0));                   // belt
  [-0.25, 0.25].forEach(x => { const leg = box(0.26, 0.26, 0.8, L.suit, x, 0.05, 0.5); g.add(leg); g.add(box(0.26, 0.16, 0.42, 0x1a1a1a, x, 0.05, 1.0)); }); // legs + shoes
  g.add(cyl(0.16, 0.18, 0.2, L.skin, 0, 0.98, 0, S));                   // neck
  g.add(sph(0.5, L.skin, 0, 1.4, 0, S));                                 // head
  [-0.5, 0.5].forEach(x => g.add(sph(0.11, L.skin, x, 1.4, 0, S)));     // ears
  g.add(sph(0.1, L.skin, 0, 1.33, 0.5, S));                              // nose
  [-0.18, 0.18].forEach(x => { g.add(sph(0.1, 0xffffff, x, 1.5, 0.42, S)); g.add(sph(0.05, 0x1b2a3a, x, 1.5, 0.5, S)); g.add(box(0.2, 0.05, 0.05, L.hairColor === 0xeeeeee ? 0xcccccc : 0x3a2a1a, x, 1.63, 0.46)); }); // eyes + brows
  g.add(box(0.3, 0.06, 0.05, 0x8a3a3a, 0, 1.19, 0.47));                 // mouth
  [-0.3, 0.3].forEach(x => g.add(sph(0.07, 0xe9a9a0, x, 1.27, 0.4, 6))); // cheeks
  switch (L.hair) {
    case 'slick': g.add(box(1.04, 0.3, 1.0, L.hairColor, 0, 1.78, -0.1)); g.add(box(1.04, 0.5, 0.3, L.hairColor, 0, 1.5, -0.42)); { const fr = box(0.5, 0.14, 0.3, L.hairColor, 0.15, 1.9, 0.3); fr.rotation.z = -0.2; g.add(fr); } break;
    case 'cap': g.add(cyl(0.56, 0.56, 0.3, L.hairColor, 0, 1.8, 0, S)); g.add(box(0.7, 0.08, 0.5, L.hairColor, 0, 1.7, 0.55)); g.add(sph(0.08, 0xc8102e, 0, 1.96, 0, 6)); break;
    case 'sides': [-0.45, 0.45].forEach(x => g.add(box(0.2, 0.4, 0.7, L.hairColor, x, 1.35, -0.1))); g.add(box(0.9, 0.12, 0.6, L.hairColor, 0, 1.82, -0.2)); break;
    case 'helmet': { const h = sph(0.58, 0x9ad04f, 0, 1.5, 0, S); h.scale.y = 0.75; g.add(h); [-0.25, 0, 0.25].forEach(x => g.add(box(0.08, 0.1, 0.9, 0x6fa03a, x, 1.92, -0.05))); g.add(cyl(0.12, 0.12, 0.6, L.hairColor, 0, 1.2, -0.55, S)); g.add(box(0.1, 0.5, 0.05, 0x333333, 0, 1.2, 0.5)); break; }
    case 'white': g.add(box(1.04, 0.32, 1.0, L.hairColor, 0, 1.8, -0.08)); g.add(box(1.04, 0.5, 0.3, L.hairColor, 0, 1.5, -0.42)); break;
    case 'bob': { const h = sph(0.6, L.hairColor, 0, 1.55, -0.05, S); h.scale.set(1, 0.9, 1); g.add(h); g.add(box(1.1, 0.5, 0.5, L.hairColor, 0, 1.2, -0.3)); g.add(box(0.7, 0.18, 0.25, L.hairColor, 0.2, 1.88, 0.38)); break; }
    case 'hoodie': { const h = sph(0.62, L.hairColor, 0, 1.45, -0.12, S); h.scale.set(1, 1.05, 1); g.add(h); g.add(box(1.0, 0.7, 0.5, L.hairColor, 0, 0.75, -0.3)); g.add(box(0.6, 0.12, 0.3, 0x3a2a1a, 0, 1.86, 0.35)); break; }
    case 'bun': g.add(box(1.02, 0.28, 1.0, L.hairColor, 0, 1.8, -0.1)); g.add(box(1.02, 0.5, 0.3, L.hairColor, 0, 1.5, -0.42)); g.add(sph(0.26, L.hairColor, 0, 1.75, -0.5, S)); break;
    case 'strawhat': g.add(cyl(0.55, 0.55, 0.25, L.hairColor, 0, 1.78, 0, S)); g.add(cyl(1.05, 1.05, 0.08, 0xe0c060, 0, 1.68, 0, S)); g.add(cyl(0.56, 0.56, 0.4, 0xe0c060, 0, 1.9, 0, S)); g.add(box(1.1, 0.08, 0.1, 0x8a3a2a, 0, 1.78, 0.5)); break;
    case 'ponytail': g.add(box(1.02, 0.3, 1.0, L.hairColor, 0, 1.78, -0.08)); g.add(box(1.02, 0.5, 0.3, L.hairColor, 0, 1.5, -0.42)); { const pt = cyl(0.12, 0.08, 0.9, L.hairColor, 0, 1.25, -0.62, S); pt.rotation.x = 0.35; g.add(pt); } break;
    case 'sidepart': g.add(box(1.04, 0.26, 1.0, L.hairColor, 0, 1.78, -0.1)); g.add(box(1.04, 0.5, 0.3, L.hairColor, 0, 1.5, -0.42)); g.add(box(0.06, 0.06, 0.9, 0xf1c27d, -0.22, 1.92, -0.05)); break;   // parting drawn with a ruler
    case 'quiff': g.add(box(1.04, 0.24, 1.0, L.hairColor, 0, 1.76, -0.12)); g.add(box(1.04, 0.5, 0.3, L.hairColor, 0, 1.5, -0.42)); { const q = sph(0.36, L.hairColor, 0, 2.0, 0.28, S); q.scale.set(1.3, 0.8, 1.1); g.add(q); } break;   // the televised banana
    case 'kepi': g.add(box(1.02, 0.3, 1.0, L.hairColor, 0, 1.62, -0.1)); g.add(cyl(0.52, 0.56, 0.42, 0x1b2a49, 0, 1.95, 0, S)); g.add(box(0.7, 0.06, 0.4, 0x111111, 0, 1.76, 0.52)); g.add(box(1.08, 0.1, 0.1, 0xd4af37, 0, 1.8, 0.5)); g.add(sph(0.08, 0xd4af37, 0, 2.05, 0.53, 6)); break;
    case 'wild': for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; g.add(sph(0.24, L.hairColor, Math.cos(a) * 0.42, 1.8 + Math.sin(i * 2) * 0.1, Math.sin(a) * 0.42 - 0.1, S)); } g.add(sph(0.3, L.hairColor, 0, 1.95, -0.1, S)); break;
  }
  for (const a of L.acc) {
    if (a === 'tie') g.add(box(0.14, 0.5, 0.06, L.tie, 0, 0.55, 0.37));
    if (a === 'bowtie') { g.add(box(0.5, 0.18, 0.08, 0xc8102e, 0, 0.84, 0.34)); g.add(box(0.12, 0.12, 0.1, 0x7a0c1c, 0, 0.84, 0.36)); }
    if (a === 'moustache') g.add(box(0.5, 0.12, 0.1, 0x222222, 0, 1.25, 0.5));
    if (a === 'vest') { g.add(box(0.95, 0.95, 0.66, 0xff8c00, 0, 0.46, 0)); g.add(box(0.97, 0.12, 0.68, 0xdddddd, 0, 0.4, 0)); g.add(box(0.97, 0.12, 0.68, 0xdddddd, 0, 0.62, 0)); }
    if (a === 'sash') { [0x2f55c7, 0xffffff, 0xe63946].forEach((c, i) => { const s = box(0.14, 1.1, 0.07, c, -0.2 + i * 0.13, 0.5, 0.36); s.rotation.z = 0.5; g.add(s); }); }
    if (a === 'rosette') g.add(sph(0.07, 0xc8102e, 0.32, 0.72, 0.36, 6));
    if (a === 'glasses') { [-0.18, 0.18].forEach(x => g.add(torus(0.13, 0.025, 0x222222, x, 1.5, 0.5))); g.add(box(0.12, 0.03, 0.03, 0x222222, 0, 1.5, 0.5)); }
    if (a === 'monocle') { g.add(torus(0.14, 0.03, 0xd4af37, 0.18, 1.5, 0.52)); g.add(cyl(0.015, 0.015, 0.5, 0xd4af37, 0.4, 1.25, 0.45, 5)); }
    if (a === 'pocket') g.add(box(0.18, 0.06, 0.04, 0xf2c14e, -0.3, 0.78, 0.33));
    if (a === 'scarf') { const s = torus(0.4, 0.14, 0xc8102e, 0, 0.95, 0); s.rotation.x = Math.PI / 2; g.add(s); g.add(box(0.2, 0.6, 0.1, 0xc8102e, -0.3, 0.5, 0.3)); }
    if (a === 'megaphone') { const m = cone(0.26, 0.5, 0xf2c14e, 0.62, 0.95, 0.5, S); m.rotation.x = Math.PI / 2; g.add(m); g.add(cyl(0.06, 0.06, 0.4, 0x333333, 0.62, 0.95, 0.15, 6)); }
    if (a === 'phone') g.add(box(0.12, 0.22, 0.03, 0x111111, 0.52, 0.9, 0.72));
    if (a === 'backpack') { g.add(box(0.7, 0.8, 0.3, 0x3a3a3a, 0, 0.5, -0.42)); g.add(box(0.5, 0.2, 0.32, 0x9ad04f, 0, 0.85, -0.42)); }
    if (a === 'pearls') { const pr = torus(0.34, 0.06, 0xf6f1e4, 0, 0.9, 0.05); pr.rotation.x = Math.PI / 2; g.add(pr); }
    if (a === 'sunglasses') { g.add(box(0.62, 0.16, 0.08, 0x111111, 0, 1.5, 0.5)); g.add(box(0.9, 0.03, 0.03, 0x111111, 0, 1.5, 0.4)); }
    if (a === 'selfie') { const st = cyl(0.03, 0.03, 1.4, 0x333333, 0.75, 1.3, 0.3, 5); st.rotation.x = -0.6; g.add(st); g.add(box(0.26, 0.45, 0.04, 0x111111, 0.75, 1.95, 0.7)); g.add(box(0.2, 0.36, 0.01, 0x00c2cb, 0.75, 1.95, 0.73)); }
    if (a === 'ringlight') { const rl = torus(0.4, 0.05, 0xffffff, 0.75, 1.95, 0.6); g.add(rl); }
    if (a === 'rabat') { g.add(box(0.34, 0.4, 0.06, 0xffffff, 0, 0.72, 0.36)); g.add(box(1.1, 0.95, 0.75, 0x111111, 0, 0.42, -0.02)); g.add(box(0.34, 0.4, 0.06, 0xffffff, 0, 0.72, 0.4)); }
    if (a === 'overalls') { g.add(box(0.95, 0.95, 0.66, 0x2f55c7, 0, 0.45, 0)); [-0.25, 0.25].forEach(x => g.add(box(0.12, 0.5, 0.05, 0x2f55c7, x, 0.75, 0.34))); g.add(box(0.5, 0.3, 0.05, 0x1f3a93, 0, 0.55, 0.34)); }
    if (a === 'straw') { const st = cyl(0.02, 0.02, 0.5, 0xe0c060, 0.25, 1.1, 0.55, 4); st.rotation.x = 1.2; st.rotation.z = -0.4; g.add(st); }
    if (a === 'calculator') { g.add(box(0.3, 0.42, 0.06, 0x2b2b2b, 0.52, 0.9, 0.72)); g.add(box(0.22, 0.1, 0.02, 0x9fd89f, 0.52, 1.03, 0.76)); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.add(box(0.05, 0.05, 0.02, 0xdddddd, 0.45 + c * 0.07, 0.78 + r * 0.07, 0.76)); }
    if (a === 'mic') { g.add(cyl(0.05, 0.04, 0.4, 0x222222, 0.5, 1.0, 0.7, 6)); g.add(sph(0.12, 0x555555, 0.5, 1.24, 0.72, 8)); g.add(box(0.2, 0.14, 0.14, 0xc8102e, 0.5, 1.08, 0.72)); }
    if (a === 'opencollar') { [-0.14, 0.14].forEach(x => { const c = box(0.2, 0.08, 0.14, L.shirt, x, 0.92, 0.3); c.rotation.z = x > 0 ? -0.6 : 0.6; g.add(c); }); g.add(cyl(0.02, 0.02, 0.3, 0xd4af37, 0, 0.8, 0.34, 5)); }
    if (a === 'whistle') { g.add(box(0.14, 0.08, 0.2, 0xd4af37, 0.15, 0.95, 0.42)); const cord = torus(0.25, 0.02, 0xc8102e, 0.05, 0.85, 0.25); cord.rotation.x = 1.2; g.add(cord); }
    if (a === 'eurobadge') { g.add(cyl(0.11, 0.11, 0.03, 0x003399, 0.3, 0.74, 0.37, 12)); for (let i = 0; i < 6; i++) { const a2 = i / 6 * Math.PI * 2; g.add(box(0.03, 0.03, 0.02, 0xffcc00, 0.3 + Math.cos(a2) * 0.07, 0.74 + Math.sin(a2) * 0.07, 0.39)); } }
    if (a === 'briefcase') { g.add(box(0.7, 0.5, 0.18, 0x5a3a1e, 0, 0.55, -0.45)); g.add(box(0.26, 0.08, 0.06, 0xd4af37, 0, 0.83, -0.45)); g.add(box(0.72, 0.04, 0.2, 0xd4af37, 0, 0.55, -0.45)); }
    if (a === 'weathervane') {
      // a weathervane bolted to his head: the arrow points wherever the wind blows
      g.add(cyl(0.04, 0.04, 0.8, 0x444444, 0, 2.2, 0, 5)); g.add(box(0.7, 0.04, 0.04, 0x444444, 0, 2.35, 0)); g.add(box(0.04, 0.04, 0.7, 0x444444, 0, 2.35, 0));
      const vane = new THREE.Group(); vane.position.set(0, 2.6, 0); vane.rotation.y = 0.6;
      vane.add(box(1.3, 0.1, 0.1, 0xd4af37, 0, 0, 0)); const tip = cone(0.16, 0.34, 0xd4af37, 0.75, 0, 0, 4); tip.rotation.z = -Math.PI / 2; vane.add(tip);
      vane.add(box(0.36, 0.4, 0.05, 0xd4af37, -0.55, 0.2, 0)); g.add(vane); g.add(sph(0.1, 0xd4af37, 0, 2.6, 0, 8));
    }
    if (a === 'rosettes') { [0x2f55c7, 0xc8102e, 0x2e8b57, 0xf2c14e, 0x7b2cbf].forEach((c, i) => g.add(sph(0.07, c, -0.36 + i * 0.13, 0.76 + (i % 2) * 0.06, 0.36, 6))); }   // one per party he has belonged to
    if (a === 'badge') { g.add(cyl(0.12, 0.12, 0.04, 0xffffff, 0.32, 0.72, 0.36, 10)); g.add(cyl(0.07, 0.07, 0.05, 0xc8102e, 0.32, 0.72, 0.37, 10)); }
  }
  [-0.42, 0.42].forEach(x => { const a = box(0.2, 0.2, 0.7, L.suit, x, 0.72, 0.35); a.rotation.x = -0.5; g.add(a); g.add(sph(0.12, L.skin, x * 0.85, 0.88, 0.68, S)); });
  const wheel = torus(0.3, 0.05, 0x222222, 0, 0.9, 0.72); wheel.rotation.x = 1.1; g.add(wheel);
  g.add(cyl(0.05, 0.05, 0.5, 0x555555, 0, 0.72, 0.9, 6));               // steering column
  return g;
}

/**
 * The same driver for the stage: buildDriver's meshes with every mat()
 * swapped for a stage material by what it paints. The suit takes the
 * candidate's LOOK3D fabric (wool by default), skin, hair, shirt and tie
 * their surfaces, gold stays gold, anything else a satin solid. This is the
 * podium's stand-in until stage 5's pilot is seated (`pilot: false`).
 */
function restageDriver(g, def, P) {
  const L = def.look, cloth = LOOK3D[def.id]?.outfit?.fabric || 'wool', swap = new Map();
  const spec = (c, rough) => {
    if (c === L.skin) return surfaceSpec('skin', c, P.tex);
    if (c === L.suit) return surfaceSpec(cloth, c, P.tex);
    if (c === L.shirt) return surfaceSpec('cotton', c, P.tex);
    if (c === L.hairColor) return { ...surfaceSpec('hair', c, P.tex), roughness: L.hair === 'slick' ? 0.28 : 0.5, clearcoat: L.hair === 'slick' ? 0.8 : 0 };
    if (c === L.tie) return surfaceSpec('satin', c, P.tex);
    if (c === 0xd4af37) return surfaceSpec('gold');
    return { name: 'driver-part', color: c, roughness: Math.min(rough, 0.7), clearcoat: c === 0xffffff || c === 0x1b2a3a ? 1 : 0 };   // eyes get a wet clearcoat
  };
  g.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, k = m.color.getHex() + ':' + m.roughness;
    if (!swap.has(k)) swap.set(k, stageMat(spec(m.color.getHex(), m.roughness), P.tier));
    o.material = swap.get(k);
  });
  return g;
}

// ---------- The seat: where a pilot drops in ----------

/** The scale a pilot built in the design template's units takes in the game's seat (PLAN 3.4, A-037). */
export const PILOT_SCALE = 1.45;
/** Where a template-unit pilot sits, in its own frame: the base of the template's torso (y 0.45, z -0.3 above the template kart's origin). */
export const TEMPLATE_HIP = Object.freeze([0, 0.45, -0.3]);
/** The driver's place per body: the hip point, in kart space. Physics bobs driver.position.y about 0.75 (physics.js updateKartVisual). */
const SEAT = { kart: [0, 0.75, -0.35], tractor: [0, 1.05, -0.35], cargo: [0, 0.75, -0.35] };
const bodyOf = def => (def.tractor ? 'tractor' : def.cargo ? 'cargo' : 'kart');

/**
 * Seat a pilot on a kart built with `pilot: false`.
 *
 * Stage 5's pilot (buildPilot: its userData.driver is itself) is already
 * the driver: placed at MOUNT, scaled and seated per body, holding its own
 * steering. It takes the seat anchor's place in the kart as it is, no
 * scale and no offset, and becomes userData.driver, so physics' bob and the
 * Politibox's hiding reach it unchanged; a pilot seated before is replaced
 * (the caller disposes it). The kart must have been built with
 * `steering: false`: its own wheel would be a second one, 0.14 below the
 * pilot's hands, so that combination throws. Returns the pilot.
 *
 * Anything else is taken as a template-unit model whose origin is the
 * template kart's (a bare group, a test rig): it goes under the anchor,
 * scaled PILOT_SCALE and offset so its `hip` (TEMPLATE_HIP by default) lands
 * on the anchor's origin. Returns the fitting group.
 */
export function seatPilot(kart, pilot, { scale = PILOT_SCALE, hip = TEMPLATE_HIP } = {}) {
  const anchor = kart.userData.driver;
  if (pilot.userData && pilot.userData.driver === pilot) {
    if (anchor.userData.steering) throw new Error('seatPilot: this kart carries its own steering; build it with steering: false, the pilot brings the wheel its hands hold');
    const parent = anchor.parent || kart;
    parent.remove(anchor); parent.add(pilot);
    kart.userData.driver = pilot;
    return pilot;
  }
  for (const c of [...anchor.children]) anchor.remove(c);
  const fit = new THREE.Group(); fit.name = 'pilot-fit';
  fit.scale.setScalar(scale); fit.position.set(-hip[0] * scale, -hip[1] * scale, -hip[2] * scale);
  fit.add(pilot); anchor.add(fit);
  return fit;
}

/**
 * The steering a template pilot's hands find, for `pilot: false`: the
 * template's column, wheel and gold hub mapped through the seat fit (the
 * cargo bike gets handlebars where the hands land instead). The legacy
 * driver carries its own wheel, so this is only built without it.
 */
function addSteering(k, P, body, x0 = SEAT[body]) {
  const T = (x, y, z) => [x0[0] + (x - TEMPLATE_HIP[0]) * PILOT_SCALE, x0[1] + (y - TEMPLATE_HIP[1]) * PILOT_SCALE, x0[2] + (z - TEMPLATE_HIP[2]) * PILOT_SCALE];
  const tier = P.stage ? P.tier : getPoly(), dark = P.m('dark', 0x222222), hubM = P.m('gold', 0xd4af37, 0.25);
  if (body === 'cargo') {
    const p = T(0, 0.9, 0.17);
    const bar = pcyl(0.035, 0.035, 0.84, P.m('metal', 0x888888), p[0], p[1], p[2], 8); bar.rotation.z = Math.PI / 2; k.add(bar);
    [-1, 1].forEach(sx => { const gr = pcyl(0.05, 0.05, 0.2, dark, sx * 0.36, p[1], p[2], 8); gr.rotation.z = Math.PI / 2; k.add(gr); });
    return;
  }
  // the tractor's hood stands where the template wheel would be: its wheel sits on the hood's back instead
  const at = body === 'tractor' ? [0, 1.72, 0.13] : T(0, 0.88, 0.2), from = body === 'tractor' ? [0, 1.5, 0.21] : T(0, 0.58, 0.5);
  k.add(tag(strut(from, at, 0.035, dark, tier)));
  const wheel = tag(new THREE.Mesh(new THREE.TorusGeometry(0.16 * PILOT_SCALE, 0.04, P.stage ? (tier === 'low' ? 6 : 12) : Math.max(6, seg() / 2), P.stage ? (tier === 'low' ? 20 : 40) : seg() * 2), dark));
  wheel.position.set(...at); wheel.rotation.x = -0.6; k.add(wheel);
  const hub = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16), hubM)); hub.position.set(...at); hub.rotation.x = Math.PI / 2 - 0.6; k.add(hub);
}

// ---------- Kart style parts ----------
const colour = h => parseInt(h.slice(1), 16);

/** Tyre and hub colours, hub size and roughness, tyre radius and width per wheel style. */
const WHEEL_LOOK = {
  classic: { tyre: 0x222222, hub: 0xbbbbbb, hubR: 0.2, hubRough: 0.4, r: 0.45, w: 0.4 },
  chrome: { tyre: 0x1a1a1a, hub: 0xeef2f6, hubR: 0.32, hubRough: 0.12, r: 0.45, w: 0.4 },
  offroad: { tyre: 0x2b2620, hub: 0x6b5a3a, hubR: 0.22, hubRough: 0.8, r: 0.52, w: 0.55 },
  gold: { tyre: 0x222222, hub: 0xd4af37, hubR: 0.3, hubRough: 0.25, r: 0.45, w: 0.4 },
};

const disc = (cc, x, y, r, fill) => { cc.fillStyle = fill; cc.beginPath(); cc.arc(x, y, r, 0, Math.PI * 2); cc.fill(); };

/** The sticker decals, drawn on a transparent square canvas. */
const STICKER_DRAW = {
  tricolore: (cc, w, h) => { ['#1f3a93', '#f6f1e4', '#c8102e'].forEach((f, i) => { cc.fillStyle = f; cc.fillRect(i * w / 3, h * 0.2, w / 3, h * 0.6); }); },
  rosette: (cc, w, h) => { ['#1f3a93', '#f6f1e4', '#c8102e'].forEach((f, i) => disc(cc, w / 2, h / 2, w * (0.46 - i * 0.14), f)); },
  etoile: (cc, w, h) => {
    disc(cc, w / 2, h / 2, w * 0.46, '#1f3a93');
    cc.fillStyle = '#f2c14e'; cc.beginPath();
    for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.16 : 0.38) * w, t = -Math.PI / 2 + i * Math.PI / 5; cc.lineTo(w / 2 + r * Math.cos(t), h / 2 + r * Math.sin(t)); }
    cc.closePath(); cc.fill();
  },
  marianne: (cc, w, h) => {
    disc(cc, w / 2, h / 2, w * 0.46, '#f6f1e4');
    cc.fillStyle = '#c8102e'; cc.beginPath(); cc.moveTo(w * 0.28, h * 0.5); cc.quadraticCurveTo(w * 0.42, h * 0.12, w * 0.72, h * 0.3); cc.lineTo(w * 0.62, h * 0.5); cc.closePath(); cc.fill();
    cc.fillStyle = '#1f3a93'; cc.font = 'bold ' + Math.round(h * 0.26) + 'px sans-serif'; cc.textAlign = 'center'; cc.fillText('RF', w / 2, h * 0.78);
  },
};

/** A flat sticker decal lying on a surface at height y, or null for 'none'. */
function stickerPlane(sticker, size, x, y, z, P) {
  const draw = STICKER_DRAW[sticker]; if (!draw) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), P.sticker(sticker, draw));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.name = 'sticker'; return m;
}

/** The rear plate: the 'F' band, the candidate's first name and, if set, the race number. */
function plateTexture(def, number) {
  return canvasTexture(256, 64, (cc, w, h) => {
    cc.fillStyle = '#f6f1e4'; cc.fillRect(0, 0, w, h); cc.fillStyle = '#1f3a93'; cc.fillRect(0, 0, 26, h); cc.fillStyle = '#fff'; cc.font = 'bold 14px sans-serif'; cc.fillText('F', 8, 38);
    const name = def.name.split(' ')[0].toUpperCase().slice(0, 8);
    cc.fillStyle = '#111'; cc.textAlign = 'center';
    if (number === null) { cc.font = 'bold 34px sans-serif'; cc.fillText(name, w / 2 + 12, 44); return; }
    cc.font = 'bold 26px sans-serif'; cc.fillText(name, 26 + (w - 26 - 70) / 2, 42);
    cc.fillRect(w - 66, 6, 60, h - 12); cc.fillStyle = '#f2c14e'; cc.font = 'bold 36px sans-serif'; cc.fillText(String(number), w - 36, 46);
  });
}

// ---------- Skins ----------
/** Mix two '#rrggbb' colours: t = 0 gives a, t = 1 gives b. */
function mix(a, b, t) {
  const ca = colour(a), cb = colour(b); let out = 0;
  for (const sh of [16, 8, 0]) { const va = (ca >> sh) & 255, vb = (cb >> sh) & 255; out |= Math.round(va + (vb - va) * t) << sh; }
  return '#' + out.toString(16).padStart(6, '0');
}

/** A tiny deterministic generator (mulberry32), so a camo pattern is the same kart to kart and frame to frame. */
function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The skin painters: each fills a square canvas with the body colour and its pattern. Texture u runs across the body, v along it. */
const SKIN_DRAW = {
  stripes: (cc, w, h, body, accent) => { cc.fillStyle = body; cc.fillRect(0, 0, w, h); cc.fillStyle = accent; cc.fillRect(w * 0.36, 0, w * 0.1, h); cc.fillRect(w * 0.54, 0, w * 0.1, h); },
  carbon: (cc, w, h, body) => {
    cc.fillStyle = mix('#141414', body, 0.3); cc.fillRect(0, 0, w, h);
    const cell = 8; cc.fillStyle = mix('#2a2a2a', body, 0.3);
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) if (((x + y) / cell) % 2 === 0) cc.fillRect(x, y, cell, cell);
    cc.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < h; y += cell) cc.fillRect(0, y, w, 2);
  },
  camo: (cc, w, h, body) => {
    const shades = [mix(body, '#3a3a2a', 0.45), mix(body, '#ffffff', 0.2), mix(body, '#000000', 0.35)]; const r = rng(7);
    cc.fillStyle = body; cc.fillRect(0, 0, w, h);
    for (let i = 0; i < 36; i++) { cc.fillStyle = shades[i % 3]; cc.beginPath(); cc.ellipse(r() * w, r() * h, w * (0.06 + r() * 0.12), h * (0.04 + r() * 0.08), r() * Math.PI, 0, Math.PI * 2); cc.fill(); }
  },
  flames: (cc, w, h, body) => {
    cc.fillStyle = body; cc.fillRect(0, 0, w, h);
    const tongue = (fill, reach) => {
      cc.fillStyle = fill; cc.beginPath(); cc.moveTo(0, h);
      for (let i = 0; i <= 8; i++) { const x = i / 8 * w; cc.quadraticCurveTo(x - w / 16, h - reach * (i % 2 ? 1 : 0.45), x, h - reach * (i % 2 ? 0.55 : 0.3)); }
      cc.lineTo(w, h); cc.closePath(); cc.fill();
    };
    tongue('#e8520f', h * 0.62); tongue('#f5a623', h * 0.46); tongue('#ffe066', h * 0.28);
  },
};

/** A 256 x 256 skin texture: `skin` is a SKINS value other than 'flat'; `body` and `accent` are '#rrggbb'. */
export function skinTexture(skin, body, accent) {
  const t = canvasTexture(256, 256, (cc, w, h) => SKIN_DRAW[skin](cc, w, h, body, accent));
  t.name = skin;     // headless, the texture is blank (primitives.js): the name is what tells skins apart
  return t;
}

// ---------- Palettes ----------
const CHROME = 0xdddddd;
/** The brake lights' material, shared by every race kart (never disposed, like the material cache). */
const BRAKE_MAT = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
const heatMat = () => new THREE.MeshBasicMaterial({ color: 0xff8a1a });   // one per turbine: its scale pulses, its colour never changes
const UNDERGLOW = { blue: 0x3a7bff, red: 0xff3a3a, gold: 0xffc83a, rainbow: 0xc03aff };   // rainbow's colour is the first frame's; anim cycles it
const FLAG = { tricolore: [0x1f3a93, 0xf6f1e4, 0xc8102e], europe: [0x003399, 0x003399, 0x003399], pirate: [0x111111, 0x111111, 0x111111] };

/**
 * The race palette: the materials the race kart has always been drawn
 * with. `m(role, colour, rough)` is primitives.mat(colour, rough) whatever
 * the role; the basic materials are made per call, as they always were, and
 * the brake lights share BRAKE_MAT.
 */
function racePalette(style) {
  const c = colour(style.body), a = colour(style.accent);
  const body = style.skin === 'flat' ? mat(c) : new THREE.MeshStandardMaterial({ map: skinTexture(style.skin, style.body, style.accent), roughness: 0.5, metalness: 0.05 });
  return {
    stage: false, body, accent: mat(a), lid: style.skin === 'flat' ? mat(0xd9b36b) : body,
    m: (role, col, rough) => mat(col, rough),
    lamp: col => new THREE.MeshBasicMaterial({ color: col }),
    brake: () => BRAKE_MAT,
    heat: heatMat,
    plate: (def, number) => new THREE.MeshBasicMaterial({ map: plateTexture(def, number) }),
    sticker: (kind, draw) => new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, draw), transparent: true }),
    livery: url => new THREE.MeshBasicMaterial({ map: imgTex(url), side: THREE.DoubleSide }),
    underglow: kind => new THREE.MeshBasicMaterial({ color: UNDERGLOW[kind], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    shadow: () => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOWS() ? 0.12 : 0.32 }),
    fx: (col, extra) => new THREE.MeshBasicMaterial({ color: col, ...extra }),
  };
}

/**
 * The stage palette: kartstage.js's materials behind the same interface.
 * Roles pick the template's finishes; a part without a role keeps its
 * colour in a satin finish. Textures the race draws per kart (skin, plate,
 * stickers) are cached here, keyed by what they show.
 */
function stagePaletteOf(style, tier, tex) {
  const skin = style.skin === 'flat' ? null : stageTexture('skin:' + style.skin + ':' + style.body + ':' + style.accent, () => skinTexture(style.skin, style.body, style.accent));
  const S = stagePalette({ body: style.body, skin, accent: style.accent, tier, tex });
  const roles = {
    chrome: () => S.chrome, gold: () => S.gold, dark: () => S.dark, metal: () => S.steel, leather: () => S.leather, strap: () => S.strap,
    rubber: col => S.rubber(col), cloth: col => S.cloth(col), gloss: col => S.solid(col, 0.3), wood: col => S.solid(col, 0.7),
  };
  return {
    ...S, stage: true, lid: skin ? S.body : S.solid(0xd9b36b, 0.55),
    m: (role, col, rough) => (roles[role] ? roles[role](col) : S.solid(col, rough ?? 0.6)),
    lamp: col => S.lamp(col),
    brake: () => S.lamp(0xff2a2a, 1.4),
    heat: () => S.glowing(0xff8a1a, 2.4),
    plate: (def, number) => S.decal(stageTexture('plate:' + def.name.split(' ')[0] + ':' + number, () => plateTexture(def, number))),
    sticker: (kind, draw) => S.decal(stageTexture('sticker:' + kind, () => canvasTexture(128, 128, draw)), true),
    livery: url => S.decal(imgTex(url)),
    underglow: kind => S.glow(UNDERGLOW[kind], kind === 'rainbow'),
    shadow: () => S.shadow(tier === 'low' ? 0.55 : 0.35),
    fx: (col, extra = {}) => S.glowing(col, 1.5, extra.transparent ? { transparent: true, opacity: extra.opacity } : {}),
  };
}

// ---------- Parts ----------
/** A mesh at (x, y, z), shadow-tagged like primitives' boxes. */
const put = (geo, m, x, y, z) => { const o = tag(new THREE.Mesh(geo, m)); o.position.set(x, y, z); return o; };
/**
 * The detail tier boxes are rounded at while a stage kart is being built,
 * else null (buildKart sets and clears it around one synchronous build):
 * the stage keeps the race's box silhouettes with edges that catch the
 * light; parts thinner than 0.08 stay sharp boxes.
 */
let rounding = null;
const boxGeo = (w, h, d) => (rounding && Math.min(w, h, d) >= 0.08 ? roundedBoxGeometry(w, h, d, rounding) : new THREE.BoxGeometry(w, h, d));
const pbox = (w, h, d, m, x, y, z) => put(boxGeo(w, h, d), m, x, y, z);
const psph = (r, m, x, y, z, s) => put(new THREE.SphereGeometry(r, s || seg(), s || seg()), m, x, y, z);
const pcyl = (rt, rb, h, m, x, y, z, s) => put(new THREE.CylinderGeometry(rt, rb, h, s || seg()), m, x, y, z);
const pcone = (r, h, m, x, y, z, s) => put(new THREE.ConeGeometry(r, h, s || seg()), m, x, y, z);
const ptorus = (r, t, m, x, y, z) => put(new THREE.TorusGeometry(r, t, Math.max(6, seg() / 2), seg() * 2), m, x, y, z);
const chromePipe = (r, len, x, y, z, P, s) => { const p = tag(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, s), P.m('chrome', CHROME, 0.2))); p.position.set(x, y, z); return p; };

/**
 * The exhaust pipes, chrome, at the rear. `rear` = { x, y, z } for the
 * rearmost pipe pair (pipes point backwards from there), `side` = { x, y, z,
 * len } for the long pipes along the flanks. The turbine's heat disc pulses
 * with the kart's boost through `anim`. On the stage every pipe's mouth
 * glows (the template's exhaust glow), flickering on "détaillés"; the glows
 * are named 'exhaust-glow' and pushed to `live`.
 */
function addExhaust(k, kind, rear, side, anim, S, P, live) {
  const mouths = [];
  const back = (x, y, z, len, r) => { const p = chromePipe(r, len, x, y, z, P); p.rotation.x = Math.PI / 2; k.add(p); mouths.push([x, y, z - len / 2, r]); return p; };
  if (kind === 'double') { [-1, 1].forEach(sx => { back(rear.x * sx, rear.y, rear.z, 0.5, 0.08); back(rear.x * sx, rear.y + 0.2, rear.z, 0.5, 0.08); }); }
  else if (kind === 'side') { [-1, 1].forEach(sx => back(side.x * sx, side.y, side.z, side.len, 0.1)); }
  else if (kind === 'quad') {
    [-1.5, -0.5, 0.5, 1.5].forEach(i => back(rear.x * 0.5 * i, rear.y, rear.z, 0.55, 0.11));
    k.add(pbox(rear.x * 2 + 0.3, 0.06, 0.4, P.m('metal', 0x666666), 0, rear.y + (P.stage ? 0.12 : 0.17), rear.z));   // heat shield (under the stage plate)
  } else if (kind === 'turbine') {
    const cn = tag(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.6, S), P.m('chrome', CHROME, 0.2))); cn.rotation.x = Math.PI / 2; cn.position.set(0, rear.y + 0.55, rear.z - 0.25); k.add(cn);
    const heat = new THREE.Mesh(new THREE.CircleGeometry(0.3, S), P.heat()); heat.rotation.y = Math.PI; heat.position.set(0, rear.y + 0.55, rear.z - (P.stage ? 0.56 : 0.53)); k.add(heat);   // the stage's sits just outside the cone's base, which hides the race's
    if (live) live.push(heat);
    anim.push((dt, t, kart) => { const b = kart ? Math.min(1, kart.boost) : 0; heat.scale.setScalar(0.9 + b * 0.4 + Math.sin(t * 30) * (0.05 + b * 0.15)); });
  } else { [-1, 1].forEach(sx => back(rear.x * sx, rear.y, rear.z, 0.5, 0.1)); }                                // stock: two pipes
  if (!P.stage || !mouths.length) return;
  const glows = mouths.map(([x, y, z, r]) => {
    const g = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 16), P.heat()); g.rotation.y = Math.PI; g.position.set(x, y, z - 0.004); g.name = 'exhaust-glow'; k.add(g); live.push(g); return g;
  });
  if (P.tier !== 'low') anim.push((dt, t, kart) => { const b = kart ? Math.min(1, kart.boost) : 0; glows.forEach((g, i) => g.scale.setScalar(0.85 + b * 0.5 + Math.sin(t * 23 + i * 1.7) * 0.08)); });
}

/** A glowing plane under the chassis; rainbow cycles its hue. Added after the shadow disc, so it draws over it. */
function addUnderglow(k, kind, anim, P, live) {
  if (!UNDERGLOW[kind]) return;
  const m = P.underglow(kind);
  const p = new THREE.Mesh(P.stage ? new THREE.PlaneGeometry(3.0, 4.4) : new THREE.PlaneGeometry(2.2, 3.4), m); p.rotation.x = -Math.PI / 2; p.position.y = 0.06; p.name = 'underglow'; k.add(p);
  if (live) live.push(p);
  // the stage glow is emissive, and its colours are linear
  if (kind === 'rainbow') anim.push(P.stage ? (dt, t) => { m.emissive.setHSL((t * 0.25) % 1, 1, 0.55).convertSRGBToLinear(); } : (dt, t) => { m.color.setHSL((t * 0.25) % 1, 1, 0.55); });
}

/** A thin pole at the rear left carrying an antenna ball or a flag of three strips that wave in the wind. */
function addMast(k, kind, x, yBase, yTop, z, anim, P, live) {
  if (kind === 'none') return;
  k.add(pcyl(0.025, 0.025, yTop - yBase, P.m('metal', 0x888888), x, (yBase + yTop) / 2, z, 6));
  if (kind === 'antenna') { k.add(psph(0.08, P.m('gloss', 0xc8102e), x, yTop + 0.06, z, 8)); return; }
  const flag = new THREE.Group(); flag.position.set(x, yTop - 0.2, z); flag.rotation.y = Math.PI / 2; k.add(flag);   // strips fly backwards from the pole
  const strips = FLAG[kind].map((c, i) => { const s = pbox(0.2, 0.42, 0.02, P.m('cloth', c), 0.11 + i * 0.2, 0, 0); flag.add(s); return s; });
  if (live) live.push(...strips);
  if (kind === 'europe') strips.forEach(s => s.add(psph(0.035, P.m('gloss', 0xffcc00), 0, 0, 0.02, 6)));
  if (kind === 'pirate') { strips[1].add(psph(0.07, P.m('gloss', 0xffffff), 0, 0.08, 0.02, 8)); [0.7, -0.7].forEach(rz => { const b = pbox(0.22, 0.025, 0.02, P.m('gloss', 0xffffff), 0, -0.08, 0.02); b.rotation.z = rz; strips[1].add(b); }); }
  // the wave, on top of each strip's rest pose, read on the first frame: the stage profile's merge lifts the strips
  // out of the flag group with its turn baked in, so the strip's own z (its thickness) is the way it flutters
  let rest = null;
  anim.push((dt, t) => {
    if (!rest) rest = strips.map(s => ({ pos: s.position.clone(), ry: s.rotation.y, z: new THREE.Vector3(0, 0, 1).applyQuaternion(s.quaternion) }));
    strips.forEach((s, i) => { const w = Math.sin(t * 6 + i), r = rest[i]; s.rotation.y = r.ry + w * 0.25; s.position.copy(r.pos).addScaledVector(r.z, w * 0.04); });
  });
}

/** The front end of the standard kart. `bodyBox` builds a box in the body material; `P.accent` is the accent colour's. */
function addNose(k, kind, bodyBox, P, S) {
  if (kind === 'splitter') k.add(pbox(1.8, 0.05, 0.36, P.accent, 0, 0.13, 1.9));
  if (kind === 'wedge') { const w = bodyBox(1.1, 0.3, 0.44, 0, 0.32, 1.98); w.rotation.x = 0.55; k.add(w); }
  if (kind === 'bull') { [-0.45, 0.45].forEach(x => k.add(ptorus(0.28, 0.04, P.accent, x, 0.4, 2.2))); const bar = pcyl(0.04, 0.04, 1.4, P.accent, 0, 0.55, 2.2, 6); bar.rotation.z = Math.PI / 2; k.add(bar); }
  if (kind === 'ram') {   // a battering ram bolted on the hood; the tip stays at z 2.25, inside the shield ring
    k.add(pbox(0.34, 0.14, 0.5, P.accent, 0, 0.74, 1.6));
    const sp = pcone(0.17, 0.7, P.accent, 0, 0.86, 1.9, S); sp.rotation.x = Math.PI / 2; k.add(sp);
  }
}

/**
 * The detail every variant gets: a seat cushion and two harness straps,
 * side mirrors on stalks, brake lights, number roundels on the flanks.
 * `p` gives the positions: `seat` [y, z] of the cushion, `back` [y, z] of
 * the back cushion, `strap` [y, z], `mirror` [x, y, z], `brake` [x, y, z]
 * and `roundel` [x, y, z]; every x is mirrored. On the stage the roundels
 * carry the race number when there is one. Without a `pilot` the harness
 * straps go too: they belong on the legacy driver's chest, and would float
 * in an empty seat or cut through a seated stage-5 pilot.
 */
function addDetail(k, p, P, number, pilot = true) {
  k.add(pbox(0.84, 0.06, 0.7, P.m('leather', 0x8a2a2a), 0, p.seat[0], p.seat[1]));
  k.add(pbox(0.8, 0.4, 0.06, P.m('leather', 0x8a2a2a), 0, p.back[0], p.back[1]));
  if (pilot) [-0.17, 0.17].forEach(x => { const st = pbox(0.1, 0.5, 0.04, P.m('strap', 0xc8102e), x, p.strap[0], p.strap[1]); st.rotation.x = 0.12; k.add(st); });   // the harness, on the driver's chest
  [-1, 1].forEach(sx => {
    const stalk = pcyl(0.02, 0.02, 0.3, P.m('dark', 0x444444), p.mirror[0] * sx, p.mirror[1], p.mirror[2], 5); stalk.rotation.z = -sx * 0.9; k.add(stalk);
    const head = pbox(0.2, 0.14, 0.05, P.m('dark', 0x222222), (p.mirror[0] + 0.22) * sx, p.mirror[1] + 0.1, p.mirror[2]); head.rotation.y = -sx * 0.3; k.add(head);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.05), P.brake()); bl.position.set(p.brake[0] * sx, p.brake[1], p.brake[2]); k.add(bl);
    const rd = pcyl(0.2, 0.2, 0.03, P.m(null, 0xffffff), p.roundel[0] * sx, p.roundel[1], p.roundel[2], 12); rd.rotation.z = Math.PI / 2; k.add(rd);
    if (P.stage && number !== null) flankNumber(k, P, number, p.roundel[0] * sx + sx * 0.017, p.roundel[1], p.roundel[2], sx);
  });
}

/** The race number on a flank roundel (stage only): a disc decal facing out on side `sx`. */
function flankNumber(k, P, number, x, y, z, sx, r = 0.19) {
  const n = new THREE.Mesh(new THREE.CircleGeometry(r, 24), P.roundel(number)); n.position.set(x, y, z); n.rotation.y = sx * Math.PI / 2; n.name = 'roundel'; k.add(n);
}

// ---------- Wheels ----------
/**
 * One stage wheel: the lathed, tread-mapped tyre is the object physics
 * spins and steers (rotation order YXZ, like the race's), its rim parts
 * hang under it. `rim` is a WHEEL_LOOK style or 'tractor' (the red
 * farm rim) or 'cargo' (a bicycle-style spoked steel rim).
 */
function stageWheel(P, { r, w, x, y, z, rim, tyre, chunky }) {
  const side = Math.sign(x) || 1;
  const t = tag(new THREE.Mesh(tyreGeometry(r, w, P.tier, chunky), P.rubber(tyre)));
  t.position.set(x, y, z); t.rotation.order = 'YXZ';
  if (rim === 'tractor') {
    const d = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.96, P.tier === 'low' ? 14 : 28); d.rotateZ(Math.PI / 2);
    t.add(new THREE.Mesh(d, P.solid(0xc8102e, 0.35)));
    const h = new THREE.CylinderGeometry(r * 0.16, r * 0.16, w * 1.04, 12); h.rotateZ(Math.PI / 2); t.add(new THREE.Mesh(h, P.chrome));
  } else if (rim === 'cargo') {
    for (const m of rimParts('classic', r, w, side, P, P.tier)) t.add(m);
  } else for (const m of rimParts(rim, r, w, side, P, P.tier)) t.add(m);
  for (const c of t.children) tag(c);
  return t;
}

// ---------- Kart ----------
/**
 * Build one kart. `style` is a full kart style; it defaults to the
 * character's own default, so a caller that does not care gets the kart
 * every player sees for that character.
 *
 * Options: `profile` 'race' (default: the race's kart, unchanged) or
 * 'stage' (the podium's: stagelook materials, the template's shapes on the
 * standard body, merged by material); `pilot` false to leave the driver
 * out (userData.driver is then an empty seat anchor, see seatPilot); for
 * the stage, `tier` ('high' | 'low', default the game's detail level) and
 * `tex`, the texture tier (fabric.textureTier: 'phone' for "détaillés" on a
 * coarse pointer). With `pilot: false`, `steering: false` leaves the
 * kart's own steering out too, for stage 5's pilot, which brings its own
 * (seatPilot; the anchor records `userData.steering`).
 */
export function buildKart(def, style = defaultStyle(def), { profile = 'race', pilot = true, tier = getPoly(), tex = textureTier(tier), steering = true } = {}) {
  const stage = profile === 'stage';
  rounding = stage ? tier : null;
  try { return build(def, style, stage, pilot, tier, tex, steering); } finally { rounding = null; }
}

function build(def, style, stage, pilot, tier, tex, steering) {
  const P = stage ? stagePaletteOf(style, tier, tex) : racePalette(style);
  const k = new THREE.Group(); const S = seg(); const high = getPoly() === 'high';
  const wheels = []; const anim = []; const live = stage ? [] : null;
  const bodyMat = P.body;
  const bodyBox = (w, h, d, x, y, z) => { const m = tag(new THREE.Mesh(boxGeo(w, h, d), bodyMat)); m.position.set(x, y, z); return m; };
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), P.plate(def, style.number));
  plate.name = 'plate';
  const addSticker = (size, x, y, z) => { const st = stickerPlane(style.sticker, size, x, y, z, P); if (st) k.add(st); };
  const liveryPlane = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), P.livery(def.livery));
  const body = bodyOf(def);
  if (def.tractor) {
    k.add(bodyBox(1.6, 1.0, 2.6, 0, 0.9, 0.2)); k.add(bodyBox(1.3, 0.9, 1.4, 0, 1.6, 0.9)); k.add(pbox(1.5, 0.12, 1.5, P.m('dark', 0x222222), 0, 2.1, 0.9));
    k.add(pcyl(0.12, 0.12, 1.2, P.accent, 0.5, 2.4, 1.4, 8)); k.add(pbox(1.7, 0.3, 0.4, P.accent, 0, 0.4, 2.0));
    k.add(pbox(1.0, 0.55, 0.4, P.m('dark', 0x222222), 0, 1.3, -0.95)); k.add(pbox(1.0, 0.1, 0.9, P.m('dark', 0x222222), 0, 1.05, -0.4));
    [-0.5, 0.5].forEach(x => { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), P.lamp(0xfff1b0)); hl.position.set(x, 1.5, 1.62); k.add(hl); });
    k.add(pbox(1.9, 0.3, 0.5, P.m('wood', 0x8b5a2b), 0, 0.6, -1.6)); for (let i = 0; i < 5; i++) k.add(pcyl(0.05, 0.05, 0.5, P.m('wood', 0xe0c060), -0.8 + i * 0.4, 0.95, -1.6, 4));
    plate.position.set(0, 0.95, -1.86); plate.rotation.y = Math.PI; k.add(plate);
    if (def.livery) { const hood = liveryPlane(1.1, 1.0); hood.rotation.x = -Math.PI / 2; hood.position.set(0, 2.17, 0.9); k.add(hood); }
    addSticker(0.6, 0, 2.18, 0.9);
    addDetail(k, { seat: [1.11, -0.42], back: [1.32, -0.74], strap: [1.5, -0.03], mirror: [0.85, 1.55, 1.1], brake: [0.72, 1.12, -1.4], roundel: [0.82, 1.1, 0.3] }, P, style.number, pilot);
    addExhaust(k, style.exhaust, { x: 0.7, y: 0.95, z: -1.5 }, { x: 0.9, y: 1.6, z: 0.3, len: 1.6 }, anim, S, P, live);
    addMast(k, style.mast, -0.7, 1.4, 2.9, -1.2, anim, P, live);
    if (stage) {
      [[-1.0, 1.2, 0.42, 0.4], [1.0, 1.2, 0.42, 0.4], [-1.05, -0.9, 0.75, 0.6], [1.05, -0.9, 0.75, 0.6]].forEach(([x, z, r, w]) => { const wh = stageWheel(P, { r, w, x, y: r, z, rim: 'tractor', tyre: 0x222222, chunky: true }); k.add(wh); wheels.push(wh); });
    } else {
      const big = new THREE.CylinderGeometry(0.75, 0.75, 0.6, S); big.rotateZ(Math.PI / 2); const small = new THREE.CylinderGeometry(0.42, 0.42, 0.4, S); small.rotateZ(Math.PI / 2);
      [[-1.0, 1.2, small], [1.0, 1.2, small], [-1.05, -0.9, big], [1.05, -0.9, big]].forEach(p => { const w = tag(new THREE.Mesh(p[2], P.m('rubber', 0x222222, 0.95))); w.position.set(p[0], p[2] === big ? 0.75 : 0.42, p[1]); w.rotation.order = 'YXZ'; k.add(w); wheels.push(w); if (p[2] === big) { const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.62, 10), P.m(null, 0xc8102e)); rim.rotation.z = Math.PI / 2; w.add(rim); } });
    }
  } else if (def.cargo) {
    k.add(bodyBox(0.8, 0.35, 2.0, 0, 0.55, -0.5));
    k.add(pbox(1.5, 0.9, 1.4, P.m('wood', 0x8b5a2b), 0, 0.85, 1.3)); k.add(style.skin === 'flat' ? pbox(1.4, 0.1, 1.3, P.lid, 0, 1.32, 1.3) : bodyBox(1.4, 0.1, 1.3, 0, 1.32, 1.3));   // the crate and its lid
    k.add(pbox(0.2, 0.08, 1.0, P.m('gloss', 0x6fcf6f), -0.35, 1.4, 1.3)); k.add(psph(0.18, P.m('gloss', 0xff6b35), 0.3, 1.45, 1.1, S)); k.add(psph(0.18, P.m('gloss', 0xff6b35), 0.5, 1.42, 1.5, S)); k.add(pcyl(0.05, 0.05, 0.8, P.m(null, 0x5a8a3a), -0.1, 1.6, 1.0, 5));
    k.add(pbox(0.9, 0.5, 0.4, P.m('dark', 0x222222), 0, 0.9, -1.0)); k.add(pcyl(0.05, 0.05, 1.3, P.m('dark', 0x444444), 0, 0.9, 0.3, 6));
    plate.position.set(0, 0.7, 2.01); k.add(plate);
    if (def.livery) { const lp = liveryPlane(1.3, 1.2); lp.rotation.x = -Math.PI / 2; lp.position.set(0, 1.38, 1.3); k.add(lp); }
    addSticker(0.6, 0.2, 1.39, 1.5);
    addDetail(k, { seat: [0.76, -0.45], back: [0.95, -0.79], strap: [1.2, -0.03], mirror: [0.55, 1.0, 0.45], brake: [0.3, 0.55, -1.72], roundel: [0.76, 0.9, 1.3] }, P, style.number, pilot);
    addExhaust(k, style.exhaust, { x: 0.35, y: 0.4, z: -1.75 }, { x: 0.5, y: 0.45, z: -0.5, len: 1.4 }, anim, S, P, live);
    addMast(k, style.mast, -0.65, 1.4, 2.8, 0.7, anim, P, live);
    if (stage) {
      [[-0.95, 1.0], [0.95, 1.0], [0, -1.4]].forEach(([x, z]) => { const wh = stageWheel(P, { r: 0.45, w: 0.18, x, y: 0.45, z, rim: 'cargo', tyre: 0x222222 }); k.add(wh); wheels.push(wh); });
    } else {
      const wg = new THREE.CylinderGeometry(0.45, 0.45, 0.18, S); wg.rotateZ(Math.PI / 2);
      [[-0.95, 1.0], [0.95, 1.0], [0, -1.4]].forEach(p => { const w = tag(new THREE.Mesh(wg, P.m('rubber', 0x222222))); w.position.set(p[0], 0.45, p[1]); w.rotation.order = 'YXZ'; k.add(w); wheels.push(w); });
    }
  } else if (stage) {
    standardStage(k, def, style, P, { anim, live, wheels, plate, pilot, steering });
  } else {
    k.add(bodyBox(1.6, 0.5, 2.8, 0, 0.5, 0)); k.add(bodyBox(1.2, 0.35, 0.9, 0, 0.5, 1.7));
    k.add(bodyBox(1.3, 0.14, 0.6, 0, 0.8, 1.0));                                                   // the cowl in front of the driver
    if (style.pods) [-0.9, 0.9].forEach(x => k.add(bodyBox(0.25, 0.35, 1.6, x, 0.5, 0.2)));        // side pods
    k.add(pbox(1.9, 0.25, 0.3, P.accent, 0, 0.3, 2.05)); k.add(pbox(1.9, 0.25, 0.3, P.accent, 0, 0.3, -1.45));
    [-0.4, 0.4].forEach(x => { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), P.lamp(0xfff1b0)); hl.position.set(x, 0.55, 2.16); k.add(hl); }); // headlights
    k.add(pbox(1.0, 0.55, 0.4, P.m('dark', 0x222222), 0, 1.0, -0.95)); k.add(pbox(1.0, 0.1, 0.9, P.m('dark', 0x222222), 0, 0.78, -0.4));
    if (style.spoiler === 'standard') { k.add(bodyBox(1.9, 0.08, 0.5, 0, 1.25, -1.5)); [-0.6, 0.6].forEach(x => k.add(pbox(0.1, 0.5, 0.1, P.accent, x, 1.0, -1.5))); }
    if (style.spoiler === 'wing') {
      k.add(bodyBox(2.3, 0.1, 0.7, 0, 1.6, -1.6)); [-0.5, 0.5].forEach(x => k.add(pbox(0.1, 0.9, 0.12, P.accent, x, 1.15, -1.6)));
      [-1.15, 1.15].forEach(x => k.add(pbox(0.06, 0.45, 0.8, P.accent, x, 1.55, -1.6)));                        // end plates
      [-0.9, 0.9].forEach(x => [-1.85, -1.35].forEach(z => k.add(pcyl(0.03, 0.03, 0.04, P.m('metal', 0x888888), x, 1.67, z, 6))));   // bolts
    }
    const bar = ptorus(0.5, 0.05, P.m('metal', 0x888888), 0, 1.25, -0.9); bar.rotation.y = Math.PI / 2; k.add(bar);                 // roll bar
    addExhaust(k, style.exhaust, { x: 0.35, y: 0.45, z: -1.7 }, { x: 1.12, y: 0.55, z: 0, len: 1.0 }, anim, S, P, live);
    plate.position.set(0, 0.62, -1.61); plate.rotation.y = Math.PI; k.add(plate);
    if (def.livery) {
      const hood = liveryPlane(1.1, 0.8); hood.rotation.x = -Math.PI / 2; hood.position.set(0, 0.69, 1.7); k.add(hood);
      if (style.spoiler === 'standard') { const sp = liveryPlane(1.8, 0.45); sp.rotation.x = -Math.PI / 2; sp.position.set(0, 1.3, -1.5); k.add(sp); }
      if (style.spoiler === 'wing') { const sp = liveryPlane(2.2, 0.65); sp.rotation.x = -Math.PI / 2; sp.position.set(0, 1.66, -1.6); k.add(sp); }
    }
    addSticker(0.55, 0, 0.7, 1.7);                                                 // over the livery, like a real decal
    addDetail(k, { seat: [0.86, -0.42], back: [1.02, -0.74], strap: [1.22, 0.0], mirror: [0.88, 0.82, 0.95], brake: [0.72, 0.45, -1.62], roundel: [style.pods ? 1.04 : 0.815, 0.52, 0.3] }, P, style.number, pilot);
    addNose(k, style.nose, bodyBox, P, S);
    addMast(k, style.mast, -0.72, 0.7, 2.3, -1.1, anim, P, live);
    if (high) {
      [-0.61, 0.61].forEach(x => [0.42, 0.5, 0.58].forEach(y => k.add(pbox(0.02, 0.04, 0.5, P.m('dark', 0x222222), x, y, 1.6))));    // vents on the nose
      [-0.55, 0.55].forEach(x => [0.8, 1.2].forEach(z => k.add(pcyl(0.025, 0.025, 0.02, P.m('metal', 0x999999), x, 0.88, z, 6))));     // rivets on the cowl
    }
    const wl = WHEEL_LOOK[style.wheels];
    const wg = new THREE.CylinderGeometry(wl.r, wl.r, wl.w, S); wg.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(wl.hubR, wl.hubR, wl.w + 0.02, 8); hub.rotateZ(Math.PI / 2);
    [[-0.95, 1.0], [0.95, 1.0], [-0.95, -1.0], [0.95, -1.0]].forEach(p => {
      const w = tag(new THREE.Mesh(wg, P.m('rubber', wl.tyre, 0.95))); w.position.set(p[0] + Math.sign(p[0]) * (wl.w - 0.4) / 2, wl.r, p[1]); w.rotation.order = 'YXZ';
      w.add(new THREE.Mesh(hub, P.m(null, wl.hub, wl.hubRough))); k.add(w); wheels.push(w);
    });
  }
  let driver;
  if (pilot) {
    driver = buildDriver(def); driver.position.set(0, def.tractor ? 1.05 : 0.75, -0.35); driver.scale.setScalar(0.85);
    if (stage) restageDriver(driver, def, P);
  } else {
    // the seat anchor: an empty group at the driver's hip point (seatPilot), and the steering its hands find
    driver = new THREE.Group(); driver.name = 'seat'; driver.position.set(...SEAT[body]);
    driver.userData.seat = { body, pilotScale: PILOT_SCALE, hip: TEMPLATE_HIP };
    driver.userData.steering = steering;
    if (steering && (body !== 'kart' || !stage)) addSteering(k, P, body);
  }
  k.add(driver);
  const sh = new THREE.Mesh(stage ? new THREE.PlaneGeometry(def.cargo ? 2.6 : 3.0, def.cargo ? 4.6 : 4.4) : new THREE.CircleGeometry(1.7, 16), P.shadow());
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; k.add(sh);
  addUnderglow(k, style.underglow, anim, P, live);
  const sparks = [];
  [-0.9, 0.9].forEach(x => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), P.fx(0x7cc4ff)); s.position.set(x, 0.25, -1.3); s.visible = false; k.add(s); sparks.push(s); });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 6, 24), P.fx(0xf2c14e)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; ring.visible = false; k.add(ring);
  const rotor = new THREE.Group(); rotor.add(pcyl(0.08, 0.08, 1.6, P.m(null, 0x444444), 0, 0.8, 0, 6)); const bl = pbox(5, 0.06, 0.3, P.m(null, 0x333333), 0, 1.6, 0); rotor.add(bl); const bl2 = bl.clone(); bl2.rotation.y = Math.PI / 2; rotor.add(bl2); rotor.position.set(0, 1.4, -0.4); rotor.visible = false; k.add(rotor);
  // a star of sparks around the kart, shown for an instant after a bump
  const bumpSparks = new THREE.Group(); const sparkMat = P.fx(0xffe08a);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), sparkMat); sp.position.set(Math.sin(a) * 1.7, 0.7 + (i % 2) * 0.35, Math.cos(a) * 1.7); sp.rotation.y = a; bumpSparks.add(sp); }
  bumpSparks.visible = false; k.add(bumpSparks);
  // the shield of "Langue de bois": a blue ring that waits for the next hit
  const shield = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.1, 6, 24), P.fx(0x7cc4ff, { transparent: true, opacity: 0.8 })); shield.rotation.x = Math.PI / 2; shield.position.y = 1.1; shield.visible = false; k.add(shield);
  // anim: `(dt, t, kart?) => void` per animated part, run by updateKartVisual (with the kart) and the turntable (without);
  // trail: null here, the race attaches one (trail.js) from the style.
  k.userData = { wheels, sparks, ring, driver, rotor, blades: [bl, bl2], bumpSparks, shield, anim, trail: null };
  if (stage) finishStage(k, tier, live);
  return k;
}

/**
 * The stage kart's last pass: shadows for the opaque parts on "détaillés"
 * only (the low tier has no shadow map), then one mesh per material, the
 * parts that move or that userData and the stage point at kept apart.
 */
function finishStage(k, tier, live) {
  k.traverse(o => { if (o.isMesh) { o.castShadow = tier !== 'low' && !o.material.transparent && o.name !== 'exhaust-glow'; o.receiveShadow = !o.material.transparent; } });
  const u = k.userData;
  mergeByMaterial(k, [...u.wheels, u.driver, ...u.blades, ...live, 'plate', 'sticker', 'underglow']);
}

// ---------- The standard kart on the stage ----------
/**
 * The standard body with the template's shapes (PLAN 3.4): the bevelled
 * hull, capsule pods, the chrome tube bumper for the stock nose, a leather
 * seat, lathed tyres with spoked chrome rims for `wheels: chrome`, the
 * tricolore wing for `spoiler: wing` with `sticker: tricolore`, a number
 * roundel on the hood when the style has a number. Every other part is the
 * race kart's, in stage materials, placed on the hull. Decals, lamps and the
 * plate are seated on the hull's surface by raycasts.
 */
const REARWARD = [0, 0, -1];   // a decal on the hood reads from the front, its top towards the driver, as the race's do
function standardStage(k, def, style, P, { anim, live, wheels, plate, pilot, steering = true }) {
  const T = P.tier, high = T !== 'low';
  const hull = tag(new THREE.Mesh(hullGeometry(T), P.body)); hull.name = 'hull'; k.add(hull);
  const hit = (from, dir) => surfaceHit(hull, from, dir);
  const onTop = (x, z) => hit([x, 3, z], [0, -1, 0]);
  const decal = (w, h, m, x, z, lift = 0.012, name = '') => { const at = onTop(x, z); if (!at) return null; const d = seat(new THREE.Mesh(new THREE.PlaneGeometry(w, h), m), at, lift, REARWARD); d.name = name; k.add(d); return d; };
  // side pods between the wheels, in the body's paint like the race pods
  if (style.pods) [-1, 1].forEach(sx => { const p = tag(capsuleMesh(0.17, 1.06, P.body, T)); p.position.set(sx * 0.93, 0.46, 0); k.add(p); });
  // bumpers: the template's chrome tube for the stock nose, an accent bar otherwise; an accent bar at the back
  if (style.nose === 'stock') {
    k.add(tag(tubeBumper(P.chrome, T)));
    [-0.55, 0.55].forEach(x => k.add(tag(strut([x, 0.3, 1.85], [x, 0.32, 2.1], 0.035, P.dark, T))));
  } else { const fb = tag(capsuleMesh(0.12, 1.9, P.accent, T, 'x')); fb.position.set(0, 0.3, 2.05); k.add(fb); }
  { const rb = tag(capsuleMesh(0.12, 1.9, P.accent, T, 'x')); rb.position.set(0, 0.3, -1.5); k.add(rb); }
  // headlights on the nose, brake lights and the plate on the tail, seated on the hull
  [-0.4, 0.4].forEach(x => {
    const at = hit([x, 0.5, 3], [0, 0, -1]); if (!at) return;
    const lamp = seat(new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), P.lamp(0xfff1b0)), at, 0.006);
    const bezel = seat(new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 6, 20), P.chrome), at, 0.004);
    k.add(lamp, bezel);
  });
  [-0.66, 0.66].forEach(x => { const at = hit([x, 0.7, -3], [0, 0, 1]); if (!at) return; k.add(seat(new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1), P.brake()), at, 0.006)); });
  // the engine block behind the seat, the plate on it, between the exhausts
  k.add(tag(new THREE.Mesh(roundedBoxGeometry(0.9, 0.5, 0.32, T, 0.04), P.dark)).translateZ(-1.5).translateY(0.62));
  plate.position.set(0, 0.72, -1.665); plate.rotation.y = Math.PI; k.add(plate);
  // the seat: a leather cushion and the template's leather shell back, smaller around the legacy driver
  k.add(tag(blade(0.84, 0.12, 0.7, P.leather, T)).translateY(0.86).translateZ(-0.42));
  { const sb = pilot ? 0.42 : 0.5; const back = tag(new THREE.Mesh(new THREE.SphereGeometry(sb, high ? 32 : 14, high ? 20 : 10), P.leather)); back.position.set(0, 0.78 + sb * 0.85, -0.86); back.rotation.x = -0.15; back.scale.set(1.0, 0.85, 0.34); k.add(back); }
  if (pilot) [-0.17, 0.17].forEach(x => { const st = tag(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.04), P.strap)); st.position.set(x, 1.22, 0); st.rotation.x = 0.12; k.add(st); });   // the harness on the driver's chest, as in the race
  // spoilers
  const wing = style.spoiler === 'wing', standard = style.spoiler === 'standard';
  if (standard) {
    k.add(tag(blade(1.9, 0.08, 0.5, P.body, T)).translateY(1.25).translateZ(-1.5));
    [-0.6, 0.6].forEach(x => k.add(tag(strut([x, 0.78, -1.42], [x, 1.22, -1.5], 0.045, P.accent, T))));
  }
  if (wing) {
    const tri = style.sticker === 'tricolore';
    if (tri) P.tricolore.forEach((m, i) => k.add(tag(blade(2.3 / 3, 0.1, 0.7, m, T)).translateX((i - 1) * 2.3 / 3).translateY(1.6).translateZ(-1.6)));
    else k.add(tag(blade(2.3, 0.1, 0.7, P.body, T)).translateY(1.6).translateZ(-1.6));
    [-0.5, 0.5].forEach(x => k.add(tag(strut([x, 0.8, -1.38], [x, 1.56, -1.62], 0.05, tri ? P.dark : P.accent, T))));
    [-1.13, 1.13].forEach(x => k.add(tag(blade(0.06, 0.45, 0.8, tri ? P.body : P.accent, T)).translateX(x).translateY(1.55).translateZ(-1.6)));   // end plates
    if (high) [-0.9, 0.9].forEach(x => [-1.85, -1.35].forEach(z => k.add(put(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), P.chrome, x, 1.66, z))));   // bolts
  }
  // decals on the hood: the livery, the sticker over it, the number roundel nearer the driver
  if (def.livery) {
    decal(1.0, 0.62, P.livery(def.livery), 0, 1.32, 0.01);
    if (standard) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), P.livery(def.livery)); sp.rotation.x = -Math.PI / 2; sp.position.set(0, 1.296, -1.5); k.add(sp); }
    if (wing) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.65), P.livery(def.livery)); sp.rotation.x = -Math.PI / 2; sp.position.set(0, 1.656, -1.6); k.add(sp); }
  }
  if (STICKER_DRAW[style.sticker]) { const st = decal(0.5, 0.5, P.sticker(style.sticker, STICKER_DRAW[style.sticker]), 0, 1.6, 0.016, 'sticker'); if (st) st.renderOrder = 1; }
  if (style.number !== null) decal(0.46, 0.46, P.roundel(style.number), 0, 1.08, 0.014, 'roundel');
  // mirrors on stalks at the cowl's edges
  [-1, 1].forEach(sx => {
    const stalk = put(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), P.dark, 0.88 * sx, 0.82, 0.95); stalk.rotation.z = -sx * 0.9; k.add(stalk);
    const head = put(new THREE.BoxGeometry(0.2, 0.14, 0.05), P.accent, 1.1 * sx, 0.92, 0.95); head.rotation.y = -sx * 0.3; k.add(head);
    const glass = put(new THREE.PlaneGeometry(0.17, 0.11), P.chrome, 1.1 * sx + 0.008 * sx, 0.92, 0.95 - 0.027); glass.rotation.y = -sx * 0.3 + Math.PI; k.add(glass);
  });
  // flank roundels: on the pods, or on the hull's sides; numbered when the style is
  [-1, 1].forEach(sx => {
    const x = style.pods ? 0.93 + 0.17 : 0.8;
    const at = style.pods ? { point: new THREE.Vector3(sx * x, 0.46, 0), normal: new THREE.Vector3(sx, 0, 0) } : hit([sx * 3, 0.5, 0.3], [-sx, 0, 0]);
    if (!at) return;
    k.add(seat(new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), style.number !== null ? P.roundel(style.number) : P.solid(0xf6f1e4, 0.35)), at, 0.006));
  });
  addExhaust(k, style.exhaust, { x: 0.35, y: 0.45, z: -1.7 }, { x: 1.12, y: 0.55, z: 0, len: 1.0 }, anim, seg(), P, live);
  addNoseStage(k, style.nose, P, T);
  addMast(k, style.mast, -0.72, 0.9, 2.3, -1.1, anim, P, live);
  if (high) [-0.45, 0.45].forEach(x => [0.95, 1.25].forEach(z => { const at = onTop(x, z); if (at) k.add(seat(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), P.chrome), at, -0.012)); }));   // rivets on the cowl
  if (!pilot && steering) addSteering(k, P, 'kart');
  // wheels: the race's positions and sizes, lathed tyres and the style's rims
  const wl = WHEEL_LOOK[style.wheels];
  [[-0.95, 1.0], [0.95, 1.0], [-0.95, -1.0], [0.95, -1.0]].forEach(([x, z]) => {
    const w = stageWheel(P, { r: wl.r, w: wl.w, x: x + Math.sign(x) * (wl.w - 0.4) / 2, y: wl.r, z, rim: style.wheels, tyre: wl.tyre, chunky: style.wheels === 'offroad' });
    k.add(w); wheels.push(w);
  });
}

/** The nose options on the hull: the race parts, rounded, in stage paint. */
function addNoseStage(k, kind, P, T) {
  if (kind === 'splitter') k.add(tag(blade(1.8, 0.05, 0.4, P.accent, T)).translateY(0.16).translateZ(1.95));
  if (kind === 'wedge') { const w = tag(blade(1.1, 0.16, 0.5, P.body, T)); w.position.set(0, 0.4, 2.0); w.rotation.x = 0.55; k.add(w); }
  if (kind === 'bull') {
    [-0.45, 0.45].forEach(x => { const t = put(new THREE.TorusGeometry(0.28, 0.04, 8, 32), P.accent, x, 0.42, 2.2); k.add(t); });
    const bar = tag(capsuleMesh(0.045, 1.5, P.accent, T, 'x')); bar.position.set(0, 0.57, 2.2); k.add(bar);
  }
  if (kind === 'ram') {
    k.add(tag(blade(0.34, 0.14, 0.5, P.accent, T)).translateY(0.86).translateZ(1.6));
    const sp = put(new THREE.ConeGeometry(0.17, 0.7, 20), P.accent, 0, 0.92, 1.9); sp.rotation.x = Math.PI / 2; k.add(sp);
  }
}
