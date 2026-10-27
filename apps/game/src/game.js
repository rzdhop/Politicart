// Kart Republique -- the UI layer's imperative half.
//
// After stage 13 everything the player sees is React (./ui): the six
// screens, the note banner and the HUD, all composed from
// @kart-republique/ui. What stays here is what must not go through React
// state: the per-frame HUD writer, which pushes the engine's payload into
// the HUD components' imperative handles; the keyboard; and the frame clock.
// The engine lives in ./engine and never touches the DOM: it returns one
// payload per frame (engine/race.js), draws the minimap on the canvas the
// HUD handed it (engine/minimap.js), queues the text it wants shown
// (engine/events.js), reads the controls through a seam (engine/input.js)
// and moves between screens through one state machine (engine/machine.js).
// Element ids are the contract the E2E suite drives (DEC-009).
//
// Three.js is pinned to 0.128.0 to match the r128 build the CDN served (see
// .claude/DECISIONS.md DEC-007).
import '@kart-republique/ui/styles.css';
import './game.css';

import { updateEngine } from './engine/audio.js';
import { createBannerQueue } from './engine/banner.js';
import { loadCustom } from './engine/custom.js';
import { ITEMS } from './engine/data.js';
import { drain, resolveFor } from './engine/events.js';
import { loadGarage } from './engine/garage.js';
import { setInputSource } from './engine/input.js';
import { getState, onTransition } from './engine/machine.js';
import { renderLootbox } from './engine/lootbox.js';
import { isNetRace, netStep } from './engine/netrace.js';
import { hasPreview, renderPreview } from './engine/preview.js';
import { endRace, renderRace, stepRace } from './engine/race.js';
import { G } from './engine/state.js';
import { $, clamp, fmtTime } from './engine/util.js';
import { hud } from './ui/Hud.tsx';
import { mountUi } from './ui/mount.tsx';
import { actions } from './ui/store.ts';
import { touchHud } from './ui/TouchControls.tsx';
import { initTouch, installNoContextMenu, isCoarsePointer, isTouchMode, setTouchMode, touchHeld } from './touch.ts';

'use strict';
/* =====================================================================================
   KART RÉPUBLIQUE v2 — satirical kart racer with a pun-name parody French political cast.
   Single-file Three.js game: spline tracks, kart physics with drift/mini-turbo,
   political items + one special power per candidate, AI opponents with rubber-banding,
   procedural textures, shadow mapping, WebAudio sound.
   ===================================================================================== */

// ---------- HUD ----------
// Written once per frame from the engine's payload, through the handles the
// React HUD registered when it mounted (ui/Hud.tsx). Every handle guards
// against an unchanged value, so a readout that did not move costs nothing
// at 60 fps, and nothing here ever goes through React state. The minimap is
// not written from here at all: the engine draws it (engine/minimap.js).
let lastItemShown = '', lastPowerReady = null, lastGod = null;
function updateHUD(p) {
  const h = hud;
  if (!h.pos || !h.lap || !h.time || !h.item || !h.power || !h.speed || !h.drift || !h.center || !h.wrong) return;
  h.pos.setPosition(p.rank + 1);
  h.lap.setText(p.finished ? 'ARRIVÉE' : 'TOUR ' + Math.min(p.lap + 1, p.laps) + '/' + p.laps);
  h.time.setText(fmtTime(p.finished ? p.finishTime : p.time) + (p.bestLap < Infinity ? '  ·  meilleur tour ' + fmtTime(p.bestLap) : ''));
  h.speed.setValue(p.speed * 3.2);
  h.drift.setValue(clamp(p.driftCharge / 2, 0, 1)); h.drift.setColor(p.driftCharge > 2 ? '#ff7a1a' : p.driftCharge > 1 ? '#ffd34d' : '#7cc4ff');
  let shown;
  if (p.itemRolling) { const ids = Object.keys(ITEMS); const it = ITEMS[ids[Math.floor(p.time * 12) % ids.length]]; shown = it.icon + '|…'; }
  else if (p.item) shown = ITEMS[p.item].icon + '|' + ITEMS[p.item].name; else shown = '·|aucun objet';
  if (shown !== lastItemShown) { lastItemShown = shown; const [ico, nm] = shown.split('|'); h.item.setItem({ icon: ico, label: nm, filled: !!p.item }); }
  h.power.setCharge(1 - p.powerCd / p.powerCdMax);
  if (p.powerReady !== lastPowerReady || p.god !== lastGod) { lastPowerReady = p.powerReady; lastGod = p.god; h.power.setReady(p.powerReady); h.power.setKeyHint(p.god ? 'F · MODE DIEU' : p.powerReady ? 'F · PRÊT !' : 'F · recharge'); }
  h.power.setName(p.powerName);
  h.center.setText(p.announce);
  h.wrong.setVisible(p.wrongWay);
  // the touch buttons carry the item and the power state themselves (the HUD's own slots make way for them)
  touchHud.item?.(shown.split('|')[0], !!p.item && !p.itemRolling);
  touchHud.power?.(1 - p.powerCd / p.powerCdMax, p.powerReady);
}
// The two text channels the engine's event queue feeds. Toasts go through
// the banner queue (engine/banner.js): one at a time, each held long enough
// to be read, so a burst of events does not flash past (DEC-029). Its clock
// is this writer's frame clock.
const banners = createBannerQueue();
function setHint(t) { if (hud.hint) hud.hint.setText(t); }
function toast(t) { banners.push(t); }
function tickToast(dt) { const r = banners.tick(dt); if (!r || !hud.toast) return; if (r.show) hud.toast.show(r.show); else if (r.hide) hud.toast.hide(); }

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return; keys[e.code] = true;
  // Driving from the keyboard hands the kart back to it: no touch buttons, no auto-acceleration.
  if (DRIVE_KEYS.includes(e.code)) setTouchMode(false);
  // In a team race the server resolves presses (engine/netrace.js); there is no pause either.
  if (['ControlLeft', 'ControlRight', 'KeyE', 'Enter'].includes(e.code)) actions.useItem();
  if (['KeyF', 'ShiftLeft', 'ShiftRight'].includes(e.code)) actions.usePower();
  if (e.code === 'Escape' && !isNetRace()) { if (G.state === 'race' || G.state === 'countdown') actions.pause(); else if (G.state === 'paused') actions.resume(); }
  if (e.code === 'KeyM') actions.toggleMute(false);
  // The admin's god console over the race (DEC-031); the action ignores everyone else.
  if (e.code === 'KeyG' && ['race', 'countdown', 'paused'].includes(G.state)) actions.toggleGodConsole();
  if (e.code === 'Enter' && G.state === 'title') $('b-play').click();
  if (e.code === 'Enter' && G.state === 'results') $('b-again').click();
  if (G.state === 'select' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) actions.stepChar(e.code === 'ArrowRight' ? 1 : -1);
  if (G.state === 'select' && e.code === 'Enter') $('b-next1').click();
  // The Politibox: the space bar hurries the opening, like a tap on the stage.
  if (G.state === 'lootbox' && e.code === 'Space') actions.skipOpening();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const DRIVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
