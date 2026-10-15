// Special powers, one per candidate.
//
// usePower resolves the eleven signature moves -- field-wide slowdowns, item
// theft, barricades, the round-about, the swap with the kart ahead -- by
// composing the item layer's hazards, projectiles and stuns. The cooldown and
// use count are tracked on the kart; the HUD reads them, this module never
// writes to it. Text goes through engine/events.js, sound is direct.
import * as THREE from 'three';

import { sfx } from './audio.js';
import { ITEMS, rollItem } from './data.js';
import { setHint, toast } from './events.js';
import { spawnHazard, stunKart } from './items.js';
import { CFG, G } from './state.js';

// ---------- Special powers ----------
export function usePower(k) {
  if (k.powerCd > 0 || k.stun > 0 || G.state !== 'race' || k.finished) return;
  const id = k.def.power.id; const fx = Math.sin(k.heading), fz = Math.cos(k.heading); const me = !k.isAI;
  if (id === 'rattrapage' && k.rank < 3) { if (me) toast('TEMPS DE PAROLE : SEULEMENT À PARTIR DE LA 4e PLACE'); return; }
  k.powerCd = k.def.power.cd || CFG.powerCooldown; k.powerUses++;
  if (id === 'elements') { let n = 0; for (const o of G.karts) if (o !== k && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 2500) { o.confused = 3; n++; } sfx('shield'); toast(me ? 'ÉLÉMENTS DE LANGAGE : ' + n + ' ADVERSAIRE' + (n > 1 ? 'S' : '') + ' RECADRÉ' + (n > 1 ? 'S' : '') : (G.player.confused > 0 ? 'ÉLÉMENTS DE LANGAGE : COMMANDES INVERSÉES !' : 'CONFÉRENCE DE PRESSE DE BERNADETTE')); return; }
  if (id === 'audience') { const t = G.karts.find(o => o.rank === k.rank - 1); if (t && t.item && t.itemRolling <= 0) { k.item = t.item; t.item = null; if (t === G.player) toast('VOTRE OBJET A ÉTÉ VOLÉ !'); } else { k.item = rollItem(k.rank); } k.itemRolling = 0; sfx('pick'); if (me) { toast('VOL D’AUDIENCE : ' + ITEMS[k.item].name.toUpperCase()); setHint(ITEMS[k.item].hint); } return; }
  if (id === 'examen') { const t = G.karts.find(o => o.rank === k.rank - 1 && !o.finished); if (t) { t.item = null; stunKart(t, 1.8); sfx('motion'); toast(me ? 'MISE EN EXAMEN DE ' + t.def.name.toUpperCase() : (t === G.player ? 'VOUS ÊTES MIS·E EN EXAMEN !' : 'MISE EN EXAMEN SUR LE CIRCUIT')); } else { k.boost = 1.4; k.boostPower = 1.4; sfx('boost'); if (me) toast('NON-LIEU : PERSONNE DEVANT, BOOST'); } return; }
  if (id === 'epandage') { for (let i = 1; i <= 2; i++) { const s = G.samples[(k.idx - i * 5 + G.N) % G.N]; spawnHazard('lisier', s.x + s.sx * (i % 2 ? 2.5 : -2.5), s.z + s.sz * (i % 2 ? 2.5 : -2.5), k); } sfx('drop'); toast(me ? 'ÉPANDAGE EN COURS' : 'ÉPANDAGE DE PATRICK !'); return; }
  if (id === 'rattrapage') { k.boost = 2.6; k.boostPower = 1.7; k.stun = 0; sfx('boost'); toast(me ? 'TEMPS DE PAROLE : RATTRAPAGE !' : 'LUCIE REVIENT DANS LA COURSE'); return; }
  if (id === 'debat') { for (const o of G.karts) if (o !== k) o.slowed = 3; sfx('shield'); toast(me ? 'GRAND DÉBAT : TOUT LE MONDE ÉCOUTE' : k.def.name + ' LANCE UN GRAND DÉBAT'); }
  else if (id === 'blocage') { for (let i = 1; i <= 4; i++) { const lat = (i % 2 ? 1 : -1) * 3.2; const s = G.samples[(k.idx - i * 4 + G.N) % G.N]; spawnHazard('barricade', s.x + s.sx * lat, s.z + s.sz * lat); } k.hazardGrace = 1.5; sfx('drop'); toast(me ? 'GRÈVE GÉNÉRALE !' : 'GRÈVE GÉNÉRALE DÉCLARÉE'); }
  else if (id === 'rondpoint') { const s = G.samples[(k.idx + 18) % G.N]; spawnHazard('rondpoint', s.x, s.z, k); sfx('drop'); toast(me ? 'ROND-POINT INAUGURÉ' : 'UN ROND-POINT APPARAÎT'); }
  else if (id === 'zfe') { let n = 0; for (const o of G.karts) if (o !== k && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 1600) { if (stunKart(o, 1.3)) n++; } k.boost = 1.2; k.boostPower = 1.4; sfx('boost'); toast(me ? 'ZFE : ' + n + ' VIGNETTE' + (n > 1 ? 'S' : '') + ' REFUSÉE' + (n > 1 ? 'S' : '') : 'ZONE À FAIBLES ÉMISSIONS !'); }
  else if (id === 'amendement') {
    const t = G.karts.find(o => o.rank === k.rank - 1 && !o.finished);
    if (t) { const p = { ...k.pos }, h = k.heading, i = k.idx, l = k.lap, sp = k.speed; k.pos.x = t.pos.x; k.pos.z = t.pos.z; k.heading = t.heading; k.idx = t.idx; k.lap = t.lap; t.pos.x = p.x; t.pos.z = p.z; t.heading = h; t.idx = i; t.lap = l; k.speed = Math.max(sp, t.speed); t.speed *= 0.6; k.maxLap = Math.max(k.maxLap, k.lap); k.hazardGrace = 1; t.hazardGrace = 1; sfx('shield'); toast(me ? 'AMENDEMENT ADOPTÉ : PLACE ÉCHANGÉE' : 'AMENDEMENT DE DERNIÈRE MINUTE !'); }
    else { k.boost = 1.4; k.boostPower = 1.4; sfx('boost'); toast(me ? 'AMENDEMENT : PERSONNE DEVANT, BOOST' : ''); }
  }
  else if (id === 'megaphone') {
    let n = 0; for (const o of G.karts) if (o !== k) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; const d = Math.hypot(dx, dz); if (d < 22) { const push = (22 - d) * 0.45; o.pos.x += dx / d * push; o.pos.z += dz / d * push; o.speed *= 0.3; if (stunKart(o, 0.9)) n++; } }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 6, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; ring.position.set(k.pos.x, 1, k.pos.z); G.scene.add(ring); let life = 0.7; const fn = dt => { life -= dt; ring.scale.setScalar(1 + (0.7 - life) * 30); ring.material.opacity = Math.max(0, life); if (life <= 0) { G.scene.remove(ring); G.animated.splice(G.animated.indexOf(fn), 1); } }; G.animated.push(fn);
    sfx('motion'); toast(me ? 'MÉGAPHONE : ' + n + ' KART' + (n > 1 ? 'S' : '') + ' REPOUSSÉ' + (n > 1 ? 'S' : '') : 'LE MÉGAPHONE DE LULU !');
  }
}
