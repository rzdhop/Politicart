import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';

import { BOX_SOUNDS, setSfxSink } from './audio.js';
import { PODIUM } from './hemicycle.js';
import {
  BLACKOUT, boxIndex, boxInfo, boxPhase, boxScene, dropGrade, frameBoxCamera, GRADE_COLOUR, makeTimeline, OPENING, PHASE_TIME, PHASES, playOpening, REVEAL_TIME,
  skipOpening, stepOpening, stopOpening, TEASE_RATE,
} from './lootbox.js';
import { getPoly, togglePoly } from './state.js';
import { STAGE_POOL } from './trail.js';

// The Politibox opening runs headless here: the timeline is pure, and the
// scene (the hemicycle stage, the urn, the prize) is plain Three.js objects
// that are posed but never drawn.

const DROPS = {
  char: { kind: 'char', id: 'lucie', grade: 'common', duplicate: false, refund: 0 },
  part: { kind: 'part', id: 'wheels:gold', grade: 'mythic', duplicate: true, refund: 400 },
  trail: { kind: 'trail', id: 'laser', grade: 'incredible', duplicate: false, refund: 0 },
  coins: { kind: 'coins', amount: 50 },
};
/** A bundle of five: every kind, the incredible one in the middle. */
const BUNDLE = [DROPS.coins, DROPS.char, DROPS.trail, DROPS.part, { kind: 'coins', amount: 500 }];
/** The phases one opening reports, then hold. */
const ONE = [...OPENING, 'hold'];
/** The tease of a drop, with the incredible blackout beat. */
const tease = drop => PHASE_TIME.tease + (dropGrade(drop) === 'incredible' ? BLACKOUT : 0);

afterEach(() => { stopOpening(); setSfxSink(null); if (getPoly() !== 'high') togglePoly(); });

/** Run an opening with a fake clock of `dt` steps for `seconds`, and say which phases were reported (with their opening's index). */
function runFor(drops, seconds, { dt = 1 / 60, cut = null, indexed = false } = {}) {
  const seen = [];
  playOpening(drops, { onPhase: (p, i) => seen.push(indexed ? [p, i] : p), cut });
  for (let t = 0; t < seconds; t += dt) stepOpening(dt);
  return seen;
}