/**
 * The keyboard and the touch buttons, merged. In touch mode the kart
 * accelerates by itself unless the brake button is held: there is no
 * accelerate button, so the right thumb only has to brake, drift and fire.
 */
function inputState() {
  const t = touchHeld; const auto = isTouchMode();
  return {
    throttle: !!(keys.ArrowUp || keys.KeyW || (auto && !t.brake)),
    brake: !!(keys.ArrowDown || keys.KeyS || t.brake),
    left: !!(keys.ArrowLeft || keys.KeyA || t.left),
    right: !!(keys.ArrowRight || keys.KeyD || t.right),
    drift: !!(keys.Space || t.drift),
  };
}
// The engine reads the player's controls through this seam rather than the keys map.
setInputSource(inputState);
initTouch();
// A long press on a menu button is a tap, not a context menu or a selection (the fields keep theirs).
installNoContextMenu();
// Phones and tablets start on the light graphics: shadows and round meshes cost frames a phone cannot spare.
if (isCoarsePointer()) actions.togglePoly();

// ---------- Screens ----------
// The screens and the HUD are React (./ui), subscribed to the machine through
// the store, and the minimap base is rebuilt by the engine when a race
// starts. The one thing the machine still drives from here is the clock's
// catch-up after a pause, so the first frame back is not a 0.05 s jump.
onTransition((to, from) => {
  if (from === 'paused') lastFrame = performance.now();
  if (to === 'countdown' && from !== 'paused') { banners.clear(); if (hud.toast) hud.toast.hide(); }   // a new race starts with a clean ribbon
});

// ---------- Screens: mount ----------
// The workshop's saved edits are applied before anything renders, as before.
loadCustom();
loadGarage();
mountUi($('ui'));
// Served by the game server (not GitHub Pages)? Then team races are on offer.
actions.detectServer();

// ---------- Main loop ----------
// The UI owns the clock. The engine steps only while the race is live; while
// paused or on the results the scene is redrawn but not advanced.
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  const state = getState();
  // The Politibox owns the canvas while it opens (DEC-037); the Boutique keeps the turntable behind its panels.
  if (state === 'lootbox') { renderLootbox(dt); return; }
  if (state === 'select' || state === 'tracks' || state === 'title' || state === 'admin' || state === 'lobby' || state === 'account' || state === 'garage' || state === 'dashboard' || state === 'shop') { if (state === 'select' || state === 'tracks' || state === 'garage' || state === 'shop' || hasPreview()) renderPreview(dt); return; }
  if (state === 'paused' || state === 'results') { renderRace(); updateEngine(); return; }

  const payload = isNetRace() ? netStep(dt) : stepRace(dt);
  // Routed events (say/tell/hintFor) resolve for the local driver, G.player.
  for (const e of drain()) { const text = resolveFor(e, G.player); if (text === null) continue; if (e.type === 'toast') toast(text); else if (e.type === 'hint') setHint(text); }
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
// karts() is read-only: which candidate and kart style each grid slot is drawn
// with, so the team-race spec can check that another player's Garage edits
// reached this screen (nothing in the DOM shows a kart's style).
window.__kr = { endRace, karts: () => (G.karts || []).map(k => ({ charId: k.def.id, style: { ...k.style } })) };
