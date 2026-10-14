// Kart Republique -- the UI layer.
//
// What is left here after stage 12 is the part of the DOM side that is not
// React yet: the HUD writer and the minimap (stage 13 moves them onto the
// library's HUD components), the keyboard, and the frame clock. The six
// screens and the note banner are React, in ./ui, composed from
// @kart-republique/ui and driven by the same engine entry points through
// ./ui/store. The engine lives in ./engine and never touches the DOM: it
// returns one payload per frame (engine/race.js), queues the text it wants
// shown (engine/events.js), reads the controls through a seam
// (engine/input.js) and moves between screens through one state machine
// (engine/machine.js). Element ids are the contract the E2E suite drives
// (DEC-009); the React screens render the same ones.
//
// Three.js is pinned to 0.128.0 to match the r128 build the CDN served (see
// .claude/DECISIONS.md DEC-007).
import '@kart-republique/ui/styles.css';
import './game.css';

import { updateEngine } from './engine/audio.js';
import { loadCustom } from './engine/custom.js';
import { CHARACTERS, ITEMS } from './engine/data.js';
import { drain } from './engine/events.js';
import { setInputSource } from './engine/input.js';
import { useItem } from './engine/items.js';
import { getState, onTransition } from './engine/machine.js';
import { usePower } from './engine/powers.js';
import { hasPreview, renderPreview } from './engine/preview.js';
import { endRace, renderRace, stepRace } from './engine/race.js';
import { G } from './engine/state.js';
import { $, clamp, fmtTime, hex } from './engine/util.js';
import { mountUi } from './ui/mount.tsx';
import { actions } from './ui/store.ts';

'use strict';
/* =====================================================================================
   KART RÉPUBLIQUE v2 — satirical kart racer with a fictional French political cast.
   Single-file Three.js game: spline tracks, kart physics with drift/mini-turbo,
   political items + one special power per candidate, AI opponents with rubber-banding,
   procedural textures, shadow mapping, WebAudio sound.
   ===================================================================================== */