describe('the Politibox timeline', () => {
  it('names every phase, the bundle pause included, in the order they play', () => {
    expect(PHASES).toEqual(['drop', 'spin', 'tease', 'burst', 'reveal', 'next', 'hold']);
    expect(OPENING).toEqual(['drop', 'spin', 'tease', 'burst', 'reveal']);
    expect(PHASE_TIME).toEqual({ drop: 0.6, spin: 1.0, tease: 1.4, burst: 0.5, next: 0.8 });
    expect(BLACKOUT).toBe(0.3);
    expect(Object.keys(TEASE_RATE)).toEqual(Object.keys(GRADE_COLOUR));
    expect(TEASE_RATE.common).toBeLessThan(TEASE_RATE.rare);
    expect(TEASE_RATE.mythic).toBeLessThan(TEASE_RATE.incredible);
  });

  it.each(Object.entries(DROPS))('plays drop, spin, tease, burst, reveal, hold in order for a %s, with the set durations', (kind, drop) => {
    const tl = makeTimeline(drop);
    const t = tease(drop);
    expect(tl.count).toBe(1);
    expect(tl.durations).toEqual({ drop: 0.6, spin: 1.0, tease: t, burst: 0.5, reveal: REVEAL_TIME[kind] });
    expect(tl.starts).toEqual({ drop: 0, spin: 0.6, tease: 1.6, burst: 1.6 + t, reveal: 2.1 + t });
    expect(tl.duration).toBeCloseTo(2.1 + t + REVEAL_TIME[kind], 10);
    const names = [];
    for (let s = 0; s < tl.duration + 2; s += 0.05) { const n = tl.phase(s).name; if (names.at(-1) !== n) names.push(n); }
    expect(names).toEqual(ONE);
    for (const name of OPENING) {
      expect(tl.phase(tl.starts[name]).name, name + ' starts').toBe(name);
      expect(tl.phase(tl.starts[name]).k).toBe(0);
      expect(tl.phase(tl.starts[name]).index).toBe(0);
      expect(tl.phase(tl.starts[name] + tl.durations[name] * 0.5).k).toBeCloseTo(0.5, 10);
    }
    expect(tl.phase(tl.duration + 10)).toMatchObject({ name: 'hold', k: 1, index: 0 });
  });

  it('keeps the timed phases the same for every prize but the blackout beat; only the reveal changes by kind', () => {
    const plain = Object.values(DROPS).filter(d => dropGrade(d) !== 'incredible');
    expect(new Set(plain.map(d => makeTimeline(d).starts.reveal))).toEqual(new Set([3.5]));
    expect(makeTimeline(DROPS.trail).starts.reveal).toBe(3.8);
    expect(makeTimeline(DROPS.trail).durations.tease).toBe(1.7);
  });

  it('chains a bundle: five openings with a next pause between, hold after the last', () => {
    const tl = makeTimeline(BUNDLE);
    expect(tl.count).toBe(5);
    expect(tl.segments.map(s => s.name)).toEqual([...OPENING, 'next', ...OPENING, 'next', ...OPENING, 'next', ...OPENING, 'next', ...OPENING, 'hold']);
    expect(tl.segments.filter(s => s.name === 'next').map(s => s.duration)).toEqual([0.8, 0.8, 0.8, 0.8]);
    // each opening starts where the pause before it ended
    let at = 0;
    BUNDLE.forEach((drop, i) => {
      expect(tl.phase(at)).toMatchObject({ name: 'drop', index: i, k: 0 });
      at += 2.1 + tease(drop) + REVEAL_TIME[drop.kind];
      if (i < 4) { expect(tl.phase(at)).toMatchObject({ name: 'next', index: i, k: 0 }); at += 0.8; }
    });
    expect(tl.duration).toBeCloseTo(at, 6);
    expect(tl.phase(tl.duration)).toMatchObject({ name: 'hold', index: 4 });
    expect(tl.revealAt(2)).toBe(tl.segments.find(s => s.index === 2 && s.name === 'reveal').start);
  });

  it('skips to the burst before it, to the reveal from it, and nowhere after a single box', () => {
    const tl = makeTimeline(DROPS.char);
    for (const t of [0, 0.3, 1.0, 2.5, 2.99]) expect(tl.skip(t)).toBe(tl.starts.burst);
    for (const t of [3.0, 3.2, 3.49]) expect(tl.skip(t)).toBe(tl.starts.reveal);
    for (const t of [3.5, 4.5, 20]) expect(tl.skip(t)).toBe(t);
  });

  it('skips a bundle on to the next urn from a reveal or a pause, and nowhere after the last reveal', () => {
    const tl = makeTimeline(BUNDLE);
    const at = (i, name) => tl.segments.find(s => s.index === i && s.name === name).start;
    expect(tl.skip(at(1, 'spin') + 0.2)).toBe(at(1, 'burst'));
    expect(tl.skip(at(1, 'burst') + 0.1)).toBe(at(1, 'reveal'));
    expect(tl.skip(at(1, 'reveal') + 0.3)).toBe(at(2, 'drop'));
    expect(tl.skip(at(1, 'next') + 0.3)).toBe(at(2, 'drop'));
    expect(tl.skip(at(4, 'reveal') + 0.3)).toBe(at(4, 'reveal') + 0.3);
    expect(tl.skip(tl.duration + 3)).toBe(tl.duration + 3);
  });

  it('gives a coin win a grade by its size, and an item the catalogue\'s', () => {
    expect(dropGrade(DROPS.part)).toBe('mythic');
    expect(dropGrade({ kind: 'coins', amount: 5 })).toBe('common');
    expect(dropGrade({ kind: 'coins', amount: 100 })).toBe('rare');
    expect(dropGrade({ kind: 'coins', amount: 500 })).toBe('mythic');
    expect(dropGrade({ kind: 'char', id: 'x', grade: 'bogus' })).toBe('common');
    expect(dropGrade(null)).toBe('common');
  });
});

