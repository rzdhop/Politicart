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
  setPreviewFrame: () => {},
}));
vi.mock('../engine/race.js', () => ({
  startRace: vi.fn(),
}));
vi.mock('../engine/minimap.js', () => ({
  attachMinimap: vi.fn(),
}));
vi.mock('../engine/audio.js', () => {
  let muted = false;
  return { initAudio: () => {}, isMuted: () => muted, toggleMute: () => { muted = !muted; return muted; } };
});

import { CHARACTERS, TRACKS } from '../engine/data.js';
import { resetMachine, transition, getState } from '../engine/machine.js';
import { App } from './App';
import { hud } from './Hud';

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
    transition(s === 'select' || s === 'admin' || s === 'paused' || s === 'results' || s === 'lobby' ? 'title' : s === 'tracks' ? 'select' : 'paused');
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

/** Every id the E2E suite addresses on the HUD, and where the contract puts it. */
const HUD_IDS: Array<[string, string]> = [
  ['hud', 'DIV'], ['h-pos', 'DIV'], ['h-lap', 'DIV'], ['h-time', 'DIV'], ['minimap', 'CANVAS'],
  ['h-item', 'DIV'], ['h-power', 'DIV'], ['h-pname', 'DIV'], ['h-pbar', 'I'], ['h-pkey', 'DIV'], ['h-hint', 'DIV'],
  ['h-speed', 'SPAN'], ['h-drift', 'I'], ['h-center', 'DIV'], ['h-toast', 'DIV'], ['h-wrong', 'DIV'],
];

describe('the HUD', () => {
  it('renders every contract id on the element the original markup put it on', () => {
    const { container } = render(<App />);
    for (const [id, tag] of HUD_IDS) {
      const el = container.querySelector('#' + id);
      expect(el, '#' + id).not.toBeNull();
      expect(el!.tagName, '#' + id).toBe(tag);
    }
    expect(container.querySelector('#h-item .nm')?.textContent).toBe('aucun objet');
    expect(container.querySelector('#h-speed')?.textContent).toBe('0');
  });

  it('is hidden on the menus and registers every handle for the frame writer', () => {
    const { container } = render(<App />);
    expect((container.querySelector('#hud') as HTMLElement).hidden).toBe(true);
    expect((container.querySelector('#h-wrong') as HTMLElement).hidden).toBe(true);
    for (const key of Object.keys(hud) as Array<keyof typeof hud>) expect(hud[key], key).not.toBeNull();
  });

  it('writes through the handles without a React render: the DOM changes, the props do not', () => {
    const { container } = render(<App />);
    hud.speed!.setValue(123.4);
    hud.pos!.setPosition(1);
    hud.lap!.setText('TOUR 2/3');
    hud.item!.setItem({ icon: '⚡', label: '49.3', filled: true });
    hud.power!.setReady(true);
    hud.power!.setKeyHint('F · PRÊT !');
    hud.drift!.setValue(0.5);
    hud.wrong!.setVisible(true);
    hud.toast!.show('FIGURE !');
    hud.center!.setText('PARTEZ !');
    expect(container.querySelector('#h-speed')?.textContent).toBe('123');
    expect(container.querySelector('#h-pos')?.textContent).toBe('1er');
    expect(container.querySelector('#h-lap')?.textContent).toBe('TOUR 2/3');
    expect(container.querySelector('#h-item')?.classList.contains('has')).toBe(true);
    expect(container.querySelector('#h-item .nm')?.textContent).toBe('49.3');
    expect(container.querySelector('#h-power')?.classList.contains('ready')).toBe(true);
    expect(container.querySelector('#h-pkey')?.textContent).toBe('F · PRÊT !');
    expect((container.querySelector('#h-drift') as HTMLElement).style.width).toBe('50%');
    expect((container.querySelector('#h-wrong') as HTMLElement).hidden).toBe(false);
    expect(container.querySelector('#h-toast')?.classList.contains('on')).toBe(true);
    expect(container.querySelector('#h-center')?.textContent).toBe('PARTEZ !');
  });
});
