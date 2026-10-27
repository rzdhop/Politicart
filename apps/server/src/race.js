// The race runner server.js plugs in: one worker thread per race
// (race-worker.js), and the translation between the room's players and the
// worker's grid slots.
//
// On start every player is told the grid and which slot is theirs. Snapshots
// from the worker go to every player, each with only the messages and sounds
// addressed to them. When the worker reports the result, the room goes back
// to its lobby through io.done().
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
  worker.on('message', m => {
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
    input(playerId, m) { const slot = slotOf.get(playerId); if (slot !== undefined) worker.postMessage({ t: 'input', slot, c: m.c, item: m.item, power: m.power }); },
    leave(playerId) { const slot = slotOf.get(playerId); if (slot === undefined) return; slotOf.delete(playerId); worker.postMessage({ t: 'leave', slot }); },
    stop() { over = true; worker.terminate(); },
  };
}
