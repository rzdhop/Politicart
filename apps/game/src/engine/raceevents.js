// Live events during the long lap (DEC-066).
//
// Every race draws three events from EVENTS with its seed (their own salt)
// and the points of the race where they fire: around a quarter, half way
// and three quarters, each nudged a little. When the leading kart passes
// one, the event fires for the whole field: every human hears the news
// (a toast, the "event" jingle) and the HUD flashes its title in the centre
// for BANNER_TIME seconds. The events change the race for a moment without
// punishing anyone for long:
//
// - flash:   Flash info -- a 49.3 for everyone: the field boosts, the back
//            of it longer;
// - urnes:   Pluie d'urnes -- every ballot box is back at once and for
//            URN_RUSH seconds the draws are upgraded (data.js RUSH_UPGRADE);
// - pieces:  Pluie de pièces -- every coin is back and for COIN_RAIN seconds
//            each one counts double (coins.js takeCoin);
// - manif:   Manif sauvage -- four barricades across the road some way
//            ahead of the leader, with gaps to thread;
// - sondage: Sondage éclair -- the three last karts get an item and a boost.
//
// The simulation runs it (race.js simStep): on a team race, the server's
// copy, whose effects reach the clients through the karts, the boxes, the
// coins and the hazards they already receive, plus the banner's id in the
// snapshot (netstate.js `ev`).
import { sfxFor } from './audio.js';
import { respawnCoins } from './coins.js';
import { rollItem } from './data.js';
import { say } from './events.js';
import { ITEM_ROLL, spawnHazard } from './items.js';
import { derive, mulberry32 } from './seed.js';
import { G } from './state.js';
import { spawnVfx } from './vfx.js';

/** The salt of the events' draw from the race seed. */
export const SALT_EVENTS = 0xe7e475;
/** How long the centre banner shows an event's title (s), and how long the rushes last. */
export const BANNER_TIME = 2.6, URN_RUSH = 12, COIN_RAIN = 12;
/** Where in the race the three events fire (fractions of the race's distance), before the nudge. */
export const EVENT_AT = Object.freeze([0.24, 0.5, 0.76]);

/** The events: the title the centre banner shows and the line every driver reads. */
export const EVENTS = Object.freeze({
  flash: { title: 'FLASH INFO', text: 'FLASH INFO : 49.3 GÉNÉRAL, TOUT LE MONDE ACCÉLÈRE !' },
  urnes: { title: 'PLUIE D’URNES', text: 'PLUIE D’URNES : TOUTES LES URNES SONT DE RETOUR, OBJETS AMÉLIORÉS !' },
  pieces: { title: 'PLUIE DE PIÈCES', text: 'PLUIE DE PIÈCES : CHAQUE POLITICOIN COMPTE DOUBLE !' },
  manif: { title: 'MANIF SAUVAGE', text: 'MANIF SAUVAGE : BARRICADES DEVANT LE PELOTON, TROUVEZ LA FAILLE !' },
  sondage: { title: 'SONDAGE ÉCLAIR', text: 'SONDAGE ÉCLAIR : LES TROIS DERNIERS REMONTENT !' },
});
export const EVENT_IDS = Object.freeze(Object.keys(EVENTS));

/** The three events of a race of seed `seed`: `{ id, at }` each, in race order, no event twice. */
export function planEvents(seed) {
  const rng = mulberry32(derive(seed >>> 0, SALT_EVENTS)), pool = [...EVENT_IDS];
  return EVENT_AT.map(at => ({ id: pool.splice(Math.floor(rng() * pool.length), 1)[0], at: at + (rng() - 0.5) * 0.08, done: false }));
}

/** Set the race's events up (startField): the plan, no banner, no rush. */
export function startEvents(seed) {
  G.eventPlan = planEvents(seed); G.eventBanner = null; G.urnRush = 0; G.coinRain = 0;
}

/** How far the leading kart is through the race (0..1). */
function leaderShare() {
  let best = 0; for (const k of G.karts) best = Math.max(best, (k.progress || 0) / Math.max(1, G.laps));
  return best;
}

/**
 * One simulation step of the events: the rushes and the banner run down,
 * and the next event fires once the leader passes its point. Only while the
 * race runs.
 */
export function updateEvents(dt) {
  if (G.urnRush > 0) G.urnRush = Math.max(0, G.urnRush - dt);
  if (G.coinRain > 0) G.coinRain = Math.max(0, G.coinRain - dt);
  if (G.eventBanner) { G.eventBanner.t -= dt; if (G.eventBanner.t <= 0) G.eventBanner = null; }
  if (G.state !== 'race' || !G.eventPlan || G.replaying) return;
  const share = leaderShare();
  for (const e of G.eventPlan) if (!e.done && share >= e.at) { e.done = true; fireEvent(e.id); break; }
}

/** The leading kart still racing. */
const leader = () => G.karts.filter(k => !k.finished).sort((a, b) => a.rank - b.rank)[0] ?? G.karts[0];

/** Fire event `id` now: its effect, the news for every human, the banner. */
export function fireEvent(id) {
  const ev = EVENTS[id]; if (!ev) return;
  const racing = G.karts.filter(k => !k.finished);
  if (id === 'flash') {
    for (const k of racing) { const back = k.rank >= G.karts.length - 3; k.boost = Math.max(k.boost, back ? 1.8 : 1.2); k.boostPower = Math.max(k.boostPower || 1.4, 1.4); spawnVfx('aura', { kart: k, color: 0xffd34d }); }
  } else if (id === 'urnes') {
    for (const b of G.itemBoxes) { b.active = true; b.timer = 0; b.mesh.visible = true; }
    G.urnRush = URN_RUSH;
  } else if (id === 'pieces') {
    respawnCoins(); G.coinRain = COIN_RAIN;
  } else if (id === 'manif') {
    const l = leader(), s = G.samples[(l.idx + Math.round(G.N * 0.05)) % G.N], hw = s.hw ?? G.hw;
    for (const o of [-0.66, -0.22, 0.22, 0.66]) { const lat = o * hw + (Math.random() - 0.5) * 2; spawnHazard('barricade', s.x + s.sx * lat, s.z + s.sz * lat, null, null); }
    spawnVfx('confetti', { x: s.x, y: (s.y || 0) + 1, z: s.z, r: 20 });
  } else if (id === 'sondage') {
    const last = [...racing].sort((a, b) => b.rank - a.rank).slice(0, 3);
    for (const k of last) { k.boost = Math.max(k.boost, 0.8); k.boostPower = Math.max(k.boostPower || 1.4, 1.35); if (!k.item && !(k.itemRolling > 0)) { k.pendingItem = rollItem(k.rank); k.itemRolling = ITEM_ROLL; } spawnVfx('coins', { kart: k }); }
  }
  G.eventBanner = { id, t: BANNER_TIME, title: ev.title };
  for (const k of G.karts) if (!k.isAI) { say(k, ev.text); sfxFor(k, 'event'); }
}

/** The centre banner's title for this frame, or ''. */
export const eventTitle = () => (G.eventBanner ? EVENTS[G.eventBanner.id]?.title ?? '' : '');
