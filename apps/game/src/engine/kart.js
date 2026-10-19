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
// driver and the helicopter rotor. Those names are a contract with the update
// code that still lives in game.js.
//
// The kart's look comes from a full kart style (kartstyle.js): body and accent
// colours, wheels, spoiler, side pods, race number and sticker. Every variant
// keeps its wheels (four, three on the cargo bike) in the same order, front
// pair first, because physics steers wheels 0 and 1.
import * as THREE from 'three';

import { defaultStyle } from './kartstyle.js';
import { box, canvasTexture, cone, cyl, imgPlane, mat, sph, tag, torus } from './primitives.js';
import { SHADOWS, seg } from './state.js';

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
    if (a === 'badge') { g.add(cyl(0.12, 0.12, 0.04, 0xffffff, 0.32, 0.72, 0.36, 10)); g.add(cyl(0.07, 0.07, 0.05, 0xc8102e, 0.32, 0.72, 0.37, 10)); }
  }
  [-0.42, 0.42].forEach(x => { const a = box(0.2, 0.2, 0.7, L.suit, x, 0.72, 0.35); a.rotation.x = -0.5; g.add(a); g.add(sph(0.12, L.skin, x * 0.85, 0.88, 0.68, S)); });
  const wheel = torus(0.3, 0.05, 0x222222, 0, 0.9, 0.72); wheel.rotation.x = 1.1; g.add(wheel);
  g.add(cyl(0.05, 0.05, 0.5, 0x555555, 0, 0.72, 0.9, 6));               // steering column
  return g;
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
function stickerPlane(sticker, size, x, y, z) {
  const draw = STICKER_DRAW[sticker]; if (!draw) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, draw), transparent: true }));
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

// ---------- Kart ----------
/**
 * Build one kart. `style` is a full kart style; it defaults to the
 * character's own default, so a caller that does not care gets the kart
 * every player sees for that character.
 */
