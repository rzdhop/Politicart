// Items: pickup, use, hazards and projectiles.
//
// pickupItems hands a rolling item to any kart that drives through an active
// ballot box. useItem resolves the nineteen items -- boosts, shields, flight,
// hazards dropped behind the kart, projectiles thrown ahead and field-wide
// stuns. spawnHazard and spawnProjectile build the meshes and register them
// in G.hazards / G.projectiles, which updateProjectiles then moves, expires
// and collides every frame. stunKart is the one way a kart gets stunned, so
// that invincibility, flight and the Langue de bois shield are honoured
// everywhere; endStun is the one way a stun is cut short.
//
// Player-facing text goes through engine/events.js (say, tell, hintFor route
// it to the drivers concerned) and comes from the LINES table (lines.js,
// DEC-038): a victim's line is picked once per call so every driver hit
// reads the same sentence; sound is a direct call, see physics.js for
// why, and is routed per kart the same way (sfxFor): the user of an item
// hears it, the drivers it hits hear the hit, nobody else hears anything
// (DEC-029). A god kart (DEC-030) is never stunned, never caught by a hazard
// or a projectile: creative mode.
import * as THREE from 'three';

import { sfxFor } from './audio.js';
import { ITEMS, rollItem } from './data.js';
import { hintFor, say, tell } from './events.js';
import { line, plural } from './lines.js';
import { updateProgress } from './physics.js';
import { box, cone, cyl, mat, setCast, sph, textPlane } from './primitives.js';
import { G, nextEntityId, roadYAt } from './state.js';
import { foeAhead, isFoe, leadingFoe } from './teams.js';
import { clamp, lerp, rand, wrapAngle } from './util.js';
import { spawnVfx } from './vfx.js';

// Hazards and projectiles carry an id so a snapshot can name them (DEC-014); the counter lives in state.js, since track.js numbers the static obstacles too (DEC-049).

