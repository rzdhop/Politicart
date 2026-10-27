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
import { beginDraft, clearDraft, getDraft, setRoster } from '../engine/custom.js';
import { emptyOwned } from '../engine/catalog.js';
import { getGarage, resetGarage, setGarage, setOwned } from '../engine/garage.js';
import { playOpening, skipOpening as skipBoxOpening, stopOpening } from '../engine/lootbox.js';
import { canTransition, getState, onTransition, transition } from '../engine/machine.js';
import * as net from '../engine/net.js';
import { isNetRace, onNetResults, pressItem, pressPower } from '../engine/netrace.js';
import { applyGodCommand } from '../engine/godcmd.js';
import { useItem as engineUseItem } from '../engine/items.js';
import { usePower as engineUsePower } from '../engine/powers.js';
import { CHARACTERS, TRACKS } from '../engine/data.js';
import { hasPreview, makeThumbs, setPreview } from '../engine/preview.js';
import { STARTERS } from '../engine/progress.js';
import { startRace } from '../engine/race.js';
import { G, getPoly, togglePoly as toggleEnginePoly } from '../engine/state.js';
import type { KartStyle } from './types';

export type GameState = 'title' | 'select' | 'tracks' | 'admin' | 'countdown' | 'race' | 'paused' | 'results' | 'lobby' | 'account' | 'garage' | 'dashboard' | 'shop' | 'lootbox';
export type TeamId = 'bleu' | 'rouge';

/**
 * One player in a team-race room, as the game server describes it. A god (the
 * admin, DEC-030) has no team. `style` is their Garage edits as the server
 * kept them (cleaned, owned), so the lobby can name their trail (DEC-036).
 */
export interface LobbyPlayer { id: string; name: string; team: TeamId | null; charId: string; ready: boolean; userId?: string | null; level?: number | null; guest?: boolean; god?: boolean; style?: Partial<KartStyle> }
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
/** What an account holds beyond the commons (engine/catalog.js): candidate ids, part keys ('wheels:gold'), trail ids. */
export interface Owned { chars: string[]; parts: string[]; trails: string[] }
/**
 * An account's race and economy counters, as the server keeps them
 * (apps/server/src/economy.js normaliseStats). The best lap and time are per
 * circuit id, in seconds; a profile may carry a partial or empty object, so
 * read it through statsOf().
 */
export interface Stats {
  races: number; wins: number; podiums: number; finished: number; dnf: number; solo: number; team: number; teamWins: number;
  boxes: number; coinsEarned: number; coinsSpent: number;
  bestLap: Record<string, number>; bestTime: Record<string, number>; byChar: Record<string, number>;
  drops: Record<string, number>; lastDaily: string | null; lastRaceAt: number | null;
}
/** How much of the catalogue an account holds (engine/catalog.js collection). */
export interface Collection { have: number; total: number; pct: number }
/** A friend's figures, as GET /api/stats/friends lists them. */
export interface FriendStats { id: string; name: string; level: number; stats: Partial<Stats>; collection: Collection }
/**
 * An account as the server describes it (engine/progress.js profileOf):
 * `unlocked` is what it may drive, `reachable` what its level lets it buy
 * (DEC-034), `coins` its politicoins, `owned` its inventory, `stats` its counters.
 */
export interface Profile {
  id: string; name: string; xp: number; level: number; xpInto: number; xpNext: number;
  reachable: string[]; unlocked: string[]; coins: number; owned: Owned; stats: Partial<Stats>; admin?: true;
}

const COUNTERS = ['races', 'wins', 'podiums', 'finished', 'dnf', 'solo', 'team', 'teamWins', 'boxes', 'coinsEarned', 'coinsSpent'] as const;
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const numbers = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  return out;
};

/** A profile's stats with every counter present: zeros and empty tables for whatever the server left out. */
export function statsOf(s: Partial<Stats> | null | undefined): Stats {
  const src = (s ?? {}) as Record<string, unknown>;
  const out = {} as Record<string, unknown>;
  for (const k of COUNTERS) out[k] = count(src[k]);
  out.bestLap = numbers(src.bestLap); out.bestTime = numbers(src.bestTime); out.byChar = numbers(src.byChar); out.drops = numbers(src.drops);
  out.lastDaily = typeof src.lastDaily === 'string' ? src.lastDaily : null;
  out.lastRaceAt = typeof src.lastRaceAt === 'number' ? src.lastRaceAt : null;
  return out as unknown as Stats;
}
/** The bonuses a race paid on top (economy.js settleRace). */
export interface Bonus { daily: boolean; levelUp: boolean; levelUpCoins: number }
/** What the account API answers (engine/account.js). */
type AuthReply = { ok: boolean; status: number; error?: string; token?: string; profile?: Profile; gained?: number; coins?: number; bonus?: Bonus };