export function buildKart(def, style = defaultStyle(def)) {
  const k = new THREE.Group(); const c = colour(style.body), a = colour(style.accent); const S = seg();
  const wheels = [];
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: plateTexture(def, style.number) }));
  plate.name = 'plate';
  const addSticker = (size, x, y, z) => { const st = stickerPlane(style.sticker, size, x, y, z); if (st) k.add(st); };
  if (def.tractor) {
    k.add(box(1.6, 1.0, 2.6, c, 0, 0.9, 0.2)); k.add(box(1.3, 0.9, 1.4, c, 0, 1.6, 0.9)); k.add(box(1.5, 0.12, 1.5, 0x222222, 0, 2.1, 0.9));
    k.add(cyl(0.12, 0.12, 1.2, a, 0.5, 2.4, 1.4, 8)); k.add(box(1.7, 0.3, 0.4, a, 0, 0.4, 2.0));
    k.add(box(1.0, 0.55, 0.4, 0x222222, 0, 1.3, -0.95)); k.add(box(1.0, 0.1, 0.9, 0x222222, 0, 1.05, -0.4));
    [-0.5, 0.5].forEach(x => { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b0 })); hl.position.set(x, 1.5, 1.62); k.add(hl); });
    k.add(box(1.9, 0.3, 0.5, 0x8b5a2b, 0, 0.6, -1.6)); for (let i = 0; i < 5; i++) k.add(cyl(0.05, 0.05, 0.5, 0xe0c060, -0.8 + i * 0.4, 0.95, -1.6, 4));
    plate.position.set(0, 0.95, -1.86); plate.rotation.y = Math.PI; k.add(plate);
    if (def.livery) { const hood = imgPlane(1.1, 1.0, def.livery); hood.rotation.x = -Math.PI / 2; hood.position.set(0, 2.17, 0.9); k.add(hood); }
    addSticker(0.6, 0, 2.18, 0.9);
    const big = new THREE.CylinderGeometry(0.75, 0.75, 0.6, S); big.rotateZ(Math.PI / 2); const small = new THREE.CylinderGeometry(0.42, 0.42, 0.4, S); small.rotateZ(Math.PI / 2);
    [[-1.0, 1.2, small], [1.0, 1.2, small], [-1.05, -0.9, big], [1.05, -0.9, big]].forEach(p => { const w = tag(new THREE.Mesh(p[2], mat(0x222222, 0.95))); w.position.set(p[0], p[2] === big ? 0.75 : 0.42, p[1]); w.rotation.order = 'YXZ'; k.add(w); wheels.push(w); if (p[2] === big) { const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.62, 10), mat(0xc8102e)); rim.rotation.z = Math.PI / 2; w.add(rim); } });
  } else if (def.cargo) {
    k.add(box(0.8, 0.35, 2.0, c, 0, 0.55, -0.5));
    k.add(box(1.5, 0.9, 1.4, 0x8b5a2b, 0, 0.85, 1.3)); k.add(box(1.4, 0.1, 1.3, 0xd9b36b, 0, 1.32, 1.3));
    k.add(box(0.2, 0.08, 1.0, 0x6fcf6f, -0.35, 1.4, 1.3)); k.add(sph(0.18, 0xff6b35, 0.3, 1.45, 1.1, S)); k.add(sph(0.18, 0xff6b35, 0.5, 1.42, 1.5, S)); k.add(cyl(0.05, 0.05, 0.8, 0x5a8a3a, -0.1, 1.6, 1.0, 5));
    k.add(box(0.9, 0.5, 0.4, 0x222222, 0, 0.9, -1.0)); k.add(cyl(0.05, 0.05, 1.3, 0x444444, 0, 0.9, 0.3, 6));
    plate.position.set(0, 0.7, 2.01); k.add(plate);
    if (def.livery) { const lp = imgPlane(1.3, 1.2, def.livery); lp.rotation.x = -Math.PI / 2; lp.position.set(0, 1.38, 1.3); k.add(lp); }
    addSticker(0.6, 0.2, 1.39, 1.5);
    const wg = new THREE.CylinderGeometry(0.45, 0.45, 0.18, S); wg.rotateZ(Math.PI / 2);
    [[-0.95, 1.0], [0.95, 1.0], [0, -1.4]].forEach(p => { const w = tag(new THREE.Mesh(wg, mat(0x222222))); w.position.set(p[0], 0.45, p[1]); w.rotation.order = 'YXZ'; k.add(w); wheels.push(w); });
  } else {
    k.add(box(1.6, 0.5, 2.8, c, 0, 0.5, 0)); k.add(box(1.2, 0.35, 0.9, c, 0, 0.5, 1.7));
    if (style.pods) [-0.9, 0.9].forEach(x => k.add(box(0.25, 0.35, 1.6, c, x, 0.5, 0.2)));         // side pods
    k.add(box(1.9, 0.25, 0.3, a, 0, 0.3, 2.05)); k.add(box(1.9, 0.25, 0.3, a, 0, 0.3, -1.45));
    [-0.4, 0.4].forEach(x => { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b0 })); hl.position.set(x, 0.55, 2.16); k.add(hl); }); // headlights
    k.add(box(1.0, 0.55, 0.4, 0x222222, 0, 1.0, -0.95)); k.add(box(1.0, 0.1, 0.9, 0x222222, 0, 0.78, -0.4));
    if (style.spoiler === 'standard') { k.add(box(1.9, 0.08, 0.5, c, 0, 1.25, -1.5)); [-0.6, 0.6].forEach(x => k.add(box(0.1, 0.5, 0.1, a, x, 1.0, -1.5))); }
    if (style.spoiler === 'wing') {
      k.add(box(2.3, 0.1, 0.7, c, 0, 1.6, -1.6)); [-0.5, 0.5].forEach(x => k.add(box(0.1, 0.9, 0.12, a, x, 1.15, -1.6)));
      [-1.15, 1.15].forEach(x => k.add(box(0.06, 0.45, 0.8, a, x, 1.55, -1.6)));                        // end plates
    }
    const bar = torus(0.5, 0.05, 0x888888, 0, 1.25, -0.9); bar.rotation.y = Math.PI / 2; k.add(bar);                 // roll bar
    [-0.35, 0.35].forEach(x => { const e = cyl(0.1, 0.1, 0.5, 0x888888, x, 0.45, -1.7, 8); e.rotation.x = Math.PI / 2; k.add(e); });
    plate.position.set(0, 0.62, -1.61); plate.rotation.y = Math.PI; k.add(plate);
    if (def.livery) {
      const hood = imgPlane(1.1, 0.8, def.livery); hood.rotation.x = -Math.PI / 2; hood.position.set(0, 0.69, 1.7); k.add(hood);
      if (style.spoiler === 'standard') { const sp = imgPlane(1.8, 0.45, def.livery); sp.rotation.x = -Math.PI / 2; sp.position.set(0, 1.3, -1.5); k.add(sp); }
      if (style.spoiler === 'wing') { const sp = imgPlane(2.2, 0.65, def.livery); sp.rotation.x = -Math.PI / 2; sp.position.set(0, 1.66, -1.6); k.add(sp); }
    }
    addSticker(0.55, 0, 0.7, 1.7);                                                 // over the livery, like a real decal
    const wl = WHEEL_LOOK[style.wheels];
    const wg = new THREE.CylinderGeometry(wl.r, wl.r, wl.w, S); wg.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(wl.hubR, wl.hubR, wl.w + 0.02, 8); hub.rotateZ(Math.PI / 2);
    [[-0.95, 1.0], [0.95, 1.0], [-0.95, -1.0], [0.95, -1.0]].forEach(p => {
      const w = tag(new THREE.Mesh(wg, mat(wl.tyre, 0.95))); w.position.set(p[0] + Math.sign(p[0]) * (wl.w - 0.4) / 2, wl.r, p[1]); w.rotation.order = 'YXZ';
      w.add(new THREE.Mesh(hub, mat(wl.hub, wl.hubRough))); k.add(w); wheels.push(w);
    });
  }
  const driver = buildDriver(def); driver.position.set(0, def.tractor ? 1.05 : 0.75, -0.35); driver.scale.setScalar(0.85); k.add(driver);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOWS() ? 0.12 : 0.32 }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; k.add(sh);
  const sparks = [];
  [-0.9, 0.9].forEach(x => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), new THREE.MeshBasicMaterial({ color: 0x7cc4ff })); s.position.set(x, 0.25, -1.3); s.visible = false; k.add(s); sparks.push(s); });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; ring.visible = false; k.add(ring);
  const rotor = new THREE.Group(); rotor.add(cyl(0.08, 0.08, 1.6, 0x444444, 0, 0.8, 0, 6)); const bl = box(5, 0.06, 0.3, 0x333333, 0, 1.6, 0); rotor.add(bl); const bl2 = bl.clone(); bl2.rotation.y = Math.PI / 2; rotor.add(bl2); rotor.position.set(0, 1.4, -0.4); rotor.visible = false; k.add(rotor);
  k.userData = { wheels, sparks, ring, driver, rotor, blades: [bl, bl2] };
  return k;
}
