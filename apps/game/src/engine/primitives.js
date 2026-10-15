// Cached materials, mesh primitives and texture helpers.
//
// Everything the scene builders are made of. Materials are cached by colour
// and roughness because the game builds thousands of meshes per track and
// Three.js materials are expensive to duplicate; the cache is deliberately
// never cleared, since the same handful of colours recur across every race.
import * as THREE from 'three';

import { SHADOWS, seg } from './state.js';

const matCache = {};
/**
 * Whether meshes created from here on cast shadows.
 *
 * Module-private behind setCast because it is assigned from elsewhere and an
 * imported binding is read-only for the importer.
 *
 * Carried over as-is, including a quirk worth knowing: nothing ever sets this
 * to false. The three call sites outside this module all set it true, so
 * `CAST && SHADOWS()` in tag() is currently just SHADOWS(). Left alone rather
 * than simplified, because stage 9 is a repackaging and a dead flag is not
 * worth a behaviour change; noted in .design-sync/NOTES.md as a cleanup.
 */
let CAST = true;

/** Set whether subsequently built meshes cast shadows. */
export function setCast(value) {
  CAST = value;
}
export function mat(color, rough) { const k = color + ':' + (rough || 0.85); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough || 0.85, metalness: 0.05 })); }
export function tag(m) { m.castShadow = CAST && SHADOWS(); m.receiveShadow = true; return m; }
export function box(w, h, d, color, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); return tag(m); }
export function sph(r, color, x, y, z, s) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, s || seg(), s || seg()), mat(color)); m.position.set(x, y, z); return tag(m); }
export function cyl(rt, rb, h, color, x, y, z, s) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s || seg()), mat(color)); m.position.set(x, y, z); return tag(m); }
export function cone(r, h, color, x, y, z, s) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, s || seg()), mat(color)); m.position.set(x, y, z); return tag(m); }
export function torus(r, t, color, x, y, z) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, Math.max(6, seg() / 2), seg() * 2), mat(color)); m.position.set(x, y, z); return tag(m); }
export function plane(w, h, color, x, z, rotY) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color, 0.95)); m.rotation.x = -Math.PI / 2; m.rotation.z = rotY || 0; m.position.set(x, 0.02, z); m.receiveShadow = true; return m; }
// Headless (the game server, DEC-014): no canvas exists, and nothing is ever
// drawn, so a blank texture stands in. Materials, wrap modes and clone() all
// still work on it, which is all the scene builders need.
const HEADLESS = typeof document === 'undefined';
export function canvasTexture(w, h, draw) { if (HEADLESS) return new THREE.Texture(); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); return t; }
export function textPlane(w, h, text, bg, fg, px) {
  const t = canvasTexture(512, Math.round(512 * h / w), (c, cw, ch) => { c.fillStyle = bg; c.fillRect(0, 0, cw, ch); c.fillStyle = fg; c.font = 'bold ' + (px || 72) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); return m;
}

// ---------- Image textures (used for player-uploaded liveries and posters) ----------
const texCache = {};
export function imgTex(url) { if (HEADLESS) return new THREE.Texture(); if (!texCache[url]) { const t = new THREE.TextureLoader().load(url); t.encoding = THREE.sRGBEncoding; texCache[url] = t; } return texCache[url]; }
export function imgPlane(w, h, url) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: imgTex(url), side: THREE.DoubleSide })); }
