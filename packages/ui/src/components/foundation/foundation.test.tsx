import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Bar } from './Bar';
import { Panel } from './Panel';
import { Row } from './Row';
import { Screen } from './Screen';

describe('Screen', () => {
  it('renders a section carrying the screen class', () => {
    const { container } = render(<Screen>contenu</Screen>);
    const section = container.querySelector('section');
    expect(section).toHaveProperty('className', 'screen');
    expect(section?.textContent).toBe('contenu');
  });

  it('appends the caller class after its own', () => {
    // Order matters: the caller's class must come last so equally specific
    // declarations from the consumer win.
    const { container } = render(<Screen className="s-title" />);
    expect(container.querySelector('section')?.className).toBe('screen s-title');
  });

  it('forwards the hidden attribute, which is how screens are switched', () => {
    const { container } = render(<Screen hidden />);
    expect(container.querySelector('section')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('Panel', () => {
  it('renders a div carrying the panel class', () => {
    const { container } = render(<Panel>texte</Panel>);
    expect(container.firstElementChild?.className).toBe('panel');
  });

  it('forwards arbitrary DOM props', () => {
    render(<Panel data-testid="p" role="group" aria-label="réglages" />);
    expect(screen.getByTestId('p').getAttribute('aria-label')).toBe('réglages');
  });
});

describe('Row', () => {
  it('renders a div carrying the row class', () => {
    const { container } = render(<Row />);
    expect(container.firstElementChild?.className).toBe('row');
  });
});

describe('Bar', () => {
  it('renders a track with a fill whose width is the value as a percentage', () => {
    const { container } = render(<Bar value={0.42} />);
    const track = container.firstElementChild;
    expect(track?.className).toBe('bar');
    expect(track?.querySelector('i')?.style.width).toBe('42%');
  });

  it.each([
    [-1, '0%'],
    [0, '0%'],
    [1, '100%'],
    [5, '100%'],
  ])('clamps %s to %s', (value, expected) => {
    const { container } = render(<Bar value={value} />);
    expect(container.querySelector('i')?.style.width).toBe(expected);
  });

  it('treats a non-finite value as empty rather than rendering NaN%', () => {
    const { container } = render(<Bar value={Number.NaN} />);
    expect(container.querySelector('i')?.style.width).toBe('0%');
  });

  it('is decorative by default, with no progressbar role', () => {
    // StatBar and PowerGauge supply their own visible labels, so an unlabelled
    // bar must not announce itself twice.
    const { container } = render(<Bar value={0.5} />);
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
  });

  it('becomes a labelled progressbar when given a label', () => {
    render(<Bar value={0.5} label="Vitesse" />);
    const bar = screen.getByRole('progressbar', { name: 'Vitesse' });
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('rounds the reported value to match the rendered width', () => {
    render(<Bar value={0.666} label="Tenue de route" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('67');
    expect(bar.querySelector('i')?.style.width).toBe('67%');
  });
});
