// Teams: who is a foe, and how a team race is scored (DEC-014).
//
// A kart's `team` is null in solo play and for AI karts, so in solo every
// other kart is a foe and nothing here changes how the game plays. In a team
// race, items, powers, hazards and invincible bumps skip teammates.
//
// Scoring is summed placement points: each human scores by finishing place,
// and a team's score is the sum of its drivers' points. AI karts take places
// but score for nobody (A-008, A-009).

export const TEAMS = Object.freeze(['bleu', 'rouge']);
export const TEAM_NAMES = Object.freeze({ bleu: 'Bleu', rouge: 'Rouge' });
export const TEAM_COLORS = Object.freeze({ bleu: 0x1f3a93, rouge: 0xc8102e });

/** Points by finishing place, index 0 = first. Places beyond the table score 0. */
export const POINTS = Object.freeze([10, 8, 6, 4, 2, 1]);

/** Whether `b` is fair game for `a`: anyone but itself and its teammates. */
export function isFoe(a, b) {
  return a !== b && !(a.team != null && a.team === b.team);
}

/**
 * The foe placed closest ahead of `k` (the next rank up, skipping
 * teammates), or null if no foe is ahead. In solo play this is exactly the
 * kart at rank k.rank - 1.
 */
export function foeAhead(k, karts) {
  let best = null;
  for (const o of karts) if (isFoe(k, o) && o.rank < k.rank && (!best || o.rank > best.rank)) best = o;
  return best;
}

/** The best-placed foe of `k`. In solo play: the leader, or second place if k leads. */
export function leadingFoe(k, karts) {
  let best = null;
  for (const o of karts) if (isFoe(k, o) && (!best || o.rank < best.rank)) best = o;
  return best;
}

/** Points for a finishing place (0-based rank). */
export const placementPoints = rank => POINTS[rank] ?? 0;

/**
 * Team standings from the karts' final ranks: one entry per team that has a
 * driver, best first. Ties go to the team whose best driver placed higher.
 */
export function teamStandings(karts) {
  const byTeam = new Map();
  for (const k of karts) {
    if (k.isAI || k.team == null) continue;
    if (!byTeam.has(k.team)) byTeam.set(k.team, { team: k.team, name: TEAM_NAMES[k.team] ?? k.team, points: 0, best: Infinity, drivers: [] });
    const t = byTeam.get(k.team); const points = placementPoints(k.rank);
    t.points += points; t.best = Math.min(t.best, k.rank);
    t.drivers.push({ kart: k, rank: k.rank, points });
  }
  const out = [...byTeam.values()];
  for (const t of out) t.drivers.sort((a, b) => a.rank - b.rank);
  return out.sort((a, b) => b.points - a.points || a.best - b.best);
}
