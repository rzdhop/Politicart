// The race seed and the streams drawn from it (DEC-049).
//
// A race has one 32-bit seed that solo play draws in startRace, the game
// server draws in runRace and sends with the start message, and every client
// receives. Everything that shapes the race -- which layout variant, where
// the static obstacles stand, how many cyclists and where they start, the
// crossings' phase -- is drawn from streams derived from that seed, so the
// server worker, each client and solo play build the same gameplay state.
// Cosmetic draws (jersey colours, pigeons, trees) keep Math.random.
//
// mulberry32 is the generator: 32-bit state, one multiply-xorshift round
// per draw, identical in every JavaScript engine (no float accumulation).
// Sub-streams: derive(seed, salt) hashes the seed with a salt so that each
// builder draws from its own stream, and adding a draw to one builder never
// moves another's. Pure, no state of its own.

/** The salts of the streams a race draws: one per builder. */
export const SALT_LAYOUT = 0x4c41594f;      // which variant, climate, cyclist count
export const SALT_FEATURES = 0x46454154;    // obstacle kinds and yaw, chicane side, crossing phase
export const SALT_CYCLISTS = 0x4359434c;    // the riders' spawns and base speeds
export const SALT_RACE = 0x52414345;        // G.rng: the race's own stream (AI draws, later stages)

/** mulberry32: the generator behind every seeded draw. Returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded random stream with the helpers util.js gives Math.random:
 * next() in [0, 1), rand(a, b) in [a, b), pick(arr), int(n) in 0..n-1 and
 * shuffle(arr) (a copy, Fisher-Yates). `seed` is kept for diagnostics.
 */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    seed: seed >>> 0,
    next,
    rand: (a, b) => a + next() * (b - a),
    pick: arr => arr[Math.floor(next() * arr.length)],
    int: n => Math.floor(next() * n),
    shuffle: arr => { const out = [...arr]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; },
  };
}

/** A sub-stream's seed: the race seed mixed with a salt (a 32-bit hash, so adding a draw to one builder never moves another's). */
export function derive(seed, salt) {
  let h = (seed >>> 0) ^ Math.imul(salt >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A fresh race seed: an unsigned 32-bit integer, safe through JSON and structuredClone. */
export function newSeed() { return (Math.random() * 4294967296) >>> 0; }
