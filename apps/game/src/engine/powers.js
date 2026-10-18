// Special powers, one per candidate.
//
// usePower checks the cooldown and resolves the sixteen signature moves --
// field-wide slowdowns, item theft, barricades, the round-about, the swap with
// the kart ahead, a speed cap, a copied power -- through applyPower, by
// composing the item layer's hazards, projectiles and stuns. The cooldown and
// use count are tracked on the kart; the HUD reads them, this module never
// writes to it. Text goes through engine/events.js, sound is direct.
import * as THREE from 'three';

import { sfx } from './audio.js';
import { ITEMS, rollItem } from './data.js';
import { hintFor, say, tell } from './events.js';
import { endStun, spawnHazard, stunKart } from './items.js';
import { CFG, G } from './state.js';
import { foeAhead, isFoe } from './teams.js';

// ---------- Special powers ----------
export function usePower(k) {
  if (k.powerCd > 0 || k.stun > 0 || G.state !== 'race' || k.finished) return;
  const id = k.def.power.id;
  if (id === 'rattrapage' && k.rank < 3) { say(k, 'TEMPS DE PAROLE : SEULEMENT À PARTIR DE LA 4e PLACE'); return; }
  k.powerCd = k.def.power.cd || CFG.powerCooldown; k.powerUses++;
  applyPower(k, id);
}

