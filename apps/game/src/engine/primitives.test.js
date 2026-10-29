// The sign cache and the race's disposal registry: a sign's texture and
// material are shared by every mesh that shows it, and what a race
// registers as disposable is freed with its scene.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { signCount, textPlane } from './primitives.js';
import { disposeScene } from './race.js';
import { G, disposable } from './state.js';

describe('textPlane', () => {
  it('shares one texture and material per distinct sign, with a mesh and a geometry per call', () => {
    const n = signCount();
    const a = textPlane(4, 1.2, 'TRAVAUX', '#f2c14e', '#111', 90), b = textPlane(4, 1.2, 'TRAVAUX', '#f2c14e', '#111', 90);
    expect(a).not.toBe(b); expect(a.geometry).not.toBe(b.geometry);
    expect(a.material).toBe(b.material); expect(a.material.map).toBe(b.material.map);
    expect(a.material.map.name).toBe('sign:TRAVAUX');
    expect(a.geometry.parameters).toMatchObject({ width: 4, height: 1.2 });
    expect(signCount()).toBe(n + 1);
    const c = textPlane(4, 1.2, 'PRIORITÉ', '#fff', '#c8102e', 90), d = textPlane(4, 1.2, 'TRAVAUX', '#fff', '#111', 90), e = textPlane(4, 1.2, 'TRAVAUX', '#f2c14e', '#111');
    expect(new Set([a.material, c.material, d.material, e.material]).size).toBe(4);
    expect(signCount()).toBe(n + 4);
    expect(textPlane(4, 1.2, 'TRAVAUX', '#f2c14e', '#111', 72).material).toBe(e.material);   // 72 is the default size
    expect(a.material.side).toBe(THREE.DoubleSide);
  });
});

describe('the disposal registry', () => {
  it('returns what it registers, and disposeScene frees the registry with the scene\'s geometries', () => {
    const before = G.disposables;
    G.disposables = [];
    const t = new THREE.Texture(), m = new THREE.MeshBasicMaterial();
    expect(disposable(t)).toBe(t); expect(disposable(m)).toBe(m);
    expect(G.disposables).toEqual([t, m]);
    let freed = 0; t.addEventListener('dispose', () => freed++); m.addEventListener('dispose', () => freed++);
    const scene = new THREE.Scene(), g = new THREE.BoxGeometry(1, 1, 1); scene.add(new THREE.Mesh(g, m)); g.addEventListener('dispose', () => freed++);
    disposeScene(scene);
    expect(freed).toBe(3);
    expect(G.disposables).toEqual([]);
    G.disposables = before;
  });
});