// ---------- Items ----------
export function pickupItems() {
  for (const b of G.itemBoxes) {
    b.mesh.rotation.y += 0.03; b.mesh.rotation.x += 0.01;
    if (!b.active) { b.timer -= 1 / 60; if (b.timer <= 0) { b.active = true; b.mesh.visible = true; } continue; }
    for (const k of G.karts) { if (k.item || k.itemRolling > 0 || k.finished || k.fly > 0) continue; const d = (k.pos.x - b.x) ** 2 + (k.pos.z - b.z) ** 2; if (d < 7) { b.active = false; b.timer = 3; b.mesh.visible = false; k.pendingItem = rollItem(k.rank); k.itemRolling = 1.1; sfxFor(k, 'box'); break; } }
  }
}
export function useItem(k) {
  if (!k.item || k.itemRolling > 0) return; const it = k.item; k.item = null;
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  // every item shows where it starts (vfx.js); what it does to the karts it reaches shows where it lands (impact below)
  if (it === 'turbo') { k.boost = 1.6; k.boostPower = 1.55; sfxFor(k, 'boost'); spawnVfx('aura', { kart: k, color: 0xffd34d }); say(k, line('item.turbo.use')); }
  else if (it === 'greve') { spawnHazard('barricade', k.pos.x - fx * 3.5, k.pos.z - fz * 3.5, null, k.team); k.hazardGrace = 1.0; sfxFor(k, 'drop'); spawnVfx('dust', { x: k.pos.x - fx * 3.5, y: k.y, z: k.pos.z - fz * 3.5 }); say(k, line('item.greve.use')); }
  else if (it === 'sondage') { spawnHazard('fakebox', k.pos.x - fx * 3.5, k.pos.z - fz * 3.5, null, k.team); k.hazardGrace = 1.0; sfxFor(k, 'drop'); spawnVfx('puff', { x: k.pos.x - fx * 3.5, y: k.y, z: k.pos.z - fz * 3.5, color: 0xffe9a0 }); say(k, line('item.sondage.use')); }
  else if (it === 'immunite') { k.invincible = 6; endStun(k); sfxFor(k, 'shield'); spawnVfx('aura', { kart: k, color: 0xf2c14e }); say(k, line('item.immunite.use')); }
  else if (it === 'helico') { k.fly = 4; endStun(k); k.drift.active = false; sfxFor(k, 'helico'); spawnVfx('dust', { kart: k }); say(k, line('item.helico.use')); }
  else if (it === 'relance') { k.relance = 3; k.relanceTimer = 0; sfxFor(k, 'euro'); spawnVfx('coins', { kart: k }); say(k, line('item.relance.use')); }
  else if (it === 'remaniement') { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished && o.rank < k.rank) { if (o.item) o.item = null; if (stunKart(o, 0.7)) hit.push(o); } const n = hit.length; sfxFor(k, 'stamp'); spawnVfx('shockwave', { kart: k, color: 0xb14cff, r: 14 }); impact(hit, 'papers'); tell(k, line('item.remaniement.use', { n, s: plural(n) }), line('item.remaniement.hit'), hit); }
  else if (it === 'dossier') { const ahead = foeAhead(k, G.karts); const target = ahead && !ahead.finished ? ahead : null; spawnProjectile('dossier', k, target); sfxFor(k, 'swoosh'); spawnVfx('streak', { kart: k, color: 0xfff5dd }); say(k, line('item.dossier.use')); }
  else if (it === 'motion') { const target = leadingFoe(k, G.karts); spawnProjectile('motion', k, target); sfxFor(k, 'motion'); spawnVfx('aura', { kart: k, color: 0xc8102e }); say(k, line('item.motion.use')); }
  else if (it === 'bravm') {
    // always two bikes, one on each side: the two karts just ahead, or both on the only one, or straight down the road
    const ahead = G.karts.filter(o => isFoe(k, o) && !o.finished && o.rank < k.rank).sort((a, b) => b.rank - a.rank).slice(0, 2);
    [1, -1].forEach((side, n) => spawnProjectile('bravm', k, ahead[n] ?? ahead[0] ?? null, side));
    sfxFor(k, 'siren'); spawnVfx('dust', { kart: k, color: 0x9a9aa8 }); say(k, line('item.bravm.use'));
  }
  else if (it === 'lacrymo') { spawnHazard('lacrymo', k.pos.x - fx * 4, k.pos.z - fz * 4, k); k.hazardGrace = 1.2; sfxFor(k, 'gas'); spawnVfx('gas', { x: k.pos.x - fx * 4, y: k.y, z: k.pos.z - fz * 4 }); say(k, line('item.lacrymo.use')); }
  else if (it === 'casserolade') { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; if (Math.hypot(dx, dz) < 20) { o.speed *= 0.5; if (stunKart(o, 0.8)) hit.push(o); } } const n = hit.length; sfxFor(k, 'pans'); heard(hit, 'pans'); spawnVfx('shockwave', { kart: k, color: 0xd98a3a, r: 20 }); impact(hit, 'impact', 0xd98a3a); tell(k, line('item.casserolade.use', { n, s: plural(n) }), line('item.casserolade.hit'), hit); }
  else if (it === 'dissolution') { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished) { if (stunKart(o, 0.9)) hit.push(o); } const n = hit.length; sfxFor(k, 'gavel'); spawnVfx('shockwave', { kart: k, color: 0xf6f1e4, r: 60 }); impact(hit, 'papers'); tell(k, line('item.dissolution.use', { n, s: plural(n) }), line('item.dissolution.hit'), hit); }
  else if (it === 'niche') { k.invincible = 5; k.phantom = 5; k.boost = Math.max(k.boost, 0.6); k.boostPower = 1.3; endStun(k); sfxFor(k, 'euro'); spawnVfx('coins', { kart: k }); say(k, line('item.niche.use')); }
  else if (it === 'langue') { k.shield = 25; sfxFor(k, 'shield'); spawnVfx('aura', { kart: k, color: 0x7cc4ff }); say(k, line('item.langue.use')); }
  else if (it === 'cumul') {
    // two mandates, two items, used at once; a cumul never rolls another cumul
    const got = []; while (got.length < 2) { const r = rollItem(k.rank); if (r !== 'cumul') got.push(r); }
    spawnVfx('confetti', { kart: k, r: 16 });
    say(k, line('item.cumul.use', { names: got.map(g => ITEMS[g].name.toUpperCase()).join(' + ') }));
    for (const g of got) { k.item = g; useItem(k); }
    return;
  }
  else if (it === 'factcheck') { const ahead = foeAhead(k, G.karts); spawnProjectile('factcheck', k, ahead && !ahead.finished ? ahead : null); sfxFor(k, 'swoosh'); spawnVfx('aura', { kart: k, color: 0x9fd8ff }); say(k, line('item.factcheck.use')); }
  else if (it === 'pantouflage') {
    // a jump down the road in a few short hops, so updateProgress follows it and counts a lap if it crosses the line
    spawnVfx('puff', { kart: k });
    for (let n = 0; n < 4; n++) { const s = G.samples[(k.idx + 9) % G.N]; k.pos.x = s.x; k.pos.z = s.z; updateProgress(k); }
    const s = G.samples[k.idx]; k.heading = Math.atan2(s.tx, s.tz); k.kx = 0; k.kz = 0; k.speed = Math.max(k.speed, 30); k.phantom = 1.2; k.hazardGrace = 1.2; endStun(k);
    sfxFor(k, 'teleport'); spawnVfx('puff', { kart: k, y: s.y || 0 }); say(k, line('item.pantouflage.use'));
  }
  else if (it === 'referendum') {
    const r = Math.random();
    if (r < 0.4) { const boosted = G.karts.filter(o => !o.finished); for (const o of boosted) { o.boost = Math.max(o.boost, 0.8); o.boostPower = Math.max(o.boostPower, 1.3); if (o !== k) sfxFor(o, 'boost'); } k.boost = 1.6; k.boostPower = 1.5; sfxFor(k, 'boost'); spawnVfx('confetti', { kart: k }); impact(boosted, 'aura', 0xffd34d); tell(k, line('item.referendum.use'), line('item.referendum.hit'), boosted); }
    else if (r < 0.8) { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished) { if (stunKart(o, 0.7)) hit.push(o); } const n = hit.length; sfxFor(k, 'gavel'); spawnVfx('shockwave', { kart: k, color: 0xc8102e, r: 30 }); impact(hit, 'impact', 0xc8102e); tell(k, line('item.referendum.non', { n, s: plural(n) }), line('item.referendum.nonHit'), hit); }
    else { k.slowed = Math.max(k.slowed, 1.5); sfxFor(k, 'drop'); spawnVfx('puff', { kart: k, color: 0x9a9a9a }); spawnVfx('aura', { kart: k, color: 0x6b8fb5 }); say(k, line('item.referendum.nul')); }
  }
  hintFor(k, 'Ramassez une urne dorée pour obtenir un objet.');
}
/** An effect of `type` on every kart in `karts` (the drivers a move reached), in `color` if given. */
export function impact(karts, type, color) { for (const o of karts) spawnVfx(type, { kart: o, color }); }
/** Everyone in `karts` hears `name`. */
const heard = (karts, name) => { for (const o of karts) sfxFor(o, name); };
/** What a hazard looks like when it catches a kart, by type (the impact half of the item that dropped it). */
const HAZARD_HIT = { barricade: ['impact', 0xc8102e], fakebox: ['impact', 0xffd34d], rondpoint: ['impact', 0x5f9a48], obstacle: ['impact', 0x9a9a92] };
/** What a projectile looks like where it lands, by type. */
const PROJECTILE_HIT = { dossier: ['papers'], motion: ['shockwave', 0xc8102e, 6], bravm: ['impact', 0x3a6bff], factcheck: ['flash', 0x9fd8ff, 1] };
/** The mesh and parameters of a hazard of `type`, unplaced. Shared by the simulation and networked clients. */
export function buildHazard(type) {
  const g = new THREE.Group(); let r = 2.2, life = 45, stun = 1.3;
  setCast(true);
  if (type === 'barricade') {
    g.add(box(2.6, 0.5, 0.25, 0xc8102e, 0, 1.0, 0)); [-0.9, 0, 0.9].forEach(o => g.add(box(0.5, 0.5, 0.27, 0xffffff, o, 1.0, 0)));
    [-1.0, 1.0].forEach(o => { g.add(box(0.15, 1.3, 0.15, 0x333333, o, 0.65, 0.25)); g.add(box(0.15, 1.3, 0.15, 0x333333, o, 0.65, -0.25)); });
    g.add(box(0.8, 0.5, 0.05, 0xc8102e, 0.9, 1.8, 0)); g.add(cyl(0.04, 0.04, 2.2, 0x333333, 0.5, 1.1, 0, 5)); g.rotation.y = rand(0, 6.28);
  } else if (type === 'fakebox') {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x6a4a00, transparent: true, opacity: 0.9, roughness: 0.3, metalness: 0.4 })); m.position.y = 1.4; g.add(m); G.animated.push(dt => { m.rotation.y -= dt * 1.8; m.rotation.x -= dt * 0.6; }); r = 2.4; life = 40; stun = 1.4;
  } else if (type === 'lisier') {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), new THREE.MeshStandardMaterial({ color: 0x5a3b1e, roughness: 1 })); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.1; pl.scale.set(1.3, 1, 1); g.add(pl);
    for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 1.2), 10), mat(0x3f2a14)); sp.rotation.x = -Math.PI / 2; sp.position.set(rand(-4, 4), 0.11, rand(-3, 3)); g.add(sp); }
    r = 4.4; life = 30; stun = 0;
  } else if (type === 'lacrymo') {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4dcb2, transparent: true, opacity: 0.55, roughness: 1 })); cloud.position.y = 1.5; cloud.scale.y = 0.65; g.add(cloud);
    for (let i = 0; i < 4; i++) { const pf = new THREE.Mesh(new THREE.SphereGeometry(rand(1.3, 2.1), 8, 6), new THREE.MeshStandardMaterial({ color: 0xe2e6c8, transparent: true, opacity: 0.4, roughness: 1 })); pf.position.set(rand(-2, 2), 1.3 + rand(-0.3, 0.8), rand(-2, 2)); g.add(pf); }
    r = 4.2; life = 7; stun = 0;
  } else if (type === 'chatons') {
    // three kittens sitting in the road, one of each coat, tails up
    [[-1.1, 0.2, 0xf4f4f4], [0.2, -0.4, 0xd98a3a], [1.2, 0.5, 0x6e6e6e]].forEach(([x, z, c]) => {
      g.add(sph(0.42, c, x, 0.42, z, 10)); g.add(sph(0.3, c, x, 0.85, z + 0.25, 8));
      g.add(cone(0.1, 0.22, c, x - 0.16, 1.1, z + 0.25, 4)); g.add(cone(0.1, 0.22, c, x + 0.16, 1.1, z + 0.25, 4));
      g.add(cyl(0.05, 0.05, 0.7, c, x, 0.5, z - 0.5, 5));
    });
    r = 3.4; life = 25; stun = 0;
  } else if (type === 'rondpoint') {
    g.add(cyl(4.2, 4.4, 0.7, 0x8a8a84, 0, 0.35, 0, 24)); g.add(cyl(3.2, 3.2, 0.4, 0x5f9a48, 0, 0.9, 0, 24)); g.add(cyl(0.4, 0.4, 5, 0xc0c0c0, 0, 3.2, 0, 8)); [-0.8, 0, 0.8].forEach(o => g.add(box(0.4, 2.4, 0.4, 0xc0c0c0, o, 6.5, 0)));
    const sign = textPlane(2.4, 1.0, 'CÉDEZ', '#fff', '#c8102e', 80); sign.position.set(0, 2.2, 4.3); g.add(sign); g.add(cyl(0.05, 0.05, 2.2, 0x555555, 0, 1.1, 4.3, 5));
    r = 5.2; life = 18; stun = 1.0;
  } else if (type === 'obstacle') {
    // a static obstacle a client did not build itself (it should have: they come with the layout); a plain block stands in
    g.add(box(3, 1.2, 1.6, 0x9a9a92, 0, 0.6, 0)); r = 3.0; life = 1e9; stun = 0;
  }
  return { g, r, life, stun };
}
export function spawnHazard(type, x, z, extra, team) {
  const { g, r, life, stun } = buildHazard(type);
  const y = roadYAt(x, z);   // on the road's surface where it is dropped (DEC-050)
  g.position.set(x, y, z); G.scene.add(g); G.hazards.push({ id: nextEntityId(), type, x, z, y, mesh: g, life, r, stun, owner: extra || null, team: team ?? (extra ? extra.team : null) ?? null });
}
/** The mesh of a projectile of `type`, unplaced. Shared by the simulation and networked clients. */
export function buildProjectileMesh(type) {
  const g = new THREE.Group();
  if (type === 'dossier') { g.add(box(0.9, 0.12, 1.1, 0xb98b4e, 0, 0, 0)); g.add(box(0.7, 0.14, 0.9, 0xfff5dd, 0, 0.02, 0)); g.add(box(0.3, 0.16, 0.12, 0xc8102e, 0.2, 0.02, 0.5)); }
  else if (type === 'bravm') {
    g.add(box(0.55, 0.45, 1.8, 0x14141e, 0, 0.75, 0)); g.add(box(0.6, 0.35, 0.6, 0x20202c, 0, 1.0, -0.4));
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.22, 12); wg.rotateZ(Math.PI / 2); [0.85, -0.85].forEach(zz => { const w = new THREE.Mesh(wg, mat(0x111111)); w.position.set(0, 0.5, zz); g.add(w); });
    g.add(cyl(0.18, 0.2, 0.9, 0x2b2b38, 0, 1.4, -0.35, 8)); g.add(sph(0.28, 0x3a3a46, 0, 1.95, -0.35, 10));           // rider torso + helmet
    g.add(box(0.5, 0.2, 0.2, 0x111118, 0, 1.3, 0.75)); const bl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0x3a6bff })); bl.position.set(0, 1.6, 0.1); g.add(bl);
    g.userData.blink = bl;
  }
  else if (type === 'factcheck') {
    // a magnifying glass, lens first
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 20), mat(0x333333)); g.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); g.add(lens);
    const handle = cyl(0.08, 0.1, 0.9, 0x6b4a2b, 0, -1.0, 0, 6); g.add(handle);
  }
  else { g.add(box(1.0, 0.8, 1.0, 0xc8102e, 0, 0, 0)); g.add(box(1.1, 0.2, 1.1, 0xfff5dd, 0, 0.5, 0)); g.add(cone(0.5, 0.8, 0xf2c14e, 0, 1.0, 0, 6)); }
  return g;
}
export function spawnProjectile(type, owner, target, side) {
  const g = buildProjectileMesh(type);
  const fx = Math.sin(owner.heading), fz = Math.cos(owner.heading); const sidespawn = type === 'bravm' ? (side ?? (Math.random() < 0.5 ? 1 : -1)) * 2 : 0;
  // y is the height over the road; gy the road's height under the projectile, followed sample by sample (DEC-050)
  const p = { id: nextEntityId(), type, x: owner.pos.x + fx * 3 + (-fz) * sidespawn, z: owner.pos.z + fz * 3 + fx * sidespawn, y: type === 'motion' ? 1.5 : type === 'bravm' ? 0 : 1.0, gy: G.samples[owner.idx]?.y || 0, dx: fx, dz: fz, owner, target, speed: type === 'motion' ? 85 : type === 'bravm' ? 74 : type === 'factcheck' ? 70 : 62, life: type === 'motion' ? 12 : type === 'bravm' ? 8 : 5, mesh: g, idx: owner.idx };
  g.position.set(p.x, p.y + p.gy, p.z); G.scene.add(g); G.projectiles.push(p);
}
export function stunKart(k, dur) {
  if (k.god || k.fly > 0) return false;
  if (k.invincible > 0) { spawnVfx('shockwave', { kart: k, color: 0xf2c14e, r: 4 }); return false; }   // the blow glances off
  if (k.shield > 0) { k.shield = 0; sfxFor(k, 'shield'); spawnVfx('shockwave', { kart: k, color: 0x7cc4ff, r: 5 }); say(k, line('shield.parry')); return false; } k.stun = Math.max(k.stun, dur); k.drift.active = false; k.drift.charge = 0; k.boost = 0; sfxFor(k, 'hit'); return true;
}
/** Cut a stun short (an item that frees the driver) and face the road again, as the end of a spin does. */
export function endStun(k) {
  if (k.stun <= 0) return;
  k.stun = 0; const s = G.samples[k.idx]; if (s) k.heading = Math.atan2(s.tx, s.tz);
}

