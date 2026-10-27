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
  setPreviewFrame: () => {},
}));
vi.mock('../engine/race.js', () => ({
  startRace: vi.fn(),
}));
vi.mock('../engine/minimap.js', () => ({
  attachMinimap: vi.fn(),
}));
// The Politibox scene draws on the shared canvas; the timeline's phases are
// played here by hand through the onPhase the store hands it.
const box = vi.hoisted(() => ({ onPhase: null as ((name: string) => void) | null, played: [] as unknown[], skips: 0 }));
vi.mock('../engine/lootbox.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine/lootbox.js')>()),
  playOpening: (drop: unknown, o: { onPhase?: (name: string) => void } = {}) => { box.played.push(drop); box.onPhase = o.onPhase ?? null; box.onPhase?.('drop'); },
  skipOpening: () => { box.skips++; },
  stopOpening: () => {},
  renderLootbox: () => {},
}));
vi.mock('../engine/audio.js', () => {
  let muted = false;
  return { initAudio: () => {}, isMuted: () => muted, toggleMute: () => { muted = !muted; return muted; } };
});

import { setRoster } from '../engine/custom.js';
import { BASE, CHARACTERS, TRACKS } from '../engine/data.js';
import { resetMachine, transition, getState } from '../engine/machine.js';
import { setTransport } from '../engine/net.js';
import { App } from './App';
import { hud } from './Hud';
import { loadGarage, myStyle, resetGarage } from '../engine/garage.js';
import { actions, getSnapshot, ownedOf } from './store';

/**
 * Every id the E2E suite addresses on the screens and the note. The
 * Workshop's ids exist only inside the admin's session, so they are listed
 * apart (ADMIN_IDS) and asserted under an admin profile.
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

/** The Workshop's contract ids, rendered only while the account is the admin's. */
const ADMIN_IDS = [
  'b-admin',
  's-admin', 'admin-chars', 'ad-files', 'ad-preview', 'admin-error', 'b-admin-reset', 'b-admin-save',
  'adm-name-victor', 'adm-title-victor', 'adm-quote-victor', 'adm-suit-victor', 'adm-kart-victor', 'adm-livery-victor', 'adm-livimg-victor',
  'adm-accent-victor', 'adm-number-victor', 'adm-wheels-victor-gold', 'adm-spoiler-victor-wing', 'adm-pods-victor-off', 'adm-sticker-victor-rosette',
  'b-dashboard', 's-dashboard', 'dash-status', 'dash-user-q', 'dash-ban-reason', 'b-dash-search', 'b-dash-refresh', 'b-dash-back',
];

/** What the fake server's dashboard answers (dashboard.js). */
const DASH = {
  stats: { accounts: { total: 42, banned: 1, new7d: 3, online: 2 }, live: { connections: 3, guests: 1, rooms: 1, races: 0 }, races: { races: 7, finished: 6, solo: 12, byTrack: { 0: 7 }, recent: [{ at: 1, code: 'ABCD', trackIdx: 0, humans: 2, gods: 0, winner: 'Zoé', teams: [{ team: 'bleu', points: 10 }] }] }, top: [{ id: 'u-z', name: 'Zoé', xp: 500, level: 4 }] },
  users: { users: [{ id: 'u-z', name: 'Zoé', xp: 500, level: 4, created: 1, seen: 2, banned: null, online: true, room: 'ABCD' }, { id: 'u-b', name: 'Banni', xp: 0, level: 1, created: 1, seen: null, banned: { at: 3, reason: 'triche' }, online: false, room: null }] },
  live: { connections: [{ id: 'c1', name: 'Zoé', userId: 'u-z', guest: false, admin: false, room: 'ABCD' }], rooms: [
    { code: 'ABCD', host: 'c1', trackIdx: 0, phase: 'lobby', since: null, race: null, players: [{ id: 'c1', name: 'Zoé', team: 'bleu', charId: 'victor', ready: false, god: false }] },
    { code: 'WXYZ', host: 'c2', trackIdx: 1, phase: 'race', since: 1, race: [{ slot: 0, name: 'Macaron', charId: 'victor', isAI: true, god: false }, { slot: 1, name: 'Yann', charId: 'gege', isAI: false, god: false }], players: [{ id: 'c2', name: 'Yann', team: 'rouge', charId: 'gege', ready: false, god: false }] },
  ] },
};

