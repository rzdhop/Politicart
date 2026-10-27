// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import { emptyOwned } from './catalog.js';
import { getGarage, getOwned, loadGarage, myStyle, resetGarage, setGarage, setOwned } from './garage.js';
import { defaultStyle } from './kartstyle.js';

const victor = CHARACTERS[0];

beforeEach(() => { localStorage.clear(); resetGarage(); setOwned(null); });

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

describe('the Garage under an economy (DEC-035)', () => {
  it('renders every edit when there is no economy (the static build)', () => {
    setGarage('wheels', 'gold'); setGarage('trail', 'laser');
    expect(getOwned()).toBeNull();
    expect(myStyle(victor)).toEqual({ ...defaultStyle(victor), wheels: 'gold', trail: 'laser' });
  });

  it('drops an unowned part on a server, keeps the edit itself, and lets colours and the number through', () => {
    setGarage('wheels', 'gold'); setGarage('number', 7); setGarage('body', '#ff0000'); setGarage('spoiler', 'none');
    setOwned({ chars: [], parts: ['spoiler:wing'], trails: [] });
    expect(myStyle(victor).wheels).toBe(defaultStyle(victor).wheels);
    expect(myStyle(victor)).toMatchObject({ number: 7, body: '#ff0000', spoiler: 'none' });
    expect(getGarage()).toMatchObject({ wheels: 'gold' });
  });

  it('owns the commons only for a guest on a server', () => {
    setGarage('sticker', 'tricolore'); setGarage('sticker', 'marianne'); setGarage('trail', 'smoke');
    setOwned(emptyOwned());
    expect(myStyle(victor).sticker).toBe(defaultStyle(victor).sticker);
    expect(myStyle(victor).trail).toBe('none');
    setGarage('sticker', 'tricolore');
    expect(myStyle(victor).sticker).toBe('tricolore');
  });

  it('renders a part once it is owned, and cleans what it is told', () => {
    setGarage('wheels', 'gold'); setGarage('trail', 'laser');
    setOwned({ chars: ['lucie'], parts: ['wheels:gold', 'wheels:nonsense'], trails: ['laser'], junk: 1 });
    expect(getOwned()).toEqual({ chars: ['lucie'], parts: ['wheels:gold'], trails: ['laser'] });
    expect(myStyle(victor)).toMatchObject({ wheels: 'gold', trail: 'laser' });
  });

  it('never filters the admin\'s character defaults, only the player\'s edits', () => {
    const styled = { ...victor, style: { wheels: 'gold' } };
    setOwned(emptyOwned());
    expect(myStyle(styled).wheels).toBe('gold');
  });
});
