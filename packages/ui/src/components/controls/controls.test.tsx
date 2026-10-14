import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { ControlsGrid } from './ControlsGrid';
import { KeyCap } from './KeyCap';

describe('Button', () => {
  it('is a primary gold button by default', () => {
    render(<Button>Jouer</Button>);
    expect(screen.getByRole('button', { name: 'Jouer' }).className).toBe('btn');
  });

  it('adds the ghost class for the secondary variant', () => {
    render(<Button variant="ghost">Retour</Button>);
    expect(screen.getByRole('button').className).toBe('btn ghost');
  });

  it('defaults to type=button so a menu click cannot submit a form', () => {
    // The game lives on one page; a stray submit would reload it mid-race.
    render(<Button>Jouer</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('still allows an explicit type', () => {
    render(<Button type="submit">Enregistrer</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Jouer</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Jouer
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveProperty('disabled', true);
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ControlsGrid and KeyCap', () => {
  it('renders the grid with the controls class', () => {
    const { container } = render(<ControlsGrid />);
    expect(container.firstElementChild?.className).toBe('controls');
  });

  it('renders a keycap as a b element', () => {
    const { container } = render(<KeyCap>Échap</KeyCap>);
    expect(container.querySelector('b')?.textContent).toBe('Échap');
  });

  it('places keycaps inside the grid, which is what styles them', () => {
    // The chip comes from the descendant rule `.controls b`, so this nesting
    // is the component contract, not an incidental detail of the markup.
    const { container } = render(
      <ControlsGrid>
        <div>
          <KeyCap>↑</KeyCap> accélérer
        </div>
      </ControlsGrid>,
    );
    expect(container.querySelector('.controls b')?.textContent).toBe('↑');
  });
});