describe('an opening', () => {
  it('is idle until one starts, and again once stopped, the scene gone with it', () => {
    expect(boxPhase()).toBe('idle');
    expect(boxIndex()).toBe(-1);
    expect(boxScene()).toBeNull();
    playOpening(DROPS.coins);
    expect(boxPhase()).toBe('drop');
    expect(boxIndex()).toBe(0);
    expect(boxScene()).not.toBeNull();
    stopOpening();
    expect(boxPhase()).toBe('idle');
    expect(boxScene()).toBeNull();
    expect(() => skipOpening()).not.toThrow();
    expect(stepOpening(0.1)).toBeNull();
  });

  it.each(Object.entries(DROPS))('reports every phase once, in order, under a fake clock (%s)', (_kind, drop) => {
    expect(runFor(drop, 8)).toEqual(ONE);
    expect(boxPhase()).toBe('hold');
  });

  it('reports every phase it passes even when one frame jumps over several', () => {
    const seen = [];
    playOpening(DROPS.part, { onPhase: p => seen.push(p) });
    stepOpening(3.6);
    expect(seen).toEqual([...OPENING]);
  });

  it('jumps to the burst on a tap before it, then to the reveal on the next, reporting each at once', () => {
    const seen = [];
    playOpening(DROPS.char, { onPhase: p => seen.push(p) });
    stepOpening(0.2);
    skipOpening();
    expect(boxPhase()).toBe('burst');
    expect(seen).toEqual(['drop', 'spin', 'tease', 'burst']);
    stepOpening(0.1);
    skipOpening();
    expect(boxPhase()).toBe('reveal');
    expect(seen.at(-1)).toBe('reveal');
    skipOpening();                                   // nothing left to skip
    expect(boxPhase()).toBe('reveal');
    for (let i = 0; i < 120; i++) stepOpening(1 / 30);
    expect(boxPhase()).toBe('hold');
    expect(seen).toEqual(ONE);
  });

  it('plays a bundle through: five reveals with a pause between, each phase told with its opening', () => {
    const seen = runFor(BUNDLE, 30, { dt: 1 / 30, indexed: true });
    const expected = [];
    BUNDLE.forEach((_, i) => { for (const p of OPENING) expected.push([p, i]); if (i < 4) expected.push(['next', i]); });
    expected.push(['hold', 4]);
    expect(seen).toEqual(expected);
    expect(boxPhase()).toBe('hold');
    expect(boxIndex()).toBe(4);
  });

  it('taps a bundle along: two taps a reveal, a third on to the next urn, and the last reveal stays', () => {
    const seen = [];
    playOpening(BUNDLE, { onPhase: (p, i) => seen.push(p + i) });
    for (let i = 0; i < 5; i++) {
      skipOpening(); expect(boxPhase()).toBe('burst'); expect(boxIndex()).toBe(i);
      skipOpening(); expect(boxPhase()).toBe('reveal');
      stepOpening(0.2);
      skipOpening();
      if (i < 4) { expect(boxPhase()).toBe('drop'); expect(boxIndex()).toBe(i + 1); }
      else { expect(boxPhase()).toBe('reveal'); expect(boxIndex()).toBe(4); }
    }
    expect(seen.filter(s => s.startsWith('reveal'))).toEqual(['reveal0', 'reveal1', 'reveal2', 'reveal3', 'reveal4']);
    expect(seen.filter(s => s.startsWith('next'))).toEqual(['next0', 'next1', 'next2', 'next3']);   // the pauses tapped over are still reported, as every phase a skip passes is
  });

  it('cuts every opening straight to its reveal where the stage does not move', () => {
    const seen = [];
    playOpening(DROPS.part, { onPhase: p => seen.push(p), cut: true });
    expect(seen).toEqual([...OPENING]);
    expect(boxPhase()).toBe('reveal');
    stopOpening();
    const bundle = runFor(BUNDLE, 12, { dt: 1 / 30, cut: true, indexed: true });
    // the five reveals and the pauses between, each opening's build-up reported in one go
    expect(bundle.filter(([p]) => p === 'reveal').map(([, i]) => i)).toEqual([0, 1, 2, 3, 4]);
    expect(bundle.filter(([p]) => p === 'next')).toHaveLength(4);
    expect(bundle.at(-1)).toEqual(['hold', 4]);
    expect(boxScene().getObjectByName('prize').visible).toBe(true);
  });

  it('plays the box sounds from the timeline: one a step, the reveal\'s by grade, coins raining on a coin win', () => {
    const heard = [];
    setSfxSink(name => heard.push(name));
    runFor(DROPS.coins, 8);
    expect(heard[0]).toBe('box_drop');
    expect(heard).toContain('box_rattle');
    expect(heard).toContain('box_tease');
    expect(heard.filter(n => n === 'box_tease').length).toBeGreaterThanOrEqual(2);
    expect(heard).toContain('box_burst');
    expect(heard.indexOf('box_burst')).toBeGreaterThan(heard.lastIndexOf('box_tease'));
    expect(heard.slice(heard.indexOf('box_burst'))).toEqual(['box_burst', 'box_reveal_rare', 'coin_rain']);
    for (const n of heard) expect(BOX_SOUNDS, n).toContain(n);
    heard.length = 0;
    playOpening(DROPS.trail);   // incredible: a faster pulse, its own fanfare
    skipOpening(); skipOpening();
    expect(heard).toEqual(['box_drop', 'box_burst', 'box_reveal_incredible']);   // a skip plays the phase it lands on, not the ones it jumped
  });

  it('streams the real stage trail behind the circling kart of a trail prize, and forgets it with the prize', () => {
    const trailGroup = () => { const found = []; boxScene().traverse(o => { if (o.name === 'trail:laser') found.push(o); }); return found; };
    runFor(DROPS.trail, 8);
    const [g] = trailGroup();
    expect(trailGroup()).toHaveLength(1);
    expect(g.children).toHaveLength(STAGE_POOL);                   // trail.js's stage pool, not a stand-in
    expect(g.children.some(o => o.visible)).toBe(true);            // the kart has been circling since the reveal
    for (const o of g.children) { expect(Number.isFinite(o.position.x)).toBe(true); expect(Number.isFinite(o.position.z)).toBe(true); }
    expect(boxScene().getObjectByName('rig:' + boxScene().getObjectByName('prize').children[0].children[0].userData.id)).toBeTruthy();
    runFor(DROPS.coins, 0.1);
    expect(trailGroup()).toHaveLength(0);
  });

  it('puts a stage rig with its pilot on the podium for a candidate, a bare kart for a part, a coin fountain for coins', () => {
    runFor(DROPS.char, 8);
    const prize = boxScene().getObjectByName('prize');
    expect(prize.children[0].name).toBe('rig:lucie');
    expect(prize.children[0].userData.pilot).toBeTruthy();
    expect(prize.visible).toBe(true);
    expect(prize.position.y).toBeCloseTo(0, 5);
    runFor(DROPS.part, 8);
    expect(prize.children[0].userData.driver.visible).toBe(false);
    expect(prize.children[0].userData.pilot).toBeUndefined();
    runFor(DROPS.coins, 8);
    const coins = boxScene().getObjectByName('coins');
    expect(coins.isInstancedMesh).toBe(true);
    expect(coins.count).toBeGreaterThanOrEqual(14);
    // the urn is built from stage materials: never a race (primitives.mat) instance
    boxScene().getObjectByName('urn').traverse(o => { if (o.isMesh) expect(o.material.userData.stage ?? 'own').toBeTruthy(); });
  });

  it('starts over from the drop when a new opening replaces one in progress', () => {
    runFor(DROPS.trail, 2);
    const seen = runFor(DROPS.coins, 0.1);
    expect(seen).toEqual(['drop']);
    expect(boxPhase()).toBe('drop');
  });

  it('keeps the stage\'s light rig fixed: no light is added for the urn, the glow or the prize', () => {
    runFor(DROPS.part, 8);
    let lights = 0; boxScene().traverse(o => { if (o.isLight) lights++; });
    expect(lights).toBe(5);
  });

  it('tints the LED strips and the sky with the grade during the tease, and bursts the stage confetti', () => {
    playOpening(DROPS.part);
    const leds = boxScene().getObjectByName('leds'), sky = boxScene().getObjectByName('sky');
    const goldLeds = leds.material.color.clone();
    for (let t = 0; t < 2.3; t += 1 / 60) stepOpening(1 / 60);      // into the tease, half way
    expect(boxPhase()).toBe('tease');
    expect(leds.material.color.equals(goldLeds)).toBe(false);
    const grade = new THREE.Color(GRADE_COLOUR.mythic).convertSRGBToLinear();
    const c = leds.material.color.clone().multiplyScalar(1 / Math.max(leds.material.color.r, leds.material.color.g, leds.material.color.b));
    expect(c.b).toBeGreaterThan(c.g);                                // mythic's purple, not the gold
    expect(sky.material.uniforms.uTint.value.b).toBeGreaterThan(sky.material.uniforms.uTint.value.g);
    skipOpening();                                                   // the burst
    expect(sky.material.uniforms.uTint.value.r).toBeCloseTo(grade.r, 3);
    expect(boxScene().getObjectByName('sparks').count).toBe(120);
  });
});

