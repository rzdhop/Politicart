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

import * as account from '../engine/account.js';
import { initAudio, isMuted, toggleMute as toggleAudioMute } from '../engine/audio.js';
import { applyCustom, resetCustom, saveCustom } from '../engine/custom.js';
import { resetGarage, setGarage } from '../engine/garage.js';
import { getState, onTransition, transition } from '../engine/machine.js';
import * as net from '../engine/net.js';
import { isNetRace, onNetResults, pressItem, pressPower } from '../engine/netrace.js';
import { useItem as engineUseItem } from '../engine/items.js';
import { usePower as engineUsePower } from '../engine/powers.js';
import { CHARACTERS } from '../engine/data.js';
import { hasPreview, makeThumbs, setPreview } from '../engine/preview.js';
import { STARTERS } from '../engine/progress.js';
import { startRace } from '../engine/race.js';
import { G, getPoly, togglePoly as toggleEnginePoly } from '../engine/state.js';

export type GameState = 'title' | 'select' | 'tracks' | 'admin' | 'countdown' | 'race' | 'paused' | 'results' | 'lobby' | 'account' | 'garage';
export type TeamId = 'bleu' | 'rouge';

/** One player in a team-race room, as the game server describes it. */
export interface LobbyPlayer { id: string; name: string; team: TeamId; charId: string; ready: boolean; userId?: string | null; level?: number | null; guest?: boolean }
/** A team-race room: its code, host, circuit and players (DEC-014). */
export interface RoomView { code: string; host: string | null; trackIdx: number; phase: 'lobby' | 'race'; players: LobbyPlayer[] }
/** One line of the friend list: a friend, or a request either way. */
export interface Friend { id: string; name: string; level: number; status: 'friend' | 'incoming' | 'outgoing'; online: boolean; room: string | null }
/** An invitation into a friend's room. */
export interface Invite { from: { id: string; name: string }; code: string }
/** The connection to the game server. */
export interface NetView {
  status: 'idle' | 'connecting' | 'open' | 'closed'; id: string | null; room: RoomView | null; error: string | null;
  friends: Friend[]; invite: Invite | null; notice: string | null;
}
/** An account as the server describes it (engine/progress.js profileOf). */
export interface Profile { id: string; name: string; xp: number; level: number; xpInto: number; xpNext: number; unlocked: string[]; admin?: true }
/** What the account API answers (engine/account.js). */
type AuthReply = { ok: boolean; status: number; error?: string; token?: string; profile?: Profile; gained?: number };

/** What the last race earned, for the results screen. */
export interface Gain { gained: number; level: number; levelUp: boolean; unlockedNow: string[] }
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
  /** The logged-in account, or null for a guest. */
  account: { token: string; profile: Profile } | null;
  /** A login or sign-up is on its way. */
  accountBusy: boolean;
  /** Why the last login or sign-up failed. */
  accountError: string | null;
  /** What the last race earned the account, until the next race starts. */
  lastGain: Gain | null;
}

export interface NetRankRow { slot: number; name: string; charId: string; team: TeamId | null; isAI: boolean; rank: number; finished: boolean; time: number | null; bestLap: number | null; points: number }
export interface NetTeamRow { team: TeamId; name: string; points: number; drivers: number[] }
/** What the server reports when a team race ends, and which slot was ours. */
export interface NetResults { ranking: NetRankRow[]; teams: NetTeamRow[]; you: number; error?: boolean }

// The lobby name lives under its own key, so resetting the workshop keeps it.
function loadName(): string { try { return JSON.parse(localStorage.getItem('kr-net') || '{}').name || ''; } catch { return ''; } }
function saveName(name: string) { try { localStorage.setItem('kr-net', JSON.stringify({ name })); } catch { /* storage full or blocked: the name is just not remembered */ } }
// The session token, so a returning player is still logged in. Nothing else about the account is kept here.
function loadToken(): string | null { try { return JSON.parse(localStorage.getItem('kr-account') || '{}').token || null; } catch { return null; } }
function saveToken(token: string | null) { try { if (token) localStorage.setItem('kr-account', JSON.stringify({ token })); else localStorage.removeItem('kr-account'); } catch { /* blocked: the session lasts for this page only */ } }

