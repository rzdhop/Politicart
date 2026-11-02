// The run's three goals (DEC-064).
//
// Every race draws three goals from GOALS with the race's seed, so every
// player of a team race and the server agree on them without sending them.
// Each kart keeps a tally of what it did (`k.tally`: super mini-turbos,
// tricks, dash pads, hits dealt, items used, coins picked, hits taken), and
// a goal is reached when its count meets its target -- or, for the goals
// judged at the line (a place, a clean run), when the kart finishes. A human
// reaching a goal is told at once; the results screen and the economy pay
// for each one (economy.js settleRace: GOAL_XP and GOAL_COINS a goal).
//
// Headless-safe and pure apart from the kart fields and the message queue.
import { say } from './events.js';
import { derive, mulberry32 } from './seed.js';
import { G } from './state.js';

/** The salt of the goals' draw from the race seed (seed.js derive): its own, so it never shifts the layout's or the cyclists' draws. */
export const SALT_GOALS = 0x60a15;
/** What a goal reached pays, in experience and politicoins (catalog.js, shared with the server's settleRace; the results screen shows them). */
export { GOAL_COINS, GOAL_XP, GOALS_PER_RUN } from './catalog.js';
import { GOALS_PER_RUN } from './catalog.js';

/**
 * The goal pool. `stat` is the tally it counts and `target` how many it
 * takes; `atLine` goals are judged when the kart finishes: `rank` (place
 * index at most `target`) or `clean` (finished with no hit taken).
 */
export const GOALS = Object.freeze([
  { id: 'turbos', stat: 'turbos', target: 2, text: 'Réussir 2 super mini-turbos' },
  { id: 'tricks', stat: 'tricks', target: 2, text: 'Réussir 2 figures en l’air' },
  { id: 'pads', stat: 'pads', target: 4, text: 'Prendre 4 accélérateurs' },
  { id: 'hits', stat: 'hits', target: 3, text: 'Toucher 3 adversaires' },
  { id: 'items', stat: 'items', target: 5, text: 'Utiliser 5 objets' },
  { id: 'coins', stat: 'coins', target: 15, text: 'Ramasser 15 politicoins' },
  { id: 'podium', atLine: 'rank', target: 2, text: 'Finir sur le podium' },
  { id: 'win', atLine: 'rank', target: 0, text: 'Gagner la course' },
  { id: 'clean', atLine: 'clean', target: 0, text: 'Finir sans être sonné' },
]);
/** The tallies a kart keeps. */
export const TALLIES = Object.freeze(['turbos', 'tricks', 'pads', 'hits', 'items', 'coins', 'hitsTaken']);

/**
 * The three goals a race of seed `seed` sets, as GOALS entries: drawn
 * without repeats, never both "podium" and "win" (one would make the other
 * a formality).
 */
export function pickGoals(seed) {
  const rng = mulberry32(derive(seed >>> 0, SALT_GOALS)), pool = [...GOALS], out = [];
  while (out.length < GOALS_PER_RUN && pool.length) {
    const g = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (g.atLine === 'rank' && out.some(o => o.atLine === 'rank')) continue;
    out.push(g);
  }
  return out;
}

/** A fresh tally, every count at zero. */
export const freshTally = () => Object.fromEntries(TALLIES.map(t => [t, 0]));

/** Kart k did `stat` `n` more times; a goal it completes is announced to its driver. */
export function tally(k, stat, n = 1) {
  if (!k || G.replaying) return;
  if (!k.tally) k.tally = freshTally();
  k.tally[stat] = (k.tally[stat] || 0) + n;
  checkGoals(k);
}

/** The goals of the race on now (G.goals, set by startField), or none. */
const current = () => G.goals || [];

/** Whether goal `g` is reached by kart k (the line goals only once it finished). */
export function reached(g, k) {
  const t = k.tally || {};
  if (g.atLine === 'rank') return !!k.finished && k.rank <= g.target;
  if (g.atLine === 'clean') return !!k.finished && !(t.hitsTaken > 0);
  return (t[g.stat] || 0) >= g.target;
}

/**
 * Mark the goals kart k has just reached (k.goalsDone, a bit per goal) and
 * tell its driver about each new one. Called on every tally and when a kart
 * finishes.
 */
export function checkGoals(k) {
  if (k.isAI || G.replaying) return;
  current().forEach((g, i) => {
    const bit = 1 << i;
    if ((k.goalsDone & bit) || !reached(g, k)) return;
    k.goalsDone = (k.goalsDone || 0) | bit;
    say(k, 'OBJECTIF RÉUSSI ! ' + g.text.toUpperCase());
  });
}

/** How many goals kart k reached. */
export const goalsCount = k => { let n = 0; for (let m = k.goalsDone || 0; m; m >>= 1) n += m & 1; return n; };

/**
 * What the HUD and the results show of kart k's goals: `{ text, have,
 * target, done }` each (`have` capped at the target; a line goal shows 0/1
 * until it is judged).
 */
export function goalsOf(k, goals = current()) {
  const t = k.tally || {};
  return goals.map((g, i) => {
    const done = !!((k.goalsDone || 0) & (1 << i));
    if (g.atLine) return { text: g.text, have: done ? 1 : 0, target: 1, done };
    return { text: g.text, have: Math.min(g.target, t[g.stat] || 0), target: g.target, done };
  });
}
