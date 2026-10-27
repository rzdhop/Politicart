// The admin's absolute power over a race in progress (DEC-031).
//
// applyGodCommand(cmd, actor) changes the race on the spot: stun, freeze,
// slow or boost any kart (or all of them), hand out any item, fire any kart's
// power or make it cast any power at all, drop any hazard in front of a kart,
// move a kart to the front or the back of the field, swap two karts, add or
// take away a lap, change how many laps the race has, make any kart a god or
// a mortal, and end the race now.
//
// The same function runs in solo play (the admin's browser, on its own
// engine) and in team races (the race worker, on the server's engine, sent
// by the admin's socket or the dashboard). It is not gated here: whoever
// calls it has already checked that the caller is the admin.
//
// `cmd` is `{ cmd, target?, ... }`. A target is a kart's index in G.karts (its
// grid slot) or 'all', which means every kart still racing but the gods and
// `actor` (the admin's own kart, or null from the dashboard). Commands that
// move one kart, or need one, refuse 'all'. The drivers affected read what
// was done to them; the caller gets `{ ok, text }` back.
import { sfxFor } from './audio.js';
import { CHARACTERS, ITEMS } from './data.js';
import { hintFor, say } from './events.js';
import { spawnHazard } from './items.js';
import { applyPower } from './powers.js';
import { G } from './state.js';

/** The hazards the admin can drop. */
export const GOD_HAZARDS = Object.freeze(['barricade', 'fakebox', 'lisier', 'lacrymo', 'rondpoint', 'chatons']);
/** Every power in the cast, by id, once each. */
export const GOD_POWERS = Object.freeze([...new Set(CHARACTERS.map(c => c.power.id))]);
/** Every command applyGodCommand understands. */
export const GOD_COMMANDS = Object.freeze(['stun', 'slow', 'boost', 'give', 'fire', 'cast', 'hazard', 'front', 'back', 'swap', 'lap', 'laps', 'god', 'finish']);
/** The most laps a race can be set to. */
export const MAX_LAPS = 9;

const DIVINE = 'INTERVENTION DIVINE : ';
const ok = text => ({ ok: true, text });
const no = text => ({ ok: false, text });
const isSlot = t => Number.isInteger(t) && t >= 0 && t < G.karts.length;

/** The karts `t` names: one slot, or 'all' (everyone still racing but the gods and the actor). */
function targets(t, actor) {
  if (t === 'all') return G.karts.filter(k => k !== actor && !k.god && !k.finished);
  return isSlot(t) ? [G.karts[t]] : [];
}

/** A kart crosses the line now: finished, timed, and the results armed once every human is in. */
function finishKart(k) {
  if (k.finished) return;
  k.finished = true; k.finishTime = G.time;
  if (G.karts.every(o => o.isAI || o.finished || o.god)) G.resultsAt = Math.min(G.resultsAt, G.time + 5);
}

/**
 * Put kart k on the road at spline index `idx` of lap `lap` (either may run
 * past the line: they are normalised), facing down the road, with a moment's
 * grace from hazards. Laps it skips are not counted as driven, and a lap it
 * goes back is not counted twice.
 */
function placeAt(k, lap, idx) {
  const N = G.N;
  while (idx >= N) { idx -= N; lap++; }
  while (idx < 0) { idx += N; lap--; }
  const s = G.samples[idx];
  k.pos.x = s.x; k.pos.z = s.z; k.heading = Math.atan2(s.tx, s.tz); k.idx = idx; k.lap = lap;
  k.maxLap = Math.max(k.maxLap, lap); k.progress = lap + idx / N;
  k.kx = 0; k.kz = 0; k.air = false; k.y = 0; k.vy = 0; k.rampPrev = null; k.hazardGrace = 1.5; k.stun = 0;
  if (k.lap >= G.laps) finishKart(k);
}

const label = k => k.def.name.toUpperCase();
const count = (n, word) => n + ' ' + word + (n > 1 ? 's' : '');

