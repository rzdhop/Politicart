// The frame payload: everything the HUD shows, as one plain object per frame.
//
// This is the engine's only output to the UI during a race. Before stage 11
// updateHUD() reached into G and the player's kart from inside game.js and
// wrote the DOM directly; now the engine hands over this snapshot and the UI
// decides how to render it. The fields are the exploration map's list from
// the plan -- rank, lap, time, speed, drift charge, item, power state,
// wrong-way flag and every kart's position -- plus the countdown label,
// which used to be written to the centre of the HUD from inside frame(), and
// whether the kart is a god's (DEC-030), which the HUD labels.
//
// Pure: it reads state and returns a new object, so it can be tested with a
// fake G and never has to know about Three.js or the DOM. One small object
// and one short array per frame is well within what 60 fps tolerates.

/** Build the payload for the current frame from the shared state. */
export function framePayload(G, CFG) {
  const k = G.player;
  const announce = G.state === 'countdown'
    ? String(Math.min(3, Math.ceil(G.countdown)))
    : (G.time < 0.9 ? 'PARTEZ !' : '');
  return {
    state: G.state,
    time: G.time,
    announce,
    rank: k.rank,
    lap: k.lap,
    laps: G.laps ?? CFG.laps,              // the race's own: the admin can change it mid-race (DEC-031)
    finished: k.finished,
    finishTime: k.finishTime,
    bestLap: k.bestLap,
    speed: Math.abs(k.speed),
    driftCharge: k.drift.charge,
    item: k.item,
    itemRolling: k.itemRolling > 0,
    powerName: k.def.power.name,
    powerCd: k.powerCd,
    powerCdMax: k.def.power.cd || CFG.powerCooldown,
    powerReady: k.powerCd <= 0,
    wrongWay: G.wrongTimer >= 1.2,
    god: k.god === true,
    kartPositions: G.karts.map(o => ({ x: o.pos.x, z: o.pos.z, color: o.style ? parseInt(o.style.body.slice(1), 16) : o.def.kart, isPlayer: o === k })),
  };
}
