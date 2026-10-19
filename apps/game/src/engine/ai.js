// AI drivers.
//
// aiInput produces, for one opponent kart, the same {throttle, brake, steer,
// drift} the player's keyboard produces, by aiming at a point ahead on the
// spline with a lane offset and a per-kart skill wobble. Rubber-banding lives
// here too: aiSpeedMul rises when the opponent trails the player and falls
// when it leads, so the field stays in contention over three laps. It also
// decides when an opponent fires its item or its special power.
import { useItem } from './items.js';
import { usePower } from './powers.js';
import { CFG, G } from './state.js';
import { clamp, rand, wrapAngle } from './util.js';

// ---------- AI ----------
export function aiInput(k, dt, lateral) {
  const N = G.N; const hw = CFG.roadHalfWidth; const look = 8 + Math.floor(Math.abs(k.speed) / 5);
  const t = G.samples[(k.idx + look) % N];
  const lane = Math.abs(lateral) > hw - 2.5 ? 0 : k.lane;
  const tx = t.x + t.sx * lane, tz = t.z + t.sz * lane;
  const desired = Math.atan2(tx - k.pos.x, tz - k.pos.z);
  const diff = wrapAngle(desired - k.heading);
  let steer = clamp(-diff * 3.2, -1, 1); if (k.confused > 0) steer = clamp(steer + Math.sin(G.time * 9 + k.skill * 100) * 1.1, -1, 1);
  const far = G.samples[(k.idx + look * 3) % N];
  const curve = Math.abs(wrapAngle(Math.atan2(far.x - k.pos.x, far.z - k.pos.z) - k.heading));
  let throttle = 1; if (curve > 1.05 && Math.abs(k.speed) > 26 * k.stats.speed) throttle = 0;
  const drift = curve > 1.15 && Math.abs(k.speed) > 28 && Math.abs(lateral) < hw - 3;
  k.laneTimer -= dt; if (k.laneTimer <= 0) { k.lane = rand(-8, 7); k.laneTimer = rand(3, 8); }
  for (const h of G.hazards) { const dx = h.x - k.pos.x, dz = h.z - k.pos.z; const ahead = dx * Math.sin(k.heading) + dz * Math.cos(k.heading); const side = dx * (-Math.cos(k.heading)) + dz * Math.sin(k.heading); if (ahead > 0 && ahead < 30 && Math.abs(side) < (h.r || 2) + 1.5) k.lane = side > 0 ? -4 : 4; }
  if (k.item && k.itemRolling <= 0) { k.itemTimer -= dt; if (k.itemTimer <= 0) useItem(k); }
  if (k.powerCd <= 0 && G.state === 'race' && Math.random() < dt * 0.25 && (k.def.power.id !== 'rattrapage' || k.rank >= 3)) usePower(k);
  return { throttle, brake: 0, steer, drift };
}