describe('the box camera', () => {
  const ndc = (cam, x, y, z) => new THREE.Vector3(x, y, z).project(cam);
  const sizes = [['landscape', 1440, 900], ['portrait', 390, 844]];

  it.each(sizes)('keeps the urn on the podium in the frame while it drops, spins and teases (%s)', (_n, W, H) => {
    // at the drop's start the urn is above the frame on purpose: it falls into it
    for (const ph of [{ name: 'drop', k: 0.5 }, { name: 'drop', k: 1 }, { name: 'spin', k: 0.5 }, { name: 'tease', k: 0.5 }, { name: 'burst', k: 0 }]) {
      const cam = frameBoxCamera(ph, W, H);
      const yUrn = ph.name === 'drop' && ph.k === 0.5 ? 1.9 : 0;
      for (const [x, y, z] of [[-1.3, PODIUM.top + yUrn, 1], [1.3, PODIUM.top + yUrn + 2.5, 1], [0, 0, PODIUM.foot]]) {
        const p = ndc(cam, x, y, z);
        expect(Math.abs(p.x), ph.name + ' x').toBeLessThan(1);
        expect(Math.abs(p.y), ph.name + ' y').toBeLessThan(1);
      }
    }
  });

  it.each(sizes)('frames the prize in the upper part of the screen once revealed, clear of the result card (%s)', (_n, W, H) => {
    const cam = frameBoxCamera({ name: 'hold', k: 1 }, W, H);
    const head = ndc(cam, 0, PODIUM.top + 3.9, 0), foot = ndc(cam, 0, PODIUM.top, 0), side = ndc(cam, 2.2, PODIUM.top + 1, 0);
    expect(head.y).toBeLessThan(0.98);
    expect(foot.y).toBeGreaterThan(-0.2);      // the podium's top sits above the lower fifth, where the card rises
    expect(Math.abs(side.x)).toBeLessThan(1);
    expect(cam.far).toBeGreaterThan(200);
  });
});

describe('the box scene budget', () => {
  it.each(['high', 'low'])('stays within the stage\'s order of size on %s, every prize kind included', tier => {
    if (getPoly() !== tier) togglePoly();
    const seen = {};
    for (const [kind, drop] of Object.entries(DROPS)) {
      runFor(drop, 8);
      const i = boxInfo();
      expect(i.tier).toBe(tier);
      seen[kind] = i;
      expect(i.meshes).toBeLessThan(tier === 'high' ? 260 : 120);
      expect(i.triangles).toBeLessThan(tier === 'high' ? 700_000 : 260_000);
    }
    stopOpening();
    expect(boxInfo()).toBeNull();
    // eslint-disable-next-line no-console
    console.log('box scene ' + tier + ': ' + Object.entries(seen).map(([k, i]) => `${k} ${i.meshes} meshes / ${i.triangles} tris (stage alone ${i.stage.draws} draws / ${i.stage.triangles} tris)`).join('; '));
  });
});
