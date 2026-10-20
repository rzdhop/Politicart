// The character showcase: a lit turntable and the roster thumbnails.
//
// The select screen shows the chosen candidate's kart rotating in its own
// small scene, and the roster tiles carry a portrait of each kart. Both come
// from here: the kart is rendered with the one shared renderer and camera
// (see render.js for the consequences of sharing them), and the thumbnails
// are rendered off-screen once per detail level and kept as data URLs. The
// UI gets a string per character out of makeThumbs(), never a scene.
//
// renderPreview reads the window size to frame the kart beside the roster on
// wide layouts. On phones -- narrow, or short in landscape -- the UI hands it
// a frame instead (setPreviewFrame): the free band of the showcase above the
// candidate's name, which it reads from the page each frame. The kart is then
// drawn into that rectangle alone, so it sits above the text whichever way
// the phone is held and follows the screen when it scrolls.
import * as THREE from 'three';

import { CHARACTERS } from './data.js';
import { myStyle } from './garage.js';
import { buildKart } from './kart.js';
import { setCast } from './primitives.js';
import { disposeScene } from './race.js';
import { camera, getRenderer, resize } from './render.js';
import { G, getPoly } from './state.js';

function ensurePreviewScene() {
  if (G.previewScene) return;
  const s = new THREE.Scene(); s.background = new THREE.Color(0x0c1230);
  s.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.9)); s.add(new THREE.AmbientLight(0xffffff, 0.2));
  const d = new THREE.DirectionalLight(0xfff4d6, 1.1); d.position.set(5, 10, 6); d.castShadow = true; d.shadow.mapSize.set(1024, 1024); const sc = d.shadow.camera; sc.left = sc.bottom = -8; sc.right = sc.top = 8; s.add(d);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ color: 0x1f2a5e, roughness: 0.9 })); disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; s.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; s.add(ring);
  G.previewScene = s; G.previewHolder = new THREE.Group(); s.add(G.previewHolder);
}

/** Put character `i`'s kart, as the player styled it, on the turntable, replacing whatever was there. */
export function setPreview(i) {
  ensurePreviewScene();
  while (G.previewHolder.children.length) { const c = G.previewHolder.children[0]; G.previewHolder.remove(c); disposeScene(c); }
  setCast(true); G.previewKart = buildKart(CHARACTERS[i], myStyle(CHARACTERS[i])); G.previewHolder.add(G.previewKart);
}

/** Whether a turntable exists yet (the title screen renders it only if so). */
export const hasPreview = () => !!G.previewScene;

let framer = null;

/**
 * Register the function that says where the kart goes on small screens:
 * `() => ({ x, y, w, h })` in CSS pixels from the top left, or null when
 * there is no room. Pass null to unregister.
 */
export function setPreviewFrame(fn) { framer = typeof fn === 'function' ? fn : null; }

/** Advance the turntable and draw it. */
export function renderPreview(dt) {
  if (!G.previewKart) setPreview(G.charIdx);
  G.previewKart.rotation.y += dt * 0.7;
  const r = getRenderer(); const W = window.innerWidth, H = window.innerHeight;
  // The Garage keeps the roster's turntable, framing included.
  const select = G.state === 'select' || G.state === 'garage'; const wide = W > 760 && H > 520 && select;
  const f = select && !wide && framer ? framer() : null;
  if (f && f.w > 40 && f.h > 60) {
    // small screen: the kart alone in its frame, the rest of the canvas cleared to the scene colour
    r.setScissorTest(false); r.setClearColor(G.previewScene.background); r.clear();
    const y = H - f.y - f.h; r.setViewport(f.x, y, f.w, f.h); r.setScissor(f.x, y, f.w, f.h); r.setScissorTest(true);
    camera.aspect = f.w / f.h; camera.position.set(0, 3.6, 10.5); camera.lookAt(0, 1.4, 0); camera.fov = 38 * Math.max(1, 1.1 / camera.aspect); camera.updateProjectionMatrix();
    r.render(G.previewScene, camera);
    r.setScissorTest(false); r.setViewport(0, 0, W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
    return;
  }
  const sx = wide ? -2.9 : 0, sy = wide ? 0 : 0.6;
  camera.position.set(sx, 3.6, 10.5); camera.lookAt(sx, 1.4 + sy, 0); camera.fov = 38; camera.updateProjectionMatrix(); r.render(G.previewScene, camera);
}

/**
 * Render every character once into a small square and return the data URLs
 * by character id. Cached per detail level, since a low-poly kart looks
 * different from a detailed one.
 */
export function makeThumbs() {
  const poly = getPoly();
  if (G.thumbPoly === poly) return G.thumbs; G.thumbPoly = poly; G.thumbs = {};
  ensurePreviewScene(); const keep = G.previewKart; const prevChildren = [...G.previewHolder.children]; prevChildren.forEach(c => G.previewHolder.remove(c));
  const renderer = getRenderer(); renderer.setSize(220, 220, false); camera.aspect = 1; camera.fov = 34; camera.updateProjectionMatrix(); camera.position.set(0.8, 3.2, 7.5); camera.lookAt(0, 1.7, 0);
  CHARACTERS.forEach(c => { const k = buildKart(c); k.rotation.y = -0.5; G.previewHolder.add(k); renderer.render(G.previewScene, camera); G.thumbs[c.id] = renderer.domElement.toDataURL('image/png'); G.previewHolder.remove(k); disposeScene(k); });
  prevChildren.forEach(c => G.previewHolder.add(c)); G.previewKart = keep; resize();
  return G.thumbs;
}
