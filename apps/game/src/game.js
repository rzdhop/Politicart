// Kart Republique -- the UI layer.
//
// What is left here after stages 9 to 11 is the DOM side of the game: the HUD
// writer, the minimap, the menus and their buttons, the keyboard, the
// workshop form and the frame clock. The engine lives in ./engine and never
// touches the DOM: it returns one payload per frame (engine/race.js), queues
// the text it wants shown (engine/events.js), reads the controls through a
// seam (engine/input.js) and moves between screens through one state machine
// (engine/machine.js) that this file listens to. Stage 12 rebuilds these
// screens in React on top of @kart-republique/ui; the element ids written
// here are the contract it keeps (DEC-009).
//
// Three.js is pinned to 0.128.0 to match the r128 build the CDN served (see
// .claude/DECISIONS.md DEC-007).
import * as THREE from 'three';

import { initAudio, isMuted, toggleMute, updateEngine } from './engine/audio.js';
import { getCustom, loadCustom, resetCustom, saveCustom, applyCustom } from './engine/custom.js';
import { BASE, CHARACTERS, ITEMS, TRACKS } from './engine/data.js';
import { drain } from './engine/events.js';
import { setInputSource } from './engine/input.js';
import { useItem } from './engine/items.js';
import { getState, onTransition, transition } from './engine/machine.js';
import { usePower } from './engine/powers.js';
import { hasPreview, makeThumbs, renderPreview, setPreview } from './engine/preview.js';
import { endRace, renderRace, startRace, stepRace } from './engine/race.js';
import { G, togglePoly } from './engine/state.js';
import { $, clamp, fmtTime, hex, ordinal } from './engine/util.js';

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

// ---------- Results ----------
// Rendered when the machine enters 'results'; the engine decides when.
function renderResults() {
  const order = [...G.karts].sort((a, b) => a.rank - b.rank);
  const p = G.player; const msgs = ['Majorité absolue ! Vous gouvernez seul·e.', 'Second tour obligatoire, mais c’est bien parti.', 'Sur le podium : un poste de ministre vous attend.', 'Coalition nécessaire. Négociations en cours.', 'Score en demi-teinte. Les sondages pardonnent peu.', 'Dernière place : retour à la base, pour écouter le pays.'];
  $('r-sub').textContent = ordinal(p.rank + 1) + ' sur ' + G.karts.length + ' — ' + msgs[p.rank] + (p.bestLap < Infinity ? '  ·  Meilleur tour : ' + fmtTime(p.bestLap) : '') + '  ·  Pouvoir utilisé ' + p.powerUses + '×';
  $('r-body').innerHTML = order.map(k => '<tr class="' + (k === p ? 'you' : '') + '"><td class="r">' + ordinal(k.rank + 1) + '</td><td><b>' + k.def.name + '</b><br><span style="font-size:12px;color:var(--muted)">' + k.def.title + '</span></td><td class="t">' + (k.finished ? fmtTime(k.finishTime) : 'en course…') + '</td></tr>').join('');
}

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return; keys[e.code] = true;
  if (G.state === 'race' && ['ControlLeft', 'ControlRight', 'KeyE', 'Enter'].includes(e.code)) useItem(G.player);
  if (G.state === 'race' && ['KeyF', 'ShiftLeft', 'ShiftRight'].includes(e.code)) usePower(G.player);
  if (e.code === 'Escape') { if (G.state === 'race' || G.state === 'countdown') pause(); else if (G.state === 'paused') resume(); }
  if (e.code === 'KeyM') { toggleMute(); syncMuteButton(); }
  if (e.code === 'Enter' && G.state === 'title') $('b-play').click();
  if (e.code === 'Enter' && G.state === 'results') $('b-again').click();
  if (G.state === 'select' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) selectChar((G.charIdx + (e.code === 'ArrowRight' ? 1 : CHARACTERS.length - 1)) % CHARACTERS.length);
  if (G.state === 'select' && e.code === 'Enter') $('b-next1').click();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function inputState() { return { throttle: keys.ArrowUp || keys.KeyW, brake: keys.ArrowDown || keys.KeyS, left: keys.ArrowLeft || keys.KeyA, right: keys.ArrowRight || keys.KeyD, drift: !!keys.Space }; }
// The engine reads the player's controls through this seam rather than the keys map.
setInputSource(inputState);

