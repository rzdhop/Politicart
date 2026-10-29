import { describe, expect, it } from 'vitest';

import { framePayload, statusOf } from './payload.js';

const CFG = { laps: 3, powerCooldown: 24 };

function fakeG(over = {}) {
  const player = {
    rank: 2, lap: 1, finished: false, finishTime: 0, bestLap: Infinity, speed: -12.5,
    drift: { charge: 1.4 }, item: 'turbo', itemRolling: 0, powerCd: 3,
    def: { kart: 0xc8102e, power: { name: 'Passage en force', cd: 30 } },
    pos: { x: 10, z: -4 },
  };
  const ai = { rank: 0, pos: { x: 1, z: 2 }, def: { kart: 0x1f3a93 } };
  return { state: 'race', time: 42.5, countdown: 0, wrongTimer: 0, player, karts: [ai, player], ...over };
}

describe('framePayload', () => {
  it('reports the player readouts the HUD shows', () => {
    const p = framePayload(fakeG(), CFG);
    expect(p).toMatchObject({
      state: 'race', time: 42.5, announce: '', rank: 2, lap: 1, laps: 3, finished: false, bestLap: Infinity,
      speed: 12.5, driftCharge: 1.4, item: 'turbo', itemRolling: false,
      powerName: 'Passage en force', powerCd: 3, powerCdMax: 30, powerReady: false, wrongWay: false,
    });
  });

  it('lists every kart position with its colour, flagging the player', () => {
    const p = framePayload(fakeG(), CFG);
    expect(p.kartPositions).toEqual([
      { x: 1, z: 2, color: 0x1f3a93, isPlayer: false },
      { x: 10, z: -4, color: 0xc8102e, isPlayer: true },
    ]);
  });

  it('counts the countdown down from 3 and never shows 4, even when the timer starts above 3', () => {
    expect(framePayload(fakeG({ state: 'countdown', countdown: 3.6 }), CFG).announce).toBe('3');
    expect(framePayload(fakeG({ state: 'countdown', countdown: 2.01 }), CFG).announce).toBe('3');
    expect(framePayload(fakeG({ state: 'countdown', countdown: 1.99 }), CFG).announce).toBe('2');
    expect(framePayload(fakeG({ state: 'countdown', countdown: 0.2 }), CFG).announce).toBe('1');
  });

  it('shows PARTEZ ! for the first 0.9 s of the race, then clears the centre of the HUD', () => {
    expect(framePayload(fakeG({ time: 0 }), CFG).announce).toBe('PARTEZ !');
    expect(framePayload(fakeG({ time: 0.89 }), CFG).announce).toBe('PARTEZ !');
    expect(framePayload(fakeG({ time: 0.9 }), CFG).announce).toBe('');
  });

  it('falls back to the global power cooldown when the character defines none', () => {
    const G = fakeG();
    G.player.def.power = { name: 'Rattrapage' };
    expect(framePayload(G, CFG).powerCdMax).toBe(24);
  });

  it('flags the power as ready at zero cooldown and the item as rolling while the slot spins', () => {
    const G = fakeG();
    G.player.powerCd = 0; G.player.itemRolling = 0.4; G.player.item = null;
    const p = framePayload(G, CFG);
    expect(p.powerReady).toBe(true);
    expect(p.itemRolling).toBe(true);
    expect(p.item).toBeNull();
  });

  it('raises the wrong-way flag only once the timer has held for 1.2 s, as the old HUD did', () => {
    expect(framePayload(fakeG({ wrongTimer: 1.19 }), CFG).wrongWay).toBe(false);
    expect(framePayload(fakeG({ wrongTimer: 1.2 }), CFG).wrongWay).toBe(true);
  });

  it('is a fresh object every frame, never a view onto G', () => {
    const G = fakeG();
    const a = framePayload(G, CFG);
    G.player.rank = 0;
    const b = framePayload(G, CFG);
    expect(a.rank).toBe(2);
    expect(b.rank).toBe(0);
    expect(a).not.toBe(b);
  });
});

// What the HUD animates (DEC-053): the hit flash, the shake, the lap flash and the item-used count from vfx.js's
// G.fxHud, the boost, and the statuses on the kart in the HUD's order.
describe('the HUD\'s motion', () => {
  it('reads nothing but zeros without effects (headless, between races)', () => {
    expect(framePayload(fakeG(), CFG)).toMatchObject({ hit: 0, shake: 0, lapFlash: 0, boost: false, status: [], itemUsed: 0 });
  });

  it('passes the effects\' HUD state and the boost through', () => {
    const G = fakeG({ fxHud: { hit: 0.7, shake: 0.4, dip: 0.2, kick: 0, lap: 0.9, used: 3 } });
    G.player.boost = 0.5;
    expect(framePayload(G, CFG)).toMatchObject({ hit: 0.7, shake: 0.4, lapFlash: 0.9, boost: true, itemUsed: 3 });
  });

  it('lists the statuses with their time left, the relance by its count, the loophole over the immunity it brings', () => {
    const k = { slowed: 1.2, confused: 0, capped: 2, rabot: 0, slip: 0.3, relance: 2, shield: 10, invincible: 5, phantom: 5, fly: 0 };
    expect(statusOf(k)).toEqual([
      { id: 'slowed', time: 1.2 }, { id: 'capped', time: 2 }, { id: 'slip', time: 0.3 }, { id: 'relance', count: 2 }, { id: 'shield', time: 10 }, { id: 'phantom', time: 5 },
    ]);
    expect(statusOf({ invincible: 6, fly: 4, rabot: 4, confused: 1 })).toEqual([{ id: 'confused', time: 1 }, { id: 'rabot', time: 4 }, { id: 'immunity', time: 6 }, { id: 'fly', time: 4 }]);
    expect(statusOf({})).toEqual([]);
  });

  it('names every status it lists in the HUD\'s table', async () => {
    const { STATUSES } = await import('./data.js');
    const all = statusOf({ slowed: 1, confused: 1, capped: 1, rabot: 1, slip: 1, relance: 1, shield: 1, invincible: 1, fly: 1 }).map(s => s.id);
    for (const id of [...all, 'phantom']) expect(STATUSES[id], id).toMatchObject({ icon: expect.any(String), name: expect.any(String), good: expect.any(Boolean) });
  });
});
