// The run's mechanics (DEC-061..066): one long lap and its sections, softer
// hits, the ballot boxes, the multi-use items and the rear guard, the coins,
// the goals and the live events, checked on a real circuit in node.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BOX_Y } from './ballotbox.js';
import { syncBallotBoxes } from './ballotbox.js';
import { COINS_LOST_ON_HIT, MAX_COINS, coinSpots, pickupCoins, takeCoin } from './coins.js';
import { CHARACTERS, ITEMS, ITEM_ODDS, itemTier, rollItem } from './data.js';
import { drain } from './events.js';
import { GOALS, GOALS_PER_RUN, goalsCount, goalsOf, pickGoals, tally } from './goals.js';
import { softStun, STUN_MAX, stunKart, updateProjectiles, useItem } from './items.js';
import { resetMachine, transition } from './machine.js';
import { applyKartDiscrete, encodeKart, encodeKartPrivate, encodeSnapshot } from './netstate.js';
import { framePayload } from './payload.js';
import { CATCH_UP, catchUp, HIT_GRACE, RECOVER_BOOST, updateKart } from './physics.js';
import { EVENT_IDS, fireEvent, planEvents, updateEvents, URN_RUSH } from './raceevents.js';
import { startField } from './race.js';
import { SECTIONS, sectionAt, sectionsOf } from './sections.js';
import { CFG, G } from './state.js';
import { TRACKS } from './data.js';

const STEP = 1 / 60;
const def = id => CHARACTERS.find(c => c.id === id);
const ids = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu'];
const SEED = 1;
/** A grid of AI karts on circuit 0 with the race running. */
function race() {
  resetMachine('tracks'); G.trackIdx = 0;
  startField(ids.map(id => ({ def: def(id), isAI: true })), { seed: SEED });
  transition('race'); G.countdown = 0; drain();
  return G.karts;
}
/** Put kart k at sample i, lateral offset lat, facing down the road at speed v. */
function place(k, i, lat, v) {
  const s = G.samples[i]; k.idx = i; k.pos.x = s.x + s.sx * lat; k.pos.z = s.z + s.sz * lat; k.heading = Math.atan2(s.tx, s.tz); k.speed = v; k.y = s.y;
}
const toasts = k => drain().filter(e => e.type === 'toast' && (!e.to || e.to === k)).map(e => e.text);

describe('one long lap (DEC-061, DEC-062)', () => {
  beforeEach(() => race());

  it('is one lap by default, and four named sections on every circuit', () => {
    expect(CFG.laps).toBe(1); expect(G.laps).toBe(1);
    for (const t of TRACKS) { const list = sectionsOf(t); expect(list, t.id).toHaveLength(4); expect(list[0][0]).toBe(0); expect(SECTIONS[t.id], t.id).toBeDefined(); }
    expect(sectionAt(0.1, sectionsOf(TRACKS[0]))).toBe(0); expect(sectionAt(0.6, sectionsOf(TRACKS[0]))).toBe(2);
  });

  it('tells a human entering the next section its name and the split, once', () => {
    const k = G.karts[0]; k.isAI = false;
    place(k, Math.floor(G.N * 0.24), 0, 30); updateKart(k, STEP); drain();
    place(k, Math.floor(G.N * 0.26), 0, 30); G.time = 31; updateKart(k, STEP);
    const said = toasts(k).filter(t => t.startsWith('SECTEUR'));
    expect(said).toHaveLength(1); expect(said[0]).toContain('FAUBOURG'); expect(said[0]).toContain('0:31');
    expect(framePayload({ ...G, player: k }, CFG).section).toEqual({ i: 1, n: 4, name: 'Faubourg Saint-Honoré' });
    updateKart(k, STEP); expect(toasts(k).filter(t => t.startsWith('SECTEUR'))).toHaveLength(0);
  });
});

