// The renderer and the camera.
//
// There is exactly one of each for the whole game, and they are reused across
// the race scene and the two preview scenes by mutating the camera rather than
// creating a second one. That makes the camera a shared mutable singleton:
// anything that changes its fov or position is responsible for what the next
// user of it sees.
//
// The renderer is created on first use, not at import. The engine also runs
// headless on the game server (DEC-014), where there is no canvas and no
// WebGL: importing this module there must not touch the DOM, and nothing on
// the server ever asks for the renderer. In the browser the first caller is
// the menu's preview, a frame after load, so the canvas is sized as before.
import * as THREE from 'three';

import { $ } from './util.js';

export const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 2000);

let renderer = null;

/** The one WebGL renderer, created and sized on the first call. */
export function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
  // Phones have 3x screens and mobile GPUs: 1.5x is sharp enough and keeps the frame rate.
  const phone = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  window.addEventListener('resize', resize); resize();
  return renderer;
}

export function resize() { const r = getRenderer(); r.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
