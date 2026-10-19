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
import { beginDraft, clearDraft, getDraft, setRoster } from '../engine/custom.js';
import { resetGarage, setGarage } from '../engine/garage.js';
import { getState, onTransition, transition } from '../engine/machine.js';
import * as net from '../engine/net.js';
import { onNetResults } from '../engine/netrace.js';
import { hasPreview, makeThumbs, setPreview } from '../engine/preview.js';
import { startRace } from '../engine/race.js';
import { G, getPoly, togglePoly as toggleEnginePoly } from '../engine/state.js';

export type GameState = 'title' | 'select' | 'tracks' | 'admin' | 'countdown' | 'race' | 'paused' | 'results' | 'lobby' | 'garage' | 'login';
export type TeamId = 'bleu' | 'rouge';

/** One player in a team-race room, as the game server describes it. */
export interface LobbyPlayer { id: string; name: string; team: TeamId; charId: string; ready: boolean }
/** A team-race room: its code, host, circuit and players (DEC-014). */
export interface RoomView { code: string; host: string | null; trackIdx: number; phase: 'lobby' | 'race'; players: LobbyPlayer[] }
/** The connection to the game server. */
export interface NetView { status: 'idle' | 'connecting' | 'open' | 'closed'; id: string | null; room: RoomView | null; error: string | null }
/** What the title screen's workshop button says: whether the last workshop save went through. */
export type AdminStatus = 'idle' | 'saved';

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
  /** The game server has an admin account (KR_ADMIN_PASSWORD_HASH set). */
  adminEnabled: boolean;
  /** This browser holds an admin session: the workshop is on offer. */
  admin: boolean;
  /** A login or save request is in flight; its button is disabled meanwhile. */
  adminBusy: boolean;
  /** Why the last login failed, in the server's words, or why it is needed again. */
  loginError: string | null;
  /** Why the last workshop save failed (the server names the field), or null. */
  adminError: string | null;
  /** Bumped whenever the workshop form must re-read the characters (open, reset). */
  formVersion: number;
  /** Bumped whenever the campaign posters change. */
  adsVersion: number;
  /** Bumped whenever the player's Garage edits change, so the form re-reads them. */
  garageVersion: number;
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
  adminEnabled: false,
  admin: false,
  adminBusy: false,
  loginError: null,
  adminError: null,
  formVersion: 0,
  adsVersion: 0,
  garageVersion: 0,
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

const socketUrl = () => net.serverUrl(window.location);

function refreshPreview() {
  if (hasPreview()) setPreview(G.charIdx);
}

/**
 * Put the server's roster in force, then redraw what shows the cast: the
 * roster portraits (rendered again if the roster is on screen, else on the
 * next "Jouer"), the turntable, the Garage, and the workshop form unless the
 * admin is in the middle of editing it.
 */
function applyRoster(roster: unknown) {
  setRoster(roster);
  const patch: Partial<UiSnapshot> = { garageVersion: snapshot.garageVersion + 1 };
  if (snapshot.state === 'select' || snapshot.state === 'garage') patch.thumbs = makeThumbs() as Record<string, string>;
  if (snapshot.state !== 'admin') { patch.formVersion = snapshot.formVersion + 1; patch.adsVersion = snapshot.adsVersion + 1; }
  refreshPreview();
  set(patch);
}

/**
 * Whether the next successful login goes back to the draft the admin was
 * saving when the session expired, rather than starting a fresh one.
 */
let resumeDraft = false;