describe('softer hits (DEC-063)', () => {
  beforeEach(() => race());

  it('stuns about half as long, never past STUN_MAX', () => {
    expect(softStun(2.6)).toBe(STUN_MAX); expect(softStun(0.7)).toBeCloseTo(0.665, 3); expect(softStun(1.5)).toBeLessThan(1.1);
    const k = G.karts[1]; place(k, 300, 0, 30);
    expect(stunKart(k, 2.6)).toBe(true); expect(k.stun).toBe(STUN_MAX);
  });

  it('gives a comeback boost when the spin ends, then a grace no hit can stun through', () => {
    const k = G.karts[1]; place(k, 300, 0, 30); stunKart(k, 0.7);
    for (let n = 0; n < 60 && k.stun > 0; n++) updateKart(k, STEP);
    expect(k.stun).toBe(0);
    updateKart(k, STEP);
    expect(k.boost).toBeGreaterThan(RECOVER_BOOST - 0.1); expect(k.hitGrace).toBeGreaterThan(HIT_GRACE - 0.1);
    expect(stunKart(k, 1.5)).toBe(false); expect(k.stun).toBe(0);
  });

  it('keeps a kart that spins rolling: it keeps more than a tenth of its speed', () => {
    const k = G.karts[1]; place(k, 300, 0, 40); stunKart(k, 1.5); const v = k.speed;
    for (let n = 0; n < 50 && k.stun > 0; n++) updateKart(k, STEP);
    expect(Math.abs(k.speed)).toBeGreaterThan(v * 0.1);
  });

  it('helps a human at the back, not the leader', () => {
    expect(catchUp(0, 6)).toBe(1); expect(catchUp(5, 6)).toBe(CATCH_UP[5]); expect(catchUp(5, 6)).toBeGreaterThan(1.05);
    expect(catchUp(0, 1)).toBe(1); expect(catchUp(2, 6)).toBeGreaterThan(1);
  });

  it('turns the vote blanc into a little boost instead of a slowdown', () => {
    const k = G.karts[0]; place(k, 300, 0, 30); k.boost = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    k.item = 'referendum'; k.itemRolling = 0; useItem(k);
    vi.restoreAllMocks();
    expect(k.slowed).toBe(0); expect(k.boost).toBeGreaterThan(0);
  });
});

describe('the ballot boxes (DEC-065)', () => {
  beforeEach(() => race());

  it('are drawn by four instanced batches, one copy per box, a proxy per box', () => {
    const parts = Object.values(G.boxBatch);
    expect(parts).toHaveLength(4);
    for (const m of parts) { expect(m.isInstancedMesh).toBe(true); expect(m.count).toBe(G.itemBoxes.length); expect(m.parent).toBe(G.scene); }
    for (const b of G.itemBoxes) { expect(b.mesh.parent).toBeNull(); expect(b.mesh.position.y - b.y).toBeCloseTo(BOX_Y, 5); }
  });

  it('scales a taken box away in the instances, and back when it returns', () => {
    const scaleOf = i => { const e = G.boxBatch.frame.instanceMatrix.array; return Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]); };
    syncBallotBoxes(STEP); expect(scaleOf(0)).toBeCloseTo(1, 3);
    G.itemBoxes[0].mesh.visible = false; syncBallotBoxes(STEP); expect(scaleOf(0)).toBe(0);
    G.itemBoxes[0].mesh.visible = true; syncBallotBoxes(STEP); expect(scaleOf(0)).toBeCloseTo(1, 3);
  });

  it('roll in 0.8 s, and an urn rush upgrades the common draws', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);   // the first entry of every row: turbo
    expect(rollItem(0)).toBe('turbo'); expect(rollItem(0, true)).toBe('turbo3');
    vi.restoreAllMocks();
    for (const row of ITEM_ODDS) expect(Object.values(row).reduce((a, b) => a + b, 0)).toBe(100);
    expect(itemTier('reserve')).toBe('mythic'); expect(itemTier('turbo3')).toBe('rare'); expect(itemTier('greve')).toBe('common');
  });
});