// ---------- Screens ----------
// One listener shows the screen for each state. Nothing else toggles a
// section, which is what keeps the sections and the machine in step.
const SCREENS = ['s-title', 's-select', 's-tracks', 's-pause', 's-results', 's-admin'];
const SCREEN_FOR = { title: 's-title', select: 's-select', tracks: 's-tracks', admin: 's-admin', paused: 's-pause', results: 's-results', countdown: null, race: null };
onTransition((to, from) => {
  SCREENS.forEach(s => { $(s).hidden = s !== SCREEN_FOR[to]; });
  $('hud').hidden = !(to === 'countdown' || to === 'race' || to === 'paused');
  if (to === 'countdown' && from !== 'paused') { $('note').hidden = true; drawMinimapBase(); }
  if (to === 'results') renderResults();
});
function pause() { transition('paused'); }
function resume() { transition(G.countdown > 0 ? 'countdown' : 'race'); lastFrame = performance.now(); }

// ---------- Select screen: rendered portraits + 3D showcase ----------
function selectChar(i) {
  G.charIdx = i; [...$('roster').children].forEach((e, j) => e.classList.toggle('sel', j === i)); setPreview(i);
  const c = CHARACTERS[i]; const lbl = { speed: 'Vitesse', accel: 'Accélération', handling: 'Tenue de route' };
  $('showcase').innerHTML = '<div class="big">' + c.name + '</div><div class="title">' + c.title + '</div><div class="quote">' + c.quote + '</div>' +
    '<div class="stats">' + ['speed', 'accel', 'handling'].map(s => '<div class="stat"><span>' + lbl[s] + '</span><div class="bar"><i style="width:' + Math.round((c.stats[s] - 0.6) / 0.6 * 100) + '%"></i></div></div>').join('') + '</div>' +
    '<div class="powerbox"><b>Pouvoir : ' + c.power.name + '</b><p>' + c.power.desc + ' <span style="color:var(--muted)">(touche F)</span></p></div>';
}
function buildRoster() {
  const thumbs = makeThumbs(); const wrap = $('roster'); wrap.innerHTML = '';
  CHARACTERS.forEach((c, i) => { const el = document.createElement('button'); el.className = 'tile' + (i === G.charIdx ? ' sel' : ''); el.type = 'button'; el.innerHTML = '<img alt="' + c.name + '" src="' + thumbs[c.id] + '"><div class="tname">' + c.name + '</div>'; el.addEventListener('click', () => { initAudio(); selectChar(i); }); wrap.appendChild(el); });
  selectChar(G.charIdx);
}
function buildTrackCards() {
  const wrap = $('trackcards'); wrap.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const el = document.createElement('button'); el.className = 'card' + (i === G.trackIdx ? ' sel' : ''); el.type = 'button';
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 150; const c = cv.getContext('2d');
    const pts = t.points; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; pts.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); });
    const sc = Math.min(200 / (maxX - minX), 110 / (maxZ - minZ)); const ox = 120 - (minX + maxX) / 2 * sc, oz = 75 + (minZ + maxZ) / 2 * sc;
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'catmullrom', 0.5); const sp = curve.getPoints(200);
    c.beginPath(); sp.forEach((p, j) => { const x = p.x * sc + ox, y = oz - p.z * sc; j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.lineJoin = 'round'; c.strokeStyle = '#f6f1e4'; c.lineWidth = 9; c.stroke(); c.strokeStyle = '#3a3b40'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(pts[0][0] * sc + ox, oz - pts[0][1] * sc, 5, 0, 7); c.fill();
    el.innerHTML = '<div class="name">' + t.name + '</div>'; el.appendChild(cv); const d = document.createElement('div'); d.className = 'desc'; d.textContent = t.desc; el.appendChild(d);
    el.addEventListener('click', () => { G.trackIdx = i; [...wrap.children].forEach((e, j) => e.classList.toggle('sel', j === i)); });
    wrap.appendChild(el);
  });
}

