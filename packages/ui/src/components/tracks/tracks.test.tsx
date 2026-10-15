import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CardGrid } from './CardGrid';
import { TrackCard } from './TrackCard';

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
    expect(order).toEqual(['div.name', 'canvas.', 'div.desc']);
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
