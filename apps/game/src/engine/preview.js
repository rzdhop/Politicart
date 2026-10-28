// The character showcase: a lit turntable and the roster thumbnails.
//
// The select screen shows the chosen candidate's kart rotating in its own
// small scene, and the roster tiles carry a portrait of each kart. Both come
// from here: the kart is rendered with the one shared renderer and camera
// (see render.js for the consequences of sharing them), and the thumbnails
// are rendered off-screen once per detail level and kept as data URLs. The
// UI gets a string per character out of makeThumbs(), never a scene.
//
// The turntable shows on the roster and the Garage alone (showsTurntable);
// every other menu sits on the plain night background, and the frame loop
// clears the canvas to it there (render.js clearCanvas) rather than leave it
// holding the last race or turntable frame. The Politibox draws its own scene.
//
// Where the kart goes is the UI's say on every layout: it registers a frame
// (setPreviewFrame), the free band of the visible screen's showcase above
// the candidate's name, which renderPreview reads from the page each frame.
// The turntable -- disc, gold ring and the tallest kart's head -- is fitted
// into that rectangle (frameKart), so it never runs over the name, the
// epithet, the stats or the power box, whether the band is the right-hand
// column of a desktop or the top of a phone held either way. It is drawn on
// the whole canvas through an off-centre projection, so nothing is cropped.
// A band taller than the window (the Garage's column runs the form's height)
// keeps the kart in its visible part, so it stays in view while the form
// scrolls; a band that scrolls off the top takes the kart with it.
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

/** Whether a turntable exists yet, so that a roster or style change knows to rebuild it. */
export const hasPreview = () => !!G.previewScene;

/** Whether menu `state` shows the turntable: the roster and the Garage do; the other menus show the plain background. */
export const showsTurntable = state => state === 'select' || state === 'garage';

let framer = null;
/** The turntable's own clock, for the parts that wave and cycle (kart.js anim). */
let clock = 0;

/**
 * Register the function that says where the kart goes:
 * `() => ({ x, y, w, h })` in CSS pixels from the top left of the window, or
 * null when there is no room (the kart is then not drawn). Pass null to
 * unregister; with no frame function at all the kart is fitted to the window.
 */
export function setPreviewFrame(fn) { framer = typeof fn === 'function' ? fn : null; }

// The turntable's camera stands still; only its projection follows the frame.
const EYE = new THREE.Vector3(0, 3.6, 10.5), TARGET = new THREE.Vector3(0, 1.4, 0);
/** What must fit in the frame: the gold ring (outer radius 3.48, from y -0.06 to 0.1) and a head as tall as the tallest kart's (3.3, the tractor's driver). */
const RING = 3.5, TOP = 3.3, HEAD = 1;
/** The share of the frame left clear on each side. */
const MARGIN = 0.04;
/** How far down a frame taller than the kart it puts the kart: a little below the middle, nearer the name it presents. */
const SINK = 0.6;
/** Below this many CSS pixels a frame has no room for the kart. */
const MIN_W = 40, MIN_H = 60;

let box = null;
/**
 * The turntable as the still camera sees it, in tangent space (a point's x
 * and y over its depth): the bounds of the ring and of a circle of radius
 * HEAD at the head's height, whichever way the kart faces. Measured once,
 * and the same for every candidate, so the disc keeps its size as the
 * player goes through the roster.
 */
function kartBox() {
  if (box) return box;
  const cam = new THREE.PerspectiveCamera(); cam.position.copy(EYE); cam.lookAt(TARGET); cam.updateMatrixWorld();
  box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }; const p = new THREE.Vector3();
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    for (const [r, y] of [[RING, -0.06], [RING, 0.1], [HEAD, TOP]]) {
      p.set(Math.cos(a) * r, y, Math.sin(a) * r).applyMatrix4(cam.matrixWorldInverse);
      const tx = p.x / -p.z, ty = p.y / -p.z;
      box.x0 = Math.min(box.x0, tx); box.x1 = Math.max(box.x1, tx); box.y0 = Math.min(box.y0, ty); box.y1 = Math.max(box.y1, ty);
    }
  }
  return box;
}

/**
 * Fit the turntable into `frame` (CSS pixels, top left origin) on a W x H
 * canvas. Its box takes the frame's width or the height of the frame's part
 * a window can show, whichever binds, less MARGIN on each side, and sits
 * centred across the frame; down, it sits a little below the middle (SINK)
 * of the part of the frame inside the window, but never leaves the frame,
 * so it scrolls off with a frame that does. Returns that box in pixels
 * (x, y, w, h) and the camera's frustum over the whole canvas in tangent
 * space (left, right, top, bottom), off-centre so the turntable lands in
 * the box: times the near distance, the planes of makePerspective.
 */
export function frameKart(frame, W, H) {
  const b = kartBox(), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const s = Math.max(bw / (frame.w * (1 - 2 * MARGIN)), bh / (Math.min(frame.h, H) * (1 - 2 * MARGIN)));   // tangent units per pixel
  const w = bw / s, h = bh / s, x = frame.x + (frame.w - w) / 2;
  const top0 = Math.max(frame.y, 0), seen = Math.min(frame.y + frame.h, H) - top0;
  const y = Math.min(Math.max(top0 + (seen - h) * SINK, frame.y), frame.y + frame.h - h);
  const left = b.x0 - x * s, top = b.y1 + y * s;
  return { x, y, w, h, left, right: left + W * s, top, bottom: top - H * s };
}

/**
 * Stand `cam` where the turntable is watched from and give it the frustum
 * that draws the turntable into `frame` on a W x H canvas (frameKart).
 * The projection is set by hand, so the next user of a shared camera must
 * call updateProjectionMatrix (renderPreview does, after drawing).
 */
export function aimTurntable(cam, frame, W, H) {
  const k = frameKart(frame, W, H), n = cam.near;
  cam.position.copy(EYE); cam.lookAt(TARGET); cam.updateMatrixWorld();
  cam.projectionMatrix.makePerspective(k.left * n, k.right * n, k.top * n, k.bottom * n, n, cam.far); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  return k;
}

/** Advance the turntable and draw it into the UI's frame. */
export function renderPreview(dt) {
  if (!G.previewKart) setPreview(G.charIdx);
  G.previewKart.rotation.y += dt * 0.7;
  clock += dt; for (const f of G.previewKart.userData.anim) f(dt, clock);   // flags wave, the rainbow cycles; no kart, so no boost and no trail
  const r = getRenderer(); const W = window.innerWidth, H = window.innerHeight;
  const f = framer ? framer() : { x: 0, y: 0, w: W, h: H };
  r.setScissorTest(false); r.setViewport(0, 0, W, H);
  if (!f || !(f.w > MIN_W && f.h > MIN_H)) { r.setClearColor(G.previewScene.background, 1); r.clear(); return; }   // no room: the background alone
  // The whole canvas through an off-centre frustum: the scene background fills it and the kart lands in the frame.
  aimTurntable(camera, f, W, H); r.render(G.previewScene, camera);
  camera.aspect = W / H; camera.updateProjectionMatrix();   // hand the next user of the camera a plain projection again
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
