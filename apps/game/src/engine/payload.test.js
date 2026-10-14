import { describe, expect, it } from 'vitest';

import { framePayload } from './payload.js';

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
