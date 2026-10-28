import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Disclaimer } from './Disclaimer';
import { GameTitle } from './GameTitle';
import { Heading } from './Heading';
import { Subtitle } from './Subtitle';

/**
 * jsdom re-serialises a CSS value with spaces after commas, so
 * `clamp(24px,4.5vw,40px)` comes back as `clamp(24px, 4.5vw, 40px)`. Compare
 * without the cosmetic whitespace rather than hard-coding either spelling.
 */
const squash = (value: string) => value.replace(/\s+/g, '');

describe('GameTitle', () => {
  it('renders a level-1 heading', () => {
    // The gradient treatment is bound to the bare h1 selector, so the element
    // itself is the contract here - there is no class to assert.
    render(<GameTitle>POLITIKART</GameTitle>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('POLITIKART');
  });

  it('carries no class of its own but accepts one', () => {
    const { container } = render(<GameTitle className="extra" />);
    expect(container.querySelector('h1')?.className).toBe('extra');
  });
});

describe('Subtitle', () => {
  it('renders with the sub class', () => {
    const { container } = render(<Subtitle>Grand Prix</Subtitle>);
    expect(container.firstElementChild?.className).toBe('sub');
  });
});

describe('Heading', () => {
  it('is an h2 at panel size by default, with no inline font-size', () => {
    render(<Heading>Résultats du scrutin</Heading>);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.style.fontSize).toBe('');
  });

  it('renders an h3 when asked', () => {
    render(<Heading level={3}>Sous-titre</Heading>);
    expect(screen.getByRole('heading', { level: 3 })).toBeDefined();
  });

  it.each([
    ['screen', 'clamp(24px,4.5vw,40px)'],
    ['screenWide', 'clamp(26px,5vw,44px)'],
  ] as const)('applies the %s clamp the game uses', (size, expected) => {
    render(<Heading size={size}>Titre</Heading>);
    expect(squash(screen.getByRole('heading').style.fontSize)).toBe(expected);
  });

  it('lets a caller style override the size clamp', () => {
    render(
      <Heading size="screen" style={{ fontSize: '20px' }}>
        Titre
      </Heading>,
    );
    expect(screen.getByRole('heading').style.fontSize).toBe('20px');
  });

  it('keeps other caller styles alongside the clamp', () => {
    render(
      <Heading size="screen" style={{ color: 'red' }}>
        Titre
      </Heading>,
    );
    const heading = screen.getByRole('heading');
    expect(squash(heading.style.fontSize)).toBe('clamp(24px,4.5vw,40px)');
    expect(heading.style.color).toBe('red');
  });
});

describe('Disclaimer', () => {
  it('renders a paragraph with the disclaimer class', () => {
    const { container } = render(<Disclaimer>Personnages fictifs.</Disclaimer>);
    const p = container.querySelector('p');
    expect(p?.className).toBe('disclaimer');
    expect(p?.textContent).toBe('Personnages fictifs.');
  });
});
