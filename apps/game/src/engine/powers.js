// Special powers, one per candidate.
//
// usePower checks the cooldown and resolves the sixteen signature moves --
// field-wide slowdowns, item theft, barricades, the round-about, the swap with
// the kart ahead, a speed cap, a dispel, a mowing, a copied power -- through
// applyPower, by composing the item layer's hazards, projectiles and stuns.
// The cooldown and use count are tracked on the kart; the HUD reads them,
// this module never writes to it.
//
// What a driver sees and hears concerns them alone (DEC-018, DEC-029): the
// user of a power reads and hears their own move, and the drivers of the
// karts it actually affected read what was done to them and hear it. A move
// that affects nobody else is silent for everybody else. Text goes through
// engine/events.js and comes from the LINES table (lines.js, DEC-038), a
// victim's line picked once per call so every driver hit reads the same
// sentence; sound is routed per kart through sfxFor, never race-wide.
//
// A god kart (the admin playing in creative mode, DEC-030) pays only a token
// cooldown, so it can fire its power about once a second.
import * as THREE from 'three';

import { sfxFor } from './audio.js';
import { ITEMS, rollItem } from './data.js';
import { hintFor, say, tell } from './events.js';
import { endStun, spawnHazard, stunKart } from './items.js';
import { line, plural } from './lines.js';
import { CFG, G } from './state.js';
import { foeAhead, isFoe } from './teams.js';

/** A god's power recharges in this many seconds instead of the candidate's cooldown. */
export const GOD_COOLDOWN = 1;
/** Déconstruction reaches karts within this many metres. */
export const DECONSTRUCTION_RANGE = 40;
/** Fauchage volontaire mows this many metres of road ahead of the tractor. */
export const FAUCHAGE_RANGE = 60;

