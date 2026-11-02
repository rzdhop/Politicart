// Politicoins on the road (DEC-064).
//
// Lines of gold coins are laid along the lap from the race seed (its own
// salt, so they never shift another draw), away from the ballot-box rows. A
// kart driving through one picks it up: it carries up to MAX_COINS, each
// worth COIN_SPEED of top speed (physics.js), and every coin picked counts
// for the run's reward (k.pickups, paid in politicoins by the server's
// settleRace) and the "coins" goal. A kart that is stunned drops
// COINS_LOST_ON_HIT of them. A coin comes back COIN_RESPAWN seconds after it
// was taken; the "Pluie de pièces" event (raceevents.js) brings them all
// back at once.
//
// One instanced mesh draws every coin (one draw); syncCoins() turns them
// each drawn frame, the simulation only flips `active`.
import * as THREE from 'three';

import { sfxFor } from './audio.js';
import { tally } from './goals.js';
import { derive, mulberry32 } from './seed.js';
import { G, disposable, getPoly } from './state.js';

/** The salt of the coins' layout from the race seed. */
export const SALT_COINS = 0xc01a5;
/** How many coins a kart carries at most, and the top speed each one is worth. */
export const MAX_COINS = 10, COIN_SPEED = 0.008;
/** How many coins a stunned kart drops. */
export const COINS_LOST_ON_HIT = 3;
/** How long a taken coin stays away (s). */
export const COIN_RESPAWN = 10;
/** A line of coins every this much of the lap, five coins a line, this many samples apart. */
export const LINE_EVERY = 0.055, LINE_COINS = 5, LINE_STEP = 6;
/** How close a kart passes to take a coin (m, squared). */
const PICK_D2 = 2.4 * 2.4;
/** A coin's height over the road (m). */
const COIN_Y = 1.2;

/**
 * Where the coins of a circuit go: lines of LINE_COINS along the road, one
 * every LINE_EVERY of the lap, each line at a lane drawn from the seed and
 * sometimes weaving across; never within 2.5 % of the lap of a ballot-box row
 * `boxRows` (fractions), nor in the first and last 3 % (the grid).
 */
export function coinSpots(samples, boxRows, seed) {
  const N = samples.length, rng = mulberry32(derive(seed >>> 0, SALT_COINS)), out = [];
  for (let f = 0.03 + LINE_EVERY / 2; f < 0.97; f += LINE_EVERY) {
    if (boxRows.some(b => Math.abs(b - f) < 0.025)) continue;
    const lane = (rng() * 2 - 1) * 0.55, weave = rng() < 0.35 ? (rng() < 0.5 ? -1 : 1) * 0.25 : 0;
    for (let j = 0; j < LINE_COINS; j++) {
      const s = samples[(Math.floor(f * N) + j * LINE_STEP) % N], hw = s.hw ?? 12;
      const lat = (lane + weave * Math.sin(j / (LINE_COINS - 1) * Math.PI)) * hw;
      out.push({ x: s.x + s.sx * lat, z: s.z + s.sz * lat, y: s.y + lat * (s.bank || 0) + COIN_Y });
    }
  }
  return out;
}

/**
 * Build the coins of the circuit into `scene` from the samples, the box rows
 * and the seed: G.coins (`{ x, y, z, active, timer }` each) and G.coinMesh.
 */
export function buildCoins(scene, samples, boxRows, seed) {
  const spots = coinSpots(samples, boxRows, seed);
  const low = getPoly() === 'low';
  const geo = new THREE.CylinderGeometry(0.85, 0.85, 0.18, low ? 12 : 24); geo.rotateX(Math.PI / 2);
  const mat = disposable(new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xa87400, emissiveIntensity: 1, roughness: 0.25, metalness: 0.55 }));
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length)); mesh.name = 'road:politicoins'; mesh.count = spots.length; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  G.coins = spots.map(p => ({ ...p, active: true, timer: 0 }));
  G.coinMesh = mesh;
  syncCoins(0);
  return mesh;
}

/**
 * The coins' simulation step: a taken coin's timer runs, and every kart on
 * the road that drives through an active coin takes it (one coin per kart
 * per pass, the nearest first is not needed: they are metres apart).
 */
export function pickupCoins(dt) {
  if (!G.coins) return;
  for (const c of G.coins) {
    if (!c.active) { c.timer -= dt; if (c.timer <= 0) c.active = true; continue; }
    for (const k of G.karts) {
      if (k.fly > 0 || k.finished || Math.abs(k.y + COIN_Y - c.y) > 2.5) continue;
      if ((k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 > PICK_D2) continue;
      c.active = false; c.timer = COIN_RESPAWN;
      takeCoin(k);
      break;
    }
  }
}

/** Kart k picks up one coin: one more carried (up to MAX_COINS), one more for the run (doubled during a coin rain). */
export function takeCoin(k) {
  const n = G.coinRain > 0 ? 2 : 1;
  k.coins = Math.min(MAX_COINS, (k.coins || 0) + n); k.pickups = (k.pickups || 0) + n;
  tally(k, 'coins', n); sfxFor(k, 'coin');
}

/** Kart k was stunned: it drops some of the coins it carries. */
export function dropCoins(k) { k.coins = Math.max(0, (k.coins || 0) - COINS_LOST_ON_HIT); }

/** Bring every coin back now (the coin rain). */
export function respawnCoins() { if (G.coins) for (const c of G.coins) { c.active = true; c.timer = 0; } }

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
let clock = 0;
/** Pose every coin for this frame: active ones turn and bob, taken ones are scaled away. */
export function syncCoins(dt) {
  const mesh = G.coinMesh; if (!mesh || !G.coins) return;
  clock += dt;
  G.coins.forEach((c, i) => {
    P.set(c.x, c.y + Math.sin(clock * 3 + i * 0.6) * 0.12, c.z); E.set(0, clock * 3.2 + i * 0.4, 0); Q.setFromEuler(E); S.setScalar(c.active ? 1 : 0);
    M.compose(P, Q, S); mesh.setMatrixAt(i, M);
  });
  mesh.instanceMatrix.needsUpdate = true;
}
