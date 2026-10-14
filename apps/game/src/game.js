// Kart Republique -- the game.
//
// This is the original single-file script, moved out of index.html unchanged.
// Only two things differ: Three.js is imported here instead of arriving as a
// global from a CDN script tag, and the file is a module rather than an inline
// block.
//
// Three.js is pinned to 0.128.0 to match the r128 build the CDN served (see
// .claude/DECISIONS.md DEC-007). It is not an upgrade: THREE.sRGBEncoding,
// used below, was removed in three >= 0.152, and moving versions is its own
// task with its own test pass rather than a side effect of repackaging.
//
// The order of everything below is load-bearing and must not be rearranged:
// textures() has to run before any builder reads TEX.*, buildTrack has to set
// G.samples and G.N before buildFeatures, crowdZone and grandstand read them,
// and the physics step inside frame() runs in a fixed sequence. The module is
// deliberately left as one file here; splitting it into modules is stage 9.
import * as THREE from 'three';

// Engine modules, pulled out of this file in stage 9. The rest of the game
// still lives here and is moved out in the stages that follow.
import { initAudio, isMuted, sfx, toggleMute, updateEngine } from './engine/audio.js';
import { getCustom, loadCustom, resetCustom, saveCustom, applyCustom } from './engine/custom.js';
import { BASE, CHARACTERS, ITEMS, ITEM_ODDS, TRACKS } from './engine/data.js';
import { drain } from './engine/events.js';
import { setInputSource } from './engine/input.js';
import { pickupItems, stunKart, updateProjectiles, useItem } from './engine/items.js';
import { buildKart } from './engine/kart.js';
import { kartCollisions, updateKart, updateRanks } from './engine/physics.js';
import { usePower } from './engine/powers.js';
import { setCast } from './engine/primitives.js';
import { camera, renderer, resize } from './engine/render.js';
import { CFG, G, SHADOWS, getPoly, togglePoly } from './engine/state.js';
import { buildTrack } from './engine/track.js';
import { $, clamp, fmtTime, hex, lerp, ordinal, rand } from './engine/util.js';

'use strict';
/* =====================================================================================
   KART RÉPUBLIQUE v2 — satirical kart racer with a fictional French political cast.
   Single-file Three.js game: spline tracks, kart physics with drift/mini-turbo,
   political items + one special power per candidate, AI opponents with rubber-banding,
   procedural textures, shadow mapping, WebAudio sound.
   ===================================================================================== */




// ---------- Kart entities ----------
function makeKart(def, isAI) {
  const mesh = buildKart(def);
  return {
    def, stats: def.stats, isAI, mesh, pos: { x: 0, z: 0 }, heading: 0, speed: 0,
    drift: { active: false, dir: 0, charge: 0 }, boost: 0, boostPower: 1.4, stun: 0, invincible: 0, slowed: 0, fly: 0, relance: 0, relanceTimer: 0,
    item: null, itemRolling: 0, pendingItem: null, itemTimer: 0, powerCd: 8 + rand(0, 6), powerUses: 0,
    y: 0, vy: 0, air: false, trick: false, rampPrev: null, slip: 0, confused: 0, pitGrace: 0, padGrace: 0, steer: 0, phantom: 0,
    idx: 0, lap: 0, progress: 0, rank: 0, finished: false, finishTime: 0,
    lane: isAI ? rand(-3.5, 3.5) : 0, laneTimer: rand(2, 6), aiSpeedMul: 1, skill: rand(-0.03, 0.03), hazardGrace: 0, lapStart: 0, bestLap: Infinity, maxLap: 0,
  };
}