describe('multi-use items and the rear guard (DEC-065)', () => {
  beforeEach(() => race());

  it('keeps an upgrade in the slot until its last use', () => {
    const k = G.karts[0]; place(k, 300, 0, 30);
    k.item = 'turbo3'; k.itemUses = ITEMS.turbo3.uses; k.itemRolling = 0;
    useItem(k); expect(k.item).toBe('turbo3'); expect(k.itemUses).toBe(2); expect(k.boost).toBeGreaterThan(1);
    useItem(k); useItem(k); expect(k.item).toBeNull(); expect(k.itemUses).toBe(0);
  });

  it('pays the jackpot in boosts and coins', () => {
    const k = G.karts[0]; place(k, 300, 0, 30); k.coins = 0;
    k.item = 'reserve'; k.itemUses = ITEMS.reserve.uses; k.itemRolling = 0;
    for (let n = 0; n < 5; n++) useItem(k);
    expect(k.item).toBeNull(); expect(k.coins).toBe(5); expect(k.pickups).toBe(5);
  });

  it('stops a dossier from behind with the barricade held behind the kart, and the item goes', () => {
    const [a, b] = G.karts; place(a, 300, 0, 30); place(b, 330, 0, 0);
    b.item = 'greve'; b.itemRolling = 0;
    a.item = 'dossier'; a.itemRolling = 0; useItem(a);
    for (let n = 0; n < 60 && G.projectiles.length; n++) updateProjectiles(STEP);
    expect(b.stun).toBe(0); expect(b.item).toBeNull();
  });

  it('counts the hit for the thrower when nothing guards the victim', () => {
    const [a, b] = G.karts; place(a, 300, 0, 30); place(b, 330, 0, 0);
    a.item = 'dossier'; a.itemRolling = 0; useItem(a);
    for (let n = 0; n < 60 && G.projectiles.length; n++) updateProjectiles(STEP);
    expect(b.stun).toBeGreaterThan(0); expect(a.tally.hits).toBe(1); expect(b.tally.hitsTaken).toBe(1);
  });
});

describe('the coins (DEC-064)', () => {
  beforeEach(() => race());

  it('lie in lines along the lap, off the box rows, the same for the same seed', () => {
    expect(G.coins.length).toBeGreaterThan(30);
    expect(G.coinMesh.count).toBe(G.coins.length);
    const again = coinSpots(G.samples, TRACKS[0].boxRows, SEED);
    expect(again.map(c => [c.x, c.z])).toEqual(G.coins.map(c => [c.x, c.z]));
    expect(coinSpots(G.samples, TRACKS[0].boxRows, SEED + 1)[0]).not.toEqual(again[0]);
  });

  it('are picked by driving through, carried up to the most, and dropped in part by a hit', () => {
    const k = G.karts[0], c = G.coins[0];
    k.pos.x = c.x; k.pos.z = c.z; k.y = c.y - 1;
    pickupCoins(STEP);
    expect(c.active).toBe(false); expect(k.coins).toBe(1); expect(k.pickups).toBe(1); expect(k.tally.coins).toBe(1);
    for (let n = 0; n < 20; n++) takeCoin(k);
    expect(k.coins).toBe(MAX_COINS); expect(k.pickups).toBe(21);
    place(k, 300, 0, 30); stunKart(k, 1); expect(k.coins).toBe(MAX_COINS - COINS_LOST_ON_HIT);
  });
});

describe('the goals (DEC-064)', () => {
  beforeEach(() => race());

  it('draws three from the seed, never both podium and win', () => {
    for (let seed = 0; seed < 200; seed++) {
      const g = pickGoals(seed);
      expect(g).toHaveLength(GOALS_PER_RUN); expect(new Set(g.map(x => x.id)).size).toBe(3);
      expect(g.filter(x => x.atLine === 'rank').length).toBeLessThanOrEqual(1);
    }
    expect(pickGoals(SEED)).toEqual(pickGoals(SEED)); expect(G.goals).toEqual(pickGoals(SEED));
    expect(GOALS.length).toBeGreaterThan(6);
  });

  it('marks a counted goal reached and tells its driver, once', () => {
    const k = G.karts[0]; k.isAI = false;
    G.goals = [GOALS.find(g => g.id === 'turbos'), GOALS.find(g => g.id === 'items'), GOALS.find(g => g.id === 'podium')];
    tally(k, 'turbos'); expect(goalsCount(k)).toBe(0);
    tally(k, 'turbos'); expect(goalsCount(k)).toBe(1);
    expect(toasts(k).filter(t => t.startsWith('OBJECTIF'))).toHaveLength(1);
    tally(k, 'turbos'); expect(toasts(k).filter(t => t.startsWith('OBJECTIF'))).toHaveLength(0);
    expect(goalsOf(k)[0]).toEqual({ text: GOALS[0].text, have: 2, target: 2, done: true });
  });

  it('judges the place at the line', () => {
    const k = G.karts[0]; k.isAI = false; G.goals = [GOALS.find(g => g.id === 'podium')];
    k.rank = 1; tally(k, 'items'); expect(goalsCount(k)).toBe(0);
    k.finished = true; tally(k, 'items'); expect(goalsCount(k)).toBe(1);
  });
});