/** Change the race in progress. Returns `{ ok, text }`; nothing changes when ok is false. */
export function applyGodCommand(cmd, actor = null) {
  if (!cmd || typeof cmd !== 'object' || !GOD_COMMANDS.includes(cmd.cmd)) return no('Commande inconnue.');
  if (!['countdown', 'race', 'paused'].includes(G.state) || !G.karts.length) return no('Aucune course en cours.');
  const one = () => { if (!isSlot(cmd.target)) return null; return G.karts[cmd.target]; };
  const many = targets(cmd.target, actor);

  switch (cmd.cmd) {
    case 'stun': {
      // a god's stun goes through immunity, shields and helicopters
      const dur = Math.min(10, Math.max(0.5, Number(cmd.dur) || 2));
      if (!many.length) return no('Personne à étourdir.');
      for (const k of many) { k.invincible = 0; k.shield = 0; k.fly = 0; k.stun = Math.max(k.stun, dur); k.drift.active = false; k.drift.charge = 0; k.boost = 0; k.speed *= 0.3; sfxFor(k, 'hit'); say(k, DIVINE + (dur >= 5 ? 'VOUS ÊTES FIGÉ·E' : 'FOUDROYÉ·E')); }
      return ok(count(many.length, 'kart') + (dur >= 5 ? ' figé' : ' foudroyé') + (many.length > 1 ? 's' : '') + '.');
    }
    case 'slow': {
      if (!many.length) return no('Personne à ralentir.');
      for (const k of many) { k.slowed = Math.max(k.slowed, 5); sfxFor(k, 'motion'); say(k, DIVINE + 'RALENTI·E'); }
      return ok(count(many.length, 'kart') + ' ralenti' + (many.length > 1 ? 's' : '') + '.');
    }
    case 'boost': {
      if (!many.length) return no('Personne à propulser.');
      for (const k of many) { k.boost = Math.max(k.boost, 2); k.boostPower = 1.6; k.stun = 0; sfxFor(k, 'boost'); say(k, DIVINE + 'BOOST'); }
      return ok(count(many.length, 'kart') + ' propulsé' + (many.length > 1 ? 's' : '') + '.');
    }
    case 'give': {
      const item = cmd.item;
      if (!Object.hasOwn(ITEMS, item)) return no('Objet inconnu.');
      if (!many.length) return no('Personne à qui donner.');
      for (const k of many) { k.item = item; k.pendingItem = null; k.itemRolling = 0; sfxFor(k, 'pick'); say(k, DIVINE + ITEMS[item].name.toUpperCase()); hintFor(k, ITEMS[item].hint); }
      return ok(ITEMS[item].name + ' donné à ' + count(many.length, 'kart') + '.');
    }
    case 'fire': {
      // each kart fires its own power, now, whatever its cooldown or its place
      if (!many.length) return no('Personne pour lancer son pouvoir.');
      for (const k of many) { k.powerUses++; applyPower(k, k.def.power.id); }
      return ok(count(many.length, 'pouvoir') + ' déclenché' + (many.length > 1 ? 's' : '') + '.');
    }
    case 'cast': {
      if (!GOD_POWERS.includes(cmd.power)) return no('Pouvoir inconnu.');
      const k = one(); if (!k) return no('Choisissez un kart.');
      k.powerUses++; applyPower(k, cmd.power);
      const name = CHARACTERS.find(c => c.power.id === cmd.power).power.name;
      return ok(k.def.name + ' lance ' + name + '.');
    }
    case 'hazard': {
      if (!GOD_HAZARDS.includes(cmd.type)) return no('Piège inconnu.');
      if (!many.length) return no('Personne devant qui poser un piège.');
      // no owner and no team: it catches everyone, the kart it was laid for included
      for (const k of many) { const s = G.samples[(k.idx + 20) % G.N]; spawnHazard(cmd.type, s.x, s.z, null, null); }
      return ok(count(many.length, 'piège') + ' posé' + (many.length > 1 ? 's' : '') + '.');
    }
    case 'front': case 'back': {
      const k = one(); if (!k) return no('Choisissez un kart.');
      const field = G.karts.filter(o => o !== k && !o.finished);
      if (!field.length) return no('Personne d’autre sur la piste.');
      const ref = field.reduce((m, o) => (cmd.cmd === 'front' ? o.progress > m.progress : o.progress < m.progress) ? o : m);
      placeAt(k, ref.lap, ref.idx + (cmd.cmd === 'front' ? 10 : -10));
      say(k, DIVINE + (cmd.cmd === 'front' ? 'EN TÊTE DE COURSE' : 'RENVOYÉ·E EN QUEUE'));
      return ok(k.def.name + (cmd.cmd === 'front' ? ' passe en tête.' : ' passe en queue.'));
    }
    case 'swap': {
      const a = isSlot(cmd.target) ? G.karts[cmd.target] : null, b = isSlot(cmd.with) ? G.karts[cmd.with] : null;
      if (!a || !b || a === b) return no('Choisissez deux karts différents.');
      const pa = { lap: a.lap, idx: a.idx, speed: a.speed }, pb = { lap: b.lap, idx: b.idx, speed: b.speed };
      placeAt(a, pb.lap, pb.idx); placeAt(b, pa.lap, pa.idx); a.speed = pb.speed; b.speed = pa.speed;
      say(a, DIVINE + 'ÉCHANGÉ·E AVEC ' + label(b)); say(b, DIVINE + 'ÉCHANGÉ·E AVEC ' + label(a));
      return ok(a.def.name + ' et ' + b.def.name + ' échangent leur place.');
    }
    case 'lap': {
      const k = one(); if (!k) return no('Choisissez un kart.');
      const delta = cmd.delta === -1 ? -1 : 1;
      if (k.finished) return no(k.def.name + ' a déjà fini.');
      k.lap = Math.max(0, k.lap + delta); k.maxLap = Math.max(k.maxLap, k.lap); k.progress = k.lap + k.idx / G.N;
      say(k, DIVINE + (delta > 0 ? 'UN TOUR OFFERT' : 'UN TOUR RETIRÉ'));
      if (k.lap >= G.laps) finishKart(k);
      return ok(k.def.name + ' : tour ' + Math.min(k.lap + 1, G.laps) + '/' + G.laps + '.');
    }
    case 'laps': {
      const n = Number(cmd.laps);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LAPS) return no('De 1 à ' + MAX_LAPS + ' tours.');
      G.laps = n;
      for (const k of G.karts) { if (!k.finished && k.lap >= n) finishKart(k); say(k, DIVINE + 'LA COURSE SE JOUE EN ' + n + ' TOUR' + (n > 1 ? 'S' : '')); }
      return ok('La course se joue en ' + n + ' tour' + (n > 1 ? 's' : '') + '.');
    }
    case 'god': {
      const k = one(); if (!k) return no('Choisissez un kart.');
      k.god = cmd.on === true;
      say(k, DIVINE + (k.god ? 'VOUS DEVENEZ UN DIEU' : 'VOUS REDEVENEZ MORTEL·LE'));
      return ok(k.def.name + (k.god ? ' devient un dieu.' : ' redevient mortel·le.'));
    }
    case 'finish': {
      // the race ends at the next step: the results list the field as it stands (never mid-countdown: there is no path from it to the results)
      if (G.state === 'countdown') return no('La course n’a pas encore commencé.');
      G.resultsAt = G.time;
      for (const k of G.karts) say(k, DIVINE + 'FIN DE LA COURSE');
      return ok('Course terminée.');
    }
  }
  return no('Commande inconnue.');
}