function startRace() {
  if (G.scene) disposeScene(G.scene);
  const track = TRACKS[G.trackIdx]; G.track = track;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(track.fog); scene.fog = new THREE.Fog(track.fog, 220, 700);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x55663a, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.15); sun.position.set(120, 200, 80); scene.add(sun); scene.add(sun.target);
  sun.castShadow = SHADOWS(); sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500; sun.shadow.bias = -0.0006;
  G.sun = sun; G.scene = scene; G.animated = []; G.hazards = []; G.projectiles = []; G.crowd = [];
  setCast(true); buildTrack(scene, track);

  const others = CHARACTERS.filter((c, i) => i !== G.charIdx).sort(() => Math.random() - 0.5).slice(0, CFG.numAI);
  const player = makeKart(CHARACTERS[G.charIdx], false);
  G.karts = [...others.map(d => makeKart(d, true)), player]; G.player = player;
  G.karts.forEach((k, i) => {
    const s = G.samples[6 + i * 4]; const lane = (i % 2 === 0 ? 1 : -1) * 3.5;
    k.pos.x = s.x + s.sx * lane; k.pos.z = s.z + s.sz * lane; k.heading = Math.atan2(s.tx, s.tz); k.idx = 6 + i * 4;
    k.mesh.position.set(k.pos.x, 0, k.pos.z); k.mesh.rotation.y = k.heading; scene.add(k.mesh);
  });
  G.time = 0; G.countdown = 3.6; G.resultsAt = Infinity; G.state = 'countdown';
  showScreen(null); $('hud').hidden = false; $('note').hidden = true;
  const s = G.samples[0]; camera.position.set(s.x - s.tx * 14, 7, s.z - s.tz * 14); camera.fov = 65;
  drawMinimapBase(); setHint('Ramassez une urne dorée pour obtenir un objet.');
  $('h-pname').textContent = player.def.power.name;
}
function disposeScene(scene) { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }

