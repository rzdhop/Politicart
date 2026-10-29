// @vitest-environment jsdom
// The team-race lobby, driven through the real store and net client, with a
// fake WebSocket playing the game server.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/stagegate.js', () => ({ hasPreview: () => false, makeThumbs: () => ({}), setPreview: () => {}, setPreviewFrame: () => {} }));
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

/** The ids of each row's primary (non-ghost) buttons under `screen`: the design system allows at most one per row. */
function primaries(container: HTMLElement, screen: string) {
  return [...container.querySelectorAll(screen + ' .row')]
    .map(row => [...row.querySelectorAll(':scope > .btn:not(.ghost)')].map(b => b.id))
    .filter(ids => ids.length);
}

const PROFILE = { id: 'u1', name: 'Alice', xp: 130, level: 2, xpInto: 10, xpNext: 160, unlocked: ['victor', 'gege', 'maurice', 'capucine', 'lucie'] };

/** A game server that answers the probe and logs Alice in. */
async function servedWithAccount() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/api/login')) return { ok: true, status: 200, json: async () => ({ token: 'tok', profile: PROFILE }) };
    return { ok: true, status: 200, json: async () => ({ kr: 'server' }) };
  }));
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
  afterEach(() => { act(() => actions.logOut()); });

  it('logs in, connects, creates a room and shows the players with their teams', async () => {
    const { container } = render(<App />);
    await servedWithAccount();
    fireEvent.click(container.querySelector('#b-account')!);
    expect(getState()).toBe('account');
    fireEvent.change(container.querySelector('#acc-name')!, { target: { value: 'Alice' } });
    fireEvent.change(container.querySelector('#acc-pass')!, { target: { value: 'secret1' } });
    await act(async () => { fireEvent.click(container.querySelector('#b-acc-login')!); await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('#acc-level')?.textContent).toBe('Alice · niveau 2');
    const sock = FakeSocket.last!;          // logging in opens the socket, so friends see us online
    act(() => { sock.open(); sock.serve({ t: 'welcome', id: 'me', profile: PROFILE }); });
    expect(sock.sent[0]).toEqual({ t: 'hello', name: 'Alice', token: 'tok' });
    fireEvent.click(container.querySelector('#b-acc-back')!);
    expect(container.querySelector('#b-account')?.textContent).toBe('Alice · niv. 2');
    expect(primaries(container, '#s-title')).toEqual([['b-play']]);   // signed in, the account stays a ghost

    fireEvent.click(container.querySelector('#b-multi')!);
    expect(getState()).toBe('lobby');
    expect((container.querySelector('#s-lobby') as HTMLElement).hidden).toBe(false);
    expect(sock.url).toMatch(/^ws:\/\/.+\/ws$/);
    expect(container.querySelector('#lobby-status')?.textContent).toBe('Connecté au serveur');
    expect(primaries(container, '#s-lobby')).toEqual([['b-mp-create']]);   // an account creates; joining is the ghost

    fireEvent.click(container.querySelector('#b-mp-create')!);
    expect(sock.sent.at(-2)).toEqual({ t: 'hello', name: 'Alice', token: 'tok' });
    // The player's Garage edits ride along (none here), so others draw their kart as styled.
    expect(sock.sent.at(-1)).toEqual({ t: 'create', style: {} });

    act(() => sock.serve({ t: 'room', room: ROOM() }));
    expect(container.querySelector('#lobby-room')?.textContent).toContain('ABCD');
    const rows = [...container.querySelectorAll('#lobby-players .player-card')].map(r => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Bleu');
    expect(rows[1]).toContain('Rouge');
    // stage 8: the players as cards (mine washed gold), the team as a ChoiceGroup, the circuit chips, the code to copy
    expect(container.querySelector('#lobby-player-me')?.classList.contains('you')).toBe(true);
    expect(container.querySelector('#lobby-player-me .pc-status')?.textContent).toBe('hôte');
    expect(container.querySelector('#b-mp-team-bleu')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#b-mp-team-bleu')?.classList.contains('chip')).toBe(true);
    expect(container.querySelector('#b-mp-track-0')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#b-mp-track-1')?.getAttribute('aria-disabled')).toBeNull();   // the host picks the circuit
    expect(container.querySelector('#lobby-room .rc-code')?.textContent).toBe('ABCD');
    expect(container.querySelectorAll('#lobby-track-meta .tl-name')).toHaveLength(3);

    // The host waits for Bob, then can start; switching team and candidate sends the change.
    expect((container.querySelector('#b-mp-start') as HTMLButtonElement).disabled).toBe(true);
    act(() => sock.serve({ t: 'room', room: ROOM({ players: [ROOM().players[0], { ...ROOM().players[1], ready: true }] }) }));
    expect((container.querySelector('#b-mp-start') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(container.querySelector('#b-mp-team-rouge')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', team: 'rouge' });
    fireEvent.click(container.querySelector('#b-mp-char-next')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', charId: 'maurice' });   // gege is Bob's, so it is skipped
    fireEvent.click(container.querySelector('#b-mp-char-prev')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', charId: 'lucie' });     // backwards from victor: only what level 2 unlocked
    fireEvent.click(container.querySelector('#b-mp-track-2')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'track', trackIdx: 2 });
    fireEvent.click(container.querySelector('#b-mp-start')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'start' });
  });

  it('lets a guest join but not create a room, ready up but not start, and shows the server’s errors', async () => {
    const { container } = render(<App />);
    await served(true);
    fireEvent.click(container.querySelector('#b-multi')!);
    const sock = FakeSocket.last!;
    act(() => { sock.open(); });
    expect((container.querySelector('#b-mp-create') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('#lobby-guest')).not.toBeNull();
    expect(primaries(container, '#s-lobby')).toEqual([['b-mp-join']]);   // a guest cannot create, so joining is the primary
    // "Se connecter" sits in its own row under the note, and the empty status line takes no room.
    expect(container.querySelector('#lobby-guest #b-mp-account')).toBeNull();
    expect(container.querySelector('#b-mp-account')?.parentElement?.classList.contains('row')).toBe(true);
    expect((container.querySelector('#lobby-error') as HTMLElement).hidden).toBe(true);
    act(() => { sock.open(); sock.serve({ t: 'welcome', id: 'bob' }); sock.serve({ t: 'room', room: ROOM() }); });
    expect(container.querySelector('#b-mp-start')).toBeNull();
    // a guest sees the host's circuit, its chips inert
    expect(container.querySelector('#b-mp-track-1')?.getAttribute('aria-disabled')).toBe('true');
    const sent = sock.sent.length;
    fireEvent.click(container.querySelector('#b-mp-track-1')!);
    expect(sock.sent).toHaveLength(sent);
    fireEvent.click(container.querySelector('#b-mp-ready')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'set', ready: true });
    act(() => sock.serve({ t: 'error', msg: 'Ce candidat est déjà pris.' }));
    expect(container.querySelector('#lobby-error')?.textContent).toBe('Ce candidat est déjà pris.');
    expect((container.querySelector('#lobby-error') as HTMLElement).hidden).toBe(false);
    fireEvent.click(container.querySelector('#b-mp-leave')!);
    expect(sock.sent.at(-1)).toEqual({ t: 'leave' });
    expect(container.querySelector('#b-mp-create')).not.toBeNull();
    fireEvent.click(container.querySelector('#b-mp-back')!);
    expect(getState()).toBe('title');
  });
});

describe('the lobby badges (DEC-036, A-032)', () => {
  it('name each player’s candidate grade and trail, "—" for a player without one', async () => {
    const { container } = render(<App />);
    await served(true);
    fireEvent.click(container.querySelector('#b-multi')!);
    const sock = FakeSocket.last!;
    act(() => { sock.open(); sock.serve({ t: 'welcome', id: 'me' }); });
    act(() => sock.serve({ t: 'room', room: ROOM({ players: [
      { id: 'me', name: 'Alice', team: 'bleu', charId: 'victor', ready: false, style: { wheels: 'gold' } },
      { id: 'bob', name: 'Bob', team: 'rouge', charId: 'patrick', ready: true, style: { trail: 'confetti', spoiler: 'wing' } },
      { id: 'cid', name: 'Cid', team: 'rouge', charId: 'gege', ready: true },
    ] }) }));
    const rows = [...container.querySelectorAll('#lobby-players .player-card')];
    expect(rows).toHaveLength(3);
    // the candidate's grade badge beside their name
    const badge = (row: Element) => row.querySelector('.grade[data-grade]');
    expect(rows[0]!.textContent).toContain('Emmanuel Macaron');
    expect(badge(rows[0]!)?.getAttribute('data-grade')).toBe('common');
    expect(badge(rows[0]!)?.textContent).toBe('Commun');
    expect(badge(rows[1]!)?.getAttribute('data-grade')).toBe('rare');
    expect(badge(rows[1]!)?.textContent).toBe('Rare');
    // the trail, named with its grade; a dash for none (a style without a trail, or no style at all)
    expect(container.querySelector('#lobby-trail-me')?.textContent).toBe('—');
    expect(container.querySelector('#lobby-trail-me')?.getAttribute('data-trail')).toBe('none');
    expect(container.querySelector('#lobby-trail-bob')?.textContent).toBe('ConfettisMythique');
    expect(container.querySelector('#lobby-trail-bob .grade')?.getAttribute('data-grade')).toBe('mythic');
    expect(container.querySelector('#lobby-trail-bob')?.getAttribute('data-trail')).toBe('confetti');
    expect(container.querySelector('#lobby-trail-cid')?.textContent).toBe('—');
    expect(container.querySelectorAll('#lobby-players .grade')).toHaveLength(4);
    fireEvent.click(container.querySelector('#b-mp-leave')!);
    fireEvent.click(container.querySelector('#b-mp-back')!);
  });
});

describe('invitations', () => {
  it('joins the inviting friend’s room from the title screen', async () => {
    const { container } = render(<App />);
    await served(true);
    fireEvent.click(container.querySelector('#b-multi')!);
    const sock = FakeSocket.last!;
    act(() => { sock.open(); sock.serve({ t: 'welcome', id: 'me' }); });
    act(() => { sock.serve({ t: 'invite', from: { id: 'u2', name: 'Bob' }, code: 'WXYZ' }); });
    expect(container.querySelector('#invite-text')?.textContent).toBe('Bob vous invite dans sa salle WXYZ');
    fireEvent.click(container.querySelector('#b-invite-join')!);
    // The invited player's Garage edits ride along (none here), as with any join.
    expect(sock.sent.at(-1)).toEqual({ t: 'join', code: 'WXYZ', style: {} });
    expect(container.querySelector('#invite')).toBeNull();
    expect(getState()).toBe('lobby');
  });
});

describe('the roster for a guest', () => {
  it('locks every candidate but the four starters', async () => {
    const { container } = render(<App />);
    await served(true);
    act(() => actions.play());
    const tiles = [...container.querySelectorAll('#roster .tile')] as HTMLButtonElement[];
    expect(tiles).toHaveLength(16);
    expect(tiles.filter(t => !t.classList.contains('locked')).map(t => t.textContent)).toEqual(['Emmanuel Macaron', 'Philippe Martini', 'Jean Lassalle-des-Fêtes', 'Sandrine Ruisseau']);
    expect(tiles.find(t => t.classList.contains('locked'))?.dataset.lock).toBe('🔒 Compte requis');
    act(() => actions.selectChar(15));
    expect(container.querySelector('#roster button[aria-pressed="true"]')?.textContent).toBe('Emmanuel Macaron');
    // On the game server a locked tile is a way into the Boutique, not a dead button (DEC-037).
    act(() => { tiles[15]!.click(); });
    expect(getState()).toBe('shop');
    expect(container.querySelector('#roster button[aria-pressed="true"]')?.textContent).toBe('Emmanuel Macaron');
    act(() => actions.closeShop());
    expect(getState()).toBe('select');
    act(() => actions.toTitle());
  });
});
