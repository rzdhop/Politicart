// Rooms and their lobby: who is in, which team, which candidate, who is
// ready, which circuit. Pure state with no sockets, so the rules can be tested
// on their own; server.js wires it to WebSocket connections.
//
// A room holds up to six humans (the grid is six karts; AI fills the rest,
// A-009). Each human drives a different candidate, so every kart on the grid
// is distinguishable. The first player in is the host and picks the circuit
// and the start; if the host leaves, the next player in line takes over.
//
// Each player may only drive the starters and the candidates their account
// owns (engine/progress.js drivableIds, DEC-034): the level alone unlocks
// nothing any more; a guest -- no account -- drives the four starters.
//
// Each player also carries their kart style: the Garage edits they made, a
// partial style (kartstyle.js), cleaned here because it comes from the
// client, then stripped of every part and trail the player does not own
// (catalog.js ownedStyle, DEC-035), so it falls back to the candidate's
// default. Everyone in the room draws that player's kart with it. `owned` is
// the inventory the server read for the account (the admin owns everything),
// the commons only for a guest; it never leaves the room's state.
//
// The admin may enter any room as a god (DEC-030): a seventh seat beyond the
// six, in any phase, on no team and with every candidate open. A god races
// as a neutral, untouchable kart with no cooldown (engine), scores no points
// and earns no experience. A god who enters during a race joins it at once
// (DEC-031). The admin also changes any room at will: forceTrack() and
// force() skip the host and unlock rules that bind the players.

import { CHARACTERS, TRACKS } from '../../game/src/engine/data.js';
import { emptyOwned, ownedStyle } from '../../game/src/engine/catalog.js';
import { cleanStyle } from '../../game/src/engine/kartstyle.js';
import { drivableIds } from '../../game/src/engine/progress.js';
import { TEAMS } from '../../game/src/engine/teams.js';

export const MAX_PLAYERS = 6;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: codes are read aloud
const CHAR_IDS = CHARACTERS.map(c => c.id);
/** A style from the client, cleaned and kept to what `owned` owns (the commons when it is missing). */
const styleFor = (style, owned) => ownedStyle(cleanStyle(style), owned ?? emptyOwned());

/** A display name: trimmed, at most 16 characters, never empty. */
export function cleanName(name, fallback = 'Député·e') {
  const s = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || fallback;
}

/** A fresh four-letter room code not in `taken`. */
export function newCode(taken, rnd = Math.random) {
  for (;;) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(rnd() * CODE_LETTERS.length)];
    if (!taken.has(c)) return c;
  }
}

export class Room {
  constructor(code) {
    this.code = code;
    this.players = [];          // { id, name, team, charId, ready, userId, level, owned, allowed, style }, in join order
    this.trackIdx = 0;
    this.phase = 'lobby';       // 'lobby' | 'race'
  }

  get host() { return this.players[0]?.id ?? null; }
  get empty() { return this.players.length === 0; }
  player(id) { return this.players.find(p => p.id === id) ?? null; }

  /**
   * Add a player; returns the player, or an error string. `who` names the
   * account behind the connection ({ userId, level, owned }); without one
   * the player is a guest, owning the commons. `style` is their kart style,
   * cleaned and kept to what they own here.
   */
  join(id, name, who = {}, style) {
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    if (this.players.length >= MAX_PLAYERS) return 'Salle complète (6 joueurs).';
    const owned = who.userId ? who.owned ?? emptyOwned() : emptyOwned();
    const allowed = drivableIds(who.userId ? who.level : 0, owned);
    const taken = new Set(this.players.map(p => p.charId));
    const charId = allowed.find(c => !taken.has(c));
    if (!charId) return 'Plus aucun candidat libre pour vous dans cette salle.';
    const count = t => this.players.filter(p => p.team === t).length;
    const team = count('bleu') <= count('rouge') ? 'bleu' : 'rouge';
    const p = { id, name: cleanName(name), team, charId, ready: false, userId: who.userId ?? null, level: who.userId ? who.level : null, owned, allowed, style: styleFor(style, owned) };
    this.players.push(p);
    return p;
  }

  /**
   * Seat the admin as a god: outside the six-player cap, during a race too,
   * on no team, any candidate nobody else drives. Returns the player or an
   * error string. The style is kept to `who.owned` like anyone's (the server
   * hands the admin the whole catalogue).
   */
  joinGod(id, name, who = {}, style, avoid = []) {
    if (this.players.some(p => p.god)) return 'Un dieu est déjà dans cette salle.';
    // `avoid`: the candidates a race in progress already drives (its AI included)
    const taken = new Set([...this.players.map(p => p.charId), ...avoid]);
    const charId = CHAR_IDS.find(c => !taken.has(c));
    if (!charId) return 'Plus aucun candidat libre dans cette salle.';
    const owned = who.owned ?? emptyOwned();
    const p = { id, name: cleanName(name), team: null, charId, ready: false, userId: who.userId ?? null, level: who.level ?? null, owned, allowed: [...CHAR_IDS], style: styleFor(style, owned), god: true };
    this.players.push(p);
    return p;
  }