/** A socket that never opens: signing in connects to the game server, which is not there. */
class SilentSocket { readyState = 0; onopen = null; onmessage = null; onclose = null; onerror = null; send() {} close() {} constructor(_url: string) {} }

type Who = 'admin' | 'player';
const STARTER_IDS = ['victor', 'gege', 'maurice', 'capucine'];
const profileOf = (who: Who, o: { coins?: number; owned?: { chars: string[]; parts: string[]; trails: string[] } } = {}) => ({
  id: who === 'admin' ? 'u-admin' : 'u-player', name: who === 'admin' ? 'rida' : 'Marianne', xp: 0, level: 1, xpInto: 0, xpNext: 120,
  reachable: [...STARTER_IDS, 'lucie'], unlocked: [...STARTER_IDS, ...(o.owned?.chars ?? [])], coins: o.coins ?? 0,
  owned: o.owned ?? { chars: [], parts: [], trails: [] }, stats: {},
  ...(who === 'admin' ? { admin: true as const } : {}),
});

interface FakeOptions {
  /** The page is served by (or names) the game server; else the static build. */
  server?: boolean;
  /** This browser holds a saved token for this account. */
  who?: Who;
  /** GET /api/roster's answer. */
  roster?: unknown;
  /** Force an answer for PUT /api/admin/roster: [status, body], or 'offline'. */
  save?: [number, unknown] | 'offline';
  /** The account's politicoins (the fake server charges the catalogue's prices). */
  coins?: number;
  /** What the next Politibox holds. */
  drop?: unknown;
}

/**
 * A stand-in for the game server's HTTP API at the fetch boundary, so the
 * store and engine/account.js run for real. It answers the saved token with
 * its profile, echoes a saved roster back to the admin only, and records
 * every call.
 */
