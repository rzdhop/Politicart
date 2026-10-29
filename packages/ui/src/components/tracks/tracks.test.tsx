import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CardGrid } from './CardGrid';
import { TrackCard } from './TrackCard';
import { TrackMeta } from './TrackMeta';

describe('CardGrid', () => {
  it('renders the cards class', () => {
    const { container } = render(<CardGrid />);
    expect(container.firstElementChild?.className).toBe('cards');
  });
});

describe('TrackCard', () => {
  it('renders name, preview and description in that order', () => {
    const { container } = render(
      <TrackCard
        name="L’Élysée"
        description="Tour du palais."
        preview={<canvas width={240} height={150} />}
      />,
    );
    const card = screen.getByRole('button');
    expect(card.className).toBe('card');
    const order = [...card.children].map((n) => n.tagName.toLowerCase() + '.' + n.className);
    expect(order).toEqual(['span.name', 'span.track-thumb', 'span.desc']);
    expect(card.querySelector('.track-thumb > canvas')).not.toBeNull();
    expect(container.querySelector('.name')?.textContent).toBe('L’Élysée');
    expect(container.querySelector('.desc')?.textContent).toBe('Tour du palais.');
  });

  it('works with no preview and no description', () => {
    render(<TrackCard name="Versailles" />);
    const card = screen.getByRole('button');
    expect(card.children).toHaveLength(1);
    expect(card.querySelector('.desc')).toBeNull();
  });

  it('adds the sel class and reports pressed when selected', () => {
    render(<TrackCard name="Palais Bourbon" selected />);
    const card = screen.getByRole('button');
    expect(card.className).toBe('card sel');
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });

  it('is the whole hit target, not a link inside it', () => {
    const onClick = vi.fn();
    render(<TrackCard name="Versailles" description="Jardins." onClick={onClick} />);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps the caller class after its own', () => {
    render(<TrackCard name="X" selected className="mine" />);
    expect(screen.getByRole('button').className).toBe('card sel mine');
  });
});

describe('TrackCard thumbnail and meta', () => {
  it('sets the thumbnail state on the preview frame, and leaves it off when omitted', () => {
    const { container, rerender } = render(<TrackCard name="X" preview={<canvas />} thumb="pending" />);
    expect(container.querySelector('.track-thumb')?.getAttribute('data-thumb')).toBe('pending');
    rerender(<TrackCard name="X" preview={<canvas />} thumb="ready" />);
    expect(container.querySelector('.track-thumb')?.getAttribute('data-thumb')).toBe('ready');
    rerender(<TrackCard name="X" preview={<canvas />} />);
    expect(container.querySelector('.track-thumb')?.hasAttribute('data-thumb')).toBe(false);
  });

  it('renders the meta after the description, inside the card', () => {
    render(<TrackCard name="X" description="D" meta={<TrackMeta items={[{ label: 'Tours', value: '3' }]} />} />);
    const card = screen.getByRole('button');
    expect(card.lastElementChild?.className).toBe('track-meta');
  });
});

describe('TrackMeta', () => {
  it('renders one chip per figure, the best one gold, as a list', () => {
    const { container } = render(
      <TrackMeta items={[{ key: 'l', label: 'Longueur', value: '2,9 km' }, { key: 'b', label: 'Meilleur tour', value: '0:58.50', tone: 'best' }]} />,
    );
    const chips = [...container.querySelectorAll('.track-chip')];
    expect(chips.map((c) => c.textContent)).toEqual(['Longueur2,9 km', 'Meilleur tour0:58.50']);
    expect(chips.map((c) => c.className)).toEqual(['track-chip', 'track-chip best']);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('lists the layouts under their caption and names every climate glyph', () => {
    const { container } = render(
      <TrackMeta
        items={[]}
        layouts={['Visite officielle', 'Jour de manif', 'Travaux du Faubourg']}
        layoutsLabel="Tracés"
        climates={[{ id: 'night', icon: '🌙', label: 'Nuit' }, { id: 'dawn', icon: '🌅', label: 'Aube' }]}
        climatesLabel="Climats"
      />,
    );
    expect(container.querySelector('.tl-label')?.textContent).toBe('Tracés');
    expect([...container.querySelectorAll('.tl-name')].map((n) => n.textContent)).toEqual(['Visite officielle', 'Jour de manif', 'Travaux du Faubourg']);
    expect(screen.getByRole('list', { name: 'Climats' })).toBeDefined();
    expect(screen.getByLabelText('Nuit').textContent).toBe('🌙');
    expect(container.querySelector('[data-climate="dawn"]')?.getAttribute('title')).toBe('Aube');
  });

  it('draws no layout or climate row when there are none, and uses only spans (it sits in a button)', () => {
    const { container } = render(<TrackMeta items={[{ label: 'Tours', value: '3' }]} />);
    expect(container.querySelector('.track-layouts')).toBeNull();
    expect(container.querySelector('.track-climates')).toBeNull();
    expect([...container.querySelectorAll('*')].every((n) => n.tagName === 'SPAN')).toBe(true);
  });
});
