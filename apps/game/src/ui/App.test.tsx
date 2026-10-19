// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
vi.mock('../engine/minimap.js', () => ({
  attachMinimap: vi.fn(),
}));
vi.mock('../engine/audio.js', () => {
  let muted = false;
  return { initAudio: () => {}, isMuted: () => muted, toggleMute: () => { muted = !muted; return muted; } };
});

import { setRoster } from '../engine/custom.js';
import { BASE, CHARACTERS, TRACKS } from '../engine/data.js';
import { resetMachine, transition, getState } from '../engine/machine.js';
import { App } from './App';
import { hud } from './Hud';
import { actions } from './store';

/**
 * Every id the E2E suite addresses on the screens and the note. The admin's
 * ids exist only on the game server, so they are listed apart and asserted
 * under the session that shows them (ADMIN_IDS, LOGIN_IDS).
 */
const CONTRACT_IDS = [
  's-title', 'b-play', 'b-poly', 'b-mute',
  's-select', 'roster', 'showcase', 'b-back1', 'b-garage', 'b-next1',
  's-garage', 'g-body', 'g-accent', 'g-number', 'g-wheels-gold', 'g-spoiler-wing', 'g-pods-off', 'g-sticker-rosette', 'b-garage-reset', 'b-garage-back',
  's-tracks', 'trackcards', 'b-back2', 'b-start',
  's-pause', 'b-resume', 'b-quit',
  's-results', 'r-title', 'r-sub', 'r-body', 'b-again', 'b-menu',
  'note',
];

/** The workshop's contract ids, rendered only inside an admin session. */
const ADMIN_IDS = [
  'b-admin', 'b-logout',
  's-admin', 'admin-chars', 'ad-files', 'ad-preview', 'admin-error', 'b-admin-reset', 'b-admin-save',
  'adm-name-victor', 'adm-title-victor', 'adm-quote-victor', 'adm-suit-victor', 'adm-kart-victor', 'adm-livery-victor', 'adm-livimg-victor',
  'adm-accent-victor', 'adm-number-victor', 'adm-wheels-victor-gold', 'adm-spoiler-victor-wing', 'adm-pods-victor-off', 'adm-sticker-victor-rosette',
];

/** The login's ids, rendered on a game server that has an admin account. */
const LOGIN_IDS = ['b-login', 's-login', 'adm-user', 'adm-pass', 'b-login-go', 'b-login-back', 'login-error'];

const PASSWORD = 'not-the-real-one';

interface FakeOptions {
  /** The page is served by the game server (else: the static build). */
  server?: boolean;
  /** The server has an admin account. */
  enabled?: boolean;
  /** This browser already holds a session. */
  admin?: boolean;
  /** GET /api/roster's answer. */
  roster?: unknown;
  /** Force an answer for PUT /api/admin/roster: [status, body], or 'offline'. */
  save?: [number, unknown] | 'offline';
  /** Force an answer for POST /api/admin/login: [status, body]. */
  login?: [number, unknown];
}

/**
 * A stand-in for the game server's HTTP API at the fetch boundary, so the
 * store and net.js run for real. It keeps a session flag as the cookie would,
 * echoes a saved roster back, and records every call.
 */
function fakeServer(o: FakeOptions = {}) {
  const state = { admin: !!o.admin, roster: o.roster ?? { chars: {}, ads: [] } };
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const answer = (status: number, body?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (body === undefined) throw new Error('no body'); return body; },
  });
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (!o.server) return answer(404);
    if (url === './api/kr') return answer(200, { kr: 'server' });
    if (url === './api/roster') return answer(200, state.roster);
    if (url === './api/admin/me') return answer(200, state.admin ? { enabled: true, admin: true, user: 'rida' } : { enabled: !!o.enabled, admin: false });
    if (url === './api/admin/login') {
      if (o.login) return answer(o.login[0], o.login[1]);
      if (!o.enabled) return answer(503, { error: 'Administration désactivée.' });
      const b = body as { user: string; password: string };
      if (b.user !== 'rida' || b.password !== PASSWORD) return answer(401, { error: 'Identifiant ou mot de passe incorrect.' });
      state.admin = true;
      return answer(204);
    }
    if (url === './api/admin/logout') { state.admin = false; return answer(204); }
    if (url === './api/admin/roster') {
      if (o.save === 'offline') throw new TypeError('Failed to fetch');
      if (o.save) return answer(o.save[0], o.save[1]);
      if (!state.admin) return answer(401, { error: 'Connexion administrateur requise.' });
      state.roster = body;
      return answer(200, body);
    }
    return answer(404);
  });
  return { fetch, calls, state };
}

/** Let every pending request, and the renders that follow, settle. */
async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
}