/** The candidate ids this player may drive: the account's unlocks, or the starters for a guest. */
export function unlockedOf(ui: Pick<UiSnapshot, 'account'>): string[] {
  return ui.account ? ui.account.profile.unlocked : [...STARTERS];
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
  garageVersion: 0,
  noteHidden: false,
  netAvailable: false,
  net: net.getNet() as NetView,
  netName: loadName(),
  netResults: null,
  account: null,
  accountBusy: false,
  accountError: null,
  lastGain: null,
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
/** Whether the race on screen was started solo (actions.start), not by the game server. */
let soloRace = false;

onTransition((to: string, from: string) => {
  const patch: Partial<UiSnapshot> = { state: to as GameState };
  if (to === 'countdown' && from !== 'paused') { patch.noteHidden = true; patch.lastGain = null; }
  set(patch);
  // A solo race just ended: the account earns its experience (a team race's comes from the server).
  if (to === 'lobby') soloRace = false;
  if (to === 'results' && from === 'race' && soloRace) reportSoloRace();
});

net.onNet((view: NetView) => set({ net: view }));
onNetResults((r: NetResults) => set({ netResults: r }));

/** A new profile from the server: keep it, and note what the race it follows earned. */
function takeProfile(profile: Profile, gained: number) {
  const before = snapshot.account?.profile;
  if (!snapshot.account) return;
  const patch: Partial<UiSnapshot> = { account: { token: snapshot.account.token, profile } };
  if (gained > 0) {
    const had = new Set(before?.unlocked ?? []);
    patch.lastGain = { gained, level: profile.level, levelUp: !!before && profile.level > before.level, unlockedNow: profile.unlocked.filter(id => !had.has(id)) };
  }
  set(patch);
}

// The server says who this connection is: a fresh profile, or nobody (the session expired).
net.onProfile((profile: Profile | null, gained: number) => {
  if (!snapshot.account) return;
  if (!profile) { saveToken(null); set({ account: null }); keepCharUnlocked(); return; }
  takeProfile(profile, gained);
});

function reportSoloRace() {
  const acc = snapshot.account; const k = G.player as unknown as { rank: number; finished: boolean } | null; if (!acc || !k) return;
  account.reportRace(acc.token, { rank: k.rank, field: G.karts.length, finished: !!k.finished }, { base: remoteServer })
    .then((r: AuthReply) => { if (r.ok && r.profile) takeProfile(r.profile, r.gained ?? 0); });
}

/** After logging out (or a lost session), fall back to a candidate a guest may drive. */
function keepCharUnlocked() {
  const allowed = unlockedOf(snapshot);
  const cur = (CHARACTERS as { id: string }[])[G.charIdx];
  if (!cur || !allowed.includes(cur.id)) { G.charIdx = 0; set({ charIdx: 0 }); }
}

/** Logged in: keep the account, remember the token, and say hello on the socket so friends see us. */
function signedIn(token: string, profile: Profile) {
  saveToken(token);
  set({ account: { token, profile }, accountBusy: false, accountError: null, netName: profile.name });
  net.connect(socketUrl(), profile.name, token);
}

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
    keepCharUnlocked();
    set({ netResults: null });
    const thumbs = makeThumbs() as Record<string, string>;
    set({ thumbs });
    transition('select');
    setPreview(G.charIdx);
  },
  selectChar(i: number) {
    const c = (CHARACTERS as { id: string }[])[i];
    if (!c || !unlockedOf(snapshot).includes(c.id)) return;      // locked: the tile says at which level
    G.charIdx = i;
    setPreview(i);
    set({ charIdx: i });
  },
  /** The arrow keys on the roster: the next candidate this way that the player may drive. */
  stepChar(dir: 1 | -1) {
    const ids = (CHARACTERS as { id: string }[]).map(c => c.id); const allowed = unlockedOf(snapshot);
    for (let n = 1; n <= ids.length; n++) {
      const i = (G.charIdx + dir * n + ids.length * 2) % ids.length;
      if (allowed.includes(ids[i]!)) { actions.selectChar(i); return; }
    }
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
    soloRace = true;
    set({ netResults: null });
    startRace();
  },
  pause() { transition('paused'); },
  resume() { transition(G.countdown > 0 ? 'countdown' : 'race'); },
  /** Use the held item: the keyboard's Ctrl/E and the touch OBJET button. In a team race the server resolves it. */
  useItem() { if (getState() !== 'race') return; if (isNetRace()) pressItem(); else engineUseItem(G.player); },
  /** Fire the special power: the keyboard's F/Shift and the touch POUVOIR button. */
  usePower() { if (getState() !== 'race') return; if (isNetRace()) pressPower(); else engineUsePower(G.player); },
  /** Pause from the touch HUD; a team race cannot be paused. */
  pauseIfSolo() { const st = getState(); if (!isNetRace() && (st === 'race' || st === 'countdown')) transition('paused'); },

  // ---- Team races (DEC-014) ----
  /**
   * Ask the game server (this origin, or the remote one) whether it is up;
   * shows the Multijoueur and account buttons if so, and restores a saved
   * session.
   */
  detectServer() {
    net.probeServer(globalThis.fetch, remoteServer).then((ok: boolean) => {
      set({ netAvailable: ok });
      const token = loadToken();
      if (!ok || !token) return;
      account.me(token, { base: remoteServer }).then((r: AuthReply) => {
        if (r.ok && r.profile) signedIn(token, r.profile);
        else if (r.status === 401) saveToken(null);               // expired; a network failure keeps it for next time
      });
    });
  },
  /** "Multijoueur": open the lobby and connect. */
  multiplayer() {
    initAudio();
    transition('lobby');
    net.connect(socketUrl(), snapshot.netName, snapshot.account?.token ?? null);
  },
  setNetName(name: string) { saveName(name); set({ netName: name }); },
  createRoom() { if (!snapshot.account) return; net.connect(socketUrl(), snapshot.netName, snapshot.account.token); net.createRoom(); },
  joinRoom(code: string) { net.connect(socketUrl(), snapshot.netName, snapshot.account?.token ?? null); net.joinRoom(code); },
  setTeam(team: TeamId) { net.setMine({ team }); },
  setChar(charId: string) { net.setMine({ charId }); },
  setReady(ready: boolean) { net.setMine({ ready }); },
  pickTrack(i: number) { net.pickTrack(i); },
  startNetRace() { initAudio(); net.startNetRace(); },
  leaveRoom() { net.leaveRoom(); },
  /** From a team race's results back to the room. */
  backToLobby() { transition('lobby'); },
  /** Back to the title: leave the room; a guest also hangs up, an account stays online for its friends. */
  lobbyBack() {
    if (snapshot.account) { if (snapshot.net.room) net.leaveRoom(); net.clearMessages(); } else net.disconnect();
    transition('title');
  },

  // ---- Accounts and friends ----
  openAccount() { initAudio(); net.clearMessages(); set({ accountError: null }); transition('account'); },
  closeAccount() { net.clearMessages(); transition('title'); },
  async logIn(name: string, password: string) {
    set({ accountBusy: true, accountError: null });
    const r: AuthReply = await account.login(name.trim(), password, { base: remoteServer });
    if (r.ok && r.token && r.profile) signedIn(r.token, r.profile); else set({ accountBusy: false, accountError: r.error ?? 'Connexion impossible.' });
  },
  async signUp(name: string, password: string) {
    set({ accountBusy: true, accountError: null });
    const r: AuthReply = await account.register(name.trim(), password, { base: remoteServer });
    if (r.ok && r.token && r.profile) signedIn(r.token, r.profile); else set({ accountBusy: false, accountError: r.error ?? 'Inscription impossible.' });
  },
  logOut() {
    const acc = snapshot.account; if (!acc) return;
    account.logout(acc.token, { base: remoteServer });
    saveToken(null);
    set({ account: null, lastGain: null, netName: '' });
    net.disconnect();
    keepCharUnlocked();
  },
  addFriend(name: string) { if (name.trim()) net.addFriend(name.trim()); },
  acceptFriend(id: string) { net.acceptFriend(id); },
  removeFriend(id: string) { net.removeFriend(id); },
  inviteFriend(id: string) { net.inviteFriend(id); },
  /** Join the room a friend invited us into, from whichever menu is on screen. */
  acceptInvite() {
    const inv = snapshot.net.invite; if (!inv) return;
    net.clearInvite();
    const st = getState();
    if (st === 'tracks') transition('select');
    if (getState() === 'select' || getState() === 'admin' || (getState() === 'results' && !isNetRace())) transition('title');
    if (getState() === 'title' || getState() === 'account') transition('lobby');
    if (getState() !== 'lobby') return;
    net.connect(socketUrl(), snapshot.netName, snapshot.account?.token ?? null);
    net.joinRoom(inv.code);
  },
  dismissInvite() { net.clearInvite(); },
};
