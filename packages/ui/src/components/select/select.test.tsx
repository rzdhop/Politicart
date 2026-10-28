import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CharacterTile } from './CharacterTile';
import { PowerBox } from './PowerBox';
import { Roster } from './Roster';
import { SelectLayout } from './SelectLayout';
import { Showcase } from './Showcase';
import { ShowcaseStage } from './ShowcaseStage';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const STAGE_LABEL = 'Le podium : glissez pour le faire pivoter';

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

describe('Roster footer', () => {
  it('renders the footer after the tiles, in its own block', () => {
    const { container } = render(
      <Roster footer={<button type="button">Retour</button>}>
        <CharacterTile name="Victor" />
        <CharacterTile name="Gégé" />
      </Roster>,
    );
    const parts = [...(container.querySelector('.roster')?.children ?? [])].map((n) => n.className);
    expect(parts).toEqual(['tile', 'tile', 'roster-foot']);
    expect(container.querySelector('.roster-foot button')?.textContent).toBe('Retour');
  });

  it('renders no footer block when there is nothing to put in it', () => {
    // `footer={wide && row}` passes false on a phone: no empty, spaced block.
    for (const footer of [undefined, null, false]) {
      const { container, unmount } = render(
        <Roster footer={footer}>
          <CharacterTile name="Victor" />
        </Roster>,
      );
      expect(container.querySelector('.roster-foot')).toBeNull();
      unmount();
    }
  });

  it('keeps the footer out of the tile count', () => {
    // The game counts `#roster .tile`; a footer must never add to it.
    const { container } = render(
      <Roster footer={<p>Glissez sur la scène pour faire pivoter le podium.</p>}>
        <CharacterTile name="Victor" />
      </Roster>,
    );
    expect(container.querySelectorAll('.roster .tile')).toHaveLength(1);
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

  it('pins a badge top-right inside the tile, and none by default', () => {
    const { container, rerender } = render(<CharacterTile name="Kevin" />);
    expect(container.querySelector('.tile-badge')).toBeNull();
    rerender(<CharacterTile name="Kevin" badge={<i data-testid="grade">Rare</i>} />);
    const badge = container.querySelector('.tile .tile-badge');
    expect(badge?.textContent).toBe('Rare');
    // Before the name strip, so it never covers the name.
    expect(badge?.nextElementSibling?.className).toBe('tname');
  });
});

describe('CharacterTile pending', () => {
  it('adds the pending class and reports busy while the portrait renders', () => {
    render(<CharacterTile name="Gégé Marteau" image="placeholder.png" pending />);
    const tile = screen.getByRole('button');
    expect(tile.className).toBe('tile pending');
    expect(tile.getAttribute('aria-busy')).toBe('true');
  });

  it('carries no busy state at all once the portrait is final', () => {
    // aria-busy="false" would be noise on every tile of a loaded roster.
    render(<CharacterTile name="Gégé Marteau" image="final.png" />);
    const tile = screen.getByRole('button');
    expect(tile.className).toBe('tile');
    expect(tile.hasAttribute('aria-busy')).toBe(false);
  });

  it('combines with selection, and keeps the placeholder as the image', () => {
    render(<CharacterTile name="Victor" image="placeholder.png" pending selected />);
    const tile = screen.getByRole('button');
    expect(tile.className).toBe('tile sel pending');
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByAltText('Victor').getAttribute('src')).toBe('placeholder.png');
  });

  it('stays clickable while pending: it is not a disabled state', () => {
    const onClick = vi.fn();
    render(<CharacterTile name="Kevin" pending onClick={onClick} />);
    const tile = screen.getByRole('button');
    expect(tile.hasAttribute('disabled')).toBe(false);
    tile.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets the caller add classes after its own, as the game does for locks', () => {
    render(<CharacterTile name="Kevin" pending className="locked" />);
    expect(screen.getByRole('button').className).toBe('tile pending locked');
  });
});

describe('ShowcaseStage', () => {
  it('is an image named by the label it is given', () => {
    render(<ShowcaseStage aria-label={STAGE_LABEL} />);
    const stage = screen.getByRole('img', { name: STAGE_LABEL });
    expect(stage.tagName).toBe('DIV');
    expect(stage.className).toBe('showcase-stage');
    // Empty: the scene is drawn behind it, on the game's canvas.
    expect(stage.childNodes).toHaveLength(0);
  });

  it('is not a tab stop', () => {
    render(<ShowcaseStage aria-label={STAGE_LABEL} />);
    expect(screen.getByRole('img').hasAttribute('tabindex')).toBe(false);
  });

  it('spreads native props, so the consumer names and drives it', () => {
    const onPointerDown = vi.fn();
    render(
      <ShowcaseStage
        aria-label={STAGE_LABEL}
        id="consumer-id"
        className="extra"
        data-yaw="0.4"
        onPointerDown={onPointerDown}
      />,
    );
    const stage = screen.getByRole('img');
    expect(stage.id).toBe('consumer-id');
    expect(stage.className).toBe('showcase-stage extra');
    expect(stage.dataset.yaw).toBe('0.4');
    fireEvent.pointerDown(stage);
    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it('forwards a ref to the element whose rect is the band', () => {
    let node: HTMLDivElement | null = null;
    render(
      <ShowcaseStage
        aria-label={STAGE_LABEL}
        ref={(el) => {
          node = el;
        }}
      />,
    );
    expect(node).toBe(screen.getByRole('img'));
  });

  it('renders a presentational child, for a static fallback picture', () => {
    render(
      <ShowcaseStage aria-label={STAGE_LABEL}>
        <svg data-testid="fallback" />
      </ShowcaseStage>,
    );
    expect(screen.getByRole('img').querySelector('[data-testid="fallback"]')).not.toBeNull();
  });
});

describe('Showcase', () => {
  it('renders the stage slot first, before the name', () => {
    const { container } = render(
      <Showcase
        name="Victor Lemarchand"
        title="Le jeune président"
        stage={<ShowcaseStage aria-label={STAGE_LABEL} />}
      >
        <StatGrid />
      </Showcase>,
    );
    const parts = [...(container.querySelector('.showcase')?.children ?? [])].map((n) => n.className);
    expect(parts).toEqual(['showcase-stage', 'big', 'title', 'stats']);
  });

  it('renders nothing extra when no stage is given', () => {
    const { container } = render(<Showcase name="Lucie" />);
    expect(container.querySelector('.showcase')?.firstElementChild?.className).toBe('big');
    expect(container.querySelector('.showcase-stage')).toBeNull();
  });

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

describe('the select group bakes in no game id (DEC-012)', () => {
  it('renders no id attribute anywhere unless the consumer passes one', () => {
    const { container } = render(
      <SelectLayout>
        <Roster footer={<button type="button">Retour</button>}>
          <CharacterTile name="Victor" image="x.png" pending selected badge="Rare" />
        </Roster>
        <Showcase
          name="Victor"
          title="Le jeune président"
          quote="« Disruptons. »"
          stage={<ShowcaseStage aria-label={STAGE_LABEL} />}
        >
          <StatGrid>
            <StatBar label="Vitesse" value={0.5} />
          </StatGrid>
          <PowerBox name="Pouvoir : Grand débat" hint="(touche F)">
            Texte.
          </PowerBox>
        </Showcase>
      </SelectLayout>,
    );
    expect(container.querySelectorAll('[id]')).toHaveLength(0);
  });
});

/**
 * The stylesheet half of the contract. jsdom applies no CSS and evaluates no
 * media query, so these read select.css itself: the rules the 3D stage and
 * its drag depend on, and the reduced-motion switch-off, are asserted as
 * written. The rendered result is checked on Storybook screenshots.
 */
describe('select.css', () => {
  type Rule = { selector: string; decls: string[] };
  type Media = { prelude: string; at: number; rules: Rule[] };

  const css = readFileSync(join(import.meta.dirname, '..', '..', 'styles', 'select.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ');

  /** Index of the `}` that closes the block opening at `open`. */
  function close(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    throw new Error('unbalanced block');
  }

  /** Top-level rules, and the rules of each `@media` block with its prelude. */
  function parse(text: string): { top: Rule[]; media: Media[] } {
    const top: Rule[] = [];
    const media: Media[] = [];
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      const head = text.slice(i, open).trim();
      const end = close(text, open);
      const body = text.slice(open + 1, end);
      if (head.startsWith('@media')) {
        media.push({ prelude: head.slice('@media'.length).trim(), at: i, rules: parse(body).top });
      } else {
        const decls = body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean);
        top.push({ selector: head, decls });
      }
      i = end + 1;
    }
    return { top, media };
  }

  const sheet = parse(css);

  function rule(rules: Rule[], selector: string): string[] {
    const found = rules.find((r) => r.selector === selector);
    expect(found, `no rule for ${selector}`).toBeDefined();
    return found?.decls ?? [];
  }

  function mediaRules(prelude: string): Rule[] {
    const block = sheet.media.find((m) => m.prelude === prelude);
    expect(block, `@media ${prelude} is missing`).toBeDefined();
    return block?.rules ?? [];
  }

  it('parses the sheet at all', () => {
    // Guards the parser: finding nothing would make every check below fail
    // for the wrong reason, or pass vacuously where it looks for absence.
    expect(sheet.top.length).toBeGreaterThan(20);
    expect(sheet.media.length).toBeGreaterThanOrEqual(3);
  });

  it('gives the stage band its size, its pointer and its touch behaviour', () => {
    const stage = rule(sheet.top, '.showcase-stage');
    for (const d of [
      'flex:1',
      'min-height:140px',
      'align-self:stretch',
      'pointer-events:auto',
      'touch-action:pan-y',
      'cursor:grab',
      'user-select:none',
    ]) {
      expect(stage).toContain(d);
    }
    expect(rule(sheet.top, '.showcase-stage:active')).toContain('cursor:grabbing');
  });

  it('keeps the showcase itself pointer-events: none', () => {
    expect(rule(sheet.top, '.showcase')).toContain('pointer-events:none');
  });

  it('sweeps the pending tile with the shared shimmer, on ::before', () => {
    // ::after is the game's lock pill; the two must not collide.
    const sweep = rule(sheet.top, '.tile.pending::before');
    expect(sweep).toContain("content:''");
    expect(sweep.some((d) => d.startsWith('animation:kr-shimmer '))).toBe(true);
    expect(sweep).toContain('pointer-events:none');
    expect(css).not.toContain('.tile.pending::after');
  });

  it('switches the pending sweep off under prefers-reduced-motion', () => {
    const reduced = rule(mediaRules('(prefers-reduced-motion:reduce)'), '.tile.pending::before');
    expect(reduced).toContain('animation:none');
    expect(reduced).toContain('content:none');
    // The column stagger only sets delays: nothing there can restart the
    // animation the media query turns off.
    const stagger = sheet.top.filter((r) => r.selector.startsWith('.tile.pending:nth-child('));
    expect(stagger.length).toBeGreaterThan(0);
    for (const r of stagger) {
      expect(r.decls.every((d) => d.startsWith('animation-delay:'))).toBe(true);
    }
  });

  it('pins the showcase in short landscape while the roster scrolls', () => {
    const short = mediaRules('(max-height:520px) and (orientation:landscape)');
    expect(rule(short, '.select-layout')).toContain(
      'grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)',
    );
    const showcase = rule(short, '.select-layout > .showcase');
    for (const d of ['position:sticky', 'top:0', 'align-self:start', 'order:0']) {
      expect(showcase).toContain(d);
    }
    // Limited to the viewport less the padding the sticky box rests inside,
    // with a 100vh fallback first for browsers without dynamic units.
    const dvh = showcase.indexOf('max-height:calc(100dvh - var(--select-pin-inset,24px))');
    const vh = showcase.indexOf('max-height:calc(100vh - var(--select-pin-inset,24px))');
    expect(dvh).toBeGreaterThan(-1);
    expect(vh).toBeGreaterThan(-1);
    expect(vh).toBeLessThan(dvh);
  });

  it('lets the layout grow to its content instead of squeezing its rows', () => {
    // A shrunk grid sized the showcase's row to its min-height, and the
    // stage band pushed the name out of the top; and a sticky showcase can
    // only travel within a container as tall as the roster.
    const layout = rule(sheet.top, '.select-layout');
    expect(layout).toContain('flex:1 0 auto');
    expect(layout).not.toContain('min-height:0');
  });

  it('puts the short-landscape rule after the 760px one, so it wins on narrow phones', () => {
    const at = (prelude: string) => sheet.media.find((m) => m.prelude === prelude)?.at ?? -1;
    expect(at('(max-width:760px)')).toBeGreaterThan(-1);
    expect(at('(max-height:520px) and (orientation:landscape)')).toBeGreaterThan(
      at('(max-width:760px)'),
    );
  });

  it('spans the roster footer across every column and left-aligns its row', () => {
    expect(rule(sheet.top, '.roster-foot')).toContain('grid-column:1/-1');
    expect(rule(sheet.top, '.roster-foot .row')).toContain('justify-content:flex-start');
  });
});