describe('the live events (DEC-066)', () => {
  beforeEach(() => race());

  it('plans three different events from the seed, in race order', () => {
    const plan = planEvents(SEED);
    expect(plan).toHaveLength(3); expect(new Set(plan.map(e => e.id)).size).toBe(3);
    for (const e of plan) expect(EVENT_IDS).toContain(e.id);
    expect(plan[0].at).toBeLessThan(plan[1].at); expect(plan[1].at).toBeLessThan(plan[2].at);
    expect(planEvents(SEED)).toEqual(plan);
  });

  it('fires each event once the leader passes its point, with a banner and the news', () => {
    const [a] = G.karts; a.isAI = false;
    for (const k of G.karts) k.progress = 0.1;
    updateEvents(STEP); expect(G.eventPlan.every(e => !e.done)).toBe(true);
    G.karts[3].progress = G.eventPlan[0].at + 0.01; updateEvents(STEP);
    expect(G.eventPlan[0].done).toBe(true); expect(G.eventBanner?.title).toBeTruthy();
    expect(toasts(a).length).toBeGreaterThan(0);
    expect(framePayload({ ...G, player: a, time: 30 }, CFG).announce).toBe(G.eventBanner.title);
  });

  it('brings every box back and upgrades the draws on an urn rush', () => {
    for (const b of G.itemBoxes) { b.active = false; b.mesh.visible = false; }
    fireEvent('urnes');
    expect(G.itemBoxes.every(b => b.active && b.mesh.visible)).toBe(true); expect(G.urnRush).toBe(URN_RUSH);
  });

  it('boosts the field on a flash, lays barricades on a manif, helps the last three on a poll', () => {
    G.karts.forEach((k, i) => { k.rank = i; k.boost = 0; k.item = null; k.itemRolling = 0; });
    fireEvent('flash'); expect(G.karts.every(k => k.boost > 0)).toBe(true);
    const before = G.hazards.length; fireEvent('manif'); expect(G.hazards.length).toBe(before + 4);
    fireEvent('sondage'); expect(G.karts.slice(3).every(k => k.itemRolling > 0)).toBe(true); expect(G.karts[0].itemRolling).toBe(0);
  });
});

describe('the run on the wire', () => {
  beforeEach(() => race());

  it('sends the coins and the banner to everyone, and the run’s own fields to the driver alone', () => {
    const k = G.karts[0]; k.item = 'turbo3'; k.itemUses = 2; k.coins = 4; k.pickups = 9; k.goalsDone = 0b101; k.section = 2; k.tally.turbos = 1;
    G.coins[1].active = false; fireEvent('flash');
    const snap = encodeSnapshot(G, 1);
    expect(snap.cn[1]).toBe('0'); expect(snap.cn).toHaveLength(G.coins.length); expect(snap.ev).toBe('flash');
    expect(encodeKart(k).cc).toBeUndefined();
    const me = encodeKartPrivate(k), copy = { ...k, drift: { ...k.drift }, pos: { ...k.pos } };
    applyKartDiscrete(copy, encodeKart(k), me);
    expect(copy.itemUses).toBe(2); expect(copy.pickups).toBe(9); expect(copy.goalsDone).toBe(0b101); expect(copy.section).toBe(2); expect(copy.tally.turbos).toBe(1);
  });
});