/** What the last race earned, for the results screen: experience, politicoins (daily and level-up bonuses included), a level, candidates. */
export interface Gain { gained: number; coins: number; daily: boolean; levelUpCoins: number; level: number; levelUp: boolean; unlockedNow: string[] }

/** The kart this screen drives in the race on screen (or the last one): its candidate and the full style it was built with. */
export interface RaceKart { charId: string; style: KartStyle }

export type Grade = 'common' | 'rare' | 'mythic' | 'incredible';
/** What a Politibox held (engine/catalog.js rollBox): politicoins, or an item, refunded when it was already owned. */
export type Drop =
  | { kind: 'coins'; amount: number }
  | { kind: 'char' | 'part' | 'trail'; id: string; grade: Grade; duplicate: boolean; refund: number };
/** Where the opening is, for the DOM half (the library's RevealStage). */
export type RevealPhase = 'idle' | 'opening' | 'burst' | 'reveal';
export type ShopTab = 'box' | 'chars' | 'parts';
/** The Boutique: where it was opened from, the tab on show, the last call's outcome, and the Politibox being opened. */
export interface ShopView { from: 'title' | 'select'; tab: ShopTab; busy: boolean; error: string | null; notice: string | null; drop: Drop | null; phase: RevealPhase }
type ShopReply = { ok: boolean; status: number; error?: string; profile?: Profile; drop?: Drop };
export type AdminStatus = 'idle' | 'saved';
/** What the roster API answers (engine/account.js fetchRoster / saveRoster). */
type RosterReply = { ok: boolean; status: number; error?: string; field?: string; roster?: unknown };

// ---- The admin's dashboard (DEC-030), as the server describes it (dashboard.js) ----
export interface DashUser { id: string; name: string; xp: number; level: number; coins: number; created: number; seen: number | null; banned: { at: number; reason: string } | null; online: boolean; room: string | null }
export interface DashConn { id: string; name: string; userId: string | null; guest: boolean; admin: boolean; room: string | null }
/** A kart of a race in progress, as the dashboard lists it (DEC-031). */
export interface DashKart { slot: number; name: string; charId: string; isAI: boolean; god: boolean }
export interface DashRoom extends RoomView { since: number | null; race: DashKart[] | null }
/** A god command (engine/godcmd.js, or a lobby command run by the server): `{ cmd, target?, ... }`. */
export type GodCmd = { cmd: string } & Record<string, unknown>;
export interface DashRecent { at: number; code: string; trackIdx: number; humans: number; gods: number; winner: string | null; teams: { team: TeamId; points: number }[] }
export interface DashStats {
  accounts: { total: number; banned: number; new7d: number; online: number };
  live: { connections: number; guests: number; rooms: number; races: number };
  races: { races: number; finished: number; solo: number; byTrack: Record<string, number>; recent: DashRecent[] };
  top: { id: string; name: string; xp: number; level: number }[];
}
/** What the dashboard screen shows: the last answers, the user search, and what is going on. */
export interface DashboardView { stats: DashStats | null; users: DashUser[]; connections: DashConn[]; rooms: DashRoom[]; query: string; busy: boolean; error: string | null; notice: string | null; updatedAt: number | null }
type DashReply = { ok: boolean; status: number; error?: string } & Record<string, unknown>;