/** Resolve power `id` for kart k, cooldown already paid. Ralliement calls it with another candidate's id. */
function applyPower(k, id) {
  if (id === 'ralliement') {
    // the transfuge joins whoever is just ahead and borrows their move
    const t = G.karts.find(o => o.rank === k.rank - 1 && !o.finished);
    const copied = t && t.def.power.id !== 'ralliement' ? t.def.power.id : null;
    if (copied) { tell(k, 'RALLIEMENT À ' + t.def.name.toUpperCase() + ' : ' + t.def.power.name.toUpperCase(), k.def.name.toUpperCase() + ' CHANGE DE CAMP'); applyPower(k, copied); }
    else { k.boost = 1.4; k.boostPower = 1.45; sfx('boost'); tell(k, 'RALLIEMENT AU VAINQUEUR ANNONCÉ : BOOST', k.def.name.toUpperCase() + ' RALLIE LE VAINQUEUR'); }
    return;
  }
  if (id === 'rabot') { for (const o of G.karts) if (isFoe(k, o)) o.rabot = 4; k.boost = Math.max(k.boost, 0.8); k.boostPower = 1.35; sfx('motion'); tell(k, 'COUP DE RABOT : -15 % POUR TOUT LE MONDE SAUF VOUS', 'COUP DE RABOT BUDGÉTAIRE : -15 % DE VITESSE'); return; }
  if (id === 'fakenews') {
    // a fake row of golden urns down the road, laid out like the real ones
    const s = G.samples[(k.idx + 24) % G.N]; [-5, 0, 5].forEach(o => spawnHazard('fakebox', s.x + s.sx * o, s.z + s.sz * o, k, k.team));
    sfx('drop'); tell(k, 'FAKE NEWS : FAUSSES URNES DEVANT', 'FAKE NEWS ! NE CROYEZ PAS LES URNES');
    return;
  }
  if (id === 'controle') {
    const behind = G.karts.filter(o => isFoe(k, o) && !o.finished && o.rank > k.rank && o.rank <= k.rank + 2);
    let n = 0; for (const o of behind) { o.speed *= 0.5; if (stunKart(o, 1.2)) { n++; say(o, 'CONTRÔLE D’IDENTITÉ : VOS PAPIERS !'); } }
    if (n) { sfx('motion'); say(k, 'CONTRÔLE D’IDENTITÉ : ' + n + ' KART' + (n > 1 ? 'S' : '') + ' ARRÊTÉ' + (n > 1 ? 'S' : '')); }
    else { k.boost = 1.2; k.boostPower = 1.4; sfx('boost'); say(k, 'RIEN À SIGNALER : BOOST'); }
    return;
  }
  if (id === 'directive') { for (const o of G.karts) if (isFoe(k, o)) o.capped = 3; sfx('shield'); tell(k, 'DIRECTIVE EUROPÉENNE : ADVERSAIRES BRIDÉS À 110', 'DIRECTIVE EUROPÉENNE : LIMITÉ À 110 KM/H'); return; }
  if (id === 'elements') { let n = 0; for (const o of G.karts) if (isFoe(k, o) && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 2500) { o.confused = 3; n++; } sfx('shield'); tell(k, 'ÉLÉMENTS DE LANGAGE : ' + n + ' ADVERSAIRE' + (n > 1 ? 'S' : '') + ' RECADRÉ' + (n > 1 ? 'S' : ''), o => (o.confused > 0 ? 'ÉLÉMENTS DE LANGAGE : COMMANDES INVERSÉES !' : 'CONFÉRENCE DE PRESSE DE BERNADETTE')); return; }
  if (id === 'audience') { const t = foeAhead(k, G.karts); if (t && t.item && t.itemRolling <= 0) { k.item = t.item; t.item = null; say(t, 'VOTRE OBJET A ÉTÉ VOLÉ !'); } else { k.item = rollItem(k.rank); } k.itemRolling = 0; sfx('pick'); say(k, 'VOL D’AUDIENCE : ' + ITEMS[k.item].name.toUpperCase()); hintFor(k, ITEMS[k.item].hint); return; }
  if (id === 'examen') { const a = foeAhead(k, G.karts); const t = a && !a.finished ? a : null; if (t) { t.item = null; stunKart(t, 1.8); sfx('motion'); tell(k, 'MISE EN EXAMEN DE ' + t.def.name.toUpperCase(), o => (t === o ? 'VOUS ÊTES MIS·E EN EXAMEN !' : 'MISE EN EXAMEN SUR LE CIRCUIT')); } else { k.boost = 1.4; k.boostPower = 1.4; sfx('boost'); say(k, 'NON-LIEU : PERSONNE DEVANT, BOOST'); } return; }
  if (id === 'epandage') { for (let i = 1; i <= 2; i++) { const s = G.samples[(k.idx - i * 5 + G.N) % G.N]; spawnHazard('lisier', s.x + s.sx * (i % 2 ? 2.5 : -2.5), s.z + s.sz * (i % 2 ? 2.5 : -2.5), k); } sfx('drop'); tell(k, 'ÉPANDAGE EN COURS', 'ÉPANDAGE DE PATRICK !'); return; }
  if (id === 'rattrapage') { k.boost = 2.6; k.boostPower = 1.7; endStun(k); sfx('boost'); tell(k, 'TEMPS DE PAROLE : RATTRAPAGE !', 'LUCIE REVIENT DANS LA COURSE'); return; }
  if (id === 'debat') { for (const o of G.karts) if (isFoe(k, o)) o.slowed = 3; sfx('shield'); tell(k, 'GRAND DÉBAT : TOUT LE MONDE ÉCOUTE', k.def.name + ' LANCE UN GRAND DÉBAT'); }
  else if (id === 'blocage') { for (let i = 1; i <= 4; i++) { const lat = (i % 2 ? 1 : -1) * 3.2; const s = G.samples[(k.idx - i * 4 + G.N) % G.N]; spawnHazard('barricade', s.x + s.sx * lat, s.z + s.sz * lat, null, k.team); } k.hazardGrace = 1.5; sfx('drop'); tell(k, 'GRÈVE GÉNÉRALE !', 'GRÈVE GÉNÉRALE DÉCLARÉE'); }
  else if (id === 'rondpoint') { const s = G.samples[(k.idx + 18) % G.N]; spawnHazard('rondpoint', s.x, s.z, k); sfx('drop'); tell(k, 'ROND-POINT INAUGURÉ', 'UN ROND-POINT APPARAÎT'); }
  else if (id === 'zfe') { let n = 0; for (const o of G.karts) if (isFoe(k, o) && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 1600) { if (stunKart(o, 1.3)) n++; } k.boost = 1.2; k.boostPower = 1.4; sfx('boost'); tell(k, 'ZFE : ' + n + ' VIGNETTE' + (n > 1 ? 'S' : '') + ' REFUSÉE' + (n > 1 ? 'S' : ''), 'ZONE À FAIBLES ÉMISSIONS !'); }
  else if (id === 'amendement') {
    const a = foeAhead(k, G.karts); const t = a && !a.finished ? a : null;
    if (t) { const p = { ...k.pos }, h = k.heading, i = k.idx, l = k.lap, sp = k.speed; k.pos.x = t.pos.x; k.pos.z = t.pos.z; k.heading = t.heading; k.idx = t.idx; k.lap = t.lap; t.pos.x = p.x; t.pos.z = p.z; t.heading = h; t.idx = i; t.lap = l; k.speed = Math.max(sp, t.speed); t.speed *= 0.6; k.maxLap = Math.max(k.maxLap, k.lap); k.hazardGrace = 1; t.hazardGrace = 1; sfx('shield'); tell(k, 'AMENDEMENT ADOPTÉ : PLACE ÉCHANGÉE', 'AMENDEMENT DE DERNIÈRE MINUTE !'); }
    else { k.boost = 1.4; k.boostPower = 1.4; sfx('boost'); tell(k, 'AMENDEMENT : PERSONNE DEVANT, BOOST', ''); }
  }
  else if (id === 'megaphone') {
    let n = 0; for (const o of G.karts) if (isFoe(k, o)) { const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z; const d = Math.hypot(dx, dz); if (d < 22) { const push = (22 - d) * 0.45; o.pos.x += dx / d * push; o.pos.z += dz / d * push; o.speed *= 0.3; if (stunKart(o, 0.9)) n++; } }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 6, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; ring.position.set(k.pos.x, 1, k.pos.z); G.scene.add(ring); let life = 0.7; const fn = dt => { life -= dt; ring.scale.setScalar(1 + (0.7 - life) * 30); ring.material.opacity = Math.max(0, life); if (life <= 0) { G.scene.remove(ring); G.animated.splice(G.animated.indexOf(fn), 1); } }; G.animated.push(fn);
    sfx('motion'); tell(k, 'MÉGAPHONE : ' + n + ' KART' + (n > 1 ? 'S' : '') + ' REPOUSSÉ' + (n > 1 ? 'S' : ''), 'LE MÉGAPHONE DE LULU !');
  }
}
