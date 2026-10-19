// @vitest-environment jsdom
// The team-race lobby, driven through the real store and net client, with a
// fake WebSocket playing the game server.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/preview.js', () => ({ hasPreview: () => false, makeThumbs: () => ({}), setPreview: () => {} }));
vi.mock('../engine/race.js', () => ({ startRace: vi.fn(), startField: vi.fn() }));
vi.mock('../engine/minimap.js', () => ({ attachMinimap: vi.fn() }));
vi.mock('../engine/audio.js', () => ({ initAudio: () => {}, isMuted: () => false, toggleMute: () => false }));

import { getState, transition } from '../engine/machine.js';
import { disconnect, setTransport } from '../engine/net.js';
import { App } from './App';
import { actions } from './store';

class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 0; sent: Array<Record<string, unknown>> = [];
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void; onerror?: () => void;
  constructor(public url: string) { FakeSocket.last = this; }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  serve(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const ROOM = (over = {}) => ({
  code: 'ABCD', host: 'me', trackIdx: 0, phase: 'lobby',
  players: [
    { id: 'me', name: 'Alice', team: 'bleu', charId: 'victor', ready: false },
    { id: 'bob', name: 'Bob', team: 'rouge', charId: 'gege', ready: false },
  ],
  ...over,
});

beforeEach(() => { setTransport(FakeSocket); });
afterEach(() => {
  cleanup(); disconnect(); vi.unstubAllGlobals();
  while (getState() !== 'title') transition(getState() === 'lobby' ? 'title' : 'title');
});

async function served(ok: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => ({ kr: 'server' }) })));
  await act(async () => { actions.detectServer(); await Promise.resolve(); await Promise.resolve(); });
}

describe('the Multijoueur button', () => {
  it('is absent when the page is not served by the game server (GitHub Pages)', async () => {
    const { container } = render(<App />);
    await served(false);
    expect(container.querySelector('#b-multi')).toBeNull();
  });

  it('appears when the game server answers its probe', async () => {
    const { container } = render(<App />);
    await served(true);
    expect(container.querySelector('#b-multi')).not.toBeNull();
  });
});

describe('the lobby', () => {
  it('connects, creates a room and shows the players with their teams', async () => {
    const { container } = render(<App />);
    await served(true);
    fireEvent.click(container.querySelector('#b-multi')!);
    expect(getState()).toBe('lobby');
    expect((container.querySelector('#s-lobby') as HTMLElement).hidden).toBe(false);
    const sock = FakeSocket.last!;
    expect(sock.url).toMatch(/^ws:\/\/.+\/ws$/);
    act(() => { sock.open(); sock.serve({ t: 'welcome', id: 'me' }); });
    expect(container.querySelector('#lobby-status')?.textContent).toBe('Connecté au serveur');

    fireEvent.change(container.querySelector('#lobby-name')!, { target: { value: 'Alice' } });
    fireEvent.click(container.querySelector('#b-mp-create')!);
    expect(sock.sent.at(-2)).toEqual({ t: 'hello', name: 'Alice' });
    // The player's Garage edits ride along (none here), so others draw their kart as styled.
    expect(sock.sent.at(-1)).toEqual({ t: 'create', style: {} });

    act(() => sock.serve({ t: 'room', room: ROOM() }));
    expect(container.querySelector('#lobby-room')?.textContent).toContain('ABCD');
    const rows = [...container.querySelectorAll('#lobby-players tr')].map(r => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Bleu');
    expect(rows[1]).toContain('Rouge');

    // The host waits for Bob, then can start; switching team and candidate sends the change.
    expect((container.querySelector('#b-mp-start') as HTMLButtonElement).disabled).toBe(true);
    act(() => sock.serve({ t: 'room', room: ROOM({ players: [ROOM().players[0], { ...ROOM().players[1], ready: true }] }) }));
    expect((container.querySelector('#b-mp-start') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(container.querySelector('#b-mp-team-rouge')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', team: 'rouge' });
    fireEvent.click(container.querySelector('#b-mp-char-next')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', charId: 'maurice' });   // gege is Bob's, so it is skipped
    fireEvent.click(container.querySelector('#b-mp-track-2')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'track', trackIdx: 2 });
    fireEvent.click(container.querySelector('#b-mp-start')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'start' });
  });

  it('lets a guest ready up but not start, and shows the server’s errors', async () => {
    const { container } = render(<App />);
    await served(true);
    fireEvent.click(container.querySelector('#b-multi')!);
    const sock = FakeSocket.last!;
    act(() => { sock.open(); sock.serve({ t: 'welcome', id: 'bob' }); sock.serve({ t: 'room', room: ROOM() }); });
    expect(container.querySelector('#b-mp-start')).toBeNull();
    fireEvent.click(container.querySelector('#b-mp-ready')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', ready: true });
    act(() => sock.serve({ t: 'error', msg: 'Ce candidat est déjà pris.' }));
    expect(container.querySelector('#lobby-error')?.textContent).toBe('Ce candidat est déjà pris.');
    fireEvent.click(container.querySelector('#b-mp-leave')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'leave' });
    expect(container.querySelector('#b-mp-create')).not.toBeNull();
    fireEvent.click(container.querySelector('#b-mp-back')!);
    expect(getState()).toBe('title');
  });
});
