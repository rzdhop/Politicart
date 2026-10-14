// The minimap: the circuit's outline, drawn once per race, and every kart's
// dot, drawn every frame.
//
// The UI hands the engine the canvas once (attachMinimap, from the HUD's
// ref), and from then on the engine owns what is on it, the same way it owns
// the WebGL canvas: the circuit base is rebuilt when a race starts, and
// stepRace() draws the field over it each frame from the same positions the
// frame payload carries. Nothing else writes to this canvas.
//
// The base is painted into an offscreen canvas and blitted each frame, so the
// per-frame cost is one drawImage plus six arcs.
import { G } from './state.js';
import { hex } from './util.js';

const W = 300;
let ctx = null;
let scale = 1, offX = 0, offZ = 0;
let base = null;

/** Hand the engine the canvas to draw on, or null to detach. */
export function attachMinimap(canvas) {
  ctx = canvas ? canvas.getContext('2d') : null;
}

/** Whether a canvas is attached. For tests and diagnostics. */
export const hasMinimap = () => ctx !== null;

/** Fit the current circuit (G.samples) into the map and paint its outline. Call once per race, after buildTrack. */
export function buildMinimapBase() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of G.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const pad = 26; scale = Math.min((W - pad * 2) / (maxX - minX), (W - pad * 2) / (maxZ - minZ)); offX = (W - (maxX - minX) * scale) / 2 - minX * scale; offZ = (W - (maxZ - minZ) * scale) / 2 - minZ * scale;
  const cv = document.createElement('canvas'); cv.width = cv.height = W; const c = cv.getContext('2d');
  c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); G.samples.forEach((s, i) => { const x = s.x * scale + offX, y = W - (s.z * scale + offZ); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 10; c.stroke(); c.strokeStyle = '#3a3b40'; c.lineWidth = 6; c.stroke();
  const s0 = G.samples[0]; c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(s0.x * scale + offX, W - (s0.z * scale + offZ), 6, 0, 7); c.fill();
  base = cv;
}

/** Draw the field over the base. `positions` is the payload's kartPositions. */
export function drawMinimap(positions) {
  if (!ctx || !base) return;
  ctx.clearRect(0, 0, W, W); ctx.drawImage(base, 0, 0);
  for (const k of positions) { const x = k.x * scale + offX, y = W - (k.z * scale + offZ); ctx.beginPath(); ctx.arc(x, y, k.isPlayer ? 9 : 6, 0, 7); ctx.fillStyle = hex(k.color); ctx.fill(); ctx.lineWidth = k.isPlayer ? 3 : 1.5; ctx.strokeStyle = k.isPlayer ? '#fff' : 'rgba(0,0,0,.6)'; ctx.stroke(); }
}
