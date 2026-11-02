// The road-relative spread of scale-1 decor (context.js spread, DEC-071).
import { afterEach, describe, expect, it } from 'vitest';

import { G } from '../state.js';
import { LAYOUT_SCALE, SPREAD_REACH, setDecorScale, setTerrain, spread } from './context.js';

const S = 4.5;
/** A straight road along x at z = 0, drawn at scale S (world units), a sample every 2 m. */
function straightRoad() {
  const samples = []; for (let x = -1500; x <= 1500; x += 2) samples.push({ x, z: 0, y: 0 });
  G.samples = samples; G.N = samples.length; setTerrain(samples);
}
afterEach(() => { setDecorScale(1); setTerrain([]); });

describe('spread', () => {
  it('is the plain DS spread on a circuit that does not ask for the road', () => {
    setDecorScale(S); straightRoad();
    expect(spread(10, 20)).toEqual([10 * S, 20 * S]);
  });

  it('keeps a point by the road at its distance at the layout scale, and moves it along with the road', () => {
    setDecorScale(S, { road: true }); straightRoad();
    const [x, z] = spread(40, 12);
    expect(x).toBeCloseTo(40 * S, 0);                    // along the road: with the circuit
    expect(z).toBeCloseTo(12 * LAYOUT_SCALE, 0);         // across: as at scale 3, not 12 x 4.5
  });

  it('blends to the plain spread far from the road, without a jump on the way', () => {
    setDecorScale(S, { road: true }); straightRoad();
    expect(spread(0, SPREAD_REACH + 50)[1]).toBeCloseTo((SPREAD_REACH + 50) * S, 3);
    let prev = spread(0, 0)[1], biggest = 0;
    for (let z = 0.5; z <= SPREAD_REACH + 10; z += 0.5) { const w = spread(0, z)[1]; expect(w).toBeGreaterThan(prev); biggest = Math.max(biggest, w - prev); prev = w; }
    expect(biggest).toBeLessThan(0.5 * S * 2);           // never more than twice the plain spread's step
  });
});
