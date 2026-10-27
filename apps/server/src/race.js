// The race runner server.js plugs in: one worker thread per race
// (race-worker.js), and the translation between the room's players and the
// worker's grid slots.
//
// On start every player is told the grid and which slot is theirs. Snapshots
// from the worker go to every player, each with only the messages and sounds
// addressed to them. When the worker reports the result, the room goes back
// to its lobby through io.done().
//
// The admin has absolute power over the race (DEC-031): addGod() seats them
// as a god kart at any moment, mid-race included, and god() runs any god
// command in the worker and resolves to its { ok, text }.
import { Worker } from 'node:worker_threads';

import { CHARACTERS } from '../../game/src/engine/data.js';
import { castOf } from './roster.js';

const WORKER = new URL('./race-worker.js', import.meta.url);

export function runRace(room, roster, io, { fast = false, hold } = {}) {
  const slotOf = new Map();
  roster.forEach((s, slot) => { if (s.playerId) slotOf.set(s.playerId, slot); });
  // style: a human's Garage edits (cleaned by the lobby), so every client draws their kart as they styled it.
  // god: the admin's creative-mode kart (DEC-030), which the engine makes untouchable and the scoring ignores.
  const grid = roster.map(({ charId, team, isAI, name, style, god }) => ({ charId, team, isAI, name, ...(style ? { style } : {}), ...(god ? { god: true } : {}) }));

  for (const [playerId, slot] of slotOf) io.send(playerId, { t: 'race', trackIdx: room.trackIdx, roster: grid, you: slot });

  // The worker has its own copy of CHARACTERS, still at the defaults: hand it
  // the admin's names, which the powers quote in their messages.
  const worker = new Worker(WORKER, { workerData: { trackIdx: room.trackIdx, roster: grid, cast: castOf(CHARACTERS), fast, hold } });
  let over = false;
  let seq = 0; const pending = new Map();         // god command id -> resolve
  worker.on('message', m => {
    if (m.t === 'godReply') { const done = pending.get(m.id); pending.delete(m.id); done?.({ ok: m.ok, text: m.text }); return; }
    if (m.t === 'snap') {
      for (const [playerId, slot] of slotOf) {
        const mine = m.per[slot] ?? { ev: [], fx: [] };
        io.send(playerId, { t: 'snap', s: m.s, ev: mine.ev, fx: [...m.fx, ...mine.fx] });
      }
    } else if (m.t === 'done') {
      over = true; worker.terminate();
      io.done({ ranking: m.ranking, teams: m.teams });
    }
  });
  worker.on('error', e => { console.error('race worker failed:', e); if (!over) { over = true; io.done({ ranking: [], teams: [], error: true }); } });

  return {
    /** The grid as it stands: the start's, plus every kart that joined since. */
    grid,
    /**
     * Seat `playerId` (the admin) in the race in progress as a god kart. The
     * other players are told to build it, the admin gets the grid and its
     * slot as at a start. False if the race is over or they already drive.
     */
    addGod(playerId, { charId, name, style }) {
      if (over || slotOf.has(playerId)) return false;
      const slot = grid.length;
      const entry = { charId, team: null, isAI: false, name, god: true, ...(style ? { style } : {}) };
      grid.push(entry); roster.push({ playerId, ...entry });
      for (const [other] of slotOf) io.send(other, { t: 'kartJoin', slot, entry });
      slotOf.set(playerId, slot);
      worker.postMessage({ t: 'join', slot, entry });
      io.send(playerId, { t: 'race', trackIdx: room.trackIdx, roster: grid, you: slot });
      return true;
    },
    /** Run god command `cmd` in the race, as `playerId`'s kart when they drive one. Resolves to { ok, text }. */
    god(cmd, playerId) {
      if (over) return Promise.resolve({ ok: false, text: 'La course est terminée.' });
      const id = ++seq;
      return new Promise(ok => {
        const timer = setTimeout(() => { pending.delete(id); ok({ ok: false, text: 'La course ne répond pas.' }); }, 2000);
        pending.set(id, r => { clearTimeout(timer); ok(r); });
        worker.postMessage({ t: 'god', id, cmd, actor: slotOf.get(playerId) ?? null });
      });
    },
    input(playerId, m) { const slot = slotOf.get(playerId); if (slot !== undefined) worker.postMessage({ t: 'input', slot, c: m.c, item: m.item, power: m.power }); },
    leave(playerId) { const slot = slotOf.get(playerId); if (slot === undefined) return; slotOf.delete(playerId); worker.postMessage({ t: 'leave', slot }); },
    stop() { over = true; worker.terminate(); },
  };
}