/** Render the game as served by a fake server, after the store has asked it what it offers. */
async function renderServed(o: FakeOptions) {
  const server = fakeServer(o);
  vi.stubGlobal('fetch', server.fetch);
  const view = render(<App />);
  await act(async () => { await actions.detectServer(); });
  await settle();
  return { ...view, server };
}

const $ = (container: HTMLElement, id: string) => container.querySelector('#' + id) as HTMLInputElement | null;
const pressed = (container: HTMLElement, id: string) => $(container, id)?.getAttribute('aria-pressed');

beforeEach(() => {
  // resetMachine clears listeners too; the store re-subscribes when imported,
  // so import order matters: App (and thus the store) is imported above, and
  // we only ever reset to 'title' without clearing by going through transitions.
  while (getState() !== 'title') {
    const s = getState();
    transition(s === 'select' || s === 'admin' || s === 'paused' || s === 'results' || s === 'lobby' || s === 'login' ? 'title' : s === 'tracks' || s === 'garage' ? 'select' : 'paused');
  }
});
afterEach(async () => {
  cleanup();
  // Back to the static build: no server, no session, the default cast.
  vi.stubGlobal('fetch', fakeServer().fetch);
  await act(async () => { await actions.detectServer(); });
  vi.unstubAllGlobals();
  setRoster({ chars: {}, ads: [] });
  localStorage.clear();
});

