// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The screens call the engine through the store. The engine's rendering
// modules open a WebGL context at import, which jsdom cannot, so those are
// stubbed; the machine, the data and the custom store are the real ones.
vi.mock('../engine/preview.js', () => ({
  hasPreview: () => false,
  makeThumbs: () => ({}),
  setPreview: () => {},
}));
vi.mock('../engine/race.js', () => ({
  startRace: vi.fn(),
}));
vi.mock('../engine/audio.js', () => {
  let muted = false;
  return { initAudio: () => {}, isMuted: () => muted, toggleMute: () => { muted = !muted; return muted; } };
});

import { CHARACTERS, TRACKS } from '../engine/data.js';
import { resetMachine, transition, getState } from '../engine/machine.js';
import { App } from './App';

/** Every id the E2E suite addresses on the six screens and the note. */
const CONTRACT_IDS = [
  's-title', 'b-play', 'b-poly', 'b-mute', 'b-admin',
  's-admin', 'admin-chars', 'ad-files', 'ad-preview', 'b-admin-reset', 'b-admin-save',
  's-select', 'roster', 'showcase', 'b-back1', 'b-next1',
  's-tracks', 'trackcards', 'b-back2', 'b-start',
  's-pause', 'b-resume', 'b-quit',
  's-results', 'r-title', 'r-sub', 'r-body', 'b-again', 'b-menu',
  'note',
];

beforeEach(() => {
  // resetMachine clears listeners too; the store re-subscribes when imported,
  // so import order matters: App (and thus the store) is imported above, and
  // we only ever reset to 'title' without clearing by going through transitions.
  while (getState() !== 'title') {
    const s = getState();
    transition(s === 'select' || s === 'admin' || s === 'paused' || s === 'results' ? 'title' : s === 'tracks' ? 'select' : 'paused');
  }
});
afterEach(() => { cleanup(); });

describe('the React screens', () => {
  it('render every element id the E2E suite drives', () => {
    const { container } = render(<App />);
    for (const id of CONTRACT_IDS) expect(container.querySelector('#' + id), '#' + id).not.toBeNull();
  });

  it('show only the title screen at the start, with the note visible and the HUD-less layout', () => {
    const { container } = render(<App />);
    const visible = [...container.querySelectorAll('section.screen')].filter(s => !(s as HTMLElement).hidden).map(s => s.id);
    expect(visible).toEqual(['s-title']);
    expect((container.querySelector('#note') as HTMLElement).hidden).toBe(false);
  });

  it('follow the machine: play opens the roster with eleven tiles and the chosen candidate in the showcase', () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#b-play')!);
    expect(getState()).toBe('select');
    expect((container.querySelector('#s-select') as HTMLElement).hidden).toBe(false);
    expect((container.querySelector('#s-title') as HTMLElement).hidden).toBe(true);
    expect(container.querySelectorAll('#roster .tile')).toHaveLength(CHARACTERS.length);
    expect(container.querySelectorAll('#roster .tile.sel')).toHaveLength(1);
    expect(container.querySelector('#showcase .big')?.textContent).toBe(CHARACTERS[0]!.name);
    expect(container.querySelectorAll('#showcase .stat')).toHaveLength(3);
    expect(container.querySelector('#showcase .powerbox')).not.toBeNull();
  });

  it('select a candidate on click and keep the gold ring on exactly one tile', () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#b-play')!);
    const tiles = container.querySelectorAll('#roster .tile');
    fireEvent.click(tiles[3]!);
    expect(tiles[3]!.classList.contains('sel')).toBe(true);
    expect(container.querySelectorAll('#roster .tile.sel')).toHaveLength(1);
    expect(container.querySelector('#showcase .big')?.textContent).toBe(CHARACTERS[3]!.name);
  });

  it('render the three circuits as cards with a name, a description and a canvas', () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#b-play')!);
    fireEvent.click(container.querySelector('#b-next1')!);
    expect(getState()).toBe('tracks');
    const cards = container.querySelectorAll('#trackcards .card');
    expect(cards).toHaveLength(TRACKS.length);
    expect(cards[0]!.querySelector('.name')?.textContent).toBe(TRACKS[0]!.name);
    expect(cards[0]!.querySelector('.desc')).not.toBeNull();
    expect(cards[0]!.querySelector('canvas')).not.toBeNull();
    fireEvent.click(cards[2]!);
    expect(cards[2]!.classList.contains('sel')).toBe(true);
    expect(container.querySelectorAll('#trackcards .card.sel')).toHaveLength(1);
  });

  it('flip the graphics and sound button labels', () => {
    const { container } = render(<App />);
    const poly = container.querySelector('#b-poly')!;
    const mute = container.querySelector('#b-mute')!;
    expect(poly.textContent).toContain('détaillés');
    fireEvent.click(poly);
    expect(poly.textContent).toContain('légers');
    expect(mute.textContent).toBe('Son : activé');
    fireEvent.click(mute);
    expect(mute.textContent).toBe('Son : coupé');
  });

  it('build the workshop form with one card per candidate and the contract input ids', () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#b-admin')!);
    expect(getState()).toBe('admin');
    expect(container.querySelectorAll('#admin-chars .card')).toHaveLength(CHARACTERS.length);
    const first = CHARACTERS[0]!.id;
    const name = container.querySelector('#adm-name-' + first) as HTMLInputElement;
    expect(name.value).toBe(CHARACTERS[0]!.name);
    expect(container.querySelector('#adm-title-' + first)).not.toBeNull();
    expect(container.querySelector('#adm-kart-' + first)).not.toBeNull();
    expect(container.querySelector('#ad-preview .disclaimer')).not.toBeNull();
  });

  it('go back to the title from the workshop on save, and report the save on the button', () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#b-admin')!);
    fireEvent.click(container.querySelector('#b-admin-save')!);
    expect(getState()).toBe('title');
    expect(container.querySelector('#b-admin')?.textContent).toContain('enregistré');
  });
});