// ---------- Admin workshop ----------
const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function readImage(file, max, cb) {
  const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const sc = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.width * sc)); cv.height = Math.max(1, Math.round(im.height * sc)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); cb(cv.toDataURL('image/jpeg', 0.82)); }; im.src = r.result; }; r.readAsDataURL(file);
}
function buildAdmin() {
  const wrap = $('admin-chars'); wrap.innerHTML = '';
  CHARACTERS.forEach((c, i) => {
    const custom = getCustom();
    const o = custom.chars[c.id] || (custom.chars[c.id] = {}); const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = '<div class="name">' + esc(BASE[i].name) + ' <span style="font-size:12px;color:var(--muted);font-family:var(--font-body)">· ' + esc(c.power.name) + '</span></div>' +
      '<label>Nom<input type="text" data-k="name" maxlength="28" id="adm-name-' + c.id + '" value="' + esc(c.name) + '"></label>' +
      '<label>Titre<input type="text" data-k="title" maxlength="40" id="adm-title-' + c.id + '" value="' + esc(c.title) + '"></label>' +
      '<label>Réplique<input type="text" data-k="quote" maxlength="64" id="adm-quote-' + c.id + '" value="' + esc(c.quote) + '"></label>' +
      '<div class="colors"><label>Veste<input type="color" data-k="suit" id="adm-suit-' + c.id + '" value="' + hex(c.look.suit) + '"></label><label>Kart<input type="color" data-k="kart" id="adm-kart-' + c.id + '" value="' + hex(c.kart) + '"></label>' +
      '<label>Livrée (image)<input type="file" accept="image/*" data-k="livery" id="adm-livery-' + c.id + '"></label><img class="livery" alt="" id="adm-livimg-' + c.id + '"' + (c.livery ? ' src="' + c.livery + '"' : '') + '></div>';
    el.querySelectorAll('input[type=text],input[type=color]').forEach(inp => inp.addEventListener('input', () => { o[inp.dataset.k] = inp.value; }));
    el.querySelector('input[type=file]').addEventListener('change', ev => { const f = ev.target.files && ev.target.files[0]; if (!f) return; readImage(f, 512, url => { o.livery = url; $('adm-livimg-' + c.id).src = url; }); });
    wrap.appendChild(el);
  });
  renderAdPreview();
}
function renderAdPreview() { $('ad-preview').innerHTML = getCustom().ads.map(u => '<img alt="" src="' + u + '">').join('') || '<span class="disclaimer">Aucune affiche personnalisée : les panneaux du jeu sont utilisés.</span>'; }
$('ad-files').addEventListener('change', ev => { const files = [...(ev.target.files || [])].slice(0, 8); if (!files.length) return; const custom = getCustom(); custom.ads = []; let left = files.length; files.forEach((f, i) => readImage(f, 640, url => { custom.ads[i] = url; if (--left === 0) renderAdPreview(); })); });
$('b-admin').addEventListener('click', () => { buildAdmin(); transition('admin'); });
$('b-admin-save').addEventListener('click', () => { applyCustom(); const ok = saveCustom(); if (hasPreview()) setPreview(G.charIdx); transition('title'); $('b-admin').textContent = ok ? 'Atelier (admin) · enregistré' : 'Atelier (admin) · non sauvegardé (stockage plein)'; });
$('b-admin-reset').addEventListener('click', () => { resetCustom(); buildAdmin(); if (hasPreview()) setPreview(G.charIdx); });
loadCustom();

// buttons
$('b-play').addEventListener('click', () => { initAudio(); buildRoster(); transition('select'); });
$('b-poly').addEventListener('click', () => { const poly = togglePoly(); $('b-poly').textContent = poly === 'low' ? 'Graphismes : légers (low-poly)' : 'Graphismes : détaillés (ombres)'; if (hasPreview()) setPreview(G.charIdx); });
$('b-mute').addEventListener('click', () => { initAudio(); toggleMute(); syncMuteButton(); });
$('b-back1').addEventListener('click', () => transition('title'));
$('b-next1').addEventListener('click', () => { buildTrackCards(); transition('tracks'); });
$('b-back2').addEventListener('click', () => transition('select'));
$('b-start').addEventListener('click', () => { initAudio(); startRace(); });
$('b-resume').addEventListener('click', resume);
$('b-quit').addEventListener('click', () => transition('title'));
$('b-again').addEventListener('click', () => { initAudio(); startRace(); });
$('b-menu').addEventListener('click', () => transition('title'));

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

/**
 * Keep the title screen's sound button in step with the audio module.
 *
 * toggleMute() returns the new state rather than touching the DOM, so this is
 * the one place that knows the wording.
 */
function syncMuteButton() {
  $('b-mute').textContent = 'Son : ' + (isMuted() ? 'coupé' : 'activé');
}

// --- Test hook -------------------------------------------------------------
// The end-to-end suite needs to reach the results screen, which is otherwise
// unreachable: there is no race time cap, so a race ends only when the player
// completes three laps. The engine's own endRace() is the seam for that. See
// DEC-009 and the note in e2e/game.spec.ts.
window.__kr = { endRace };
