// Rooms and their lobby: who is in, which team, which candidate, who is
// ready, which circuit. Pure state with no sockets, so the rules can be tested
// on their own; server.js wires it to WebSocket connections.
//
// A room holds up to six humans (the grid is six karts; AI fills the rest,
// A-009). Each human drives a different candidate, so every kart on the grid
// is distinguishable. The first player in is the host and picks the circuit
// and the start; if the host leaves, the next player in line takes over.
//
// Each player may only drive the candidates their account has unlocked
// (engine/progress.js); a guest -- no account -- drives the four starters.

import { CHARACTERS, TRACKS } from '../../game/src/engine/data.js';
import { unlockedIds } from '../../game/src/engine/progress.js';
import { TEAMS } from '../../game/src/engine/teams.js';

export const MAX_PLAYERS = 6;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: codes are read aloud
const CHAR_IDS = CHARACTERS.map(c => c.id);

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
    this.players = [];          // { id, name, team, charId, ready, userId, level, allowed }, in join order
    this.trackIdx = 0;
    this.phase = 'lobby';       // 'lobby' | 'race'
  }

  get host() { return this.players[0]?.id ?? null; }
  get empty() { return this.players.length === 0; }
  player(id) { return this.players.find(p => p.id === id) ?? null; }

  /**
   * Add a player; returns the player, or an error string. `who` names the
   * account behind the connection ({ userId, level }); without one the
   * player is a guest.
   */
  join(id, name, who = {}) {
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    if (this.players.length >= MAX_PLAYERS) return 'Salle complète (6 joueurs).';
    const allowed = unlockedIds(who.userId ? who.level : 0);
    const taken = new Set(this.players.map(p => p.charId));
    const charId = allowed.find(c => !taken.has(c));
    if (!charId) return 'Plus aucun candidat libre pour vous dans cette salle.';
    const count = t => this.players.filter(p => p.team === t).length;
    const team = count('bleu') <= count('rouge') ? 'bleu' : 'rouge';
    const p = { id, name: cleanName(name), team, charId, ready: false, userId: who.userId ?? null, level: who.userId ? who.level : null, allowed };
    this.players.push(p);
    return p;
  }

  /** An account levelled up while in the room: it may drive its new candidates. */
  setLevel(id, level) {
    const p = this.player(id); if (!p || !p.userId) return;
    p.level = level; p.allowed = unlockedIds(level);
  }

  leave(id) { this.players = this.players.filter(p => p.id !== id); }

  /** Change a player's team, candidate or readiness. Returns an error string or null. */
  set(id, { team, charId, ready } = {}) {
    const p = this.player(id); if (!p) return 'Joueur inconnu.';
    if (this.phase !== 'lobby') return 'La course a déjà commencé.';
    if (team !== undefined) { if (!TEAMS.includes(team)) return 'Équipe inconnue.'; p.team = team; }
    if (charId !== undefined) {
      if (!CHAR_IDS.includes(charId)) return 'Candidat inconnu.';
      if (!p.allowed.includes(charId)) return p.userId ? 'Candidat pas encore débloqué.' : 'Les invité·es jouent les quatre candidats de départ.';
      if (this.players.some(o => o !== p && o.charId === charId)) return 'Ce candidat est déjà pris.';
      p.charId = charId;
    }
    if (ready !== undefined) p.ready = !!ready;
    return null;
  }

  /** The host picks the circuit. */
  setTrack(id, trackIdx) {
    if (id !== this.host) return 'Seul l’hôte choisit le circuit.';
    if (!Number.isInteger(trackIdx) || trackIdx < 0 || trackIdx >= TRACKS.length) return 'Circuit inconnu.';
    this.trackIdx = trackIdx; return null;
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
    const humans = this.players.map(p => ({ playerId: p.id, name: p.name, charId: p.charId, team: p.team, isAI: false }));
    const free = CHAR_IDS.filter(c => !humans.some(h => h.charId === c));
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    const ai = free.slice(0, Math.max(0, MAX_PLAYERS - humans.length)).map(charId => ({ playerId: null, name: CHARACTERS.find(c => c.id === charId).name, charId, team: null, isAI: true }));
    return [...ai, ...humans];
  }

  /** Back to the lobby after a race: everyone must ready up again. */
  endRace() { this.phase = 'lobby'; for (const p of this.players) p.ready = false; }

  /** What every client in the room is told. */
  view() {
    return {
      code: this.code, host: this.host, trackIdx: this.trackIdx, phase: this.phase,
      players: this.players.map(({ id, name, team, charId, ready, userId, level }) => ({ id, name, team, charId, ready, userId, level, guest: !userId })),
    };
  }
}