/** A projectile reaches kart k: its effect where it lands, the impact for the victim and the thrower (vfx.js, audio.js). */
function projectileHit(p, k) {
  const [type, color, r] = PROJECTILE_HIT[p.type] ?? ['impact'];
  spawnVfx(type, { kart: k, color, r }); if (type !== 'impact') spawnVfx('impact', { kart: k, color });
  sfxFor(k, 'impact'); if (p.owner && p.owner !== k) sfxFor(p.owner, 'impact');
}
/** A hazard catches kart k: the debris of what it ran into, and its sound. */
function hazardHit(h, k) {
  const [type, color] = HAZARD_HIT[h.type] ?? ['impact'];
  spawnVfx(type, { x: h.x, y: h.y || 0, z: h.z, color }); if (h.type === 'fakebox') spawnVfx('papers', { x: h.x, y: h.y || 0, z: h.z });
  sfxFor(k, 'impact');
}

// ---------- Projectiles in flight ----------
export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.life -= dt;
    if (p.target && (p.target.finished || p.target.fly > 0)) p.target = null;
    if (p.target) { const dx = p.target.pos.x - p.x, dz = p.target.pos.z - p.z; const d = Math.hypot(dx, dz) || 1; const want = Math.atan2(dx, dz), cur = Math.atan2(p.dx, p.dz); const a = cur + clamp(wrapAngle(want - cur), -3.5 * dt, 3.5 * dt); p.dx = Math.sin(a); p.dz = Math.cos(a); if (p.type === 'motion') p.y = d > 20 ? 5 : lerp(5, 1, 1 - d / 20); }
    { const N = G.N; let best = p.idx, bd = Infinity; for (let o = 0; o <= 14; o++) { const j = (p.idx + o) % N; const s = G.samples[j]; const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = j; } } p.idx = best; p.gy = G.samples[best].y || 0; }
    if (!p.target && (p.type === 'dossier' || p.type === 'factcheck')) { const t = G.samples[(p.idx + 8) % G.N]; const a = Math.atan2(t.x - p.x, t.z - p.z); p.dx = Math.sin(a); p.dz = Math.cos(a); }
    p.x += p.dx * p.speed * dt; p.z += p.dz * p.speed * dt;
    p.mesh.position.set(p.x, p.y + p.gy, p.z); p.mesh.rotation.y += dt * 9;
    let hit = false;
    if (p.mesh.userData.blink) p.mesh.userData.blink.material.color.setHex(Math.floor(G.time * 10) % 2 ? 0x3a6bff : 0xff3a4a);
    for (const k of G.karts) { if (k.god) continue; if (k === p.owner && p.life > (p.type === 'motion' ? 11.5 : p.type === 'bravm' ? 7.4 : 4.6)) continue; if (k !== p.owner && !isFoe(p.owner, k)) continue; if (p.type === 'motion' && k !== p.target) continue; if (k.fly > 0 || k.y - p.gy > 1.5) continue; const d = (k.pos.x - p.x) ** 2 + (k.pos.z - p.z) ** 2; if (d < 6.5) {
      // fact-checking goes through immunity, shields and tax loopholes alike
      projectileHit(p, k);
      if (p.type === 'factcheck') { k.invincible = 0; k.shield = 0; k.phantom = 0; stunKart(k, 1.2); say(k, line('item.factcheck.hit')); hit = true; break; }
      stunKart(k, p.type === 'motion' ? 2.6 : p.type === 'bravm' ? 1.7 : 1.5); say(k, line('item.' + p.type + '.hit')); hit = true; break; } }
    if (!hit && p.life <= 0) spawnVfx('puff', { x: p.x, y: p.y + p.gy, z: p.z, color: 0xcfcfcf });   // spent: it fizzles out
    if (hit || p.life <= 0) { G.scene.remove(p.mesh); G.projectiles.splice(i, 1); }
  }
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.life -= dt; let hit = false;
    for (const k of G.karts) { if (k.god || (k.hazardGrace > 0 && h.type !== 'obstacle' && h.type !== 'lacrymo') || k.fly > 0 || k === h.owner || (h.team != null && k.team === h.team) || k.y - (h.y || 0) > 1.2) continue; const d = (k.pos.x - h.x) ** 2 + (k.pos.z - h.z) ** 2; if (d < h.r * h.r) {
      if (h.type === 'lacrymo') { if (k.slowed <= 0) { say(k, line('hazard.lacrymo.hit')); sfxFor(k, 'gas'); spawnVfx('gas', { kart: k }); } k.slowed = Math.max(k.slowed, 1.3); k.confused = Math.max(k.confused, 1.0); }
      else if (h.type === 'chatons') { k.speed *= 0.35; k.confused = Math.max(k.confused, 1.2); k.hazardGrace = 1.2; sfxFor(k, 'bump'); spawnVfx('puff', { kart: k, color: 0xffc0d8 }); say(k, line('hazard.chatons.hit')); }
      else if (h.type === 'lisier') { if (k.slip <= 0) { say(k, line('hazard.lisier.hit')); spawnVfx('splash', { kart: k, color: 0x5a3b1e }); } k.slip = Math.max(k.slip, 0.4); }
      else if (h.type === 'obstacle') { const dx = k.pos.x - h.x, dz = k.pos.z - h.z, dd = Math.hypot(dx, dz) || 1; k.pos.x = h.x + dx / dd * h.r; k.pos.z = h.z + dz / dd * h.r; if (k.speed > 12) { k.speed *= 0.55; sfxFor(k, 'bump'); hazardHit(h, k); } }
      else if (h.type === 'rondpoint') { const dx = k.pos.x - h.x, dz = k.pos.z - h.z, dd = Math.hypot(dx, dz) || 1; k.pos.x = h.x + dx / dd * h.r; k.pos.z = h.z + dz / dd * h.r; if (k.speed > 10) { k.speed *= 0.4; hazardHit(h, k); if (stunKart(k, h.stun)) say(k, line('hazard.rondpoint.hit')); k.hazardGrace = 0.8; } }
      else { hazardHit(h, k); if (stunKart(k, h.stun)) say(k, line('hazard.' + h.type + '.hit')); hit = true; break; } } }     // fakebox or barricade
    if (hit || h.life <= 0) { G.scene.remove(h.mesh); G.hazards.splice(i, 1); }
  }
}
