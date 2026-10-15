// Procedural textures, drawn once into canvases.
//
// Haussmann facades, asphalt, grass, gravel and the rest are painted in code
// rather than shipped as images, which is why the game needs no texture assets
// at all.
//
// Built lazily and exactly once -- the TEX.ready guard -- and the result is
// shared by every track. **Load order matters: textures() must run before any
// builder reads TEX.*,** which buildTrack relies on.
import * as THREE from 'three';

import { canvasTexture } from './primitives.js';

export const TEX = {};
export function textures() {
  if (TEX.ready) return;
  TEX.facade = canvasTexture(256, 256, (c, w, h) => { // Haussmann: cream stone, tall windows, iron balconies, 3 floors per tile
    c.fillStyle = '#e4d6bb'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = Math.random() < 0.5 ? '#d8c9ab' : '#ece0c8'; c.fillRect(Math.random() * w, Math.random() * h, 6, 3); }
    for (let f = 0; f < 3; f++) { const y = 18 + f * 84; c.fillStyle = '#6a5a4a'; c.fillRect(0, y + 60, w, 3);
      for (let x = 14; x < w; x += 52) { c.fillStyle = '#2d3b55'; c.fillRect(x, y, 26, 52); c.fillStyle = '#9fb4cf'; c.fillRect(x + 3, y + 3, 9, 20); c.fillRect(x + 14, y + 3, 9, 20); c.fillStyle = '#3a3a3a'; for (let b = 0; b < 5; b++) c.fillRect(x - 4 + b * 8, y + 36, 2, 18); c.fillRect(x - 5, y + 34, 36, 2); } }
  });
  TEX.facade.wrapS = TEX.facade.wrapT = THREE.RepeatWrapping;
  TEX.palace = canvasTexture(256, 256, (c, w, h) => { // classical: pale stone, arched windows, pilasters
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = '#e6dcc4'; c.fillRect(Math.random() * w, Math.random() * h, 8, 2); }
    for (let f = 0; f < 2; f++) { const y = 30 + f * 120; for (let x = 10; x < w; x += 64) { c.fillStyle = '#d9cfb8'; c.fillRect(x - 8, 0, 6, h); c.fillStyle = '#334a66'; c.fillRect(x + 8, y, 30, 64); c.beginPath(); c.arc(x + 23, y, 15, Math.PI, 0); c.fill(); c.fillStyle = '#b9c9dd'; c.fillRect(x + 12, y + 6, 9, 24); c.fillRect(x + 25, y + 6, 9, 24); c.fillStyle = '#c9bc9c'; c.fillRect(x + 4, y + 66, 38, 5); } }
  });
  TEX.palace.wrapS = TEX.palace.wrapT = THREE.RepeatWrapping;
  TEX.cobble = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#8c8a84'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const o = (y / 16) % 2 ? 8 : 0; c.fillStyle = ['#9b9992', '#85837c', '#a3a19a', '#7d7b74'][Math.floor(Math.random() * 4)]; c.fillRect(x + o + 1, y + 1, 14, 14); } });
  TEX.cobble.wrapS = TEX.cobble.wrapT = THREE.RepeatWrapping;
  TEX.gravel = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#cdbc8e'; c.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { c.fillStyle = ['#d9c99c', '#bfae80', '#e2d3a8', '#b3a376'][i % 4]; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  TEX.gravel.wrapS = TEX.gravel.wrapT = THREE.RepeatWrapping;
  TEX.grass = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#6f9a55'; c.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { c.fillStyle = ['#79a55e', '#64904c', '#82ad66', '#5d8746'][i % 4]; c.fillRect(Math.random() * w, Math.random() * h, 2, 3); } });
  TEX.grass.wrapS = TEX.grass.wrapT = THREE.RepeatWrapping;
  TEX.water = canvasTexture(256, 256, (c, w, h) => { c.fillStyle = '#4a7fa8'; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.08 + Math.random() * 0.2) + ')'; c.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 2); } });
  TEX.water.wrapS = TEX.water.wrapT = THREE.RepeatWrapping;
  TEX.asphalt = canvasTexture(256, 512, (c, w, h) => {
    c.fillStyle = '#3c3d42'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < 0.5 ? '#46474d' : '#323338'; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    c.fillStyle = '#e9e4d6'; c.fillRect(w / 2 - 4, 0, 8, h * 0.45); c.fillRect(6, 0, 5, h); c.fillRect(w - 11, 0, 5, h);
  });
  TEX.asphalt.wrapS = TEX.asphalt.wrapT = THREE.RepeatWrapping;
  TEX.ready = true;
}
