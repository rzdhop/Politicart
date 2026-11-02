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
import { ITEMS, itemTier, itemUses, REAR_GUARDS, rollItem } from './data.js';
import { buildFakeBallotBox } from './ballotbox.js';
import { dropCoins, takeCoin } from './coins.js';
import { tally } from './goals.js';
import { hintFor, say, tell } from './events.js';
import { line, plural } from './lines.js';
import { updateProgress } from './physics.js';
import { barricade, buildProjectileMesh, lacrymo, poseProjectile } from './itemmeshes.js';
import { box, cone, cyl, mat, setCast, sph, textPlane } from './primitives.js';
import { G, nextEntityId, roadYAt } from './state.js';
import { foeAhead, isFoe, leadingFoe } from './teams.js';
import { clamp, lerp, rand, wrapAngle } from './util.js';
import { spawnVfx } from './vfx.js';

// Hazards and projectiles carry an id so a snapshot can name them (DEC-014); the counter lives in state.js, since track.js numbers the static obstacles too (DEC-049).

// ---------- Items ----------
/** How long the roll of an item lasts once a box is taken (s): short, so the box pays out at once (DEC-065). */
export const ITEM_ROLL = 0.8;
/** How long a taken box stays away (s). */
export const BOX_RESPAWN = 3;
/** The projectiles a rear guard stops. */
const GUARDED = Object.freeze(['dossier', 'bravm']);

export function pickupItems() {
  for (const b of G.itemBoxes) {
    b.mesh.rotation.y += 0.03;
    if (!b.active) { b.timer -= 1 / 60; if (b.timer <= 0) { b.active = true; b.mesh.visible = true; } continue; }
    for (const k of G.karts) { if (k.item || k.itemRolling > 0 || k.finished || k.fly > 0) continue; const d = (k.pos.x - b.x) ** 2 + (k.pos.z - b.z) ** 2; if (d < 7) { b.active = false; b.timer = BOX_RESPAWN; b.mesh.visible = false; k.pendingItem = rollItem(k.rank, G.urnRush > 0); k.itemRolling = ITEM_ROLL; sfxFor(k, 'box'); break; } }
  }
}
/** The rolled item lands in kart k's slot, with its uses; a rare or mythic one plays the jackpot for its driver. */
export function landItem(k, id) {
  k.item = id; k.itemUses = itemUses(id);
  if (!k.isAI && itemTier(id) !== 'common') sfxFor(k, 'jackpot');
}
/** Whether kart k holds an item behind it that guards its back (a rear guard, drawn and ready). */
export const guardsRear = k => !!k.item && !(k.itemRolling > 0) && REAR_GUARDS.includes(k.item);

