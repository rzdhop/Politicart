// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { getGarage, loadGarage, myStyle, resetGarage, setGarage } from './garage.js';
import { defaultStyle } from './kartstyle.js';

const victor = CHARACTERS[0];

beforeEach(() => { localStorage.clear(); resetGarage(); });

describe('the Garage edits', () => {
  it('start empty, so the kart is the character default', () => {
    expect(getGarage()).toEqual({});
    expect(myStyle(victor)).toEqual(defaultStyle(victor));
  });

  it('keep a valid change, persist it and apply it to any character', () => {
    expect(setGarage('number', 42)).toBe(true);
    expect(setGarage('wheels', 'gold')).toBe(true);
    expect(JSON.parse(localStorage.getItem('kr-kart'))).toEqual({ number: 42, wheels: 'gold' });
    for (const c of CHARACTERS) expect(myStyle(c)).toEqual({ ...defaultStyle(c), number: 42, wheels: 'gold' });
  });

  it('ignore an invalid change and keep the previous value', () => {
    setGarage('number', 7);
    expect(setGarage('number', 500)).toBe(false);
    expect(setGarage('sticker', 'skull')).toBe(false);
    expect(setGarage('toString', 'x')).toBe(false);
    expect(getGarage()).toEqual({ number: 7 });
  });

  it('come back from storage, cleaned', () => {
    localStorage.setItem('kr-kart', JSON.stringify({ body: '#ABCDEF', number: 1000, junk: true }));
    expect(loadGarage()).toEqual({ body: '#abcdef' });
  });

  it('survive corrupt storage', () => {
    localStorage.setItem('kr-kart', '{not json');
    expect(loadGarage()).toEqual({});
  });

  it('reset to nothing, in memory and in storage', () => {
    setGarage('spoiler', 'wing');
    resetGarage();
    expect(getGarage()).toEqual({});
    expect(localStorage.getItem('kr-kart')).toBeNull();
  });
});
