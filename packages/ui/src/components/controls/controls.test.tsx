import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { ChoiceGroup } from './ChoiceGroup';
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

describe('ChoiceGroup', () => {
  const OPTIONS = [
    { value: 'classic', label: 'Classiques', id: 'w-classic' },
    { value: 'gold', label: 'Dorées', id: 'w-gold' },
  ] as const;

  it('is a labelled group of chip buttons, the picked one pressed', () => {
    render(<ChoiceGroup label="Roues" options={OPTIONS} value="gold" onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Roues' });
    expect(group.className).toBe('choice-group');
    expect(group.querySelector('.choice-label')?.textContent).toBe('Roues');
    const chips = screen.getAllByRole('button');
    expect(chips.map(c => c.className)).toEqual(['chip', 'chip']);
    expect(chips.map(c => c.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(chips.map(c => c.getAttribute('type'))).toEqual(['button', 'button']);
  });

  it('puts the option ids on the chips', () => {
    render(<ChoiceGroup label="Roues" options={OPTIONS} value="classic" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Dorées' }).id).toBe('w-gold');
  });

  it('reports the picked value', () => {
    const onChange = vi.fn();
    render(<ChoiceGroup label="Roues" options={OPTIONS} value="classic" onChange={onChange} />);
    screen.getByRole('button', { name: 'Dorées' }).click();
    expect(onChange).toHaveBeenCalledWith('gold');
  });

  it('merges a consumer class onto the group', () => {
    render(<ChoiceGroup label="Roues" options={OPTIONS} value="classic" onChange={() => {}} className="wide" />);
    expect(screen.getByRole('group').className).toBe('choice-group wide');
  });

  it('makes a disabled option aria-disabled and not pickable', () => {
    const onChange = vi.fn();
    render(
      <ChoiceGroup
        label="Roues"
        options={[OPTIONS[0], { ...OPTIONS[1], disabled: true }]}
        value="classic"
        onChange={onChange}
      />,
    );
    const gold = screen.getByRole('button', { name: 'Dorées' });
    expect(gold.getAttribute('aria-disabled')).toBe('true');
    // Not the native attribute: a badge inside the chip must still take a tap.
    expect(gold).toHaveProperty('disabled', false);
    gold.click();
    expect(onChange).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Classiques' }).click();
    expect(onChange).toHaveBeenCalledWith('classic');
    expect(screen.getByRole('button', { name: 'Classiques' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('renders an option badge inside the chip after the label, and lets it take a click', () => {
    const onBadge = vi.fn();
    const onChange = vi.fn();
    render(
      <ChoiceGroup
        label="Roues"
        options={[
          OPTIONS[0],
          { ...OPTIONS[1], disabled: true, badge: <span id="g-buy-wheels-gold" onClick={onBadge}>Mythique</span> },
        ]}
        value="classic"
        onChange={onChange}
      />,
    );
    const gold = document.getElementById('w-gold');
    expect(gold?.querySelector('.chip-badge')?.textContent).toBe('Mythique');
    expect(gold?.textContent).toBe('DoréesMythique');
    document.getElementById('g-buy-wheels-gold')?.click();
    expect(onBadge).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});
