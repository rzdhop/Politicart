import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResultsTable, type ResultsRow } from './ResultsTable';

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
