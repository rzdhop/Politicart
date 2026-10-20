// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { beginDraft, clearDraft, getCustom, getDraft, loadCustom, normaliseRoster, setRoster } from './custom.js';
import { BASE, CHARACTERS } from './data.js';
import { defaultStyle } from './kartstyle.js';
import { G } from './state.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

afterEach(() => { localStorage.clear(); loadCustom(); });

describe('the cast in force', () => {
  it('drops the old per-browser workshop edits at load and plays the default cast', () => {
    localStorage.setItem('kr-custom', JSON.stringify({ chars: { victor: { name: 'Ancien' } }, ads: [] }));
    loadCustom();
    expect(localStorage.getItem('kr-custom')).toBeNull();
    expect(CHARACTERS[0].name).toBe(BASE[0].name);
    expect(getCustom()).toEqual({ chars: {}, ads: [] });
  });

  it('applies the server roster, kart defaults included, and marks the portraits stale', () => {
    G.thumbPoly = 'high';
    setRoster({ chars: { victor: { name: 'Jean Test', kart: '#FF0000', livery: PNG, style: { wheels: 'gold', number: 7 } } }, ads: [PNG] });
    const victor = CHARACTERS[0];
    expect(victor.name).toBe('Jean Test');
    expect(victor.title).toBe(BASE[0].title);
    expect(victor.kart).toBe(0xff0000);
    expect(victor.livery).toBe(PNG);
    expect(victor.style).toEqual({ wheels: 'gold', number: 7 });
    expect(defaultStyle(victor)).toMatchObject({ body: '#ff0000', wheels: 'gold', number: 7 });
    expect(CHARACTERS[1].style).toBeUndefined();
    expect(getCustom().ads).toEqual([PNG]);
    expect(G.thumbPoly).toBeNull();
  });

  it('goes back to the default cast, style included, when the roster no longer names a character', () => {
    setRoster({ chars: { victor: { name: 'Jean Test', style: { wheels: 'gold' } } } });
    setRoster({ chars: {}, ads: [] });
    expect(CHARACTERS[0].name).toBe(BASE[0].name);
    expect(CHARACTERS[0].style).toBeUndefined();
    expect(CHARACTERS[0].livery).toBeNull();
  });

  it('degrades a malformed answer to the default cast instead of breaking', () => {
    for (const bad of [null, 'x', [], { kr: 'server' }, { chars: [] }, { chars: { victor: 'x' } }]) {
      setRoster(bad);
      expect(CHARACTERS[0].name).toBe(BASE[0].name);
    }
    expect(normaliseRoster({
      chars: { victor: { name: 5, suit: 'red', kart: '#12345g', livery: 'javascript:x', style: { wheels: 'square', pods: false } }, nobody: { name: 'X' } },
      ads: ['http://evil/x.png', PNG, 3],
    })).toEqual({ chars: { victor: { style: { pods: false } } }, ads: [PNG] });
  });
});

describe('the workshop draft', () => {
  it('starts from the cast in force and changes nothing in the game until it is saved', () => {
    setRoster({ chars: { victor: { name: 'Jean Test' } } });
    const d = beginDraft();
    expect(d).toEqual({ chars: { victor: { name: 'Jean Test' } }, ads: [] });
    d.chars.victor.name = 'Brouillon';
    expect(getCustom().chars.victor.name).toBe('Jean Test');
    expect(CHARACTERS[0].name).toBe('Jean Test');
  });

  it('clears to the default cast in the form only', () => {
    setRoster({ chars: { victor: { name: 'Jean Test' } } });
    beginDraft();
    clearDraft();
    expect(getDraft()).toEqual({ chars: {}, ads: [] });
    expect(CHARACTERS[0].name).toBe('Jean Test');
  });
});
