import { describe, expect, it } from 'vitest';

import {
  builtinStyle, cleanStyle, DEFAULT_ACCENT, defaultStyle, EXHAUSTS, MASTS, mergeStyle, NOSES, playerStyle, SKINS, SPOILERS, STICKERS,
  TRAILS, UNDERGLOWS, WHEELS,
} from './kartstyle.js';

const char = (extra = {}) => ({ id: 'victor', kart: 0x1f3a93, ...extra });

describe('cleanStyle', () => {
  it('keeps every valid field', () => {
    const s = { body: '#ff0000', accent: '#00ff00', wheels: 'gold', spoiler: 'wing', pods: false, number: 7, sticker: 'rosette' };
    expect(cleanStyle(s)).toEqual(s);
  });

  it('keeps the exhaust, underglow, mast, nose, skin and trail when they are listed values', () => {
    const s = { exhaust: 'turbine', underglow: 'rainbow', mast: 'pirate', nose: 'ram', skin: 'flames', trail: 'laser' };
    expect(cleanStyle(s)).toEqual(s);
    for (const [key, list] of [['exhaust', EXHAUSTS], ['underglow', UNDERGLOWS], ['mast', MASTS], ['nose', NOSES], ['skin', SKINS], ['trail', TRAILS]]) {
      for (const v of list) expect(cleanStyle({ [key]: v })).toEqual({ [key]: v });
    }
  });

  it('drops an unknown trail, exhaust or skin', () => {
    expect(cleanStyle({ trail: 'rainbow', exhaust: 'none', skin: 'gold', underglow: 'flat', mast: 'stock', nose: 'wing' })).toEqual({});
    expect(cleanStyle({ trail: 'LASER' })).toEqual({});
    expect(cleanStyle({ trail: null })).toEqual({});
    expect(cleanStyle({ trail: 'laser', number: 3 })).toEqual({ trail: 'laser', number: 3 });
  });

  it('lowercases colours so equal colours compare equal', () => {
    expect(cleanStyle({ body: '#FFAA00' })).toEqual({ body: '#ffaa00' });
  });

  it('drops malformed colours', () => {
    for (const body of ['red', '#fff', '#12345g', '#1234567', 0xff0000, null, ' #ff0000']) {
      expect(cleanStyle({ body })).toEqual({});
    }
  });

  it('drops values outside each list', () => {
    expect(cleanStyle({ wheels: 'square', spoiler: 'jet', sticker: 'skull' })).toEqual({});
    expect(cleanStyle({ wheels: 'GOLD' })).toEqual({});
  });

  it('accepts race numbers 0 to 99 and null, nothing else', () => {
    expect(cleanStyle({ number: 0 })).toEqual({ number: 0 });
    expect(cleanStyle({ number: 99 })).toEqual({ number: 99 });
    expect(cleanStyle({ number: null })).toEqual({ number: null });
    for (const number of [-1, 100, 7.5, '7', NaN, Infinity]) expect(cleanStyle({ number })).toEqual({});
  });

  it('wants a real boolean for pods', () => {
    expect(cleanStyle({ pods: 'false' })).toEqual({});
    expect(cleanStyle({ pods: 0 })).toEqual({});
  });

  it('ignores unknown keys and anything inherited', () => {
    const proto = { body: '#ff0000' };
    const s = Object.create(proto);
    s.junk = 1;
    expect(cleanStyle(s)).toEqual({});
    expect(cleanStyle(JSON.parse('{"__proto__":{"body":"#ff0000"},"constructor":1}'))).toEqual({});
  });

  it('cleans non-objects to an empty style', () => {
    for (const v of [null, undefined, 'x', 3, true, ['#ff0000']]) expect(cleanStyle(v)).toEqual({});
  });
});

describe('builtinStyle', () => {
  it('reproduces the original kart', () => {
    expect(builtinStyle(char())).toEqual({
      body: '#1f3a93', accent: DEFAULT_ACCENT, wheels: 'classic', spoiler: 'standard', pods: true, number: null, sticker: 'none',
      exhaust: 'stock', underglow: 'none', mast: 'none', nose: 'stock', skin: 'flat', trail: 'none',
    });
  });

  it('uses only values the cleaner accepts', () => {
    const s = builtinStyle(char({ kart: 0x00000f }));
    expect(cleanStyle(s)).toEqual(s);
    expect(WHEELS).toContain(s.wheels);
    expect(SPOILERS).toContain(s.spoiler);
    expect(STICKERS).toContain(s.sticker);
    expect(EXHAUSTS).toContain(s.exhaust);
    expect(UNDERGLOWS).toContain(s.underglow);
    expect(MASTS).toContain(s.mast);
    expect(NOSES).toContain(s.nose);
    expect(SKINS).toContain(s.skin);
    expect(TRAILS).toContain(s.trail);
  });

  it('starts every new part on its free option and without a trail', () => {
    const s = builtinStyle(char());
    expect([s.exhaust, s.underglow, s.mast, s.nose, s.skin, s.trail]).toEqual(['stock', 'none', 'none', 'stock', 'flat', 'none']);
  });
});

describe('fallbacks', () => {
  it('mergeStyle lays partials over the base, later ones winning', () => {
    const base = builtinStyle(char());
    expect(mergeStyle(base, { number: 3 }, { number: 9, wheels: 'chrome' })).toEqual({ ...base, number: 9, wheels: 'chrome' });
  });

  it('mergeStyle ignores invalid fields instead of overwriting with them', () => {
    const base = builtinStyle(char());
    expect(mergeStyle(base, { body: 'nope', number: 500 })).toEqual(base);
  });

  it('defaultStyle applies the admin defaults of the character', () => {
    const s = defaultStyle(char({ style: { wheels: 'gold', number: 1 } }));
    expect(s.wheels).toBe('gold');
    expect(s.number).toBe(1);
    expect(s.body).toBe('#1f3a93');
  });

  it('playerStyle keeps the character default for every field the player left alone', () => {
    const c = char({ style: { wheels: 'gold', sticker: 'etoile' } });
    const s = playerStyle(c, { number: 42, wheels: 'offroad' });
    expect(s).toEqual({ ...builtinStyle(c), sticker: 'etoile', wheels: 'offroad', number: 42 });
  });

  it('playerStyle with no edits is the character default', () => {
    const c = char({ style: { spoiler: 'none' } });
    expect(playerStyle(c, undefined)).toEqual(defaultStyle(c));
  });
});
