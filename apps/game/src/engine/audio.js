// Synthesised sound and music, through WebAudio.
//
// Self-contained: nothing outside calls into it except through initAudio,
// sfx, updateEngine, toggleMute and isMuted. The AudioContext is created
// lazily on the first user gesture, because browsers refuse to start one
// before that -- which is why initAudio is called from every button that can
// begin a game rather than at load.
import { G } from './state.js';

let AC = null, master = null, engineOsc = null, engineGain = null, muted = false, nextNoteTime = 0, noteIx = 0;
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
const MELODY = [[67, 1], [71, 1], [74, 1], [79, 2], [74, 1], [78, 1], [74, 1], [71, 1], [69, 3], [69, 1], [72, 1], [76, 1], [81, 2], [76, 1], [78, 1], [76, 1], [74, 1], [71, 3], [72, 1], [76, 1], [79, 1], [84, 2], [79, 1], [83, 1], [79, 1], [76, 1], [74, 3], [78, 1], [81, 1], [78, 1], [74, 1], [78, 1], [74, 1], [71, 1], [72, 1], [74, 1], [67, 3]];
const BASS = [[43, 50], [43, 50], [38, 45], [38, 45], [38, 45], [38, 45], [43, 50], [43, 50], [36, 43], [36, 43], [43, 50], [43, 50], [38, 45], [38, 45], [43, 50], [43, 50]];
export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = AC.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(AC.destination);
  engineOsc = AC.createOscillator(); engineOsc.type = 'sawtooth'; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  engineGain = AC.createGain(); engineGain.gain.value = 0; engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master); engineOsc.start();
  nextNoteTime = AC.currentTime + 0.1; noteIx = 0; scheduleMusic();
}
function playNote(midi, t, dur, type, vol) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = midiHz(midi); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); }
function scheduleMusic() {
  const beat = 60 / 168;
  while (nextNoteTime < AC.currentTime + 0.4) {
    const beatsSoFar = MELODY.slice(0, noteIx).reduce((a, n) => a + n[1], 0);
    const n = MELODY[noteIx]; playNote(n[0], nextNoteTime, n[1] * beat * 0.9, 'triangle', 0.12);
    for (let b = 0; b < n[1]; b++) { const absBeat = beatsSoFar + b; const bar = Math.floor(absBeat / 3) % BASS.length; const inBar = absBeat % 3; playNote(inBar === 0 ? BASS[bar][0] : BASS[bar][1] + (inBar === 2 ? 4 : 0), nextNoteTime + b * beat, beat * 0.5, inBar === 0 ? 'sine' : 'square', inBar === 0 ? 0.16 : 0.05); }
    nextNoteTime += n[1] * beat; noteIx = (noteIx + 1) % MELODY.length;
  }
  setTimeout(scheduleMusic, 120);
}
function playSfx(name) {
  if (!AC || muted) return; const t = AC.currentTime; const o = AC.createOscillator(), g = AC.createGain(); o.connect(g); g.connect(master);
  const env = (v, d) => { g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.start(t); o.stop(t + d + 0.02); };
  switch (name) {
    case 'boost': o.type = 'square'; o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.3); env(0.14, 0.35); break;
    case 'bump': o.type = 'triangle'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15); env(0.2, 0.18); break;
    case 'hit': o.type = 'sawtooth'; o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.5); env(0.22, 0.55); break;
    case 'box': o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.08); env(0.12, 0.2); break;
    case 'pick': o.type = 'square'; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(990, t + 0.07); o.frequency.setValueAtTime(1320, t + 0.14); env(0.1, 0.25); break;
    case 'drop': o.type = 'triangle'; o.frequency.setValueAtTime(220, t); env(0.12, 0.15); break;
    case 'throw': o.type = 'sawtooth'; o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(1800, t + 0.2); env(0.1, 0.22); break;
    case 'motion': o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.6); env(0.18, 0.7); break;
    case 'jump': o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35); env(0.12, 0.4); break;
    case 'helico': o.type = 'square'; o.frequency.setValueAtTime(80, t); o.frequency.linearRampToValueAtTime(140, t + 1.5); env(0.12, 1.6); break;
    case 'shield': o.type = 'sine'; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(659, t + 0.1); o.frequency.setValueAtTime(784, t + 0.2); o.frequency.setValueAtTime(1046, t + 0.3); env(0.14, 0.5); break;
    case 'lap': o.type = 'square'; o.frequency.setValueAtTime(784, t); o.frequency.setValueAtTime(1046, t + 0.12); env(0.1, 0.3); break;
    case 'count': o.type = 'square'; o.frequency.setValueAtTime(440, t); env(0.12, 0.2); break;
    case 'go': o.type = 'square'; o.frequency.setValueAtTime(880, t); env(0.16, 0.6); break;
    case 'finish': [0, 0.15, 0.3, 0.45].forEach((d, i) => { const o2 = AC.createOscillator(), g2 = AC.createGain(); o2.type = 'square'; o2.frequency.value = [523, 659, 784, 1046][i]; g2.gain.setValueAtTime(0.12, t + d); g2.gain.exponentialRampToValueAtTime(0.001, t + d + 0.4); o2.connect(g2); g2.connect(master); o2.start(t + d); o2.stop(t + d + 0.42); }); break;
    // ---- The Politibox (DEC-054): played from lootbox.js's timeline through sfx(), solo screen, no kart to route by.
    case 'box_drop': voice(t, 'triangle', 110, 38, 0.25, 0.28); voice(t, 'square', 70, 40, 0.08, 0.1); break;                        // the urn lands: a thud
    case 'box_rattle': o.type = 'square'; o.frequency.setValueAtTime(300, t); o.frequency.setValueAtTime(180, t + 0.03); o.frequency.setValueAtTime(260, t + 0.06); env(0.07, 0.1); break;
    case 'box_tease': o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.05); env(0.08, 0.12); break;   // one pulse of the build-up
    case 'box_burst': voice(t, 'sawtooth', 1400, 90, 0.45, 0.2); voice(t, 'square', 220, 60, 0.3, 0.1); break;                        // the lid flies
    case 'box_reveal_common': chord(t, 'triangle', [523, 659], 0.18, 0.3, 0.1); break;
    case 'box_reveal_rare': chord(t, 'square', [523, 659, 784], 0.12, 0.35, 0.1); break;
    case 'box_reveal_mythic': chord(t, 'square', [523, 659, 784, 1046, 1318], 0.11, 0.45, 0.11); chord(t, 'triangle', [262, 330], 0.3, 0.8, 0.08); break;
    case 'box_reveal_incredible': chord(t, 'square', [784, 784, 784, 1046], 0.14, 0.3, 0.14); voice(t + 0.56, 'square', 1318, 1318, 0.9, 0.14); voice(t + 0.56, 'triangle', 659, 659, 0.9, 0.1); break;   // a fanfare
    case 'coin_rain': for (let i = 0; i < 8; i++) voice(t + i * 0.06, 'sine', 1500 + ((i * 7919) % 1100), 2200 + ((i * 104729) % 600), 0.1, 0.06); break;
    // ---- The items' and powers' own (DEC-053), routed per kart through sfxFor like every race sound.
    case 'impact': voice(t, 'square', 190, 45, 0.18, 0.2); noise(t, 0.12, 0.22, 1800); break;                                         // a projectile or a hazard connects
    case 'swoosh': noise(t, 0.28, 0.16, 900, 3800); voice(t, 'triangle', 500, 1400, 0.2, 0.05); break;                               // something thrown
    case 'teleport': chord(t, 'sine', [523, 784, 1046, 1568, 2093], 0.04, 0.18, 0.08); voice(t, 'triangle', 2400, 300, 0.35, 0.05); break;
    case 'siren': for (let i = 0; i < 4; i++) voice(t + i * 0.16, 'square', i % 2 ? 880 : 660, i % 2 ? 880 : 660, 0.15, 0.06); break;   // the BRAV-M's two tones
    case 'gas': noise(t, 0.9, 0.14, 500, 260); voice(t, 'sine', 130, 90, 0.8, 0.05); break;                                            // a hiss settling
    case 'pans': for (let i = 0; i < 7; i++) { voice(t + i * 0.075, 'square', 1250 + (i % 3) * 230, 900, 0.07, 0.07); voice(t + i * 0.075, 'triangle', 2600 + (i % 2) * 400, 2400, 0.05, 0.04); } break;
    case 'gavel': [0, 0.17].forEach(d => { voice(t + d, 'triangle', 240, 80, 0.1, 0.32); noise(t + d, 0.04, 0.18, 2500); }); break;   // two knocks
    case 'stamp': voice(t, 'square', 140, 50, 0.12, 0.26); noise(t, 0.07, 0.16, 1200); break;                                           // a rubber stamp comes down
    case 'mow': voice(t, 'sawtooth', 95, 120, 0.9, 0.08); voice(t, 'square', 47, 60, 0.9, 0.05); noise(t, 0.9, 0.06, 3000, 1500); break;   // the mower's engine
    case 'euro': voice(t, 'sine', 1568, 1568, 0.12, 0.1); voice(t + 0.09, 'sine', 2093, 2093, 0.3, 0.1); for (let i = 0; i < 4; i++) voice(t + 0.12 + i * 0.05, 'triangle', 2600 + i * 180, 2300, 0.06, 0.04); break;   // the till
    case 'rally': chord(t, 'square', [392, 523, 659, 784], 0.08, 0.22, 0.09); voice(t + 0.32, 'triangle', 1046, 1046, 0.5, 0.08); break;   // a rally's fanfare
  }
}
/** Every sound the items and powers play besides the race's own, for the test: each a case above. */
export const ITEM_SOUNDS = Object.freeze(['impact', 'swoosh', 'teleport', 'siren', 'gas', 'pans', 'gavel', 'stamp', 'mow', 'euro', 'rally']);
let noiseBuf = null;
/** White noise from `t` for `dur` seconds through a band-pass at `f0` Hz (sweeping to `f1`), fading from `vol`. */
function noise(t, dur, vol, f0, f1 = f0) {
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = noiseBuf;
  f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
}
/** Every sound the Politibox plays, for the timeline's test: each a case above. */
export const BOX_SOUNDS = Object.freeze(['box_drop', 'box_rattle', 'box_tease', 'box_burst', 'box_reveal_common', 'box_reveal_rare', 'box_reveal_mythic', 'box_reveal_incredible', 'coin_rain']);
/** One oscillator of its own: `type` from f0 to f1 Hz over `dur` seconds, starting at `t`, fading from `vol`. */
function voice(t, type, f0, f1, dur, vol) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
/** An arpeggio: `notes` Hz one every `gap` seconds, each `dur` long. */
function chord(t, type, notes, gap, dur, vol) { notes.forEach((f, i) => voice(t + i * gap, type, f, f, dur, vol)); }
export function updateEngine() { if (!engineGain) return; const k = G.player; const racing = G.state === 'race' || G.state === 'countdown'; engineGain.gain.value = racing && !muted ? 0.045 + Math.abs(k.speed) / 900 : 0; engineOsc.frequency.value = 55 + Math.abs(k.speed) * 2.6 + (k.boost > 0 ? 60 : 0) + (k.fly > 0 ? 40 : 0); }
/**
 * Mute or unmute, returning the new state.
 *
 * The original wrote the title screen's button text from in here. Returning
 * the state instead keeps this module free of the DOM, and leaves one place --
 * game.js -- that knows what the button says.
 */
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

/** Whether sound is currently muted. */
export const isMuted = () => muted;

// ---------- Routing by kart (DEC-014) ----------
// sfx(name) is heard by everyone in the race; sfxFor(k, name) only by kart
// k's driver -- the old `if (k === G.player) sfx(...)` and `if (!k.isAI)`
// checks. With no sink installed both play here, which is solo play. The
// game server installs a sink and forwards each sound to the right sockets.
let sink = null;

/** Route every sound to `fn(name, kartOrNull)` instead of playing it. Pass null to restore. */
export function setSfxSink(fn) { sink = typeof fn === 'function' ? fn : null; }

/** A sound for everyone in the race. Silent while a networked client replays its kart (DEC-052): the server sends the sound once. */
export function sfx(name) { if (G.replaying) return; if (sink) sink(name, null); else playSfx(name); }

/** A sound for kart k's driver only. Silent for AI karts, and while replaying. */
export function sfxFor(k, name) {
  if (!k || k.isAI || G.replaying) return;
  if (sink) sink(name, k); else if (k === G.player) playSfx(name);
}