export interface UiSnapshot {
  state: GameState;
  charIdx: number;
  trackIdx: number;
  /** Roster portraits by character id, rendered by the engine on entering the roster. */
  thumbs: Record<string, string>;
  poly: 'high' | 'low';
  muted: boolean;
  /** What the title screen's workshop button says after a save. */
  adminStatus: AdminStatus;
  /** The Workshop's save is on its way to the server. */
  adminBusy: boolean;
  /** Why the server refused the last save, shown in the Workshop. */
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
  /** The logged-in account, or null for a guest. */
  account: { token: string; profile: Profile } | null;
  /** A login or sign-up is on its way. */
  accountBusy: boolean;
  /** Why the last login or sign-up failed. */
  accountError: string | null;
  /** What the last race earned the account, until the next race starts. */
  lastGain: Gain | null;
  /** The local kart of the race on screen, for the kart card on the pause and results screens; null before the first race. */
  raceKart: RaceKart | null;
  /** The admin's dashboard (DEC-030). */
  dashboard: DashboardView;
  /** The admin's god console is open over the race (DEC-031). */
  godConsole: boolean;
  /** What the last god command in a solo race said (team races answer through net.notice / net.error). */
  godReply: string | null;
  /** The Boutique and the Politibox (DEC-037). */
  shop: ShopView;
  /** The friends' figures, once Compte asked for them; null until then and for a guest. */
  friendStats: FriendStats[] | null;
  /** The friend whose figures Compte shows, by id. */
  friendShown: string | null;
  /** Why the friends' figures could not be shown. */
  friendStatsError: string | null;
}

export interface NetRankRow { slot: number; name: string; charId: string; team: TeamId | null; isAI: boolean; god?: boolean; rank: number; finished: boolean; time: number | null; bestLap: number | null; points: number }
export interface NetTeamRow { team: TeamId; name: string; points: number; drivers: number[] }
/** What the server reports when a team race ends, and which slot was ours. */
export interface NetResults { ranking: NetRankRow[]; teams: NetTeamRow[]; you: number; error?: boolean }

// The lobby name lives under its own key, so resetting the workshop keeps it.
function loadName(): string { try { return JSON.parse(localStorage.getItem('kr-net') || '{}').name || ''; } catch { return ''; } }
function saveName(name: string) { try { localStorage.setItem('kr-net', JSON.stringify({ name })); } catch { /* storage full or blocked: the name is just not remembered */ } }
// The session token, so a returning player is still logged in. Nothing else about the account is kept here.
function loadToken(): string | null { try { return JSON.parse(localStorage.getItem('kr-account') || '{}').token || null; } catch { return null; } }
function saveToken(token: string | null) { try { if (token) localStorage.setItem('kr-account', JSON.stringify({ token })); else localStorage.removeItem('kr-account'); } catch { /* blocked: the session lasts for this page only */ } }

/** Whether this session is the administrator's: only then is the Workshop offered (the server checks again on save). */
export function isAdmin(ui: Pick<UiSnapshot, 'account'>): boolean {
  return ui.account?.profile?.admin === true;
}

/**
 * What this player owns, for drawing and racing their kart (DEC-035): null
 * without a game server (no economy: everything goes), the account's
 * inventory, or a guest's -- the commons only.
 */
export function ownedOf(ui: Pick<UiSnapshot, 'netAvailable' | 'account'>): Owned | null {
  if (!ui.netAvailable) return null;
  return ui.account ? ui.account.profile.owned : emptyOwned();
}

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
  adminBusy: false,
  adminError: null,
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
  raceKart: null,
  dashboard: { stats: null, users: [], connections: [], rooms: [], query: '', busy: false, error: null, notice: null, updatedAt: null },
  godConsole: false,
  godReply: null,
  shop: { from: 'title', tab: 'box', busy: false, error: null, notice: null, drop: null, phase: 'idle' },
  friendStats: null,
  friendShown: null,
  friendStatsError: null,
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

/**
 * The kart this screen follows, captured from the engine when a race starts
 * (solo or team: either way the grid is built before the countdown), so the
 * screens read it from the snapshot like everything else.
 */
function captureRaceKart(): RaceKart | null {
  const k = G.player as unknown as { def?: { id: string }; style?: KartStyle } | null;
  return k?.def && k.style ? { charId: k.def.id, style: k.style } : snapshot.raceKart;
}

onTransition((to: string, from: string) => {
  const patch: Partial<UiSnapshot> = { state: to as GameState };
  if (to === 'countdown' && from !== 'paused') { patch.noteHidden = true; patch.lastGain = null; patch.godReply = null; }
  // A grid is on the track (a god entering a race mid-way joins it during the countdown, netrace.js).
  if ((to === 'countdown' || to === 'race') && from !== 'paused') patch.raceKart = captureRaceKart();
  set(patch);
  // A solo race just ended: the account earns its experience (a team race's comes from the server).
  if (to === 'lobby') soloRace = false;
  if (to === 'results' && from === 'race' && soloRace) reportSoloRace();
});

