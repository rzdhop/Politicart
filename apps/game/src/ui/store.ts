// The UI store: what the React screens read, and the actions they call.
//
// A thin external store over the engine. The screens never touch `G` or the
// machine directly; they read one immutable snapshot through useUi() and call
// the actions below, which do what the single-file game's button handlers
// did -- in the same order -- and then publish a new snapshot. The machine is
// still the source of truth for `state`: the store subscribes to it at load
// and mirrors every accepted transition.
//
// Everything in the snapshot is menu state. Nothing here updates during a
// race: the HUD is driven imperatively by game.js from the engine's frame
// payload, on purpose (see the plan's 60 fps finding and stage 13).
import { useSyncExternalStore } from 'react';

import { initAudio, isMuted, toggleMute as toggleAudioMute } from '../engine/audio.js';
import { applyCustom, resetCustom, saveCustom } from '../engine/custom.js';
import { getState, onTransition, transition } from '../engine/machine.js';
import { hasPreview, makeThumbs, setPreview } from '../engine/preview.js';
import { startRace } from '../engine/race.js';
import { G, getPoly, togglePoly as toggleEnginePoly } from '../engine/state.js';

export type GameState = 'title' | 'select' | 'tracks' | 'admin' | 'countdown' | 'race' | 'paused' | 'results';
export type AdminStatus = 'idle' | 'saved' | 'full';

export interface UiSnapshot {
  state: GameState;
  charIdx: number;
  trackIdx: number;
  /** Roster portraits by character id, rendered by the engine on entering the roster. */
  thumbs: Record<string, string>;
  poly: 'high' | 'low';
  muted: boolean;
  /** What the title screen's workshop button says after a save attempt. */
  adminStatus: AdminStatus;
  /** Bumped whenever the workshop form must re-read the characters (open, reset). */
  formVersion: number;
  /** Bumped whenever the campaign posters change. */
  adsVersion: number;
  /** The "play on a computer" note: shown until the first race starts, then never again. */
  noteHidden: boolean;
}

let snapshot: UiSnapshot = {
  state: getState() as GameState,
  charIdx: G.charIdx,
  trackIdx: G.trackIdx,
  thumbs: {},
  poly: getPoly() as 'high' | 'low',
  muted: isMuted(),
  adminStatus: 'idle',
  formVersion: 0,
  adsVersion: 0,
  noteHidden: false,
};

const listeners = new Set<() => void>();

function set(patch: Partial<UiSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const fn of listeners) fn();
}

export const getSnapshot = () => snapshot;

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The screens' view of the game. Re-renders on every store change. */
export function useUi(): UiSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// The machine is the source of truth for `state`; mirror it.
onTransition((to: string, from: string) => {
  const patch: Partial<UiSnapshot> = { state: to as GameState };
  if (to === 'countdown' && from !== 'paused') patch.noteHidden = true;
  set(patch);
});

function refreshPreview() {
  if (hasPreview()) setPreview(G.charIdx);
}

export const actions = {
  /** "Jouer": render the portraits, open the roster, put the chosen kart on the turntable. */
  play() {
    initAudio();
    const thumbs = makeThumbs() as Record<string, string>;
    set({ thumbs });
    transition('select');
    setPreview(G.charIdx);
  },
  selectChar(i: number) {
    G.charIdx = i;
    setPreview(i);
    set({ charIdx: i });
  },
  selectTrack(i: number) {
    G.trackIdx = i;
    set({ trackIdx: i });
  },
  togglePoly() {
    const poly = toggleEnginePoly() as 'high' | 'low';
    refreshPreview();
    set({ poly });
  },
  /** The title button initialises audio first; the M key, as in the original, does not. */
  toggleMute(fromButton: boolean) {
    if (fromButton) initAudio();
    toggleAudioMute();
    set({ muted: isMuted() });
  },
  openAdmin() {
    set({ formVersion: snapshot.formVersion + 1 });
    transition('admin');
  },
  saveAdmin() {
    applyCustom();
    const ok = saveCustom();
    refreshPreview();
    transition('title');
    set({ adminStatus: ok ? 'saved' : 'full' });
  },
  resetAdmin() {
    resetCustom();
    refreshPreview();
    set({ formVersion: snapshot.formVersion + 1, adsVersion: snapshot.adsVersion + 1 });
  },
  adsChanged() {
    set({ adsVersion: snapshot.adsVersion + 1 });
  },
  toTitle() { transition('title'); },
  toSelect() { transition('select'); },
  toTracks() { transition('tracks'); },
  start() {
    initAudio();
    startRace();
  },
  pause() { transition('paused'); },
  resume() { transition(G.countdown > 0 ? 'countdown' : 'race'); },
};