describe('the React screens', () => {
  it('render every element id the E2E suite drives', () => {
    const { container } = render(<App />);
    for (const id of CONTRACT_IDS) expect(container.querySelector('#' + id), '#' + id).not.toBeNull();
  });

  it('render the workshop and login ids on the game server, under the session that shows each', async () => {
    const admin = await renderServed({ server: true, enabled: true, admin: true });
    for (const id of ADMIN_IDS) expect(admin.container.querySelector('#' + id), '#' + id).not.toBeNull();
    cleanup();
    const visitor = await renderServed({ server: true, enabled: true });
    for (const id of LOGIN_IDS) expect(visitor.container.querySelector('#' + id), '#' + id).not.toBeNull();
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

  it('build the workshop form with one card per candidate and the contract input ids', async () => {
    const { container } = await renderServed({ server: true, enabled: true, admin: true });
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

  it('go back to the title from the workshop on save, and report the save on the button', async () => {
    const { container } = await renderServed({ server: true, enabled: true, admin: true });
    fireEvent.click(container.querySelector('#b-admin')!);
    fireEvent.click(container.querySelector('#b-admin-save')!);
    await settle();
    expect(getState()).toBe('title');
    expect(container.querySelector('#b-admin')?.textContent).toContain('enregistré');
  });

  it('open the Garage from the roster, apply a choice at once, reset it, and come back', () => {
    localStorage.clear();
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#b-play')!);
    const chosen = container.querySelector('#showcase .big')?.textContent;
    fireEvent.click(container.querySelector('#b-garage')!);
    expect(getState()).toBe('garage');
    expect((container.querySelector('#s-garage') as HTMLElement).hidden).toBe(false);
    expect(container.querySelector('#g-showcase .big')?.textContent).toBe(chosen);
    expect(container.querySelector('#g-wheels-classic')?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(container.querySelector('#g-wheels-gold')!);
    expect(container.querySelector('#g-wheels-gold')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#g-wheels-classic')?.getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('kr-kart')!)).toEqual({ wheels: 'gold' });
    fireEvent.click(container.querySelector('#b-garage-reset')!);
    expect(container.querySelector('#g-wheels-classic')?.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('kr-kart')).toBeNull();
    fireEvent.click(container.querySelector('#b-garage-back')!);
    expect(getState()).toBe('select');
  });
});

describe('the admin (game server only)', () => {
  it('is absent from the static build: no login, no workshop', async () => {
    const { container, server } = await renderServed({ server: false });
    for (const id of ['b-login', 'b-admin', 'b-logout', 's-admin', 's-login']) expect($(container, id), '#' + id).toBeNull();
    // The static build never asks for the roster or a session.
    expect(server.calls.map(c => c.url)).toEqual(['./api/kr']);
  });

  it('offers a visitor the login but never the workshop', async () => {
    const { container } = await renderServed({ server: true, enabled: true });
    expect($(container, 'b-login')?.textContent).toBe('Administration');
    for (const id of ['b-admin', 'b-logout', 's-admin']) expect($(container, id), '#' + id).toBeNull();
  });

  it('offers no login when the server has no admin account', async () => {
    const { container } = await renderServed({ server: true, enabled: false });
    expect($(container, 'b-multi')).not.toBeNull();
    for (const id of ['b-login', 'b-admin', 's-login', 's-admin']) expect($(container, id), '#' + id).toBeNull();
  });

  it('logs in from the title and opens the workshop straight away', async () => {
    const { container, server } = await renderServed({ server: true, enabled: true });
    fireEvent.click($(container, 'b-login')!);
    expect(getState()).toBe('login');
    expect(($(container, 's-login') as HTMLElement).hidden).toBe(false);
    expect($(container, 'adm-user')?.getAttribute('autocomplete')).toBe('username');
    expect($(container, 'adm-pass')?.getAttribute('type')).toBe('password');
    expect($(container, 'login-error')?.getAttribute('role')).toBe('alert');

    fireEvent.change($(container, 'adm-user')!, { target: { value: 'rida' } });
    fireEvent.change($(container, 'adm-pass')!, { target: { value: PASSWORD } });
    fireEvent.keyDown($(container, 'adm-pass')!, { key: 'Enter', code: 'Enter' });
    expect($(container, 'adm-pass')?.value).toBe('');
    await settle();
    expect(getState()).toBe('admin');
    expect(($(container, 's-admin') as HTMLElement).hidden).toBe(false);
    expect(server.calls.find(c => c.url === './api/admin/login')?.body).toEqual({ user: 'rida', password: PASSWORD });

    // Back on the title, the workshop and the logout replace the login.
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('title');
    expect($(container, 'b-admin')).not.toBeNull();
    expect($(container, 'b-logout')?.textContent).toBe('Déconnexion');
    expect($(container, 'b-login')).toBeNull();
  });

  it('shows the server message on a wrong password, clears the field and keeps the workshop shut', async () => {
    const { container } = await renderServed({ server: true, enabled: true });
    fireEvent.click($(container, 'b-login')!);
    fireEvent.change($(container, 'adm-user')!, { target: { value: 'rida' } });
    fireEvent.change($(container, 'adm-pass')!, { target: { value: 'wrong' } });
    fireEvent.click($(container, 'b-login-go')!);
    expect($(container, 'adm-pass')?.value).toBe('');
    await settle();
    expect(getState()).toBe('login');
    expect($(container, 'login-error')?.textContent).toBe('Identifiant ou mot de passe incorrect.');
    expect($(container, 's-admin')).toBeNull();
    expect($(container, 'b-admin')).toBeNull();
    fireEvent.click($(container, 'b-login-back')!);
    expect(getState()).toBe('title');
  });

  it.each([
    [429, 'Trop de tentatives. Réessayez dans une minute.'],
    [503, 'Administration désactivée.'],
  ])('shows the server message on a %i login', async (status, error) => {
    const { container } = await renderServed({ server: true, enabled: true, login: [status, { error }] });
    fireEvent.click($(container, 'b-login')!);
    fireEvent.change($(container, 'adm-pass')!, { target: { value: 'x' } });
    fireEvent.keyDown($(container, 'adm-user')!, { key: 'Enter', code: 'Enter' });
    await settle();
    expect(getState()).toBe('login');
    expect($(container, 'login-error')?.textContent).toBe(error);
    expect($(container, 'adm-pass')?.value).toBe('');
  });

  it('logs out: the workshop goes, the login comes back', async () => {
    const { container, server } = await renderServed({ server: true, enabled: true, admin: true });
    fireEvent.click($(container, 'b-logout')!);
    await settle();
    expect(server.calls.some(c => c.url === './api/admin/logout' && c.method === 'POST')).toBe(true);
    expect($(container, 'b-admin')).toBeNull();
    expect($(container, 's-admin')).toBeNull();
    expect($(container, 'b-login')).not.toBeNull();
  });

  it('plays the cast the server holds, kart defaults included, which the Garage shows as the default', async () => {
    const roster = { chars: { victor: { name: 'Jean Serveur', style: { wheels: 'gold' } } }, ads: [] };
    const { container } = await renderServed({ server: true, enabled: true, roster });
    expect(CHARACTERS[0]!.name).toBe('Jean Serveur');
    fireEvent.click($(container, 'b-play')!);
    expect($(container, 'roster')?.textContent).toContain('Jean Serveur');
    fireEvent.click(container.querySelectorAll('#roster .tile')[0]!);
    fireEvent.click($(container, 'b-garage')!);
    expect(pressed(container, 'g-wheels-gold')).toBe('true');
    // A player's own choice still wins over the admin default.
    fireEvent.click($(container, 'g-wheels-chrome')!);
    expect(pressed(container, 'g-wheels-chrome')).toBe('true');
  });
});

describe('the workshop (admin session)', () => {
  it('sends the edits and kart defaults to the server, then plays them', async () => {
    const { container, server } = await renderServed({ server: true, enabled: true, admin: true });
    fireEvent.click($(container, 'b-admin')!);
    expect(pressed(container, 'adm-wheels-victor-classic')).toBe('true');
    expect(pressed(container, 'adm-pods-victor-on')).toBe('true');
    fireEvent.change($(container, 'adm-name-victor')!, { target: { value: 'Jean Atelier' } });
    fireEvent.click($(container, 'adm-wheels-victor-gold')!);
    fireEvent.click($(container, 'adm-pods-victor-off')!);
    fireEvent.click($(container, 'adm-sticker-victor-marianne')!);
    fireEvent.click($(container, 'adm-spoiler-victor-wing')!);
    fireEvent.change($(container, 'adm-number-victor')!, { target: { value: '12' } });
    fireEvent.change($(container, 'adm-accent-victor')!, { target: { value: '#00ff00' } });
    expect(pressed(container, 'adm-wheels-victor-gold')).toBe('true');
    expect(pressed(container, 'adm-wheels-victor-classic')).toBe('false');
    // Nothing reaches the game before the server accepts it.
    expect(CHARACTERS[0]!.name).toBe(BASE[0]!.name);

    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    const put = server.calls.find(c => c.url === './api/admin/roster')!;
    expect(put.method).toBe('PUT');
    expect((put.body as { chars: Record<string, unknown> }).chars.victor).toEqual({
      name: 'Jean Atelier',
      style: { wheels: 'gold', pods: false, sticker: 'marianne', spoiler: 'wing', number: 12, accent: '#00ff00' },
    });
    expect(getState()).toBe('title');
    expect(CHARACTERS[0]!.name).toBe('Jean Atelier');
    expect((CHARACTERS[0] as unknown as { style: unknown }).style).toMatchObject({ wheels: 'gold', number: 12 });

    // Reopened, the form shows what the server stored.
    fireEvent.click($(container, 'b-admin')!);
    expect($(container, 'adm-name-victor')?.value).toBe('Jean Atelier');
    expect($(container, 'adm-number-victor')?.value).toBe('12');
    expect(pressed(container, 'adm-sticker-victor-marianne')).toBe('true');
  });

  it('stays open with the server message, naming the field, when the save is refused', async () => {
    const error = 'chars.victor.name : 28 caractères au plus.';
    const { container } = await renderServed({ server: true, enabled: true, admin: true, save: [400, { error, field: 'chars.victor.name' }] });
    fireEvent.click($(container, 'b-admin')!);
    expect(($(container, 'admin-error') as HTMLElement).hidden).toBe(true);
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('admin');
    expect(($(container, 'admin-error') as HTMLElement).hidden).toBe(false);
    expect($(container, 'admin-error')?.textContent).toBe(error);
    expect($(container, 'admin-error')?.getAttribute('role')).toBe('alert');
  });

  it.each([
    ['too large', [413, { error: 'Requête trop volumineuse.' }] as [number, unknown], 'Requête trop volumineuse.'],
    ['unreachable', 'offline' as const, 'Serveur injoignable.'],
  ])('shows the error when the server is %s', async (_label, save, message) => {
    const { container } = await renderServed({ server: true, enabled: true, admin: true, save });
    fireEvent.click($(container, 'b-admin')!);
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('admin');
    expect($(container, 'admin-error')?.textContent).toBe(message);
  });

  it('goes to the login when the session has expired, and back to the same draft after it', async () => {
    const { container, server } = await renderServed({ server: true, enabled: true, admin: true });
    fireEvent.click($(container, 'b-admin')!);
    fireEvent.change($(container, 'adm-name-victor')!, { target: { value: 'Brouillon' } });
    server.state.admin = false;            // the server forgot the session
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('login');
    expect($(container, 'login-error')?.textContent).toContain('Session expirée');
    expect($(container, 'b-admin')).toBeNull();

    fireEvent.change($(container, 'adm-user')!, { target: { value: 'rida' } });
    fireEvent.change($(container, 'adm-pass')!, { target: { value: PASSWORD } });
    fireEvent.click($(container, 'b-login-go')!);
    await settle();
    expect(getState()).toBe('admin');
    expect($(container, 'adm-name-victor')?.value).toBe('Brouillon');
  });

  it('resets the form to the default cast in memory only, until it is saved', async () => {
    const roster = { chars: { victor: { name: 'Jean Serveur', style: { wheels: 'gold' } } }, ads: [] };
    const { container, server } = await renderServed({ server: true, enabled: true, admin: true, roster });
    fireEvent.click($(container, 'b-admin')!);
    expect($(container, 'adm-name-victor')?.value).toBe('Jean Serveur');
    expect(pressed(container, 'adm-wheels-victor-gold')).toBe('true');
    const before = server.calls.length;
    fireEvent.click($(container, 'b-admin-reset')!);
    expect($(container, 'adm-name-victor')?.value).toBe(BASE[0]!.name);
    expect(pressed(container, 'adm-wheels-victor-classic')).toBe('true');
    expect(server.calls.length).toBe(before);
    expect(CHARACTERS[0]!.name).toBe('Jean Serveur');
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(server.state.roster).toEqual({ chars: {}, ads: [] });
    expect(CHARACTERS[0]!.name).toBe(BASE[0]!.name);
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
