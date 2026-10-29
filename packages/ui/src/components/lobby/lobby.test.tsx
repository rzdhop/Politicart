import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InviteRow } from './InviteRow';
import { PlayerCard } from './PlayerCard';
import { PlayerGrid } from './PlayerGrid';
import { COPIED_MS, RoomCode } from './RoomCode';
import { TeamPicker } from './TeamPicker';

describe('PlayerCard and PlayerGrid', () => {
  it('renders a list of player cards', () => {
    const { container } = render(
      <PlayerGrid id="players">
        <PlayerCard name="Alice" />
        <PlayerCard name="Bob" />
      </PlayerGrid>,
    );
    const grid = container.querySelector('#players')!;
    expect(grid.tagName).toBe('UL');
    expect(grid.className).toBe('player-grid');
    expect([...grid.children].map((c) => c.tagName + '.' + c.className)).toEqual(['LI.player-card', 'LI.player-card']);
  });

  it('shows name, tag, team, level, status and kart, the team colour as a variable', () => {
    const { container } = render(
      <ul>
        <PlayerCard name="Bob" tag="(invité·e)" team="Rouge" teamColor="#c8102e" level="niv. 2" status="prêt·e" ready kart={<b>Kart</b>} portrait="x.png" />
      </ul>,
    );
    const card = container.querySelector('.player-card') as HTMLElement;
    expect(card.textContent).toBe('Bob (invité·e)Rougeniv. 2Kartprêt·e');
    expect(card.className).toBe('player-card ready');
    expect(card.dataset.ready).toBe('true');
    expect(card.style.getPropertyValue('--team')).toBe('#c8102e');
    expect(card.querySelector('.pc-portrait img')?.getAttribute('src')).toBe('x.png');
  });

  it('marks the viewer’s own card and leaves out what is not given', () => {
    const { container } = render(<ul><PlayerCard name="Alice" you /></ul>);
    const card = container.querySelector('.player-card') as HTMLElement;
    expect(card.className).toBe('player-card you');
    expect(card.dataset.ready).toBe('false');
    for (const part of ['.pc-tag', '.pc-team', '.pc-level', '.pc-kart', '.pc-status', '.pc-actions', '.pc-portrait img']) expect(card.querySelector(part)).toBeNull();
  });

  it('puts the actions at the card’s foot', () => {
    render(<ul><PlayerCard name="Bob" actions={<button type="button">Exclure</button>} /></ul>);
    expect(screen.getByRole('button', { name: 'Exclure' }).parentElement?.className).toBe('pc-actions');
  });
});

describe('TeamPicker', () => {
  const teams = [
    { value: 'bleu', label: 'Bleu', color: 'blue', id: 't-bleu', count: 2 },
    { value: 'rouge', label: 'Rouge', color: 'red', id: 't-rouge' },
  ] as const;

  it('is a labelled choice group with a coloured dot per team and the picked one pressed', () => {
    const { container } = render(<TeamPicker label="Équipe" teams={teams} value="rouge" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Équipe' }).className).toBe('choice-group team-picker');
    expect(container.querySelector('#t-rouge')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#t-bleu')?.getAttribute('aria-pressed')).toBe('false');
    expect((container.querySelector('#t-bleu .team-dot') as HTMLElement).style.background).toBe('blue');
    expect(container.querySelector('#t-bleu .team-count')?.textContent).toBe('2');
    expect(container.querySelector('#t-rouge .team-count')).toBeNull();
  });

  it('reports the picked team', () => {
    const onChange = vi.fn();
    const { container } = render(<TeamPicker label="Équipe" teams={teams} value="bleu" onChange={onChange} />);
    fireEvent.click(container.querySelector('#t-rouge')!);
    expect(onChange).toHaveBeenCalledWith('rouge');
  });
});

describe('RoomCode', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('reads "label code" as text, so the code can be found in it', () => {
    const { container } = render(<RoomCode id="room" code="ABCD" label="Salle" hint="Donnez ce code" />);
    expect(container.querySelector('#room')?.textContent).toMatch(/Salle ([A-Z]{4})/);
    expect(container.querySelector('.rc-code')?.textContent).toBe('ABCD');
    expect(container.querySelector('.rc-hint')?.textContent).toBe('Donnez ce code');
  });

  it('copies the code to the clipboard and says so for a moment', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const onCopy = vi.fn();
    render(<RoomCode code="ABCD" copyLabel="Copier" copiedLabel="Copié !" onCopied={onCopy} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copier' })); await Promise.resolve(); });
    expect(writeText).toHaveBeenCalledWith('ABCD');
    expect(onCopy).toHaveBeenCalledWith('ABCD');
    expect(screen.getByRole('button').textContent).toBe('Copié !');
    act(() => { vi.advanceTimersByTime(COPIED_MS); });
    expect(screen.getByRole('button').textContent).toBe('Copier');
  });

  it('still reports a copy without a clipboard, with the text it was given', () => {
    vi.stubGlobal('navigator', {});
    const onCopy = vi.fn();
    render(<RoomCode code="ABCD" copyText="https://example.test/?salle=ABCD" onCopied={onCopy} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onCopy).toHaveBeenCalledWith('https://example.test/?salle=ABCD');
    expect(screen.getByRole('button').textContent).toBe('Copied!');
  });
});

describe('InviteRow', () => {
  it('renders one ghost button per friend with its id, and invites by id', () => {
    const onInvite = vi.fn();
    const { container } = render(
      <InviteRow friends={[{ id: 'u2', name: 'Bob' }]} onInvite={onInvite} inviteLabel={(n) => 'Inviter ' + n} buttonId={(id) => 'inv-' + id} label="Inviter :" />,
    );
    const b = container.querySelector('#inv-u2') as HTMLButtonElement;
    expect(b.textContent).toBe('Inviter Bob');
    expect(b.className).toBe('btn ghost');
    b.click();
    expect(onInvite).toHaveBeenCalledWith('u2');
    expect(container.querySelector('.ir-label')?.textContent).toBe('Inviter :');
  });

  it('shows the empty line when nobody can be invited', () => {
    const { container } = render(<InviteRow friends={[]} onInvite={() => {}} empty="Personne en ligne." />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.ir-empty')?.textContent).toBe('Personne en ligne.');
  });
});