  /**
   * An account changed while in the room (a level, a purchase, a Politibox
   * win): it may drive and wear what it owns now. A god keeps every candidate.
   */
  setProfile(id, { level, owned }) {
    const p = this.player(id); if (!p || !p.userId) return;
    p.level = level; p.owned = owned ?? emptyOwned();
    p.allowed = p.god ? [...CHAR_IDS] : drivableIds(level, p.owned);
  }

  leave(id) { this.players = this.players.filter(p => p.id !== id); }

  /** Change a player's team, candidate, readiness or kart style. Returns an error string or null. */
  set(id, { team, charId, ready, style } = {}) {
    const p = this.player(id); if (!p) return 'Joueur inconnu.';
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    if (team !== undefined) { if (p.god) return 'Un dieu n’a pas d’équipe.'; if (!TEAMS.includes(team)) return 'Équipe inconnue.'; p.team = team; }
    if (charId !== undefined) {
      if (!CHAR_IDS.includes(charId)) return 'Candidat inconnu.';
      if (!p.allowed.includes(charId)) return p.userId ? 'Candidat pas encore débloqué.' : 'Les invité·es jouent les quatre candidats de départ.';
      if (this.players.some(o => o !== p && o.charId === charId)) return 'Ce candidat est déjà pris.';
      p.charId = charId;
    }
    if (ready !== undefined) p.ready = !!ready;
    if (style !== undefined) p.style = styleFor(style, p.owned);
    return null;
  }

  /** The host picks the circuit. */
  setTrack(id, trackIdx) {
    if (id !== this.host) return 'Seul l’hôte choisit le circuit.';
    if (!Number.isInteger(trackIdx) || trackIdx < 0 || trackIdx >= TRACKS.length) return 'Circuit inconnu.';
    this.trackIdx = trackIdx; return null;
  }

  /** The admin picks the circuit, host or not, while the room waits. */
  forceTrack(trackIdx) {
    if (!Number.isInteger(trackIdx) || trackIdx < 0 || trackIdx >= TRACKS.length) return 'Circuit inconnu.';
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    this.trackIdx = trackIdx; return null;
  }

  /**
   * The admin changes a player's team or candidate, whatever they unlocked
   * (a god keeps no team). Two players still never share a candidate.
   * Returns an error string or null.
   */
  force(id, { team, charId } = {}) {
    const p = this.player(id); if (!p) return 'Joueur inconnu.';
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    if (team !== undefined) { if (p.god) return 'Un dieu n’a pas d’équipe.'; if (!TEAMS.includes(team)) return 'Équipe inconnue.'; p.team = team; }
    if (charId !== undefined) {
      if (!CHAR_IDS.includes(charId)) return 'Candidat inconnu.';
      if (this.players.some(o => o !== p && o.charId === charId)) return 'Ce candidat est déjà pris.';
      p.charId = charId;
    }
    return null;
  }

  /** Why the host cannot start now, or null if they can. */
  cannotStart(id) {
    if (id !== this.host) return 'Seul l’hôte lance la course.';
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    if (!this.players.every(p => p.ready || p.id === this.host)) return 'Tout le monde n’est pas prêt.';
    return null;
  }

  /**
   * The grid for a race: the humans in join order, then AI candidates nobody
   * picked, up to six. Each slot says who drives it.
   */
  roster(rnd = Math.random) {
    const humans = this.players.map(p => ({ playerId: p.id, name: p.name, charId: p.charId, team: p.team, isAI: false, style: p.style, ...(p.god ? { god: true } : {}) }));
    const free = CHAR_IDS.filter(c => !humans.some(h => h.charId === c));
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    // the god's seat is the seventh: the AI still fills the grid to six around the mortals
    const mortals = humans.filter(h => !h.god).length;
    const ai = free.slice(0, Math.max(0, MAX_PLAYERS - mortals)).map(charId => ({ playerId: null, name: CHARACTERS.find(c => c.id === charId).name, charId, team: null, isAI: true }));
    return [...ai, ...humans];
  }

  /** Back to the lobby after a race: everyone must ready up again. */
  endRace() { this.phase = 'lobby'; for (const p of this.players) p.ready = false; }

  /** What every client in the room is told. */
  view() {
    return {
      code: this.code, host: this.host, trackIdx: this.trackIdx, phase: this.phase,
      players: this.players.map(({ id, name, team, charId, ready, userId, level, style, god }) => ({ id, name, team, charId, ready, userId, level, guest: !userId, god: !!god, style: { ...style } })),
    };
  }
}