// ---------- Camera & sun ----------
function updateCamera(dt) {
  const k = G.player; const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  const back = k.speed < -2 ? -11 : 12 - Math.min(2, k.boost * 2);
  const ty = 6.2 + (k.fly > 0 ? 3 : 0) + k.y * 0.6;
  const tx = k.pos.x - fx * back, tz = k.pos.z - fz * back;
  const a = 1 - Math.exp(-dt * (G.state === 'countdown' ? 1.6 : 6));
  camera.position.x = lerp(camera.position.x, tx, a); camera.position.z = lerp(camera.position.z, tz, a); camera.position.y = lerp(camera.position.y, ty, a);
  camera.lookAt(k.pos.x + fx * 5, 1.2 + k.mesh.position.y * 0.5, k.pos.z + fz * 5);
  camera.fov = lerp(camera.fov, k.boost > 0 ? 76 : 65, 1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
  if (G.sun) { G.sun.position.set(k.pos.x + 120, 200, k.pos.z + 80); G.sun.target.position.set(k.pos.x, 0, k.pos.z); G.sun.target.updateMatrixWorld(); }
}

// ---------- HUD ----------
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
function drawMinimap() {
  const W = 300; mm.clearRect(0, 0, W, W); mm.drawImage(mmBase, 0, 0);
  for (const k of G.karts) { const x = k.pos.x * mmScale + mmOffX, y = W - (k.pos.z * mmScale + mmOffZ); mm.beginPath(); mm.arc(x, y, k === G.player ? 9 : 6, 0, 7); mm.fillStyle = hex(k.def.kart); mm.fill(); mm.lineWidth = k === G.player ? 3 : 1.5; mm.strokeStyle = k === G.player ? '#fff' : 'rgba(0,0,0,.6)'; mm.stroke(); }
}
let lastItemShown = '', lastPowerReady = null;
function updateHUD() {
  const k = G.player;
  hud.pos.innerHTML = (k.rank + 1) + '<small>' + (k.rank === 0 ? 'er' : 'e') + '</small>';
  hud.lap.textContent = k.finished ? 'ARRIVÉE' : 'TOUR ' + Math.min(k.lap + 1, CFG.laps) + '/' + CFG.laps;
  hud.time.textContent = fmtTime(k.finished ? k.finishTime : G.time) + (k.bestLap < Infinity ? '  ·  meilleur tour ' + fmtTime(k.bestLap) : '');
  hud.speed.textContent = Math.round(Math.abs(k.speed) * 3.2);
  hud.drift.style.width = (clamp(k.drift.charge / 2, 0, 1) * 100) + '%'; hud.drift.style.background = k.drift.charge > 2 ? '#ff7a1a' : k.drift.charge > 1 ? '#ffd34d' : '#7cc4ff';
  let shown;
  if (k.itemRolling > 0) { const keys = Object.keys(ITEMS); const it = ITEMS[keys[Math.floor(G.time * 12) % keys.length]]; shown = it.icon + '|…'; }
  else if (k.item) shown = ITEMS[k.item].icon + '|' + ITEMS[k.item].name; else shown = '·|aucun objet';
  if (shown !== lastItemShown) { lastItemShown = shown; const [ico, nm] = shown.split('|'); hud.item.querySelector('.ico').textContent = ico; hud.item.querySelector('.nm').textContent = nm; hud.item.classList.toggle('has', !!k.item); }
  const ready = k.powerCd <= 0; hud.pbar.style.width = ((1 - k.powerCd / (k.def.power.cd || CFG.powerCooldown)) * 100) + '%';
  if (ready !== lastPowerReady) { lastPowerReady = ready; hud.power.classList.toggle('ready', ready); hud.pkey.textContent = ready ? 'F · PRÊT !' : 'F · recharge'; }
  const s = G.samples[k.idx]; const dot = Math.sin(k.heading) * s.tx + Math.cos(k.heading) * s.tz;
  G.wrongTimer = (dot < -0.2 && k.speed > 3 && !k.finished) ? G.wrongTimer + 1 / 60 : 0; hud.wrong.hidden = G.wrongTimer < 1.2;
  drawMinimap();
}
function setHint(t) { hud.hint.textContent = t; }
function toast(t) { if (!t) return; hud.toast.textContent = t; hud.toast.classList.add('on'); G.toastTimer = 2.2; }

// ---------- Results ----------
function showResults() {
  G.state = 'results'; $('hud').hidden = true;
  const order = [...G.karts].sort((a, b) => a.rank - b.rank);
  const p = G.player; const msgs = ['Majorité absolue ! Vous gouvernez seul·e.', 'Second tour obligatoire, mais c’est bien parti.', 'Sur le podium : un poste de ministre vous attend.', 'Coalition nécessaire. Négociations en cours.', 'Score en demi-teinte. Les sondages pardonnent peu.', 'Dernière place : retour à la base, pour écouter le pays.'];
  $('r-sub').textContent = ordinal(p.rank + 1) + ' sur ' + G.karts.length + ' — ' + msgs[p.rank] + (p.bestLap < Infinity ? '  ·  Meilleur tour : ' + fmtTime(p.bestLap) : '') + '  ·  Pouvoir utilisé ' + p.powerUses + '×';
  $('r-body').innerHTML = order.map(k => '<tr class="' + (k === p ? 'you' : '') + '"><td class="r">' + ordinal(k.rank + 1) + '</td><td><b>' + k.def.name + '</b><br><span style="font-size:12px;color:var(--muted)">' + k.def.title + '</span></td><td class="t">' + (k.finished ? fmtTime(k.finishTime) : 'en course…') + '</td></tr>').join('');
  showScreen('s-results');
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
const SCREENS = ['s-title', 's-select', 's-tracks', 's-pause', 's-results', 's-admin'];
function showScreen(id) { SCREENS.forEach(s => { $(s).hidden = s !== id; }); }
function pause() { G.state = 'paused'; showScreen('s-pause'); }
function resume() { G.state = G.countdown > 0 ? 'countdown' : 'race'; showScreen(null); lastFrame = performance.now(); }

// ---------- Select screen: rendered portraits + 3D showcase ----------
function ensurePreviewScene() {
  if (G.previewScene) return;
  const s = new THREE.Scene(); s.background = new THREE.Color(0x0c1230);
  s.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.9)); s.add(new THREE.AmbientLight(0xffffff, 0.2));
  const d = new THREE.DirectionalLight(0xfff4d6, 1.1); d.position.set(5, 10, 6); d.castShadow = true; d.shadow.mapSize.set(1024, 1024); const sc = d.shadow.camera; sc.left = sc.bottom = -8; sc.right = sc.top = 8; s.add(d);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ color: 0x1f2a5e, roughness: 0.9 })); disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; s.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; s.add(ring);
  G.previewScene = s; G.previewHolder = new THREE.Group(); s.add(G.previewHolder);
}
function setPreview(i) {
  ensurePreviewScene();
  while (G.previewHolder.children.length) { const c = G.previewHolder.children[0]; G.previewHolder.remove(c); disposeScene(c); }
  setCast(true); G.previewKart = buildKart(CHARACTERS[i]); G.previewHolder.add(G.previewKart);
}
function renderPreview(dt) {
  if (!G.previewKart) setPreview(G.charIdx);
  G.previewKart.rotation.y += dt * 0.7;
  const wide = window.innerWidth > 760 && G.state === 'select'; const sx = wide ? -2.9 : 0, sy = wide ? 0 : 0.6;
  camera.position.set(sx, 3.6, 10.5); camera.lookAt(sx, 1.4 + sy, 0); camera.fov = 38; camera.updateProjectionMatrix(); renderer.render(G.previewScene, camera);
}
function makeThumbs() {
  // Render each character once into a small square and keep the data URL for the roster tiles.
  const poly = getPoly();
  if (G.thumbPoly === poly) return; G.thumbPoly = poly; G.thumbs = {};
  ensurePreviewScene(); const keep = G.previewKart; const prevChildren = [...G.previewHolder.children]; prevChildren.forEach(c => G.previewHolder.remove(c));
  renderer.setSize(220, 220, false); camera.aspect = 1; camera.fov = 34; camera.updateProjectionMatrix(); camera.position.set(0.8, 3.2, 7.5); camera.lookAt(0, 1.7, 0);
  CHARACTERS.forEach(c => { const k = buildKart(c); k.rotation.y = -0.5; G.previewHolder.add(k); renderer.render(G.previewScene, camera); G.thumbs[c.id] = renderer.domElement.toDataURL('image/png'); G.previewHolder.remove(k); disposeScene(k); });
  prevChildren.forEach(c => G.previewHolder.add(c)); G.previewKart = keep; resize();
}
function selectChar(i) {
  G.charIdx = i; [...$('roster').children].forEach((e, j) => e.classList.toggle('sel', j === i)); setPreview(i);
  const c = CHARACTERS[i]; const lbl = { speed: 'Vitesse', accel: 'Accélération', handling: 'Tenue de route' };
  $('showcase').innerHTML = '<div class="big">' + c.name + '</div><div class="title">' + c.title + '</div><div class="quote">' + c.quote + '</div>' +
    '<div class="stats">' + ['speed', 'accel', 'handling'].map(s => '<div class="stat"><span>' + lbl[s] + '</span><div class="bar"><i style="width:' + Math.round((c.stats[s] - 0.6) / 0.6 * 100) + '%"></i></div></div>').join('') + '</div>' +
    '<div class="powerbox"><b>Pouvoir : ' + c.power.name + '</b><p>' + c.power.desc + ' <span style="color:var(--muted)">(touche F)</span></p></div>';
}
function buildRoster() {
  makeThumbs(); const wrap = $('roster'); wrap.innerHTML = '';
  CHARACTERS.forEach((c, i) => { const el = document.createElement('button'); el.className = 'tile' + (i === G.charIdx ? ' sel' : ''); el.type = 'button'; el.innerHTML = '<img alt="' + c.name + '" src="' + G.thumbs[c.id] + '"><div class="tname">' + c.name + '</div>'; el.addEventListener('click', () => { initAudio(); selectChar(i); }); wrap.appendChild(el); });
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
$('b-admin').addEventListener('click', () => { buildAdmin(); showScreen('s-admin'); G.state = 'admin'; });
$('b-admin-save').addEventListener('click', () => { applyCustom(); const ok = saveCustom(); if (G.previewHolder) setPreview(G.charIdx); showScreen('s-title'); G.state = 'title'; $('b-admin').textContent = ok ? 'Atelier (admin) · enregistré' : 'Atelier (admin) · non sauvegardé (stockage plein)'; });
$('b-admin-reset').addEventListener('click', () => { resetCustom(); buildAdmin(); if (G.previewHolder) setPreview(G.charIdx); });
loadCustom();

// buttons
$('b-play').addEventListener('click', () => { initAudio(); buildRoster(); showScreen('s-select'); G.state = 'select'; });
$('b-poly').addEventListener('click', () => { const poly = togglePoly(); $('b-poly').textContent = poly === 'low' ? 'Graphismes : légers (low-poly)' : 'Graphismes : détaillés (ombres)'; if (G.previewHolder) setPreview(G.charIdx); });
$('b-mute').addEventListener('click', () => { initAudio(); toggleMute(); syncMuteButton(); });
$('b-back1').addEventListener('click', () => { showScreen('s-title'); G.state = 'title'; });
$('b-next1').addEventListener('click', () => { buildTrackCards(); showScreen('s-tracks'); G.state = 'tracks'; });
$('b-back2').addEventListener('click', () => { showScreen('s-select'); G.state = 'select'; });
$('b-start').addEventListener('click', () => { initAudio(); startRace(); });
$('b-resume').addEventListener('click', resume);
$('b-quit').addEventListener('click', () => { G.state = 'title'; $('hud').hidden = true; showScreen('s-title'); });
$('b-again').addEventListener('click', () => { initAudio(); startRace(); });
$('b-menu').addEventListener('click', () => { G.state = 'title'; showScreen('s-title'); });

// ---------- Main loop ----------
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  if (G.state === 'select' || G.state === 'tracks' || G.state === 'title' || G.state === 'admin') { if (G.state === 'select' || G.state === 'tracks' || G.previewScene) renderPreview(dt); return; }
  if (G.state === 'paused' || G.state === 'results') { if (G.scene) renderer.render(G.scene, camera); updateEngine(); return; }

  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown); G.countdown -= dt; const after = Math.ceil(G.countdown);
    if (G.countdown <= 0) { G.state = 'race'; hud.center.textContent = 'PARTEZ !'; setTimeout(() => { if (hud.center.textContent === 'PARTEZ !') hud.center.textContent = ''; }, 900); sfx('go'); G.karts.forEach(k => { k.lapStart = 0; }); }
    else { hud.center.textContent = Math.min(3, after); if (before !== after) sfx('count'); }
  } else G.time += dt;

  for (const k of G.karts) updateKart(k, dt);
  kartCollisions(); pickupItems(); updateProjectiles(dt); updateRanks();
  // The engine no longer touches the HUD: everything it wanted to say during the step is queued, and shown here.
  for (const e of drain()) { if (e.type === 'toast') toast(e.text); else if (e.type === 'hint') setHint(e.text); }
  for (const f of [...G.animated]) f(dt);
  for (const c of G.crossings) { c.t += dt; const p = (c.t * c.speed) % (4 * c.range); const lat = p < 2 * c.range ? p - c.range : 3 * c.range - p; const dir = p < 2 * c.range ? 1 : -1; c.mesh.position.set(c.s.x + c.s.sx * lat, 0, c.s.z + c.s.sz * lat); c.mesh.rotation.y = Math.atan2(c.s.sx * dir, c.s.sz * dir);
    for (const k of G.karts) { if (k.hazardGrace > 0 || k.fly > 0 || k.y > 1.2) continue; const d = (k.pos.x - c.mesh.position.x) ** 2 + (k.pos.z - c.mesh.position.z) ** 2; if (d < 10) { k.hazardGrace = 1.5; k.speed *= 0.3; if (stunKart(k, 1.3) && k === G.player) toast('RENVERSÉ PAR LE CORTÈGE !'); } } }
  const ct = G.time * 5; for (const c of G.crowd) if (c.amp) c.g.position.y = Math.abs(Math.sin(ct + c.ph)) * c.amp + (c.base || 0);
  if (G.toastTimer > 0) { G.toastTimer -= dt; if (G.toastTimer <= 0) hud.toast.classList.remove('on'); }
  updateCamera(dt); updateHUD(); updateEngine();
  renderer.render(G.scene, camera);
  if (G.time >= G.resultsAt || (G.player.finished && G.karts.every(k => k.finished))) showResults();
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
// completes three laps. Exposing this one function keeps that spec working
// across the repackaging. See DEC-009 and the note in e2e/game.spec.ts; it
// goes away when stage 11 gives the engine a real seam.
window.showResults = showResults;