net.onNet((view: NetView) => set({ net: view }));
onNetResults((r: NetResults) => set({ netResults: r }));

/**
 * Tell the Garage what the player owns (DEC-035), and redraw what shows
 * their kart if that changed: the turntable and the Garage form.
 */
let ownedKey = 'null';
function applyOwned(owned: Owned | null) {
  const key = JSON.stringify(owned);
  if (key === ownedKey) return;
  ownedKey = key;
  setOwned(owned);
  refreshPreview();
  set({ garageVersion: snapshot.garageVersion + 1 });
}

/** A new profile from the server: keep it, put its inventory in force, and note what the race it follows earned. */
function takeProfile(profile: Profile, gained = 0, coins = 0, bonus: Bonus | null = null) {
  const before = snapshot.account?.profile;
  if (!snapshot.account) return;
  const patch: Partial<UiSnapshot> = { account: { token: snapshot.account.token, profile } };
  if (gained > 0 || coins > 0) {
    const had = new Set(before?.unlocked ?? []);
    patch.lastGain = {
      gained, coins, daily: !!bonus?.daily, levelUpCoins: bonus?.levelUpCoins ?? 0,
      level: profile.level, levelUp: !!before && profile.level > before.level, unlockedNow: profile.unlocked.filter(id => !had.has(id)),
    };
  }
  set(patch);
  applyOwned(profile.owned ?? null);
}

// The server says who this connection is: a fresh profile, or nobody (the session expired).
net.onProfile((profile: Profile | null, gained: number, coins: number, bonus: Bonus | null) => {
  if (!snapshot.account) return;
  if (!profile) { saveToken(null); set({ account: null, friendStats: null, friendShown: null }); applyOwned(emptyOwned()); keepCharUnlocked(); leaveWorkshopUnlessAdmin(); return; }
  takeProfile(profile, gained, coins, bonus);
  leaveWorkshopUnlessAdmin();
});

/** A solo race just ended: tell the server how it went (rank, circuit, candidate, times) and keep what it paid. */
function reportSoloRace() {
  const acc = snapshot.account; const k = G.player as unknown as { rank: number; finished: boolean; finishTime: number; bestLap: number; def?: { id: string } } | null; if (!acc || !k) return;
  const race = {
    rank: k.rank, field: G.karts.length, finished: !!k.finished,
    trackId: (TRACKS as { id: string }[])[G.trackIdx]?.id ?? null,
    charId: k.def?.id ?? (CHARACTERS as { id: string }[])[G.charIdx]?.id ?? null,
    time: k.finished && Number.isFinite(k.finishTime) ? k.finishTime : null,
    bestLap: Number.isFinite(k.bestLap) ? k.bestLap : null,
  };
  account.reportRace(acc.token, race, { base: remoteServer })
    .then((r: AuthReply) => { if (r.ok && r.profile) takeProfile(r.profile, r.gained ?? 0, r.coins ?? 0, r.bonus ?? null); });
}

/** After logging out (or a lost session), fall back to a candidate a guest may drive. */
function keepCharUnlocked() {
  const allowed = unlockedOf(snapshot);
  const cur = (CHARACTERS as { id: string }[])[G.charIdx];
  if (!cur || !allowed.includes(cur.id)) { G.charIdx = 0; set({ charIdx: 0 }); }
}

