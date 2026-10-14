// The renderer and the camera.
//
// There is exactly one of each for the whole game, and they are reused across
// the race scene and the two preview scenes by mutating the camera rather than
// creating a second one. That makes the camera a shared mutable singleton:
// anything that changes its fov or position is responsible for what the next
// user of it sees.
//
// The canvas is looked up at module scope, which is safe because the entry is
// loaded as a module and so runs after the document is parsed.
import * as THREE from 'three';

import { $ } from './util.js';

export const canvas = $('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 2000);
export function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
