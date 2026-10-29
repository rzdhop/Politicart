// The gate to the select stage: preview.js and the modules only it needs
// (the hemicycle, its drag input) are a chunk of their own, loaded on demand
// (DEC-055, vite.config.js engine-stage), so the title paints before they
// are downloaded and parsed. game.js, the store and the screens call the
// stage through this module, which forwards to preview.js once it is here
// and does the sensible thing meanwhile: the canvas is cleared, a launch
// does not happen (there is no drawn stage to launch from), the podium and
// the frame callback are remembered and applied as soon as the chunk lands.
//
// The roster placeholders (DEC-045) live here, not in preview.js, so the
// sixteen tiles show at once whether or not the stage has loaded.
//
// Headless-safe: the game server never imports this, and nothing here
// touches the DOM at import.
import * as THREE from 'three';

import { CHARACTERS } from './data.js';
import { clearCanvas } from './render.js';
import { G } from './state.js';

let mod = null, loading = null;
/** Calls made before the chunk arrived, replayed in order once it has. */
const queued = [];

/** Start loading the stage chunk (once); resolves to preview.js's exports. */
export function loadStage() {
  if (!loading) {
    loading = import('./preview.js').then(m => {
      mod = m;
      for (const f of queued.splice(0)) f(m);
      return m;
    });
  }
  return loading;
}
/** Whether preview.js is loaded, so a caller may reach it synchronously. */
export const stageLoaded = () => !!mod;
function later(f) { queued.push(f); loadStage(); }

/** The screens that show the turntable (the select stage): the roster and the Garage. */
export const showsTurntable = state => state === 'select' || state === 'garage';

/** A frame's share of the title's warm-up (preview.js warmStage); while the chunk loads, loading is the warm-up. */
export function warmStage() { if (mod) return mod.warmStage(); loadStage(); return true; }
/** Draw the stage for this frame; the plain background until the chunk is here. */
export function renderPreview(dt) { if (mod) mod.renderPreview(dt); else { loadStage(); clearCanvas(); } }
/** Whether the "go" launch is armed or playing (preview.js launching). */
export const launching = () => (mod ? mod.launching() : false);
/** Play the launch (preview.js launch); nothing to launch from before the stage has drawn. */
export function launch() { return mod ? mod.launch() : false; }
/** The stage as its last frame drew it (preview.js stageInfo); null before it exists. */
export const stageInfo = () => (mod ? mod.stageInfo() : null);
/** Whether the stage exists yet (preview.js hasPreview). */
export const hasPreview = () => (mod ? mod.hasPreview() : false);
/** Put candidate `i` on the podium (preview.js setPreview); remembered until the chunk lands. */
export function setPreview(i, opts) { if (mod) mod.setPreview(i, opts); else later(m => m.setPreview(i, opts)); }
/** Register the stage frame callback (preview.js setPreviewFrame); remembered until the chunk lands. */
export function setPreviewFrame(fn) { if (mod) mod.setPreviewFrame(fn); else later(m => m.setPreviewFrame(fn)); }

/** "Jean-Luc Mélèche" → "JM": the first letters of the first and the last word. */
export function initials(name) {
  const words = String(name || '').split(/\s+/).filter(w => /\p{L}/u.test(w));
  if (!words.length) return '?';
  const first = w => (w.match(/\p{L}/u) || ['?'])[0].toUpperCase();
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

/** A placeholder tile: the kart's colour, a soft light, the candidate's initials. A data URL; '' headless. */
export function placeholder(def) {
  if (typeof document === 'undefined') return '';
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'); if (!c) return '';
  const col = '#' + new THREE.Color(def.kart).getHexString();
  c.fillStyle = col; c.fillRect(0, 0, S, S);
  const g = c.createRadialGradient(S * 0.5, S * 0.32, 4, S * 0.5, S * 0.45, S * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(12,18,48,.55)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.fillStyle = '#fffaf0'; c.font = '52px "Lilita One", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowOffsetY = 3;
  c.fillText(initials(def.name), S / 2, S * 0.42);
  return cv.toDataURL('image/png');
}

/**
 * The roster portraits, by candidate id, at once (preview.js makeThumbs).
 * Before the stage chunk is here: a placeholder per candidate, kept in
 * G.thumbs for preview.js to start from, and the listener is handed over
 * as soon as the chunk lands, which then renders the real portraits.
 */
export function makeThumbs(listener) {
  if (mod) return mod.makeThumbs(listener);
  const urls = { ...(G.thumbs || {}) };
  for (const def of CHARACTERS) if (!urls[def.id]) urls[def.id] = placeholder(def);
  G.thumbs = urls;
  later(m => m.makeThumbs(listener));
  return { ...urls };
}