/** Logged in: keep the account, remember the token, put its inventory in force, and say hello on the socket so friends see us. */
function signedIn(token: string, profile: Profile) {
  saveToken(token);
  set({ account: { token, profile }, accountBusy: false, accountError: null, netName: profile.name });
  applyOwned(profile.owned ?? null);
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

/**
 * Put the server's roster in force, then redraw what shows the cast: the
 * roster portraits (rendered again if the roster is on screen, else on the
 * next "Jouer"), the turntable, the Garage, and the Workshop form unless the
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

/** Ask the game server for the cast every player gets. Unreachable or refused: the cast in force stays. */
async function refreshRoster() {
  const r: RosterReply = await account.fetchRoster({ base: remoteServer });
  if (r.ok) applyRoster(r.roster);
}

/**
 * Whether the next "Atelier" goes back to the draft the admin was saving when
 * the session expired, rather than starting a fresh one from the cast in force.
 */
let resumeDraft = false;

/** The Workshop and the dashboard are the admin's alone: once the session is not, they close. */
function leaveWorkshopUnlessAdmin() {
  if (isAdmin(snapshot)) return;
  if (getState() === 'admin' || getState() === 'dashboard') transition('title');
  set({ adminStatus: 'idle', adminBusy: false, adminError: null });
}

/** Change the dashboard's view. */
function dash(patch: Partial<DashboardView>) { set({ dashboard: { ...snapshot.dashboard, ...patch } }); }

/**
 * One dashboard call: the admin's token, the answer, or the failure in the
 * view. A 401 means the session is no longer the admin's: it is forgotten and
 * the admin sent to Compte, as the Workshop does.
 */
async function dashCall(fn: (token: string) => Promise<DashReply>): Promise<DashReply | null> {
  const acc = snapshot.account; if (!acc || !isAdmin(snapshot)) return null;
  const r = await fn(acc.token);
  if (r.ok) return r;
  if (r.status === 401) {
    sessionExpired();
    if (getState() === 'title') transition('account');
    set({ accountError: 'Session expirée : reconnectez-vous pour le tableau de bord.' });
    return null;
  }
  dash({ error: r.error ?? 'Erreur du serveur.', notice: null });
  return null;
}

/** The server no longer knows this token (a 401): forget it here too, as a logout would, without calling the server. */
function sessionExpired() {
  saveToken(null);
  set({ account: null, lastGain: null, netName: '', friendStats: null, friendShown: null });
  applyOwned(emptyOwned());
  net.disconnect();
  keepCharUnlocked();
  leaveWorkshopUnlessAdmin();
}

// ---- The Boutique and the Politibox (DEC-032..037) ----
/** Change the shop's view. */
function shop(patch: Partial<ShopView>) { set({ shop: { ...snapshot.shop, ...patch } }); }

/** The engine's opening phases, as the DOM half shows them. */
const REVEAL_OF: Record<string, RevealPhase> = { drop: 'opening', spin: 'opening', shake: 'opening', burst: 'burst', reveal: 'reveal', hold: 'reveal' };
const onBoxPhase = (name: string) => { if (getState() === 'lootbox') shop({ phase: REVEAL_OF[name] ?? 'opening' }); };

/**
 * One shop call with the account's token: busy while it runs, and on an
 * answer the new profile put in force -- or the server's sentence shown, a
 * 401 forgetting the session as everywhere else. Resolves to the answer
 * when it succeeded.
 */
async function shopCall(fn: (token: string) => Promise<ShopReply>): Promise<ShopReply | null> {
  const acc = snapshot.account;
  if (!acc || snapshot.shop.busy) return null;
  shop({ busy: true, error: null, notice: null });
  const r = await fn(acc.token);
  shop({ busy: false });
  if (r.ok && r.profile) { takeProfile(r.profile); return r; }
  if (r.status === 401) { sessionExpired(); shop({ error: 'Session expirée : reconnectez-vous dans Compte.' }); return null; }
  shop({ error: r.error ?? 'Erreur du serveur.' });
  return null;
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
  /** "Atelier": the Workshop, on a fresh draft of the cast in force. Only for the admin's session. */
  openAdmin() {
    if (!isAdmin(snapshot)) return;
    if (!resumeDraft) beginDraft();
    resumeDraft = false;
    set({ formVersion: snapshot.formVersion + 1, adsVersion: snapshot.adsVersion + 1, adminError: null });
    transition('admin');
  },
  /**
   * Send the draft to the server with the account's token. Accepted, the
   * roster the server stored is put in force (then read back, as every new
   * player will get it) and the Workshop closes. Refused, the Workshop stays
   * open with the server's reason, naming the field -- except for an expired
   * session, which is forgotten and sends the admin to Compte, the draft
   * kept for when they come back.
   */
  async saveAdmin() {
    const acc = snapshot.account;
    if (snapshot.adminBusy || !acc || !isAdmin(snapshot)) return;
    set({ adminBusy: true, adminError: null });
    const r: RosterReply = await account.saveRoster(getDraft(), acc.token, { base: remoteServer });
    set({ adminBusy: false });
    if (r.ok) {
      applyRoster(r.roster);
      if (getState() === 'admin') transition('title');
      set({ adminStatus: 'saved' });
      void refreshRoster();
      return;
    }
    if (r.status === 401) {
      resumeDraft = true;
      sessionExpired();
      if (getState() === 'title') transition('account');
      set({ accountError: 'Session expirée : reconnectez-vous pour enregistrer l’Atelier.' });
      return;
    }
    const error = r.error ?? 'Enregistrement impossible.';
    set({ adminError: r.field && !error.includes(r.field) ? r.field + ' : ' + error : error });
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

  // ---- The admin's dashboard (DEC-030) ----
  /** "Tableau de bord": open it and load everything. Only for the admin's session. */
  openDashboard() {
    if (!isAdmin(snapshot)) return;
    initAudio();
    dash({ error: null, notice: null });
    transition('dashboard');
    void actions.refreshDashboard();
  },
  closeDashboard() { if (getState() === 'dashboard') transition('title'); },
  /** Reload the statistics, the user list (for the current search) and what is live. */
  async refreshDashboard() {
    if (snapshot.dashboard.busy) return;
    dash({ busy: true });
    const q = snapshot.dashboard.query;
    const [stats, users, live] = await Promise.all([
      dashCall(t => account.dashboard.stats(t, { base: remoteServer })),
      dashCall(t => account.dashboard.users(t, q, { base: remoteServer })),
      dashCall(t => account.dashboard.live(t, { base: remoteServer })),
    ]);
    const patch: Partial<DashboardView> = { busy: false };
    if (stats) { const { ok: _ok, status: _st, error: _e, ...body } = stats; patch.stats = body as unknown as DashStats; }
    if (users) patch.users = (users.users as DashUser[]) ?? [];
    if (live) { patch.connections = (live.connections as DashConn[]) ?? []; patch.rooms = (live.rooms as DashRoom[]) ?? []; }
    if (stats && users && live) { patch.error = null; patch.updatedAt = Date.now(); }
    dash(patch);
  },
  /** Filter the user list by a part of a name, then reload it. */
  async searchUsers(q: string) {
    dash({ query: q.trim() });
    const r = await dashCall(t => account.dashboard.users(t, snapshot.dashboard.query, { base: remoteServer }));
    if (r) dash({ users: (r.users as DashUser[]) ?? [], error: null });
  },
  async banUser(id: string, reason: string) {
    const r = await dashCall(t => account.dashboard.ban(t, id, reason.trim(), { base: remoteServer }));
    if (r) { dash({ notice: 'Compte banni.', error: null }); await actions.refreshDashboard(); }
  },
  async unbanUser(id: string) {
    const r = await dashCall(t => account.dashboard.unban(t, id, { base: remoteServer }));
    if (r) { dash({ notice: 'Bannissement levé.', error: null }); await actions.refreshDashboard(); }
  },
  /** Close every session of an account: it has to log in again. */
  async logoutUser(id: string) {
    const r = await dashCall(t => account.dashboard.logoutUser(t, id, { base: remoteServer }));
    if (r) { dash({ notice: 'Sessions fermées.', error: null }); await actions.refreshDashboard(); }
  },
  async closeRoom(code: string) {
    const r = await dashCall(t => account.dashboard.closeRoom(t, code, { base: remoteServer }));
    if (r) { dash({ notice: 'Salle ' + code + ' fermée.', error: null }); await actions.refreshDashboard(); }
  },
  async kickConnection(id: string) {
    const r = await dashCall(t => account.dashboard.kick(t, id, { base: remoteServer }));
    if (r) { dash({ notice: 'Connexion fermée.', error: null }); await actions.refreshDashboard(); }
  },
  /** Give account `id` `amount` politicoins (the server caps it at 100 000); the list then shows the new balance. */
  async grantCoins(id: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 0) { dash({ error: 'Un nombre entier de politicoins.', notice: null }); return; }
    const r = await dashCall(t => account.dashboard.grantCoins(t, id, amount, { base: remoteServer }));
    if (!r) return;
    const u = r.user as { name?: string; coins?: number } | undefined;
    dash({ notice: amount.toLocaleString('fr-FR') + ' politicoins crédités' + (u?.name ? ' à ' + u.name : '') + (typeof u?.coins === 'number' ? ' (solde ' + u.coins.toLocaleString('fr-FR') + ').' : '.'), error: null });
    await actions.refreshDashboard();
  },
  /**
   * Any command on room `code`, from the dashboard (DEC-031): start, track,
   * kick, team, char in the lobby; every god command in a race.
   */
  async roomCommand(code: string, cmd: GodCmd) {
    const r = await dashCall(t => account.dashboard.command(t, code, cmd, { base: remoteServer }));
    if (r) { dash({ notice: String(r.text ?? 'Fait.'), error: null }); await actions.refreshDashboard(); }
  },
  /**
   * A god command from the race or the lobby on screen (DEC-031). In a team
   * race, or in a room, the server runs it (and checks it is the admin); in
   * a solo race the admin's own engine does, on the spot.
   */
  godCommand(cmd: GodCmd) {
    if (!isAdmin(snapshot)) return;
    const st = getState();
    if (isNetRace() || (st === 'lobby' && snapshot.net.room)) { net.clearMessages(); set({ godReply: null }); net.godCmd(null, cmd); return; }
    if (st !== 'race' && st !== 'countdown' && st !== 'paused') return;
    const r = applyGodCommand(cmd, G.player) as { ok: boolean; text: string };
    set({ godReply: r.text });
  },
  /** Open or close the god console over the race (the G key, or its button). */
  toggleGodConsole() { if (isAdmin(snapshot)) set({ godConsole: !snapshot.godConsole }); },
  /** Enter room `code` as a god: the lobby opens on it, and the server seats the admin outside the teams. */
  godJoin(code: string) {
    const acc = snapshot.account; if (!acc || !isAdmin(snapshot)) return;
    initAudio();
    if (getState() === 'dashboard' || getState() === 'title') transition('lobby');
    if (getState() !== 'lobby') return;
    net.connect(socketUrl(), snapshot.netName, acc.token);
    net.godJoin(code.toUpperCase().trim(), getGarage());
  },

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
   * shows the Multijoueur and account buttons if so, puts the admin's cast
   * in force, and restores a saved session. Unreachable: the default cast.
   */
  async detectServer() {
    const ok: boolean = await net.probeServer(globalThis.fetch, remoteServer);
    set({ netAvailable: ok });
    if (!ok) { applyOwned(null); return; }                       // the static build: the default cast, no accounts, no economy
    if (!snapshot.account) applyOwned(emptyOwned());             // a guest until a saved session says otherwise
    const token = loadToken();
    await Promise.all([
      refreshRoster(),
      token && account.me(token, { base: remoteServer }).then((r: AuthReply) => {
        if (r.ok && r.profile) signedIn(token, r.profile);
        else if (r.status === 401) saveToken(null);               // expired; a network failure keeps it for next time
      }),
    ]);
  },
  /** "Multijoueur": open the lobby and connect. */
  multiplayer() {
    initAudio();
    transition('lobby');
    net.connect(socketUrl(), snapshot.netName, snapshot.account?.token ?? null);
  },
  setNetName(name: string) { saveName(name); set({ netName: name }); },
  createRoom() { if (!snapshot.account) return; net.connect(socketUrl(), snapshot.netName, snapshot.account.token); net.createRoom(getGarage()); },
  joinRoom(code: string) { net.connect(socketUrl(), snapshot.netName, snapshot.account?.token ?? null); net.joinRoom(code, getGarage()); },
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
    resumeDraft = false;
    set({ account: null, lastGain: null, netName: '', friendStats: null, friendShown: null });
    applyOwned(emptyOwned());                                   // a guest on a server owns the commons
    net.disconnect();
    keepCharUnlocked();
    leaveWorkshopUnlessAdmin();
  },
  /** Ask the server for the friends' figures (GET /api/stats/friends); a guest has none. Resolves to what it answered. */
  async loadFriendStats(): Promise<FriendStats[] | null> {
    const acc = snapshot.account; if (!acc) return null;
    const r = await account.shop.friendStats(acc.token, { base: remoteServer }) as { ok: boolean; status: number; error?: string; friends?: FriendStats[] };
    if (r.ok) { const list = Array.isArray(r.friends) ? r.friends : []; set({ friendStats: list }); return list; }
    if (r.status === 401) { sessionExpired(); set({ accountError: 'Session expirée : reconnectez-vous.' }); return null; }
    set({ friendStats: null, friendStatsError: r.error ?? 'Statistiques indisponibles.' });
    return null;
  },
  /** "Stats" on a friend's row: show their figures, fetched afresh so a race just run counts. */
  async showFriendStats(id: string) {
    if (!snapshot.account) return;
    set({ friendShown: id, friendStatsError: null });
    const list = await actions.loadFriendStats();
    if (list && !list.some(f => f.id === id)) set({ friendShown: null, friendStatsError: 'Cette personne n’est plus dans vos ami·es.' });
  },
  hideFriendStats() { set({ friendShown: null, friendStatsError: null }); },
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
    if (st === 'lootbox') actions.boxDone();
    if (getState() === 'shop') transition('title');
    if (getState() === 'select' || getState() === 'admin' || (getState() === 'results' && !isNetRace())) transition('title');
    if (getState() === 'title' || getState() === 'account' || getState() === 'dashboard') transition('lobby');
    if (getState() !== 'lobby') return;
    net.connect(socketUrl(), snapshot.netName, snapshot.account?.token ?? null);
    net.joinRoom(inv.code, getGarage());
  },
  dismissInvite() { net.clearInvite(); },

  // ---- The Boutique and the Politibox (DEC-032..037) ----
  /** "Boutique", from the title or the roster, optionally on a tab. Only where a game server runs the economy. */
  openShop(from: 'title' | 'select', tab?: ShopTab) {
    if (!snapshot.netAvailable || !canTransition('shop')) return;
    initAudio();
    // The candidates' cards show the roster portraits, rendered once per detail level.
    const thumbs = makeThumbs() as Record<string, string>;
    shop({ from, error: null, notice: null, ...(tab ? { tab } : {}) });
    set({ thumbs });
    transition('shop');
    setPreview(G.charIdx);
  },
  /**
   * A locked chip's badge in the Garage (DEC-035): back to the roster, then
   * the Boutique on `tab`, so its "Retour" lands on the roster (the machine
   * has no garage → shop edge; the player reopens the Garage from there).
   */
  shopFromGarage(tab: ShopTab) {
    if (!snapshot.netAvailable) return;
    if (getState() === 'garage') transition('select');
    actions.openShop('select', tab);
  },
  /** "Retour": back where the shop was opened from. */
  closeShop() {
    if (getState() !== 'shop') return;
    shop({ error: null, notice: null });
    transition(snapshot.shop.from);
    if (snapshot.shop.from === 'select') { keepCharUnlocked(); setPreview(G.charIdx); }
  },
  shopTab(tab: ShopTab) { shop({ tab, error: null, notice: null }); },
  /** Buy candidate `id`. The price is the server's (catalog.js): the request names the candidate only. */
  async buyChar(id: string) {
    if (await shopCall(t => account.shop.buyChar(t, id, { base: remoteServer }))) shop({ notice: 'Acquis !' });
  },
  /** Buy option `value` of part `category`; the server prices it. */
  async buyPart(category: string, value: string) {
    if (await shopCall(t => account.shop.buyPart(t, category, value, { base: remoteServer }))) shop({ notice: 'Acquis !' });
  },
  /** Open a Politibox: the server charges and rolls; the opening plays on the canvas, from the shop or again from the result. */
  async openBox() {
    const r = await shopCall(t => account.shop.openBox(t, { base: remoteServer }));
    if (!r?.drop) return;
    const st = getState();
    if (st !== 'shop' && st !== 'lootbox') return;          // left the shop while the server answered
    shop({ drop: r.drop, phase: 'opening' });
    if (st === 'shop') transition('lootbox');
    playOpening(r.drop, { onPhase: onBoxPhase });
  },
  /** A tap on the stage: hurry the opening along (to the burst, then to the prize). */
  skipOpening() { if (getState() === 'lootbox') skipBoxOpening(); },
  /** "Retour à la boutique". */
  boxDone() {
    stopOpening();
    if (getState() === 'lootbox') transition('shop');
    shop({ phase: 'idle', drop: null, error: null, notice: null });
    setPreview(G.charIdx);
  },
};
