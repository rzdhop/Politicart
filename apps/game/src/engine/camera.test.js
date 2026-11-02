// The chase camera's yaw (race.js followYaw): it follows the kart's heading
// the short way round, and holds still while a hit spins the kart, so the
// kart spins on screen and the view does not.
import { describe, expect, it } from 'vitest';

import { CAM, followYaw } from './race.js';
import { wrapAngle } from './util.js';

const STEP = 1 / 60;
/** A minimal kart: only what followYaw reads. */
const kart = (heading, stun = 0) => ({ heading, stun });

describe('chase camera yaw', () => {
  it('catches up with the heading while driving', () => {
    CAM.yaw = 0; const k = kart(1.2);
    for (let i = 0; i < 60; i++) followYaw(k, STEP);
    expect(Math.abs(wrapAngle(CAM.yaw - k.heading))).toBeLessThan(0.01);
  });

  it('turns the short way round across ±π', () => {
    CAM.yaw = Math.PI - 0.1; const k = kart(-Math.PI + 0.1);
    followYaw(k, STEP);
    // one step goes up past π (wrapping to the negative side), never back down through 0
    expect(Math.abs(CAM.yaw)).toBeGreaterThan(Math.PI - 0.1);
  });

  it('holds still while the kart spins from a hit, then swings back smoothly', () => {
    CAM.yaw = 0.3; const k = kart(0.3, 1.5);
    // the physics spins a stunned kart at 11 rad/s: the camera must not follow
    for (let i = 0; i < 66; i++) { k.heading = wrapAngle(k.heading - 11 * STEP); k.stun -= STEP; followYaw(k, STEP); }
    expect(CAM.yaw).toBe(0.3);
    // the spin ends facing the road (here 0.5 rad): the yaw eases there, no single step jumps more than a few degrees
    k.stun = 0; k.heading = 0.5; let prev = CAM.yaw, biggest = 0;
    for (let i = 0; i < 30; i++) { followYaw(k, STEP); biggest = Math.max(biggest, Math.abs(CAM.yaw - prev)); prev = CAM.yaw; }
    expect(biggest).toBeLessThan(0.05);
    expect(Math.abs(CAM.yaw - 0.5)).toBeLessThan(0.01);
  });
});