export function useItem(k) {
  if (!k.item || k.itemRolling > 0) return; const id = k.item;
  // an item of several uses (an upgrade, the jackpot) stays in the slot until its last use
  if ((k.itemUses || 1) > 1) { k.itemUses--; if (k.isAI) k.itemTimer = rand(0.4, 1.4); } else { k.item = null; k.itemUses = 0; }
  const it = id;
  tally(k, 'items');
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  // every item shows where it starts (vfx.js); what it does to the karts it reaches shows where it lands (impact below)
  if (it === 'turbo') { k.boost = 1.6; k.boostPower = 1.55; sfxFor(k, 'boost'); spawnVfx('rocket', { kart: k, color: 0xffd34d }); say(k, line('item.turbo.use')); }
  else if (it === 'turbo3') { k.boost = Math.max(k.boost, 1.15); k.boostPower = 1.55; sfxFor(k, 'boost'); spawnVfx('rocket', { kart: k, color: 0xffd34d }); say(k, line('item.turbo3.use')); }
  else if (it === 'dossier3') { const ahead = foeAhead(k, G.karts); spawnProjectile('dossier', k, ahead && !ahead.finished ? ahead : null); sfxFor(k, 'swoosh'); spawnVfx('streak', { kart: k, color: 0xfff5dd }); say(k, line('item.dossier3.use')); }
  else if (it === 'reserve') { k.boost = Math.max(k.boost, 0.9); k.boostPower = 1.6; takeCoin(k); sfxFor(k, 'euro'); spawnVfx('coins', { kart: k }); spawnVfx('rocket', { kart: k, color: 0xf2c14e }); say(k, line('item.reserve.use')); }
  else if (it === 'greve') { spawnHazard('barricade', k.pos.x - fx * 3.5, k.pos.z - fz * 3.5, null, k.team, k); k.hazardGrace = 1.0; sfxFor(k, 'drop'); spawnVfx('dust', { x: k.pos.x - fx * 3.5, y: k.y, z: k.pos.z - fz * 3.5 }); say(k, line('item.greve.use')); }
  else if (it === 'sondage') { spawnHazard('fakebox', k.pos.x - fx * 3.5, k.pos.z - fz * 3.5, null, k.team, k); k.hazardGrace = 1.0; sfxFor(k, 'drop'); spawnVfx('puff', { x: k.pos.x - fx * 3.5, y: k.y, z: k.pos.z - fz * 3.5, color: 0xffe9a0 }); say(k, line('item.sondage.use')); }
  else if (it === 'immunite') { k.invincible = 6; endStun(k); sfxFor(k, 'shield'); spawnVfx('bubble', { kart: k, color: 0xf2c14e }); say(k, line('item.immunite.use')); }
  else if (it === 'helico') { k.fly = 4; endStun(k); k.drift.active = false; sfxFor(k, 'helico'); spawnVfx('dust', { kart: k }); spawnVfx('beam', { kart: k, color: 0x7cc4ff }); say(k, line('item.helico.use')); }
  else if (it === 'relance') { k.relance = 3; k.relanceTimer = 0; sfxFor(k, 'euro'); spawnVfx('coins', { kart: k }); say(k, line('item.relance.use')); }
  else if (it === 'remaniement') { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished && o.rank < k.rank) { if (o.item) o.item = null; if (stunKart(o, 0.7, k)) hit.push(o); } const n = hit.length; sfxFor(k, 'stamp'); spawnVfx('shockwave', { kart: k, color: 0xb14cff, r: 14 }); impact(hit, 'papers'); tell(k, line('item.remaniement.use', { n, s: plural(n) }), line('item.remaniement.hit'), hit); }
  else if (it === 'dossier') { const ahead = foeAhead(k, G.karts); const target = ahead && !ahead.finished ? ahead : null; spawnProjectile('dossier', k, target); sfxFor(k, 'swoosh'); spawnVfx('streak', { kart: k, color: 0xfff5dd }); spawnVfx('papers', { kart: k }); say(k, line('item.dossier.use')); }
  else if (it === 'motion') { const target = leadingFoe(k, G.karts); spawnProjectile('motion', k, target); sfxFor(k, 'motion'); spawnVfx('aura', { kart: k, color: 0xc8102e }); spawnVfx('beam', { kart: k, color: 0xc8102e }); say(k, line('item.motion.use')); }
  else if (it === 'bravm') {
    // always two bikes, one on each side: the two karts just ahead, or both on the only one, or straight down the road
    const ahead = G.karts.filter(o => isFoe(k, o) && !o.finished && o.rank < k.rank).sort((a, b) => b.rank - a.rank).slice(0, 2);
    [1, -1].forEach((side, n) => spawnProjectile('bravm', k, ahead[n] ?? ahead[0] ?? null, side));
    sfxFor(k, 'siren'); spawnVfx('siren', { kart: k }); spawnVfx('dust', { kart: k, color: 0x9a9aa8 }); say(k, line('item.bravm.use'));
  }
  else if (it === 'lacrymo') { spawnHazard('lacrymo', k.pos.x - fx * 4, k.pos.z - fz * 4, k); k.hazardGrace = 1.2; sfxFor(k, 'gas'); spawnVfx('gas', { x: k.pos.x - fx * 4, y: k.y, z: k.pos.z - fz * 4 }); say(k, line('item.lacrymo.use')); }
  else if (it === 'casserolade') { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; if (Math.hypot(dx, dz) < 20) { o.speed *= 0.5; if (stunKart(o, 0.8, k)) hit.push(o); } } const n = hit.length; sfxFor(k, 'pans'); heard(hit, 'pans'); spawnVfx('shockwave', { kart: k, color: 0xd98a3a, r: 20 }); spawnVfx('pans', { kart: k }); impact(hit, 'impact', 0xd98a3a); tell(k, line('item.casserolade.use', { n, s: plural(n) }), line('item.casserolade.hit'), hit); }
  else if (it === 'dissolution') { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished) { if (stunKart(o, 0.9, k)) hit.push(o); } const n = hit.length; sfxFor(k, 'gavel'); spawnVfx('shockwave', { kart: k, color: 0xf6f1e4, r: 60 }); spawnVfx('papers', { kart: k }); spawnVfx('confetti', { kart: k, r: 20 }); impact(hit, 'papers'); tell(k, line('item.dissolution.use', { n, s: plural(n) }), line('item.dissolution.hit'), hit); }
  else if (it === 'niche') { k.invincible = 5; k.phantom = 5; k.boost = Math.max(k.boost, 0.6); k.boostPower = 1.3; endStun(k); sfxFor(k, 'euro'); spawnVfx('coins', { kart: k }); spawnVfx('bubble', { kart: k, color: 0xf2c14e }); say(k, line('item.niche.use')); }
  else if (it === 'langue') { k.shield = 25; sfxFor(k, 'shield'); spawnVfx('bubble', { kart: k, color: 0x7cc4ff }); say(k, line('item.langue.use')); }
  else if (it === 'cumul') {
    // two mandates, two items, used at once; a cumul never rolls another cumul
    const got = []; while (got.length < 2) { const r = rollItem(k.rank); if (r !== 'cumul') got.push(r); }
    spawnVfx('confetti', { kart: k, r: 16 });
    say(k, line('item.cumul.use', { names: got.map(g => ITEMS[g].name.toUpperCase()).join(' + ') }));
    for (const g of got) { k.item = g; k.itemUses = 1; useItem(k); }
    return;
  }
  else if (it === 'factcheck') { const ahead = foeAhead(k, G.karts); spawnProjectile('factcheck', k, ahead && !ahead.finished ? ahead : null); sfxFor(k, 'swoosh'); spawnVfx('aura', { kart: k, color: 0x9fd8ff }); say(k, line('item.factcheck.use')); }
  else if (it === 'pantouflage') {
    // a jump down the road in a few short hops, so updateProgress follows it and counts a lap if it crosses the line
    spawnVfx('puff', { kart: k }); spawnVfx('beam', { kart: k });
    for (let n = 0; n < 4; n++) { const s = G.samples[(k.idx + 9) % G.N]; k.pos.x = s.x; k.pos.z = s.z; updateProgress(k); }
    const s = G.samples[k.idx]; k.heading = Math.atan2(s.tx, s.tz); k.kx = 0; k.kz = 0; k.speed = Math.max(k.speed, 30); k.phantom = 1.2; k.hazardGrace = 1.2; endStun(k);
    sfxFor(k, 'teleport'); spawnVfx('puff', { kart: k, y: s.y || 0 }); spawnVfx('beam', { kart: k }); say(k, line('item.pantouflage.use'));
  }
  else if (it === 'referendum') {
    const r = Math.random();
    if (r < 0.4) { const boosted = G.karts.filter(o => !o.finished); for (const o of boosted) { o.boost = Math.max(o.boost, 0.8); o.boostPower = Math.max(o.boostPower, 1.3); if (o !== k) sfxFor(o, 'boost'); } k.boost = 1.6; k.boostPower = 1.5; sfxFor(k, 'boost'); spawnVfx('confetti', { kart: k }); impact(boosted, 'aura', 0xffd34d); tell(k, line('item.referendum.use'), line('item.referendum.hit'), boosted); }
    else if (r < 0.8) { const hit = []; for (const o of G.karts) if (isFoe(k, o) && !o.finished) { if (stunKart(o, 0.7, k)) hit.push(o); } const n = hit.length; sfxFor(k, 'gavel'); spawnVfx('shockwave', { kart: k, color: 0xc8102e, r: 30 }); impact(hit, 'impact', 0xc8102e); tell(k, line('item.referendum.non', { n, s: plural(n) }), line('item.referendum.nonHit'), hit); }
    else { k.boost = Math.max(k.boost, 0.6); k.boostPower = Math.max(k.boostPower || 1.4, 1.3); sfxFor(k, 'boost'); spawnVfx('puff', { kart: k, color: 0xf6f1e4 }); spawnVfx('aura', { kart: k, color: 0x6b8fb5 }); say(k, line('item.referendum.nul')); }   // the vote blanc: no longer a penalty (DEC-063)
  }
  if (k.item) hintFor(k, ITEMS[k.item].hint + ' (' + k.itemUses + ' restant' + (k.itemUses > 1 ? 's' : '') + ')');
  else hintFor(k, 'Ramassez une urne pour obtenir un objet.');
}
/** An effect of `type` on every kart in `karts` (the drivers a move reached), in `color` if given. */
export function impact(karts, type, color) { for (const o of karts) spawnVfx(type, { kart: o, color }); }
/** Everyone in `karts` hears `name`. */
const heard = (karts, name) => { for (const o of karts) sfxFor(o, name); };
/** What a hazard looks like when it catches a kart, by type (the impact half of the item that dropped it). */
const HAZARD_HIT = { barricade: ['impact', 0xc8102e], fakebox: ['impact', 0xffd34d], rondpoint: ['impact', 0x5f9a48], obstacle: ['impact', 0x9a9a92] };
/** What a projectile looks like where it lands, by type. */
const PROJECTILE_HIT = { dossier: ['papers'], motion: ['shockwave', 0xc8102e, 6], bravm: ['siren', 0x3a6bff], factcheck: ['flash', 0x9fd8ff, 1] };
/** The mesh and parameters of a hazard of `type`, unplaced. Shared by the simulation and networked clients. */
export function buildHazard(type) {
  const g = new THREE.Group(); let r = 2.2, life = 45, stun = 1.3;
  setCast(true);
  if (type === 'barricade') {
    barricade(g); g.rotation.y = rand(0, 6.28);   // the strike's barricade, its tyres and burning barrel (itemmeshes.js)
  } else if (type === 'fakebox') {
    // the fake urne (ballotbox.js): the real one's look, its "?" upside down and a tilt as it turns
    const fb = buildFakeBallotBox(); g.add(fb); G.animated.push(dt => fb.userData.tick(dt, G.time)); r = 2.4; life = 40; stun = 1.4;
  } else if (type === 'lisier') {
    const pl = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), new THREE.MeshStandardMaterial({ color: 0x5a3b1e, roughness: 1 })); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.1; pl.scale.set(1.3, 1, 1); g.add(pl);
    for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 1.2), 10), mat(0x3f2a14)); sp.rotation.x = -Math.PI / 2; sp.position.set(rand(-4, 4), 0.11, rand(-3, 3)); g.add(sp); }
    r = 4.4; life = 30; stun = 0;
  } else if (type === 'lacrymo') {
    lacrymo(g);   // the grenade and its churning cloud (itemmeshes.js)
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
export function spawnHazard(type, x, z, extra, team, by = null) {
  const { g, r, life, stun } = buildHazard(type);
  const y = roadYAt(x, z);   // on the road's surface where it is dropped (DEC-050)
  g.position.set(x, y, z); G.scene.add(g); G.hazards.push({ id: nextEntityId(), type, x, z, y, mesh: g, life, r, stun, owner: extra || null, team: team ?? (extra ? extra.team : null) ?? null, by: by ?? extra ?? null });
}
/** The prop of a projectile of `type`, unplaced (itemmeshes.js, DEC-071). Shared by the simulation and networked clients. */
export { buildProjectileMesh };
export function spawnProjectile(type, owner, target, side) {
  const g = buildProjectileMesh(type);
  const fx = Math.sin(owner.heading), fz = Math.cos(owner.heading); const sidespawn = type === 'bravm' ? (side ?? (Math.random() < 0.5 ? 1 : -1)) * 2 : 0;
  // y is the height over the road; gy the road's height under the projectile, followed sample by sample (DEC-050)
  const p = { id: nextEntityId(), type, x: owner.pos.x + fx * 3 + (-fz) * sidespawn, z: owner.pos.z + fz * 3 + fx * sidespawn, y: type === 'motion' ? 1.5 : type === 'bravm' ? 0 : 1.0, gy: G.samples[owner.idx]?.y || 0, dx: fx, dz: fz, owner, target, speed: type === 'motion' ? 85 : type === 'bravm' ? 74 : type === 'factcheck' ? 70 : 62, life: type === 'motion' ? 12 : type === 'bravm' ? 8 : 5, mesh: g, idx: owner.idx };
  g.position.set(p.x, p.y + p.gy, p.z); G.scene.add(g); G.projectiles.push(p);
}
/** The longest a hit stuns (s), whatever the move (DEC-063). */
export const STUN_MAX = 1.2;
/** How long a hit nominally `d` seconds long actually stuns: about half, a floor so it still reads as a hit, never past STUN_MAX. */
export const softStun = d => Math.min(STUN_MAX, 0.35 + d * 0.45);
/**
 * Stun kart k for a hit of nominal length `dur` (softStun shortens it),
 * `by` the kart whose move it is (counted for its "hits" goal). Honours
 * flight, immunity, the Langue de bois shield and the grace after a spin
 * (physics.js HIT_GRACE). A stunned kart drops some coins. Returns whether
 * the kart was stunned.
 */
export function stunKart(k, dur, by = null) {
  if (k.god || k.fly > 0) return false;
  if (k.invincible > 0) { spawnVfx('shockwave', { kart: k, color: 0xf2c14e, r: 4 }); return false; }   // the blow glances off
  if (k.shield > 0) { k.shield = 0; sfxFor(k, 'shield'); spawnVfx('shockwave', { kart: k, color: 0x7cc4ff, r: 5 }); say(k, line('shield.parry')); return false; }
  if (k.hitGrace > 0) { spawnVfx('shockwave', { kart: k, color: 0xffffff, r: 3 }); return false; }   // just out of a spin: no stun-lock
  k.stun = Math.max(k.stun, softStun(dur)); k.drift.active = false; k.drift.charge = 0; k.boost = 0; sfxFor(k, 'hit');
  dropCoins(k); tally(k, 'hitsTaken'); if (by && by !== k) tally(by, 'hits');
  return true;
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
    p.mesh.position.set(p.x, p.y + p.gy, p.z); poseProjectile(p.mesh, p.dx, p.dz, dt, G.time);   // faces where it goes, its parts moving (itemmeshes.js)
    let hit = false;
    for (const k of G.karts) { if (k.god) continue; if (k === p.owner && p.life > (p.type === 'motion' ? 11.5 : p.type === 'bravm' ? 7.4 : 4.6)) continue; if (k !== p.owner && !isFoe(p.owner, k)) continue; if (p.type === 'motion' && k !== p.target) continue; if (k.fly > 0 || k.y - p.gy > 1.5) continue; const d = (k.pos.x - p.x) ** 2 + (k.pos.z - p.z) ** 2; if (d < 6.5) {
      // a dossier or a bike from behind ends in the item the kart holds behind it (DEC-065)
      if (GUARDED.includes(p.type) && k !== p.owner && guardsRear(k) && p.dx * Math.sin(k.heading) + p.dz * Math.cos(k.heading) > 0.3) {
        k.item = null; k.itemUses = 0; sfxFor(k, 'parry'); spawnVfx('impact', { kart: k, color: 0xf6f1e4 }); say(k, line('rear.parry')); hit = true; break;
      }
      // fact-checking goes through immunity, shields and tax loopholes alike
      projectileHit(p, k);
      if (p.type === 'factcheck') { k.invincible = 0; k.shield = 0; k.phantom = 0; stunKart(k, 1.2, p.owner); say(k, line('item.factcheck.hit')); hit = true; break; }
      stunKart(k, p.type === 'motion' ? 2.6 : p.type === 'bravm' ? 1.7 : 1.5, p.owner); say(k, line('item.' + p.type + '.hit')); hit = true; break; } }
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
      else if (h.type === 'rondpoint') { const dx = k.pos.x - h.x, dz = k.pos.z - h.z, dd = Math.hypot(dx, dz) || 1; k.pos.x = h.x + dx / dd * h.r; k.pos.z = h.z + dz / dd * h.r; if (k.speed > 10) { k.speed *= 0.4; hazardHit(h, k); if (stunKart(k, h.stun, h.by)) say(k, line('hazard.rondpoint.hit')); k.hazardGrace = 0.8; } }
      else { hazardHit(h, k); if (stunKart(k, h.stun, h.by)) say(k, line('hazard.' + h.type + '.hit')); hit = true; break; } } }     // fakebox or barricade
    if (hit || h.life <= 0) { G.scene.remove(h.mesh); G.hazards.splice(i, 1); }
  }
}
