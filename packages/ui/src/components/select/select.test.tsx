import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CharacterTile } from './CharacterTile';
import { PowerBox } from './PowerBox';
import { Roster } from './Roster';
import { SelectLayout } from './SelectLayout';
import { Showcase } from './Showcase';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

describe('SelectLayout and Roster', () => {
  it('render their layout classes', () => {
    const { container } = render(
      <SelectLayout>
        <Roster />
      </SelectLayout>,
    );
    expect(container.firstElementChild?.className).toBe('select-layout');
    expect(container.querySelector('.select-layout > .roster')).not.toBeNull();
  });
});

describe('CharacterTile', () => {
  it('renders a button with the portrait and the name strip', () => {
    render(<CharacterTile name="Gégé Marteau" image="data:image/png;base64,AAA" />);
    const tile = screen.getByRole('button');
    expect(tile.className).toBe('tile');
    expect(tile.querySelector('.tname')?.textContent).toBe('Gégé Marteau');
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  it('uses the name as the portrait alt text', () => {
    render(<CharacterTile name="Odile Pinson" image="x.png" />);
    expect(screen.getByAltText('Odile Pinson')).toBeDefined();
  });

  it('omits the image entirely when none is given', () => {
    // An unloaded roster must not render a broken image.
    const { container } = render(<CharacterTile name="Lulu" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.tname')?.textContent).toBe('Lulu');
  });

  it('adds the sel class and reports pressed when selected', () => {
    render(<CharacterTile name="Victor" selected />);
    const tile = screen.getByRole('button');
    expect(tile.className).toBe('tile sel');
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });

  it('reports not-pressed when unselected, so the state is announced either way', () => {
    render(<CharacterTile name="Victor" />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
  });

  it('is clickable', () => {
    const onClick = vi.fn();
    render(<CharacterTile name="Kevin" onClick={onClick} />);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Showcase', () => {
  it('renders the name, title and quote in the order the layout expects', () => {
    const { container } = render(
      <Showcase name="Victor Lemarchand" title="Le jeune président" quote="« Disruptons. »" />,
    );
    const parts = [...container.querySelectorAll('.showcase > *')].map((n) => [
      n.className,
      n.textContent,
    ]);
    expect(parts).toEqual([
      ['big', 'Victor Lemarchand'],
      ['title', 'Le jeune président'],
      ['quote', '« Disruptons. »'],
    ]);
  });

  it('omits the optional lines rather than leaving empty elements', () => {
    const { container } = render(<Showcase name="Lucie" />);
    expect(container.querySelector('.title')).toBeNull();
    expect(container.querySelector('.quote')).toBeNull();
    expect(container.querySelector('.big')?.textContent).toBe('Lucie');
  });

  it('renders children after the identity lines', () => {
    const { container } = render(
      <Showcase name="Hubert">
        <StatGrid data-testid="stats" />
      </Showcase>,
    );
    const children = [...(container.querySelector('.showcase')?.children ?? [])];
    expect(children.at(-1)?.className).toBe('stats');
  });
});

describe('StatGrid and StatBar', () => {
  it('nests the grid inside the showcase, which is what styles it', () => {
    // `.showcase .stats` is a descendant rule, so this nesting is the contract.
    const { container } = render(
      <Showcase name="Bernadette">
        <StatGrid>
          <StatBar label="Vitesse" value={0.5} />
        </StatGrid>
      </Showcase>,
    );
    expect(container.querySelector('.showcase .stats .stat')).not.toBeNull();
  });

  it('renders the label above a gold bar', () => {
    const { container } = render(<StatBar label="Accélération" value={0.25} />);
    const stat = container.firstElementChild;
    expect(stat?.className).toBe('stat');
    expect(stat?.querySelector('span')?.textContent).toBe('Accélération');
    expect(stat?.querySelector('.bar i')).toHaveProperty('style.width', '25%');
  });

  it('leaves its bar decorative, since the label already names it', () => {
    const { container } = render(<StatBar label="Vitesse" value={0.5} />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('clamps an out-of-range stat instead of overflowing the track', () => {
    // A caller normalising a raw game stat can overshoot; the bar must not.
    const { container } = render(<StatBar label="Vitesse" value={1.4} />);
    expect(container.querySelector('.bar i')).toHaveProperty('style.width', '100%');
  });
});

describe('PowerBox', () => {
  it('renders the title in bold and the body as a paragraph', () => {
    const { container } = render(
      <PowerBox name="Pouvoir : Grand débat">Prend la parole pendant 3 s.</PowerBox>,
    );
    const box = container.firstElementChild;
    expect(box?.className).toBe('powerbox');
    expect(box?.querySelector('b')?.textContent).toBe('Pouvoir : Grand débat');
    expect(box?.querySelector('p')?.textContent).toBe('Prend la parole pendant 3 s.');
  });

  it('appends the hint inside the paragraph, muted', () => {
    const { container } = render(
      <PowerBox name="Pouvoir : Mégaphone" hint="(touche F)">
        Assourdit les adversaires.
      </PowerBox>,
    );
    const hint = container.querySelector('p span');
    expect(hint?.textContent?.trim()).toBe('(touche F)');
    expect((hint as HTMLElement | null)?.style.color).toBe('var(--muted)');
  });

  it('renders no hint element when none is given', () => {
    const { container } = render(<PowerBox name="Pouvoir">Texte.</PowerBox>);
    expect(container.querySelector('p span')).toBeNull();
  });
});