/** The foes a move by `k` can still affect: everyone racing against it who has not finished. */
const foesOf = k => G.karts.filter(o => isFoe(k, o) && !o.finished);
/** Those of `karts` within `r` metres of k. */
const near = (k, karts, r) => karts.filter(o => (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < r * r);
/** Everyone in `hit` hears `name`: the sound of what was just done to them. */
const heard = (hit, name) => { for (const o of hit) sfxFor(o, name); };

// ---------- Special powers ----------
export function usePower(k) {
  if (k.powerCd > 0 || k.stun > 0 || G.state !== 'race' || k.finished) return;
  const id = k.def.power.id;
  if (id === 'rattrapage' && k.rank < 3) { say(k, line('power.rattrapage.early')); return; }
  k.powerCd = k.god ? GOD_COOLDOWN : k.def.power.cd || CFG.powerCooldown; k.powerUses++;
  applyPower(k, id);
}

/** A boost for a move that found nobody to hit, with its own line. */
function consolation(k, text) { k.boost = Math.max(k.boost, 1.4); k.boostPower = 1.4; sfxFor(k, 'boost'); say(k, text); }

/**
 * Resolve power `id` for kart k, cooldown already paid. Ralliement calls it
 * with another candidate's id; the admin's god commands (godcmd.js) call it
 * with any id, for any kart.
 */
export function applyPower(k, id) {
  const name = k.def.name.toUpperCase();
  if (id === 'ralliement') {
    // the transfuge joins whoever is just ahead and borrows their move
    const t = G.karts.find(o => o.rank === k.rank - 1 && !o.finished);
    const copied = t && t.def.power.id !== 'ralliement' ? t.def.power.id : null;
    if (copied) { say(k, line('power.ralliement.use', { name: t.def.name.toUpperCase(), power: t.def.power.name.toUpperCase() })); applyPower(k, copied); }
    else { k.boost = 1.4; k.boostPower = 1.45; sfxFor(k, 'boost'); say(k, line('power.ralliement.none')); }
    return;
  }
  if (id === 'rabot') {
    const hit = foesOf(k); for (const o of hit) o.rabot = 4;
    k.boost = Math.max(k.boost, 0.8); k.boostPower = 1.35; sfxFor(k, 'motion'); heard(hit, 'motion');
    tell(k, line('power.rabot.use'), line('power.rabot.hit'), hit);
    return;
  }
  if (id === 'fakenews') {
    // a fake row of golden urns down the road, laid out like the real ones
    const s = G.samples[(k.idx + 24) % G.N]; [-5, 0, 5].forEach(o => spawnHazard('fakebox', s.x + s.sx * o, s.z + s.sz * o, k, k.team));
    sfxFor(k, 'drop'); say(k, line('power.fakenews.use'));
    return;
  }
  if (id === 'controle') {
    const behind = foesOf(k).filter(o => o.rank > k.rank && o.rank <= k.rank + 2);
    const hit = []; for (const o of behind) { o.speed *= 0.5; if (stunKart(o, 1.2)) hit.push(o); } const n = hit.length;
    if (n) { sfxFor(k, 'motion'); tell(k, line('power.controle.use', { n, s: plural(n) }), line('power.controle.hit'), hit); }
    else consolation(k, line('power.controle.none'));
    return;
  }
  if (id === 'directive') {
    const hit = foesOf(k); for (const o of hit) o.capped = 3;
    sfxFor(k, 'shield'); heard(hit, 'motion');
    tell(k, line('power.directive.use'), line('power.directive.hit'), hit);
    return;
  }
  if (id === 'chatons') {
    // a litter of kittens behind her, spread across the road: nobody dares drive over them
    [0, 3, -3].forEach((lat, i) => { const s = G.samples[(k.idx - (i + 1) * 4 + G.N) % G.N]; spawnHazard('chatons', s.x + s.sx * lat, s.z + s.sz * lat, k); });
    k.hazardGrace = 1.5; sfxFor(k, 'drop'); say(k, line('power.chatons.use'));
    return;
  }
  if (id === 'audience') {
    const t = foeAhead(k, G.karts);
    if (t && t.item && t.itemRolling <= 0) { k.item = t.item; t.item = null; sfxFor(t, 'drop'); say(t, line('power.audience.hit')); } else { k.item = rollItem(k.rank); }
    k.itemRolling = 0; sfxFor(k, 'pick'); say(k, line('power.audience.use', { item: ITEMS[k.item].name.toUpperCase() })); hintFor(k, ITEMS[k.item].hint);
    return;
  }
  if (id === 'examen') {
    const a = foeAhead(k, G.karts); const t = a && !a.finished ? a : null;
    if (t) { t.item = null; stunKart(t, 1.8); sfxFor(k, 'motion'); tell(k, line('power.examen.use', { name: t.def.name.toUpperCase() }), line('power.examen.hit'), [t]); }
    else consolation(k, line('power.examen.none'));
    return;
  }
  if (id === 'fauchage') {
    // the swath: the road ahead of the tractor, hazards and karts alike
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const inSwath = (x, z, side) => { const dx = x - k.pos.x, dz = z - k.pos.z; const ahead = dx * fx + dz * fz; return ahead > -2 && ahead < FAUCHAGE_RANGE && Math.abs(dx * fz - dz * fx) < side; };
    let mown = 0;
    for (let i = G.hazards.length - 1; i >= 0; i--) { const h = G.hazards[i]; if (inSwath(h.x, h.z, G.hw + 1)) { G.scene.remove(h.mesh); G.hazards.splice(i, 1); mown++; } }
    const hit = []; for (const o of foesOf(k)) if (inSwath(o.pos.x, o.pos.z, 12) && stunKart(o, 1.0)) hit.push(o);
    if (!mown && !hit.length) { consolation(k, line('power.fauchage.none')); return; }
    sfxFor(k, 'motion'); const n = hit.length;
    tell(k, line('power.fauchage.use', { m: mown, ms: plural(mown), n, s: plural(n) }), line('power.fauchage.hit', { name }), hit);
    return;
  }
  if (id === 'rattrapage') { k.boost = 2.6; k.boostPower = 1.7; endStun(k); sfxFor(k, 'boost'); say(k, line('power.rattrapage.use')); return; }
  if (id === 'debat') {
    const hit = foesOf(k); for (const o of hit) o.slowed = 3;
    sfxFor(k, 'shield'); heard(hit, 'motion');
    tell(k, line('power.debat.use'), line('power.debat.hit', { name }), hit);
  }
  else if (id === 'blocage') { for (let i = 1; i <= 4; i++) { const lat = (i % 2 ? 1 : -1) * 3.2; const s = G.samples[(k.idx - i * 4 + G.N) % G.N]; spawnHazard('barricade', s.x + s.sx * lat, s.z + s.sz * lat, null, k.team); } k.hazardGrace = 1.5; sfxFor(k, 'drop'); say(k, line('power.blocage.use')); }
  else if (id === 'rondpoint') { const s = G.samples[(k.idx + 18) % G.N]; spawnHazard('rondpoint', s.x, s.z, k); sfxFor(k, 'drop'); say(k, line('power.rondpoint.use')); }
  else if (id === 'deconstruction') {
    // everything that props a kart up goes: boost, immunity, shield, loophole, helicopter, item
    const hit = near(k, foesOf(k), DECONSTRUCTION_RANGE);
    for (const o of hit) { o.boost = 0; o.relance = 0; o.invincible = 0; o.shield = 0; o.phantom = 0; o.fly = 0; o.item = null; o.pendingItem = null; o.itemRolling = 0; o.slowed = Math.max(o.slowed, 2); o.speed *= 0.6; }
    if (!hit.length) { consolation(k, line('power.deconstruction.none')); return; }
    k.boost = Math.max(k.boost, 1.2); k.boostPower = 1.4; sfxFor(k, 'boost'); heard(hit, 'motion'); const n = hit.length;
    tell(k, line('power.deconstruction.use', { n, s: plural(n) }), line('power.deconstruction.hit', { name }), hit);
  }
  else if (id === 'amendement') {
    const a = foeAhead(k, G.karts); const t = a && !a.finished ? a : null;
    if (t) { const p = { ...k.pos }, h = k.heading, i = k.idx, l = k.lap, sp = k.speed; k.pos.x = t.pos.x; k.pos.z = t.pos.z; k.heading = t.heading; k.idx = t.idx; k.lap = t.lap; t.pos.x = p.x; t.pos.z = p.z; t.heading = h; t.idx = i; t.lap = l; k.speed = Math.max(sp, t.speed); t.speed *= 0.6; k.maxLap = Math.max(k.maxLap, k.lap); k.hazardGrace = 1; t.hazardGrace = 1; sfxFor(k, 'shield'); sfxFor(t, 'motion'); tell(k, line('power.amendement.use'), line('power.amendement.hit', { name }), [t]); }
    else consolation(k, line('power.amendement.none'));
  }
  else if (id === 'megaphone') {
    const hit = []; for (const o of foesOf(k)) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; const d = Math.hypot(dx, dz); if (d < 22) { const push = (22 - d) * 0.45; o.pos.x += dx / d * push; o.pos.z += dz / d * push; o.speed *= 0.3; if (stunKart(o, 0.9)) hit.push(o); } } const n = hit.length;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 6, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; ring.position.set(k.pos.x, 1, k.pos.z); G.scene.add(ring); let life = 0.7; const fn = dt => { life -= dt; ring.scale.setScalar(1 + (0.7 - life) * 30); ring.material.opacity = Math.max(0, life); if (life <= 0) { G.scene.remove(ring); G.animated.splice(G.animated.indexOf(fn), 1); } }; G.animated.push(fn);
    sfxFor(k, 'motion'); tell(k, line('power.megaphone.use', { n, s: plural(n) }), line('power.megaphone.hit', { name }), hit);
  }
}
