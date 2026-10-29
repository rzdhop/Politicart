import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GainBreakdown } from './GainBreakdown';
import { Podium } from './Podium';
import { ResultsTable, type ResultsRow } from './ResultsTable';
import { TeamStandings } from './TeamStandings';

const ROWS: ResultsRow[] = [
  {
    id: 'victor',
    rank: '1er',
    name: 'Victor Lemarchand',
    detail: 'Le jeune président',
    time: '2:14.07',
  },
  { id: 'gege', rank: '2e', name: 'Gégé Marteau', detail: 'Le syndicaliste', time: '2:15.80' },
  { id: 'lulu', rank: '3e', name: 'Lulu', time: 'en course…', highlighted: true },
];

describe('ResultsTable', () => {
  it('is scoped to its own class rather than restyling every table', () => {
    const { container } = render(<ResultsTable rows={ROWS} />);
    expect(container.querySelector('table')?.className).toBe('results-table');
  });

  it('renders one row per racer, in the order given', () => {
    render(<ResultsTable rows={ROWS} />);
    const names = screen.getAllByRole('row').map((r) => r.querySelector('b')?.textContent);
    expect(names).toEqual(['Victor Lemarchand', 'Gégé Marteau', 'Lulu']);
  });

  it('puts the rank and time in their styled columns', () => {
    const { container } = render(<ResultsTable rows={ROWS} />);
    const first = container.querySelector('tbody tr');
    expect(first?.querySelector('td.r')?.textContent).toBe('1er');
    expect(first?.querySelector('td.t')?.textContent).toBe('2:14.07');
  });

  it('renders the muted detail line under the name', () => {
    const { container } = render(<ResultsTable rows={ROWS} />);
    const detail = container.querySelector('tbody tr span') as HTMLElement;
    expect(detail.textContent).toBe('Le jeune président');
    expect(detail.style.color).toBe('var(--muted)');
  });

  it('omits the detail line and its break when there is no detail', () => {
    const { container } = render(<ResultsTable rows={[ROWS[2]!]} />);
    expect(container.querySelector('tbody tr span')).toBeNull();
    expect(container.querySelector('tbody tr br')).toBeNull();
  });

  it('highlights the row flagged as the player', () => {
    const { container } = render(<ResultsTable rows={ROWS} />);
    const highlighted = [...container.querySelectorAll('tbody tr')].filter(
      (r) => r.className === 'you',
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.querySelector('b')?.textContent).toBe('Lulu');
  });

  it('renders no header row unless columns are given', () => {
    // The wording is the game's, so there is deliberately no default.
    const { container } = render(<ResultsTable rows={ROWS} />);
    expect(container.querySelector('thead')).toBeNull();
  });

  it('renders the given headers, with the time column right-aligned', () => {
    const { container } = render(
      <ResultsTable rows={ROWS} columns={['', 'Candidat·e', 'Temps']} />,
    );
    const headers = [...container.querySelectorAll('thead th')];
    expect(headers.map((h) => h.textContent)).toEqual(['', 'Candidat·e', 'Temps']);
    expect((headers[2] as HTMLElement).style.textAlign).toBe('right');
  });

  it('survives an empty field of racers', () => {
    const { container } = render(<ResultsTable rows={[]} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('falls back to the row index when no id is given', () => {
    const rows: ResultsRow[] = [
      { rank: '1er', name: 'A', time: '1:00' },
      { rank: '2e', name: 'B', time: '1:01' },
    ];
    const { container } = render(<ResultsTable rows={rows} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});

describe('ResultsTable bodyProps', () => {
  it('spreads bodyProps onto the tbody, so the game can give it its contract id', () => {
    const { container } = render(<ResultsTable rows={ROWS} bodyProps={{ id: 'r-body' }} />);
    const body = container.querySelector('tbody#r-body');
    expect(body).not.toBeNull();
    expect(body?.querySelectorAll('tr')).toHaveLength(ROWS.length);
  });

  it('renders a plain tbody when bodyProps is omitted', () => {
    const { container } = render(<ResultsTable rows={ROWS} />);
    expect(container.querySelector('tbody')?.attributes).toHaveLength(0);
  });
});

describe('Podium', () => {
  it('lists the first three in finishing order, each on its numbered step', () => {
    const { container } = render(
      <Podium
        placeLabel={(n) => n + (n === 1 ? 'er' : 'e')}
        entries={[
          { name: 'A', portrait: 'a.png', value: '1:00', you: true },
          { name: 'B', detail: 'b' },
          { name: 'C' },
          { name: 'D' },
        ]}
      />,
    );
    const places = [...container.querySelectorAll('.podium > li')] as HTMLElement[];
    expect(places.map((p) => p.dataset.place)).toEqual(['1', '2', '3']);
    expect(places.map((p) => p.querySelector('.pd-step')?.textContent)).toEqual(['1er', '2e', '3e']);
    expect(places[0]!.className).toBe('podium-place you');
    expect(places[0]!.querySelector('img')?.getAttribute('src')).toBe('a.png');
    expect(places[0]!.querySelector('.pd-value')?.textContent).toBe('1:00');
    expect(places[1]!.querySelector('.pd-detail')?.textContent).toBe('b');
    expect(places[2]!.querySelector('.pd-detail')).toBeNull();
    expect(container.querySelector('.podium')?.tagName).toBe('OL');
  });
});

describe('GainBreakdown', () => {
  it('writes each amount after a plus, with its label, and carries the count-up target', () => {
    const { container } = render(
      <GainBreakdown id="g" lines={[{ key: 'xp', label: 'XP', value: 40 }, { key: 'c', label: 'politicoins', value: 1200, tone: 'coin' }]} format={(v) => v.toLocaleString('fr-FR')} notes={['Niveau 2 atteint !']} />,
    );
    const lines = [...container.querySelectorAll('.gain-line')] as HTMLElement[];
    expect(lines.map((l) => l.textContent)).toEqual(['+40 XP', '+1\u202f200 politicoins']);
    expect(lines.map((l) => l.className)).toEqual(['gain-line tone-xp', 'gain-line tone-coin']);
    const value = lines[1]!.querySelector('.gain-value') as HTMLElement;
    expect(value.className).toBe('gain-value kr-count');
    expect(value.style.getPropertyValue('--to')).toBe('1200');
    expect(value.style.getPropertyValue('--i')).toBe('1');
    expect(container.querySelector('.gain-notes')?.textContent).toBe('Niveau 2 atteint !');
    expect(container.querySelector('#g')?.textContent).toContain('XP');
  });

  it('draws no notes list without notes', () => {
    const { container } = render(<GainBreakdown lines={[{ label: 'XP', value: 5 }]} />);
    expect(container.querySelector('.gain-notes')).toBeNull();
  });
});

describe('TeamStandings', () => {
  it('is a table row per team, best first, with a bar as long as its share of the best score', () => {
    const { container } = render(
      <TeamStandings
        bodyProps={{ id: 'teams' }}
        teams={[{ name: 'Bleu', points: 24, detail: '3 pilotes', color: 'blue', you: true }, { name: 'Rouge', points: 12, color: 'red' }]}
      />,
    );
    const rows = [...container.querySelectorAll('#teams tr')] as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).toBe('you');
    expect(rows[0]!.textContent).toBe('1Bleu3 pilotes24 pts');
    expect(rows[1]!.style.getPropertyValue('--team')).toBe('red');
    expect((rows[0]!.querySelector('.ts-bar i') as HTMLElement).style.width).toBe('100%');
    expect((rows[1]!.querySelector('.ts-bar i') as HTMLElement).style.width).toBe('50%');
    expect(container.querySelector('table')?.className).toBe('results-table team-standings');
  });

  it('keeps an empty bar for a team without points', () => {
    const { container } = render(<TeamStandings teams={[{ name: 'Bleu', points: 0 }]} pointsLabel={(p) => p + ' points'} />);
    expect((container.querySelector('.ts-bar i') as HTMLElement).style.width).toBe('0%');
    expect(container.querySelector('td.t')?.textContent).toBe('0 points');
  });
});
