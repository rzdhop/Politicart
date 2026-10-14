// The character showcase: a lit turntable and the roster thumbnails.
//
// The select screen shows the chosen candidate's kart rotating in its own
// small scene, and the roster tiles carry a portrait of each kart. Both come
// from here: the kart is rendered with the one shared renderer and camera
// (see render.js for the consequences of sharing them), and the thumbnails
// are rendered off-screen once per detail level and kept as data URLs. The
// UI gets a string per character out of makeThumbs(), never a scene.
//
// renderPreview reads the window width to frame the kart beside the roster
// on wide layouts and above it on narrow ones. That is a read of the
// viewport, not a DOM write, and it mirrors the stylesheet's 760px break.
import * as THREE from 'three';

import { CHARACTERS } from './data.js';
import { buildKart } from './kart.js';
import { setCast } from './primitives.js';
import { disposeScene } from './race.js';
import { camera, renderer, resize } from './render.js';
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

/** Put character `i`'s kart on the turntable, replacing whatever was there. */
export function setPreview(i) {
  ensurePreviewScene();
  while (G.previewHolder.children.length) { const c = G.previewHolder.children[0]; G.previewHolder.remove(c); disposeScene(c); }
  setCast(true); G.previewKart = buildKart(CHARACTERS[i]); G.previewHolder.add(G.previewKart);
}

/** Whether a turntable exists yet (the title screen renders it only if so). */
export const hasPreview = () => !!G.previewScene;

/** Advance the turntable and draw it. */
export function renderPreview(dt) {
  if (!G.previewKart) setPreview(G.charIdx);
  G.previewKart.rotation.y += dt * 0.7;
  const wide = window.innerWidth > 760 && G.state === 'select'; const sx = wide ? -2.9 : 0, sy = wide ? 0 : 0.6;
  camera.position.set(sx, 3.6, 10.5); camera.lookAt(sx, 1.4 + sy, 0); camera.fov = 38; camera.updateProjectionMatrix(); renderer.render(G.previewScene, camera);
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
  renderer.setSize(220, 220, false); camera.aspect = 1; camera.fov = 34; camera.updateProjectionMatrix(); camera.position.set(0.8, 3.2, 7.5); camera.lookAt(0, 1.7, 0);
  CHARACTERS.forEach(c => { const k = buildKart(c); k.rotation.y = -0.5; G.previewHolder.add(k); renderer.render(G.previewScene, camera); G.thumbs[c.id] = renderer.domElement.toDataURL('image/png'); G.previewHolder.remove(k); disposeScene(k); });
  prevChildren.forEach(c => G.previewHolder.add(c)); G.previewKart = keep; resize();
  return G.thumbs;
}
