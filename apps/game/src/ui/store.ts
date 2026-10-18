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
import * as net from '../engine/net.js';
import { onNetResults } from '../engine/netrace.js';
import { hasPreview, makeThumbs, setPreview } from '../engine/preview.js';
import { startRace } from '../engine/race.js';
import { G, getPoly, togglePoly as toggleEnginePoly } from '../engine/state.js';

export type GameState = 'title' | 'select' | 'tracks' | 'admin' | 'countdown' | 'race' | 'paused' | 'results' | 'lobby';
export type TeamId = 'bleu' | 'rouge';

/** One player in a team-race room, as the game server describes it. */
export interface LobbyPlayer { id: string; name: string; team: TeamId; charId: string; ready: boolean }
/** A team-race room: its code, host, circuit and players (DEC-014). */
export interface RoomView { code: string; host: string | null; trackIdx: number; phase: 'lobby' | 'race'; players: LobbyPlayer[] }
/** The connection to the game server. */
export interface NetView { status: 'idle' | 'connecting' | 'open' | 'closed'; id: string | null; room: RoomView | null; error: string | null }
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
  /** Whether the page was served by the game server, so team races are possible. */
  netAvailable: boolean;
  net: NetView;
  /** The name shown to the other players, remembered in this browser. */
  netName: string;
  /** The last team race's results, until a solo race starts. */
  netResults: NetResults | null;
}

export interface NetRankRow { slot: number; name: string; charId: string; team: TeamId | null; isAI: boolean; rank: number; finished: boolean; time: number | null; bestLap: number | null; points: number }
export interface NetTeamRow { team: TeamId; name: string; points: number; drivers: number[] }
/** What the server reports when a team race ends, and which slot was ours. */
export interface NetResults { ranking: NetRankRow[]; teams: NetTeamRow[]; you: number; error?: boolean }

// The lobby name lives under its own key, so resetting the workshop keeps it.
function loadName(): string { try { return JSON.parse(localStorage.getItem('kr-net') || '{}').name || ''; } catch { return ''; } }
function saveName(name: string) { try { localStorage.setItem('kr-net', JSON.stringify({ name })); } catch { /* storage full or blocked: the name is just not remembered */ } }

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
  netAvailable: false,
  net: net.getNet() as NetView,
  netName: loadName(),
  netResults: null,
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

net.onNet((view: NetView) => set({ net: view }));
onNetResults((r: NetResults) => set({ netResults: r }));

// The game server to use when the page is not served by it: set at build time
// (the Pages workflow passes the KR_SERVER_URL repository variable). Empty
// means the page's own origin, as with `npm run serve`.
const remoteServer: string = import.meta.env.VITE_KR_SERVER ?? '';
const socketUrl = () => net.serverUrl(window.location, remoteServer);

function refreshPreview() {
  if (hasPreview()) setPreview(G.charIdx);
}

export const actions = {
  /** "Jouer": render the portraits, open the roster, put the chosen kart on the turntable. */
  play() {
    initAudio();
    set({ netResults: null });
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
    set({ netResults: null });
    startRace();
  },
  pause() { transition('paused'); },
  resume() { transition(G.countdown > 0 ? 'countdown' : 'race'); },

  // ---- Team races (DEC-014) ----
  /** Ask the game server (this origin, or the remote one) whether it is up; shows the Multijoueur button if so. */
  detectServer() { net.probeServer(globalThis.fetch, remoteServer).then((ok: boolean) => set({ netAvailable: ok })); },
  /** "Multijoueur": open the lobby and connect. */
  multiplayer() {
    initAudio();
    transition('lobby');
    net.connect(socketUrl(), snapshot.netName);
  },
  setNetName(name: string) { saveName(name); set({ netName: name }); },
  createRoom() { net.connect(socketUrl(), snapshot.netName); net.createRoom(); },
  joinRoom(code: string) { net.connect(socketUrl(), snapshot.netName); net.joinRoom(code); },
  setTeam(team: TeamId) { net.setMine({ team }); },
  setChar(charId: string) { net.setMine({ charId }); },
  setReady(ready: boolean) { net.setMine({ ready }); },
  pickTrack(i: number) { net.pickTrack(i); },
  startNetRace() { initAudio(); net.startNetRace(); },
  leaveRoom() { net.leaveRoom(); },
  /** From a team race's results back to the room. */
  backToLobby() { transition('lobby'); },
  /** Back to the title: leave the room and hang up. */
  lobbyBack() { net.disconnect(); transition('title'); },
};