/** Open the workshop form on the draft, re-read into fresh inputs. */
function enterWorkshop() {
  set({ formVersion: snapshot.formVersion + 1, adsVersion: snapshot.adsVersion + 1, adminError: null });
  transition('admin');
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
  // ---- Admin: login and the workshop (server build only) ----
  /** "Administration": the login screen. */
  openLogin() {
    resumeDraft = false;
    set({ loginError: null });
    transition('login');
  },
  /**
   * Log in. The password is handed straight to the request and kept nowhere;
   * the screen clears its field. On success, straight to the workshop.
   */
  async login(user: string, password: string) {
    if (snapshot.adminBusy) return;
    set({ adminBusy: true, loginError: null });
    const r = await net.adminLogin(user, password);
    if (!r.ok) { set({ adminBusy: false, loginError: r.error }); return; }
    set({ adminBusy: false, admin: true, adminEnabled: true, loginError: null });
    if (!resumeDraft) beginDraft();
    resumeDraft = false;
    if (getState() === 'login') enterWorkshop();
  },
  /** Back to the title from the login; an expired session's draft is dropped. */
  loginBack() {
    resumeDraft = false;
    set({ loginError: null });
    transition('title');
  },
  /** "Déconnexion": end the session; the workshop button goes with it. */
  async logout() {
    await net.adminLogout();
    const me = await net.fetchAdmin();
    set({ admin: me.admin, adminEnabled: me.enabled, adminStatus: 'idle' });
  },
  /** The workshop, on a fresh draft of the cast in force. Only for an admin. */
  openAdmin() {
    if (!snapshot.admin) return;
    beginDraft();
    enterWorkshop();
  },
  /**
   * Send the draft to the server. Accepted, the stored roster is put in force
   * for this player (every other player gets it on their next load) and the
   * workshop closes. Refused, the workshop stays open with the server's reason,
   * except for an expired session, which goes to the login and back.
   */
  async saveAdmin() {
    if (snapshot.adminBusy) return;
    set({ adminBusy: true, adminError: null });
    const r = await net.saveRoster(getDraft());
    set({ adminBusy: false });
    if (r.ok) {
      applyRoster(r.roster);
      if (getState() === 'admin') transition('title');
      set({ adminStatus: 'saved' });
      return;
    }
    if (r.status === 401) {
      resumeDraft = true;
      set({ admin: false, loginError: 'Session expirée : reconnectez-vous pour enregistrer vos modifications.' });
      if (getState() === 'admin') transition('login');
      return;
    }
    set({ adminError: r.error });
  },
  /** Back to the default cast, in the form only: nothing changes for anyone until it is saved. */
  resetAdmin() {
    clearDraft();
    set({ formVersion: snapshot.formVersion + 1, adsVersion: snapshot.adsVersion + 1, adminError: null });
  },
  adsChanged() {
    set({ adsVersion: snapshot.adsVersion + 1 });
  },
  toTitle() { transition('title'); },
  toSelect() { transition('select'); },

  // ---- Garage: the player's own kart ----
  openGarage() { transition('garage'); setPreview(G.charIdx); },
  /** Change one field of the player's kart; an invalid value is ignored. */
  setGarage(key: string, value: unknown) {
    if (!setGarage(key, value)) return;
    setPreview(G.charIdx);
    set({ garageVersion: snapshot.garageVersion + 1 });
  },
  resetGarage() {
    resetGarage();
    setPreview(G.charIdx);
    set({ garageVersion: snapshot.garageVersion + 1 });
  },
  toTracks() { transition('tracks'); },
  start() {
    initAudio();
    set({ netResults: null });
    startRace();
  },
  pause() { transition('paused'); },
  resume() { transition(G.countdown > 0 ? 'countdown' : 'race'); },

  // ---- Team races (DEC-014) ----
  /**
   * Ask the page's origin whether it is the game server. If so: the
   * Multijoueur button, the admin's cast, and the admin's login or workshop.
   * The static build (GitHub Pages) keeps the default cast and offers neither.
   */
  async detectServer() {
    const ok = await net.probeServer();
    if (!ok) { set({ netAvailable: false, adminEnabled: false, admin: false }); return; }
    set({ netAvailable: true });
    const [roster, me] = await Promise.all([net.fetchRoster(), net.fetchAdmin()]);
    if (roster) applyRoster(roster);
    set({ adminEnabled: me.enabled, admin: me.admin });
  },
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
