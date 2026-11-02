// The frame payload: everything the HUD shows, as one plain object per frame.
//
// This is the engine's only output to the UI during a race. Before stage 11
// updateHUD() reached into G and the player's kart from inside game.js and
// wrote the DOM directly; now the engine hands over this snapshot and the UI
// decides how to render it. The fields are the exploration map's list from
// the plan -- rank, lap, time, speed, drift charge, item, power state,
// wrong-way flag and every kart's position -- plus the countdown label,
// which used to be written to the centre of the HUD from inside frame(), and
// whether the kart is a god's (DEC-030), which the HUD labels.
//
// Pure: it reads state and returns a new object, so it can be tested with a
// fake G and never has to know about Three.js or the DOM. One small object
// and one short array per frame is well within what 60 fps tolerates.

import { itemTier, REAR_GUARDS } from './data.js';
import { goalsOf } from './goals.js';
import { sectionOf } from './sections.js';

/** Build the payload for the current frame from the shared state. */
export function framePayload(G, CFG) {
  const k = G.player;
  const event = G.eventBanner?.title ?? '';
  const announce = G.state === 'countdown'
    ? String(Math.min(3, Math.ceil(G.countdown)))
    : (G.time < 0.9 ? 'PARTEZ !' : event);
  return {
    state: G.state,
    time: G.time,
    announce,
    layoutName: G.layout?.name ?? '',       // the variant the seed drew (DEC-049), shown under the countdown
    rank: k.rank,
    lap: k.lap,
    laps: G.laps ?? CFG.laps,              // the race's own: the admin can change it mid-race (DEC-031)
    finished: k.finished,
    finishTime: k.finishTime,
    bestLap: k.bestLap,
    speed: Math.abs(k.speed),
    driftCharge: k.drift.charge,
    item: k.item,
    itemRolling: k.itemRolling > 0,
    itemUses: k.item ? Math.max(1, k.itemUses || 1) : 0,     // an upgrade's uses left (DEC-065)
    itemTier: k.item ? itemTier(k.item) : null,
    section: sectionOf(k, G.track),                          // the long lap's themed section (sections.js)
    coins: k.coins || 0,                                     // politicoins carried (coins.js)
    pickups: k.pickups || 0,
    goals: goalsOf(k, G.goals || []),                        // the run's three goals (goals.js)
    event,                                                   // a live event's title while its banner shows (raceevents.js)
    powerName: k.def.power.name,
    powerCd: k.powerCd,
    powerCdMax: k.def.power.cd || CFG.powerCooldown,
    powerReady: k.powerCd <= 0,
    wrongWay: G.wrongTimer >= 1.2,
    god: k.god === true,
    kartPositions: G.karts.map(o => ({ x: o.pos.x, z: o.pos.z, color: o.style ? parseInt(o.style.body.slice(1), 16) : o.def.kart, isPlayer: o === k })),
    ...motionOf(G, k),
  };
}

// ---------- What the HUD animates (DEC-053) ----------
/**
 * The statuses on kart k, in the HUD's order: each `{ id, time }` (seconds
 * left) or `{ id, count }` (the relance's boosts). The loophole's phantom
 * hides the immunity it comes with.
 */
export function statusOf(k) {
  const out = [], on = (id, v) => { if (v > 0) out.push({ id, time: v }); };
  on('slowed', k.slowed); on('confused', k.confused); on('capped', k.capped); on('rabot', k.rabot); on('slip', k.slip);
  if (k.relance > 0) out.push({ id: 'relance', count: k.relance });
  on('shield', k.shield);
  if (k.phantom > 0) on('phantom', k.phantom); else on('immunity', k.invincible);
  on('fly', k.fly);
  if (k.item && !(k.itemRolling > 0) && REAR_GUARDS.includes(k.item)) out.push({ id: 'rear', count: 1 });    // an item held behind the kart guards its back (DEC-065)
  return out;
}
/**
 * The HUD's motion for kart k: `hit` (the red flash, 0 to 1), `shake` (the
 * camera's), `lapFlash` (the gold one), `boost` (the kart boosts), `status`
 * (statusOf) and `itemUsed` (a count bumped each time the item leaves the
 * slot: the slot flashes on a change). G.fxHud is vfx.js's, null headless.
 */
export function motionOf(G, k) {
  const fx = G.fxHud;
  return { hit: fx?.hit ?? 0, shake: fx?.shake ?? 0, lapFlash: fx?.lap ?? 0, boost: k.boost > 0, status: statusOf(k), itemUsed: fx?.used ?? 0 };
}