function fakeServer(o: FakeOptions = {}) {
  const state = {
    roster: o.roster ?? { chars: {}, ads: [] }, sessions: new Map<string, Who>(o.who ? [['tok-' + o.who, o.who]] : []),
    coins: o.coins ?? 0, owned: { chars: [] as string[], parts: [] as string[], trails: [] as string[] },
  };
  const me = (who: Who) => profileOf(who, { coins: state.coins, owned: state.owned });
  const calls: Array<{ url: string; method: string; body: unknown; auth?: string }> = [];
  const answer = (status: number, body?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (body === undefined) throw new Error('no body'); return body; },
  });
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const auth = (init.headers as Record<string, string> | undefined)?.authorization;
    calls.push({ url, method, body, auth });
    if (!o.server) return answer(404);
    const who = auth ? state.sessions.get(auth.slice(7)) : undefined;
    if (url === './api/kr') return answer(200, { kr: 'server' });
    if (url === './api/roster') return answer(200, state.roster);
    if (url === './api/me') return who ? answer(200, { profile: me(who) }) : answer(401, { error: 'Session expirée.' });
    // The economy, priced like the catalogue (lucie 300, wheels:gold 400, a box 120); bodies never carry a price.
    if (url === './api/shop/char' || url === './api/shop/part' || url === './api/box/open') {
      if (!who) return answer(401, { error: 'Session expirée.' });
      const price = url === './api/box/open' ? 120 : url === './api/shop/char' ? ({ lucie: 300 } as Record<string, number>)[(body as { id: string }).id] ?? 9999 : 400;
      if (state.coins < price) return answer(402, { error: 'Pas assez de politicoins.' });
      state.coins -= price;
      if (url === './api/shop/char') state.owned.chars.push((body as { id: string }).id);
      if (url === './api/shop/part') state.owned.parts.push((body as { category: string; value: string }).category + ':' + (body as { value: string }).value);
      if (url === './api/box/open') { const d = (o.drop ?? { kind: 'coins', amount: 50 }) as { kind: string; amount?: number; refund?: number }; state.coins += d.amount ?? d.refund ?? 0; return answer(200, { profile: me(who), drop: d }); }
      return answer(200, { profile: me(who), bought: {} });
    }
    if (url === './api/logout') { if (auth) state.sessions.delete(auth.slice(7)); return answer(200, {}); }
    if (url.startsWith('./api/admin/') && url !== './api/admin/roster') {
      if (who !== 'admin') return answer(401, { error: 'Réservé à l’administrateur : connectez-vous avec son compte.' });
      if (url === './api/admin/stats') return answer(200, DASH.stats);
      if (url.startsWith('./api/admin/users?') || url === './api/admin/users') return answer(200, DASH.users);
      if (url === './api/admin/live') return answer(200, DASH.live);
      return answer(200, {});
    }
    if (url === './api/admin/roster') {
      if (o.save === 'offline') throw new TypeError('Failed to fetch');
      if (o.save) return answer(o.save[0], o.save[1]);
      if (who !== 'admin') return answer(401, { error: 'Réservé à l’administrateur : connectez-vous avec son compte.' });
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

/** Render the game as served by a fake server, after the store asked what it offers and restored the saved session. */
async function renderServed(o: FakeOptions) {
  const server = fakeServer(o);
  vi.stubGlobal('fetch', server.fetch);
  if (o.who) localStorage.setItem('kr-account', JSON.stringify({ token: 'tok-' + o.who }));
  const view = render(<App />);
  await act(async () => { await actions.detectServer(); });
  await settle();
  return { ...view, server };
}

const $ = (container: HTMLElement, id: string) => container.querySelector('#' + id) as HTMLInputElement | null;
const pressed = (container: HTMLElement, id: string) => $(container, id)?.getAttribute('aria-pressed');
const disabled = (container: HTMLElement, id: string) => ($(container, id) as HTMLButtonElement | null)?.disabled;

beforeEach(() => {
  // resetMachine clears listeners too; the store re-subscribes when imported,
  // so import order matters: App (and thus the store) is imported above, and
  // we only ever reset to 'title' without clearing by going through transitions.
  while (getState() !== 'title') {
    const s = getState();
    transition(s === 'select' || s === 'admin' || s === 'paused' || s === 'results' || s === 'lobby' || s === 'account' || s === 'dashboard' || s === 'shop' ? 'title' : s === 'tracks' || s === 'garage' ? 'select' : s === 'lootbox' ? 'shop' : 'paused');
  }
  setTransport(SilentSocket);
});
afterEach(async () => {
  cleanup();
  // Back to the static build: no session, no server, the default cast.
  vi.stubGlobal('fetch', fakeServer().fetch);
  if (getSnapshot().account) actions.logOut();
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

  it('render the Workshop ids under an admin profile', async () => {
    const { container } = await renderServed({ server: true, who: 'admin' });
    fireEvent.click(container.querySelector('#b-admin')!);
    for (const id of ADMIN_IDS) expect(container.querySelector('#' + id), '#' + id).not.toBeNull();
  });

  // Changed with the admin gate (R-06 redefined): the Workshop is opened by an admin profile.
  it('build the workshop form with one card per candidate and the contract input ids', async () => {
    const { container } = await renderServed({ server: true, who: 'admin' });
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

  // Changed with the admin gate (R-06 redefined): an admin profile, and the save goes to the server.
  it('go back to the title from the workshop on save, and report the save on the button', async () => {
    const { container } = await renderServed({ server: true, who: 'admin' });
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

describe('the Workshop gate', () => {
  it('is absent from the static build, which plays the default cast without asking for a roster', async () => {
    const { container, server } = await renderServed({ server: false });
    for (const id of ['b-admin', 's-admin']) expect($(container, id), '#' + id).toBeNull();
    expect(server.calls.map(c => c.url)).toEqual(['./api/kr']);
    expect(CHARACTERS[0]!.name).toBe(BASE[0]!.name);
  });

  it('is not offered to a visitor or a normal account on the game server', async () => {
    const visitor = await renderServed({ server: true });
    expect($(visitor.container, 'b-account')).not.toBeNull();
    for (const id of ['b-admin', 's-admin']) expect($(visitor.container, id), '#' + id).toBeNull();
    cleanup();
    const player = await renderServed({ server: true, who: 'player' });
    expect($(player.container, 'b-account')?.textContent).toContain('Marianne');
    for (const id of ['b-admin', 's-admin']) expect($(player.container, id), '#' + id).toBeNull();
    actions.openAdmin();
    expect(getState()).toBe('title');
  });

  it('goes with a logout', async () => {
    const { container } = await renderServed({ server: true, who: 'admin' });
    expect($(container, 'b-admin')).not.toBeNull();
    act(() => { actions.logOut(); });
    expect($(container, 'b-admin')).toBeNull();
    expect($(container, 's-admin')).toBeNull();
    actions.openAdmin();
    expect(getState()).toBe('title');
  });

  it('plays the cast the server holds, kart defaults included, which the Garage shows as the default', async () => {
    const roster = { chars: { victor: { name: 'Jean Serveur', style: { wheels: 'gold' } } }, ads: [] };
    const { container } = await renderServed({ server: true, roster });
    expect(CHARACTERS[0]!.name).toBe('Jean Serveur');
    fireEvent.click($(container, 'b-play')!);
    expect($(container, 'roster')?.textContent).toContain('Jean Serveur');
    fireEvent.click(container.querySelectorAll('#roster .tile')[0]!);
    fireEvent.click($(container, 'b-garage')!);
    expect(pressed(container, 'g-wheels-gold')).toBe('true');
  });
});

describe('the Workshop (admin profile)', () => {
  it('sends the edits and kart defaults with the token, then plays what the server stored', async () => {
    const { container, server } = await renderServed({ server: true, who: 'admin' });
    fireEvent.click($(container, 'b-admin')!);
    expect(pressed(container, 'adm-wheels-victor-classic')).toBe('true');
    fireEvent.change($(container, 'adm-name-victor')!, { target: { value: 'Jean Atelier' } });
    fireEvent.click($(container, 'adm-wheels-victor-gold')!);
    fireEvent.click($(container, 'adm-pods-victor-off')!);
    fireEvent.change($(container, 'adm-number-victor')!, { target: { value: '12' } });
    expect(pressed(container, 'adm-wheels-victor-gold')).toBe('true');
    // Nothing reaches the game before the server accepts it.
    expect(CHARACTERS[0]!.name).toBe(BASE[0]!.name);

    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    const put = server.calls.find(c => c.url === './api/admin/roster')!;
    expect(put.method).toBe('PUT');
    expect(put.auth).toBe('Bearer tok-admin');
    expect((put.body as { chars: Record<string, unknown> }).chars.victor).toEqual({ name: 'Jean Atelier', style: { wheels: 'gold', pods: false, number: 12 } });
    expect(getState()).toBe('title');
    expect(getSnapshot().adminStatus).toBe('saved');
    expect(CHARACTERS[0]!.name).toBe('Jean Atelier');
    // Read back after the save, as every new player gets it.
    expect(server.calls.filter(c => c.url === './api/roster')).toHaveLength(2);

    // Reopened, the form shows what the server stored.
    fireEvent.click($(container, 'b-admin')!);
    expect($(container, 'adm-name-victor')?.value).toBe('Jean Atelier');
    expect($(container, 'adm-number-victor')?.value).toBe('12');
  });

  it('stays open with the server message, naming the field, on a 400', async () => {
    const { container } = await renderServed({ server: true, who: 'admin', save: [400, { error: '28 caractères au plus.', field: 'chars.victor.name' }] });
    fireEvent.click($(container, 'b-admin')!);
    expect(($(container, 'admin-error') as HTMLElement).hidden).toBe(true);
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('admin');
    expect(($(container, 'admin-error') as HTMLElement).hidden).toBe(false);
    expect($(container, 'admin-error')?.textContent).toBe('chars.victor.name : 28 caractères au plus.');
    expect($(container, 'admin-error')?.getAttribute('role')).toBe('alert');
    expect($(container, 'b-admin-save')?.hasAttribute('disabled')).toBe(false);
  });

  it.each([
    ['too large', [413, { error: 'Distribution trop lourde (10 Mo au plus).' }] as [number, unknown], 'Distribution trop lourde (10 Mo au plus).'],
    ['unreachable', 'offline' as const, 'Serveur injoignable.'],
  ])('shows the error when the server is %s', async (_label, save, message) => {
    const { container } = await renderServed({ server: true, who: 'admin', save });
    fireEvent.click($(container, 'b-admin')!);
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('admin');
    expect($(container, 'admin-error')?.textContent).toBe(message);
    expect(CHARACTERS[0]!.name).toBe(BASE[0]!.name);
  });

  it('on a 401 drops the token, closes the Workshop and opens Compte, the draft kept for the next login', async () => {
    const { container, server } = await renderServed({ server: true, who: 'admin' });
    fireEvent.click($(container, 'b-admin')!);
    fireEvent.change($(container, 'adm-name-victor')!, { target: { value: 'Brouillon' } });
    server.state.sessions.clear();                    // the server forgot the session
    fireEvent.click($(container, 'b-admin-save')!);
    await settle();
    expect(getState()).toBe('account');
    expect(getSnapshot().account).toBeNull();
    expect(localStorage.getItem('kr-account')).toBeNull();
    expect($(container, 'acc-error')?.textContent).toContain('Session expirée');
    expect($(container, 's-admin')).toBeNull();
    expect($(container, 'b-admin')).toBeNull();

    // Logged in again (a fresh token restored), the Workshop reopens on the same draft.
    server.state.sessions.set('tok-admin', 'admin');
    localStorage.setItem('kr-account', JSON.stringify({ token: 'tok-admin' }));
    act(() => { actions.closeAccount(); });
    await act(async () => { await actions.detectServer(); });
    await settle();
    fireEvent.click($(container, 'b-admin')!);
    expect($(container, 'adm-name-victor')?.value).toBe('Brouillon');
  });

  it('resets the form to the default cast in memory only, until it is saved', async () => {
    const roster = { chars: { victor: { name: 'Jean Serveur', style: { wheels: 'gold' } } }, ads: [] };
    const { container, server } = await renderServed({ server: true, who: 'admin', roster });
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

describe('the admin dashboard (DEC-030)', () => {
  it('is offered to the admin only, loads the figures, the users, the rooms, and bans with the typed reason', async () => {
    const { container, server } = await renderServed({ server: true, who: 'admin' });
    fireEvent.click($(container, 'b-dashboard')!);
    expect(getState()).toBe('dashboard');
    await settle();
    expect($(container, 's-dashboard')!.hidden).toBe(false);
    expect($(container, 'dash-fig-accounts')!.textContent).toContain('42');
    expect($(container, 'dash-fig-races')!.textContent).toContain('12 courses solo');
    expect(container.querySelectorAll('#dash-users tr')).toHaveLength(2);
    expect($(container, 'dash-users')!.textContent).toContain('triche');
    expect(container.querySelectorAll('#dash-rooms tr')).toHaveLength(2);
    expect($(container, 'b-dash-god-ABCD')).not.toBeNull();
    expect($(container, 'dash-top')!.textContent).toContain('Zoé');
    expect($(container, 'dash-recent')!.textContent).toContain('Zoé');

    fireEvent.change($(container, 'dash-ban-reason')!, { target: { value: 'spam' } });
    fireEvent.click($(container, 'b-dash-ban-u-z')!);
    await settle();
    const ban = server.calls.find(c => c.url === './api/admin/users/ban');
    expect(ban).toMatchObject({ method: 'POST', body: { id: 'u-z', reason: 'spam' }, auth: 'Bearer tok-admin' });
    expect($(container, 'b-dash-unban-u-b')).not.toBeNull();

    fireEvent.change($(container, 'dash-user-q')!, { target: { value: 'zo' } });
    fireEvent.click($(container, 'b-dash-search')!);
    await settle();
    expect(server.calls.some(c => c.url === './api/admin/users?q=zo')).toBe(true);

    fireEvent.click($(container, 'b-dash-back')!);
    expect(getState()).toBe('title');
  });

  it('controls any room from afar: a lobby is started and its players moved, a race gets the god console (DEC-031)', async () => {
    const { container, server } = await renderServed({ server: true, who: 'admin' });
    fireEvent.click($(container, 'b-dashboard')!);
    await settle();
    fireEvent.click($(container, 'b-dash-manage-ABCD')!);
    expect($(container, 'dash-control-ABCD')).not.toBeNull();
    fireEvent.click($(container, 'b-dash-move-c1')!);
    fireEvent.click($(container, 'b-dash-start-ABCD')!);
    await settle();
    const commands = server.calls.filter(c => c.url === './api/admin/rooms/command').map(c => c.body);
    expect(commands).toEqual([{ code: 'ABCD', cmd: { cmd: 'team', id: 'c1', team: 'rouge' } }, { code: 'ABCD', cmd: { cmd: 'start' } }]);

    fireEvent.click($(container, 'b-dash-manage-WXYZ')!);
    expect($(container, 'dash-control-ABCD')).toBeNull();
    expect(container.querySelectorAll('#dash-god-WXYZ-targets button')).toHaveLength(3);
    fireEvent.click($(container, 'dash-god-WXYZ-target-1')!);
    fireEvent.click($(container, 'dash-god-WXYZ-front')!);
    fireEvent.click($(container, 'dash-god-WXYZ-finish')!);
    await settle();
    expect(server.calls.filter(c => c.url === './api/admin/rooms/command').slice(-2).map(c => c.body)).toEqual([
      { code: 'WXYZ', cmd: { cmd: 'front', target: 1 } }, { code: 'WXYZ', cmd: { cmd: 'finish' } },
    ]);
    expect($(container, 'b-dash-god-WXYZ')!.textContent).toBe('Entrer dans la course');
  });

  it('is absent for a player, and its button never renders', async () => {
    const { container } = await renderServed({ server: true, who: 'player' });
    expect($(container, 'b-dashboard')).toBeNull();
    expect($(container, 's-dashboard')).toBeNull();
    actions.openDashboard();
    expect(getState()).toBe('title');
  });

  it('enters a room as a god from the dashboard: the lobby opens and the server is asked', async () => {
    const { container } = await renderServed({ server: true, who: 'admin' });
    fireEvent.click($(container, 'b-dashboard')!);
    await settle();
    fireEvent.click($(container, 'b-dash-god-ABCD')!);
    expect(getState()).toBe('lobby');
    expect($(container, 's-lobby')!.hidden).toBe(false);
  });
});

/** The Boutique and the Politibox's contract ids (DEC-009), on a game server only. */
const SHOP_IDS = ['b-shop', 's-shop', 'coins', 'shop-tab-box', 'shop-tab-chars', 'shop-tab-parts', 'shop-char-lucie', 'b-buy-char-lucie', 'shop-part-wheels-gold', 'b-buy-part-wheels-gold', 'b-open-box', 'shop-error', 'shop-notice', 'b-shop-back', 's-lootbox', 'lb-stage'];

describe('the Boutique and the Politibox (DEC-032..037)', () => {
  beforeEach(() => { box.onPhase = null; box.played = []; box.skips = 0; });

  it('render their contract ids on the game server, and the reveal\'s once a box is open', async () => {
    const { container } = await renderServed({ server: true, who: 'player', coins: 1000 });
    for (const id of SHOP_IDS) expect($(container, id), '#' + id).not.toBeNull();
    fireEvent.click($(container, 'b-shop')!);
    fireEvent.click($(container, 'b-open-box')!);
    await settle();
    act(() => { box.onPhase?.('reveal'); });
    for (const id of ['box-result', 'box-grade', 'b-box-again', 'b-box-back']) expect($(container, id), '#' + id).not.toBeNull();
  });

  it('are absent from the static build, title button included', async () => {
    const { container } = await renderServed({ server: false });
    for (const id of SHOP_IDS) expect($(container, id), '#' + id).toBeNull();
    actions.openShop('title');
    expect(getState()).toBe('title');
  });

  it('show a guest the shop with every button disabled and an invitation to sign up', async () => {
    const { container } = await renderServed({ server: true });
    fireEvent.click($(container, 'b-shop')!);
    expect(getState()).toBe('shop');
    expect($(container, 's-shop')!.hidden).toBe(false);
    expect($(container, 'shop-guest')?.textContent).toBe('Créez un compte pour gagner des politicoins.');
    expect($(container, 'coins')?.textContent).toBe('0');
    expect(disabled(container, 'b-open-box')).toBe(true);
    expect(disabled(container, 'b-buy-char-lucie')).toBe(true);
    expect(disabled(container, 'b-buy-part-wheels-gold')).toBe(true);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('#s-shop .shop-card button')];
    expect(buttons.length).toBeGreaterThan(30);
    expect(buttons.every(b => b.disabled)).toBe(true);
    fireEvent.click($(container, 'b-shop-back')!);
    expect(getState()).toBe('title');
  });

  it('buy a candidate and a part with the token, the bodies naming the item and never a price, then count the coins down', async () => {
    const { container, server } = await renderServed({ server: true, who: 'player', coins: 1000 });
    expect($(container, 'b-shop')?.textContent).toContain('1');
    fireEvent.click($(container, 'b-shop')!);
    expect($(container, 'coins')?.textContent).toBe((1000).toLocaleString('fr-FR'));
    fireEvent.click($(container, 'shop-tab-chars')!);
    expect($(container, 'shop-panel-chars')!.hidden).toBe(false);
    expect($(container, 'b-buy-char-lucie')?.textContent).toBe('Acheter');
    expect($(container, 'b-buy-char-patrick')?.textContent).toBe('Niveau 3 requis');
    expect(disabled(container, 'b-buy-char-patrick')).toBe(true);
    expect($(container, 'b-buy-char-victor')?.textContent).toBe('Acquis');

    fireEvent.click($(container, 'b-buy-char-lucie')!);
    await settle();
    const buy = server.calls.find(c => c.url === './api/shop/char')!;
    expect(buy).toMatchObject({ method: 'POST', auth: 'Bearer tok-player', body: { id: 'lucie' } });
    expect($(container, 'b-buy-char-lucie')?.textContent).toBe('Acquis');
    expect($(container, 'coins')?.textContent).toBe('700');
    expect($(container, 'shop-notice')?.textContent).toBe('Acquis !');

    fireEvent.click($(container, 'shop-tab-parts')!);
    fireEvent.click($(container, 'b-buy-part-wheels-gold')!);
    await settle();
    expect(server.calls.find(c => c.url === './api/shop/part')?.body).toEqual({ category: 'wheels', value: 'gold' });
    expect($(container, 'coins')?.textContent).toBe('300');
    expect($(container, 'b-buy-part-wheels-gold')?.textContent).toBe('Acquis');
    // 300 left: a mythic part (400) is out of reach, a rare one (150) is not.
    expect($(container, 'b-buy-part-underglow-gold')?.textContent).toBe('Pas assez de politicoins');
    expect(disabled(container, 'b-buy-part-wheels-chrome')).toBe(false);
    for (const c of server.calls.filter(c => c.url.startsWith('./api/shop/') || c.url === './api/box/open')) expect(JSON.stringify(c.body)).not.toMatch(/price|cost|amount/);

    // Bought, the candidate is on the roster.
    fireEvent.click($(container, 'b-shop-back')!);
    fireEvent.click($(container, 'b-play')!);
    const lucie = CHARACTERS.findIndex(c => c.id === 'lucie');
    const tile = container.querySelectorAll('#roster .tile')[lucie]!;
    expect(tile.classList.contains('locked')).toBe(false);
  });

  it('show the server\'s refusal on a 402, coins unchanged', async () => {
    const { container } = await renderServed({ server: true, who: 'player', coins: 1000 });
    fireEvent.click($(container, 'b-shop')!);
    // The page thinks it can afford it; the server says otherwise.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 402, json: async () => ({ error: 'Pas assez de politicoins.' }) })));
    fireEvent.click($(container, 'shop-tab-parts')!);
    fireEvent.click($(container, 'b-buy-part-wheels-gold')!);
    await settle();
    expect($(container, 'shop-error')?.textContent).toBe('Pas assez de politicoins.');
    expect($(container, 'shop-error')!.hidden).toBe(false);
    expect($(container, 'coins')?.textContent).toBe((1000).toLocaleString('fr-FR'));
    expect(getState()).toBe('shop');
  });

  it('open a Politibox: charge it, play the opening, skip on a tap, show the prize, and go back', async () => {
    const drop = { kind: 'part', id: 'wheels:gold', grade: 'mythic', duplicate: true, refund: 400 };
    const { container, server } = await renderServed({ server: true, who: 'player', coins: 150, drop });
    fireEvent.click($(container, 'b-shop')!);
    expect(disabled(container, 'b-open-box')).toBe(false);
    fireEvent.click($(container, 'b-open-box')!);
    await settle();
    expect(server.calls.find(c => c.url === './api/box/open')).toMatchObject({ method: 'POST', body: {}, auth: 'Bearer tok-player' });
    expect(getState()).toBe('lootbox');
    expect(box.played).toEqual([drop]);
    expect($(container, 's-lootbox')!.hidden).toBe(false);
    expect($(container, 'box-result')).toBeNull();                 // still opening
    fireEvent.click($(container, 'lb-stage')!);
    expect(box.skips).toBe(1);
    act(() => { box.onPhase?.('burst'); });
    expect(container.querySelector('.kr-flash')).not.toBeNull();
    act(() => { box.onPhase?.('reveal'); });
    expect($(container, 'box-result')?.textContent).toBe('Pièce : Roues doréesDoublon : +400 politicoins remboursés');
    expect($(container, 'box-grade')?.getAttribute('data-grade')).toBe('mythic');
    expect($(container, 'box-grade')?.textContent).toBe('Mythique');
    // 150 - 120 + 400 refunded: enough for another
    expect(getSnapshot().account!.profile.coins).toBe(430);
    expect(disabled(container, 'b-box-again')).toBe(false);
    fireEvent.click($(container, 'b-box-back')!);
    expect(getState()).toBe('shop');
    expect($(container, 'coins')?.textContent).toBe('430');
  });

  it('keep "Encore une !" disabled under the price of a box', async () => {
    const { container } = await renderServed({ server: true, who: 'player', coins: 125, drop: { kind: 'coins', amount: 5 } });
    fireEvent.click($(container, 'b-shop')!);
    fireEvent.click($(container, 'b-open-box')!);
    await settle();
    act(() => { box.onPhase?.('reveal'); });
    expect($(container, 'box-result')?.textContent).toBe('5 politicoins');
    expect(disabled(container, 'b-box-again')).toBe(true);
    fireEvent.click($(container, 'b-box-back')!);
    expect(disabled(container, 'b-open-box')).toBe(true);
  });

  it('open on the candidates from a locked roster tile, and come back to the roster', async () => {
    const { container } = await renderServed({ server: true, who: 'player', coins: 0 });
    fireEvent.click($(container, 'b-play')!);
    const lucie = CHARACTERS.findIndex(c => c.id === 'lucie');
    const tile = container.querySelectorAll('#roster .tile')[lucie] as HTMLButtonElement;
    expect(tile.disabled).toBe(false);
    expect(tile.getAttribute('data-lock')).toContain('Boutique');
    fireEvent.click(tile);
    expect(getState()).toBe('shop');
    expect($(container, 'shop-panel-chars')!.hidden).toBe(false);
    expect(getSnapshot().charIdx).not.toBe(lucie);
    fireEvent.click($(container, 'b-shop-back')!);
    expect(getState()).toBe('select');
  });

  it('keep a locked tile inert on the static build', () => {
    const { container } = render(<App />);
    fireEvent.click($(container, 'b-play')!);
    const lucie = CHARACTERS.findIndex(c => c.id === 'lucie');
    const tile = container.querySelectorAll('#roster .tile')[lucie] as HTMLButtonElement;
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(tile);
    expect(getState()).toBe('select');
  });
});

describe('ownedOf (DEC-035)', () => {
  it('is null without a server, the commons for a guest on one, and the account\'s inventory signed in', async () => {
    expect(ownedOf({ netAvailable: false, account: null })).toBeNull();
    expect(ownedOf({ netAvailable: true, account: null })).toEqual({ chars: [], parts: [], trails: [] });
    const profile = profileOf('player', { owned: { chars: ['lucie'], parts: ['wheels:gold'], trails: [] } });
    expect(ownedOf({ netAvailable: true, account: { token: 't', profile } })).toEqual(profile.owned);
  });

  it('is what the Garage draws with: a guest on a server sees an unowned edit dropped, the static build does not', async () => {
    localStorage.setItem('kr-kart', JSON.stringify({ wheels: 'gold' }));
    loadGarage();
    await renderServed({ server: true });
    expect(myStyle(CHARACTERS[0]!).wheels).toBe('classic');
    cleanup();
    await renderServed({ server: false });
    expect(myStyle(CHARACTERS[0]!).wheels).toBe('gold');
    resetGarage();
  });
});