// ---------- HUD ----------
// Written once per frame from the engine's payload. Each readout keeps its
// last value and skips the DOM when nothing changed, which is what makes
// this cheap enough to run at 60 fps.
const hud = { pos: $('h-pos'), lap: $('h-lap'), time: $('h-time'), item: $('h-item'), hint: $('h-hint'), speed: $('h-speed'), drift: $('h-drift'), center: $('h-center'), toast: $('h-toast'), wrong: $('h-wrong'), power: $('h-power'), pbar: $('h-pbar'), pkey: $('h-pkey') };
const mm = $('minimap').getContext('2d'); let mmScale = 1, mmOffX = 0, mmOffZ = 0; let mmBase = null;
function drawMinimapBase() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of G.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const W = 300, pad = 26; mmScale = Math.min((W - pad * 2) / (maxX - minX), (W - pad * 2) / (maxZ - minZ)); mmOffX = (W - (maxX - minX) * mmScale) / 2 - minX * mmScale; mmOffZ = (W - (maxZ - minZ) * mmScale) / 2 - minZ * mmScale;
  const cv = document.createElement('canvas'); cv.width = cv.height = W; const c = cv.getContext('2d');
  c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); G.samples.forEach((s, i) => { const x = s.x * mmScale + mmOffX, y = W - (s.z * mmScale + mmOffZ); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 10; c.stroke(); c.strokeStyle = '#3a3b40'; c.lineWidth = 6; c.stroke();
  const s0 = G.samples[0]; c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(s0.x * mmScale + mmOffX, W - (s0.z * mmScale + mmOffZ), 6, 0, 7); c.fill();
  mmBase = cv;
}
function drawMinimap(positions) {
  const W = 300; mm.clearRect(0, 0, W, W); mm.drawImage(mmBase, 0, 0);
  for (const k of positions) { const x = k.x * mmScale + mmOffX, y = W - (k.z * mmScale + mmOffZ); mm.beginPath(); mm.arc(x, y, k.isPlayer ? 9 : 6, 0, 7); mm.fillStyle = hex(k.color); mm.fill(); mm.lineWidth = k.isPlayer ? 3 : 1.5; mm.strokeStyle = k.isPlayer ? '#fff' : 'rgba(0,0,0,.6)'; mm.stroke(); }
}
let lastItemShown = '', lastPowerReady = null, lastPowerName = '', lastAnnounce = '';
function updateHUD(p) {
  hud.pos.innerHTML = (p.rank + 1) + '<small>' + (p.rank === 0 ? 'er' : 'e') + '</small>';
  hud.lap.textContent = p.finished ? 'ARRIVÉE' : 'TOUR ' + Math.min(p.lap + 1, p.laps) + '/' + p.laps;
  hud.time.textContent = fmtTime(p.finished ? p.finishTime : p.time) + (p.bestLap < Infinity ? '  ·  meilleur tour ' + fmtTime(p.bestLap) : '');
  hud.speed.textContent = Math.round(p.speed * 3.2);
  hud.drift.style.width = (clamp(p.driftCharge / 2, 0, 1) * 100) + '%'; hud.drift.style.background = p.driftCharge > 2 ? '#ff7a1a' : p.driftCharge > 1 ? '#ffd34d' : '#7cc4ff';
  let shown;
  if (p.itemRolling) { const ids = Object.keys(ITEMS); const it = ITEMS[ids[Math.floor(p.time * 12) % ids.length]]; shown = it.icon + '|…'; }
  else if (p.item) shown = ITEMS[p.item].icon + '|' + ITEMS[p.item].name; else shown = '·|aucun objet';
  if (shown !== lastItemShown) { lastItemShown = shown; const [ico, nm] = shown.split('|'); hud.item.querySelector('.ico').textContent = ico; hud.item.querySelector('.nm').textContent = nm; hud.item.classList.toggle('has', !!p.item); }
  hud.pbar.style.width = ((1 - p.powerCd / p.powerCdMax) * 100) + '%';
  if (p.powerReady !== lastPowerReady) { lastPowerReady = p.powerReady; hud.power.classList.toggle('ready', p.powerReady); hud.pkey.textContent = p.powerReady ? 'F · PRÊT !' : 'F · recharge'; }
  if (p.powerName !== lastPowerName) { lastPowerName = p.powerName; $('h-pname').textContent = p.powerName; }
  if (p.announce !== lastAnnounce) { lastAnnounce = p.announce; hud.center.textContent = p.announce; }
  hud.wrong.hidden = !p.wrongWay;
  drawMinimap(p.kartPositions);
}
// The two text channels the engine's event queue feeds. The toast fades on
// its own clock, which belongs here with the element it fades.
let toastTimer = 0;
function setHint(t) { hud.hint.textContent = t; }
function toast(t) { if (!t) return; hud.toast.textContent = t; hud.toast.classList.add('on'); toastTimer = 2.2; }
function tickToast(dt) { if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) hud.toast.classList.remove('on'); } }

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return; keys[e.code] = true;
  if (G.state === 'race' && ['ControlLeft', 'ControlRight', 'KeyE', 'Enter'].includes(e.code)) useItem(G.player);
  if (G.state === 'race' && ['KeyF', 'ShiftLeft', 'ShiftRight'].includes(e.code)) usePower(G.player);
  if (e.code === 'Escape') { if (G.state === 'race' || G.state === 'countdown') actions.pause(); else if (G.state === 'paused') actions.resume(); }
  if (e.code === 'KeyM') actions.toggleMute(false);
  if (e.code === 'Enter' && G.state === 'title') $('b-play').click();
  if (e.code === 'Enter' && G.state === 'results') $('b-again').click();
  if (G.state === 'select' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) actions.selectChar((G.charIdx + (e.code === 'ArrowRight' ? 1 : CHARACTERS.length - 1)) % CHARACTERS.length);
  if (G.state === 'select' && e.code === 'Enter') $('b-next1').click();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function inputState() { return { throttle: keys.ArrowUp || keys.KeyW, brake: keys.ArrowDown || keys.KeyS, left: keys.ArrowLeft || keys.KeyA, right: keys.ArrowRight || keys.KeyD, drift: !!keys.Space }; }
// The engine reads the player's controls through this seam rather than the keys map.
setInputSource(inputState);

// ---------- Screens ----------
// The screens are React (./ui), subscribed to the machine through the store.
// What the machine still drives from here is the HUD, which is not React yet
// (stage 13), the minimap base, and the clock's catch-up after a pause.
onTransition((to, from) => {
  $('hud').hidden = !(to === 'countdown' || to === 'race' || to === 'paused');
  if (to === 'countdown' && from !== 'paused') drawMinimapBase();
  if (from === 'paused') lastFrame = performance.now();
});

// ---------- Screens: mount ----------
// The workshop's saved edits are applied before anything renders, as before.
loadCustom();
mountUi($('ui'));

// ---------- Main loop ----------
// The UI owns the clock. The engine steps only while the race is live; while
// paused or on the results the scene is redrawn but not advanced.
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  const state = getState();
  if (state === 'select' || state === 'tracks' || state === 'title' || state === 'admin') { if (state === 'select' || state === 'tracks' || hasPreview()) renderPreview(dt); return; }
  if (state === 'paused' || state === 'results') { renderRace(); updateEngine(); return; }

  const payload = stepRace(dt);
  for (const e of drain()) { if (e.type === 'toast') toast(e.text); else if (e.type === 'hint') setHint(e.text); }
  tickToast(dt);
  updateHUD(payload); updateEngine();
  renderRace();
}
requestAnimationFrame(frame);

// --- Test hook -------------------------------------------------------------
// The end-to-end suite needs to reach the results screen, which is otherwise
// unreachable: there is no race time cap, so a race ends only when the player
// completes three laps. The engine's own endRace() is the seam for that. See
// DEC-009 and the note in e2e/game.spec.ts.
window.__kr = { endRace };
