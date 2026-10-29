import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoinCount } from './CoinCount';
import { DropHistory } from './DropHistory';
import { GRADES, GradeBadge } from './GradeBadge';
import { KartCard } from './KartCard';
import { OddsTable } from './OddsTable';
import { RevealCard } from './RevealCard';
import { RevealStage } from './RevealStage';
import { ShopCard } from './ShopCard';
import { Tabs } from './Tabs';

describe('GradeBadge', () => {
  it('sets the grade class, the data attribute and the accessible name from the label', () => {
    render(<GradeBadge grade="mythic" label="Mythique" />);
    const badge = screen.getByText('Mythique');
    expect(badge.className).toBe('grade grade-mythic');
    expect(badge.getAttribute('data-grade')).toBe('mythic');
    expect(badge.getAttribute('aria-label')).toBe('Mythique');
  });

  it('defaults the label to the capitalised grade id', () => {
    // The game passes French; the library's own default stays language-neutral.
    render(<GradeBadge grade="incredible" />);
    expect(screen.getByText('Incredible').getAttribute('aria-label')).toBe('Incredible');
  });

  it('adds the small size class', () => {
    render(<GradeBadge grade="rare" size="sm" />);
    expect(screen.getByText('Rare').className).toBe('grade grade-rare grade-sm');
  });

  it('covers every grade with a distinct class', () => {
    const { container } = render(
      <>
        {GRADES.map((g) => (
          <GradeBadge key={g} grade={g} />
        ))}
      </>,
    );
    const classes = [...container.querySelectorAll('.grade')].map((n) => n.className);
    expect(classes).toEqual([
      'grade grade-common',
      'grade grade-rare',
      'grade grade-mythic',
      'grade grade-incredible',
    ]);
  });

  it('merges a consumer class and spreads span props', () => {
    render(<GradeBadge grade="rare" className="big" id="g-rare" />);
    const badge = screen.getByText('Rare');
    expect(badge.className).toBe('grade grade-rare big');
    expect(badge.id).toBe('g-rare');
  });
});

describe('CoinCount', () => {
  it('renders the glyph and the formatted value', () => {
    const { container } = render(<CoinCount value={1250} format={(n) => `${n} pc`} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.coin-value')?.textContent).toBe('1250 pc');
  });

  it('formats with toLocaleString by default', () => {
    const { container } = render(<CoinCount value={1250} />);
    expect(container.querySelector('.coin-value')?.textContent).toBe((1250).toLocaleString());
  });

  it('spreads valueProps on the number element, which is where the game puts #coins', () => {
    const { container } = render(<CoinCount value={7} valueProps={{ id: 'coins' }} />);
    expect(container.querySelector('#coins')?.className).toBe('coin-value');
    expect(container.querySelector('#coins')?.textContent).toBe('7');
  });

  it('renders the label only when given, and the size classes', () => {
    const { container, rerender } = render(<CoinCount value={1} />);
    expect(container.querySelector('.coin-label')).toBeNull();
    expect(container.firstElementChild?.className).toBe('coin-count');
    rerender(<CoinCount value={1} label="politicoins" size="lg" />);
    expect(container.querySelector('.coin-label')?.textContent).toBe('politicoins');
    expect(container.firstElementChild?.className).toBe('coin-count coin-count-lg');
  });
});

describe('ShopCard', () => {
  const base = {
    title: 'Lucie Vasseur',
    grade: 'common' as const,
    price: 300,
    buyLabel: 'Acheter',
    ownedLabel: 'Acquis',
  };

  it('is an article carrying the card, shop and grade classes with the badge inside', () => {
    const { container } = render(<ShopCard {...base} gradeLabel="Commun" subtitle="L'outsider" />);
    const card = container.querySelector('article');
    expect(card?.className).toBe('card shop-card grade-common');
    expect(card?.getAttribute('data-grade')).toBe('common');
    expect(card?.querySelector('.grade')?.textContent).toBe('Commun');
    expect(card?.querySelector('.shop-title')?.textContent).toBe('Lucie Vasseur');
    expect(card?.querySelector('.shop-subtitle')?.textContent).toBe("L'outsider");
    expect(card?.querySelector('.shop-price .coin-value')?.textContent).toBe('300');
  });

  it('buys on click with a live primary button carrying buyProps', () => {
    const onBuy = vi.fn();
    render(<ShopCard {...base} onBuy={onBuy} buyProps={{ id: 'b-buy-char-lucie' }} />);
    const button = screen.getByRole('button', { name: 'Acheter' });
    expect(button.id).toBe('b-buy-char-lucie');
    expect(button.className).toBe('btn');
    expect(button).toHaveProperty('disabled', false);
    button.click();
    expect(onBuy).toHaveBeenCalledOnce();
  });

  it('is disabled and reads the reason when locked', () => {
    const onBuy = vi.fn();
    render(<ShopCard {...base} onBuy={onBuy} locked="Niveau 5 requis" buyProps={{ id: 'b-buy-char-patrick' }} />);
    const button = screen.getByRole('button', { name: 'Niveau 5 requis' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.id).toBe('b-buy-char-patrick');
    button.click();
    expect(onBuy).not.toHaveBeenCalled();
    expect(screen.queryByText('Acheter')).toBeNull();
    expect(document.querySelector('.shop-card')?.className).toContain('locked');
  });

  it('reads the owned label, disabled, with the tick ribbon, and owned wins over locked', () => {
    const { container } = render(<ShopCard {...base} owned locked="Niveau 5 requis" buyProps={{ id: 'b-buy-char-lucie' }} />);
    const button = screen.getByRole('button', { name: 'Acquis' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.id).toBe('b-buy-char-lucie');
    expect(container.querySelector('.shop-ribbon')?.textContent).toBe('✓');
    expect(container.querySelector('article')?.className).toBe('card shop-card grade-common owned');
    expect(screen.queryByText('Niveau 5 requis')).toBeNull();
  });

  it('shows an image URL as a decorative img, or any node as given', () => {
    const { container, rerender } = render(<ShopCard {...base} image="x.png" />);
    const img = container.querySelector('.shop-image img');
    expect(img?.getAttribute('src')).toBe('x.png');
    expect(img?.getAttribute('alt')).toBe('');
    rerender(<ShopCard {...base} image={<i data-testid="thumb" />} />);
    expect(container.querySelector('.shop-image [data-testid=thumb]')).not.toBeNull();
  });

  it('omits the price line and the ribbon when there is nothing to show', () => {
    const { container } = render(<ShopCard title="Politibox" grade="rare" />);
    expect(container.querySelector('.shop-price')).toBeNull();
    expect(container.querySelector('.shop-ribbon')).toBeNull();
    expect(container.querySelector('.shop-subtitle')).toBeNull();
    // The language-neutral defaults, for a consumer that passes nothing.
    expect(screen.getByRole('button', { name: 'Buy' })).toBeDefined();
  });

  it('spreads div props on the article', () => {
    const { container } = render(<ShopCard {...base} id="shop-char-lucie" className="wide" />);
    const card = container.querySelector('article');
    expect(card?.id).toBe('shop-char-lucie');
    expect(card?.className).toBe('card shop-card grade-common wide');
  });
});

describe('KartCard', () => {
  const PARTS = [
    { id: 'wheels', label: 'Roues', value: 'Dorées', grade: 'mythic' as const },
    { id: 'spoiler', label: 'Aileron', value: 'Standard', grade: 'common' as const },
  ];

  it('renders the name, the badge and one chip per part with a grade dot', () => {
    const { container } = render(
      <KartCard name="Gégé Marteau" title="Le syndicaliste" grade="rare" gradeLabel="Rare" parts={PARTS} />,
    );
    expect(container.firstElementChild?.className).toBe('card kart-card grade-rare');
    expect(container.querySelector('.kart-head .name')?.textContent).toBe('Gégé Marteau');
    expect(container.querySelector('.kart-head .grade')?.textContent).toBe('Rare');
    expect(container.querySelector('.kart-title')?.textContent).toBe('Le syndicaliste');
    const chips = [...container.querySelectorAll('.kart-part')];
    expect(chips.map((c) => c.textContent)).toEqual(['RouesDorées', 'AileronStandard']);
    expect(chips.map((c) => c.querySelector('.grade-dot')?.className)).toEqual([
      'grade-dot grade-mythic',
      'grade-dot grade-common',
    ]);
  });

  it('renders the trail line with its grade dot, and none without a trail', () => {
    const { container, rerender } = render(
      <KartCard name="Gégé" grade="common" parts={PARTS} trail={{ label: 'Laser', grade: 'incredible' }} />,
    );
    const trail = container.querySelector('.kart-trail');
    expect(trail?.textContent).toBe('Laser');
    expect(trail?.querySelector('.grade-dot')?.className).toBe('grade-dot grade-incredible');
    rerender(<KartCard name="Gégé" grade="common" parts={PARTS} trail={null} />);
    expect(container.querySelector('.kart-trail')).toBeNull();
  });

  it('shows the thumbnail only when given, and spreads div props', () => {
    const { container, rerender } = render(<KartCard name="Gégé" grade="common" parts={[]} id="pause-kart" />);
    expect(container.querySelector('.kart-image')).toBeNull();
    expect(container.firstElementChild?.id).toBe('pause-kart');
    rerender(<KartCard name="Gégé" grade="common" parts={[]} image="kart.png" />);
    expect(container.querySelector('.kart-image img')?.getAttribute('src')).toBe('kart.png');
  });
});

describe('RevealStage', () => {
  it('renders nothing at all in idle', () => {
    const { container } = render(
      <RevealStage grade="rare" phase="idle">
        <p>Lucie</p>
      </RevealStage>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('dims the scene in opening, without the flash or the card', () => {
    const { container } = render(
      <RevealStage grade="rare" phase="opening">
        <p>Lucie</p>
      </RevealStage>,
    );
    const stage = container.firstElementChild;
    expect(stage?.className).toBe('kr-reveal kr-reveal-rare kr-reveal-phase-opening');
    expect(stage?.getAttribute('data-phase')).toBe('opening');
    expect(container.querySelector('.kr-reveal-dim')).not.toBeNull();
    expect(container.querySelector('.kr-flash')).toBeNull();
    expect(screen.queryByText('Lucie')).toBeNull();
  });

  it('plays the flash in burst, tinted by the grade', () => {
    const { container } = render(<RevealStage grade="incredible" phase="burst" />);
    expect(container.firstElementChild?.className).toContain('kr-reveal-incredible');
    expect(container.querySelector('.kr-flash')).not.toBeNull();
    expect(container.querySelector('.kr-reveal-card')).toBeNull();
  });

  it('shows the children in a rising card in reveal, and only then', () => {
    const { container } = render(
      <RevealStage grade="mythic" phase="reveal" id="box-stage">
        <p>Lucie</p>
      </RevealStage>,
    );
    const card = container.querySelector('.kr-reveal-card');
    expect(card?.className).toBe('kr-reveal-card kr-rise');
    expect(card?.textContent).toBe('Lucie');
    expect(container.querySelector('.kr-flash')).toBeNull();
    expect(container.firstElementChild?.id).toBe('box-stage');
    expect(container.firstElementChild?.getAttribute('aria-live')).toBe('polite');
  });

  it('pulses a vignette in tease, the rate set by the grade class, with no card', () => {
    const { container } = render(
      <RevealStage grade="incredible" phase="tease">
        <p>Lucie</p>
      </RevealStage>,
    );
    expect(container.firstElementChild?.className).toBe('kr-reveal kr-reveal-incredible kr-reveal-phase-tease');
    expect(container.querySelector('.kr-tease')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.kr-flash')).toBeNull();
    expect(screen.queryByText('Lucie')).toBeNull();
  });

  it('sinks the card away in next, inert, and shows the bundle counter through its phases', () => {
    const { container, rerender } = render(
      <RevealStage grade="rare" phase="next" count={5} index={1} counterProps={{ id: 'box-count' }}>
        <p>Lucie</p>
      </RevealStage>,
    );
    const card = container.querySelector('.kr-reveal-card');
    expect(card?.className).toBe('kr-reveal-card kr-sink');
    expect(card?.getAttribute('aria-hidden')).toBe('true');
    expect(card?.textContent).toBe('Lucie');
    expect(container.querySelector('#box-count')?.className).toBe('kr-counter');
    expect(container.querySelector('#box-count')?.textContent).toBe('2 / 5');
    rerender(
      <RevealStage grade="rare" phase="opening" count={5} index={4} formatCounter={(i, n) => `${i + 1} sur ${n}`}>
        <p>Lucie</p>
      </RevealStage>,
    );
    expect(container.querySelector('.kr-counter')?.textContent).toBe('5 sur 5');
    expect(container.querySelector('.kr-reveal-card')).toBeNull();
    rerender(
      <RevealStage grade="rare" phase="reveal" count={1}>
        <p>Lucie</p>
      </RevealStage>,
    );
    expect(container.querySelector('.kr-counter')).toBeNull();
  });
});

describe('RevealCard', () => {
  it('renders the glyph, the caption, the name and the badge, carrying the kind and the grade', () => {
    const { container } = render(
      <RevealCard kind="char" name="Candidat : Lucie Vasseur" grade="rare" gradeLabel="Rare" caption="La Politibox vous offre" id="card">
        <button>Encore une !</button>
      </RevealCard>,
    );
    const card = container.querySelector('#card');
    expect(card?.className).toBe('card reveal-card reveal-card-char grade-rare');
    expect(card?.getAttribute('data-kind')).toBe('char');
    expect(card?.getAttribute('data-grade')).toBe('rare');
    expect(card?.querySelector('.reveal-glyph svg')?.getAttribute('class')).toBe('kind-glyph kind-glyph-char');
    expect(card?.querySelector('.reveal-caption')?.textContent).toBe('La Politibox vous offre');
    expect(card?.querySelector('.reveal-name')?.textContent).toBe('Candidat : Lucie Vasseur');
    expect(card?.querySelector('.grade')?.textContent).toBe('Rare');
    expect(card?.querySelector('.reveal-refund')).toBeNull();
    expect(screen.getByRole('button', { name: 'Encore une !' })).toBeDefined();
  });

  it('puts the ids on the result block, the refund line and the badge through part props, the result text being name then refund', () => {
    const { container } = render(
      <RevealCard
        kind="part"
        name="Pièce : Roues dorées"
        grade="mythic"
        gradeLabel="Mythique"
        refund="Doublon : +400 politicoins remboursés"
        resultProps={{ id: 'box-result' }}
        refundProps={{ id: 'box-refund' }}
        badgeProps={{ id: 'box-grade' }}
      />,
    );
    expect(container.querySelector('#box-result')?.textContent).toBe('Pièce : Roues doréesDoublon : +400 politicoins remboursés');
    expect(container.querySelector('#box-refund')?.className).toBe('reveal-refund');
    expect(container.querySelector('#box-grade')?.getAttribute('data-grade')).toBe('mythic');
    expect(container.querySelector('#box-result .reveal-glyph')).toBeNull();
  });

  it('draws one glyph per kind', () => {
    const { container } = render(
      <>
        {(['char', 'part', 'trail', 'coins'] as const).map((k) => (
          <RevealCard key={k} kind={k} name={k} grade="common" />
        ))}
      </>,
    );
    expect([...container.querySelectorAll('.kind-glyph')].map((g) => g.getAttribute('class'))).toEqual([
      'kind-glyph kind-glyph-char',
      'kind-glyph kind-glyph-part',
      'kind-glyph kind-glyph-trail',
      'kind-glyph kind-glyph-coins',
    ]);
    expect(container.querySelector('.reveal-caption')).toBeNull();
  });
});

describe('DropHistory', () => {
  const DROPS = [
    { kind: 'coins' as const, grade: 'common' as const, label: '10 politicoins' },
    { kind: 'part' as const, grade: 'mythic' as const, label: 'Roues dorées' },
    { kind: 'trail' as const, grade: 'incredible' as const, label: 'Laser' },
  ];

  it('lists the drops as grade-coloured chips with their glyph, in the order given', () => {
    const { container } = render(<DropHistory title="Derniers tirages" drops={DROPS} listProps={{ id: 'box-history' }} />);
    expect(container.querySelector('.drop-history-title')?.textContent).toBe('Derniers tirages');
    const chips = [...container.querySelectorAll('#box-history .drop-chip')];
    expect(chips.map((c) => c.className)).toEqual(['drop-chip grade-common', 'drop-chip grade-mythic', 'drop-chip grade-incredible']);
    expect(chips.map((c) => c.getAttribute('data-kind'))).toEqual(['coins', 'part', 'trail']);
    expect(chips.map((c) => c.querySelector('.drop-chip-label')?.textContent)).toEqual(['10 politicoins', 'Roues dorées', 'Laser']);
    expect(chips.map((c) => c.querySelector('.kind-glyph')?.getAttribute('class'))).toEqual(['kind-glyph kind-glyph-coins', 'kind-glyph kind-glyph-part', 'kind-glyph kind-glyph-trail']);
    expect(container.querySelector('.drop-history-empty')).toBeNull();
  });

  it('caps the chips at max, and reads the empty label when there is nothing', () => {
    const { container, rerender } = render(<DropHistory drops={DROPS} max={2} emptyLabel="Aucun tirage" />);
    expect(container.querySelectorAll('.drop-chip')).toHaveLength(2);
    expect(container.querySelector('.drop-history-title')).toBeNull();
    rerender(<DropHistory drops={[]} emptyLabel="Aucun tirage" id="h" className="wide" />);
    expect(container.querySelector('.drop-history-list')).toBeNull();
    expect(container.querySelector('.drop-history-empty')?.textContent).toBe('Aucun tirage');
    expect(container.querySelector('#h')?.className).toBe('drop-history wide');
    rerender(<DropHistory drops={[]} />);
    expect(container.firstElementChild?.innerHTML).toBe('');
  });
});

describe('OddsTable', () => {
  const ROWS = [
    { label: 'Candidat·e', odds: 0.02 },
    { label: 'Politicoins', odds: 0.94 },
    { label: '5 politicoins', odds: 0.4, sub: true },
  ];

  it('is a table of row headers and percentages, the sub rows marked, with a caption', () => {
    const { container } = render(<OddsTable id="box-odds" caption="Une urne dorée." rows={ROWS} />);
    const table = container.querySelector('table#box-odds');
    expect(table?.className).toBe('odds-table');
    expect(table?.querySelector('caption')?.textContent).toBe('Une urne dorée.');
    expect(table?.querySelector('thead')).toBeNull();
    const rows = [...table!.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.querySelector('th')?.getAttribute('scope'))).toEqual(['row', 'row', 'row']);
    expect(rows.map((r) => r.textContent)).toEqual(['Candidat·e2 %', 'Politicoins94 %', '5 politicoins40 %']);
    expect(rows.map((r) => r.className)).toEqual(['', '', 'odds-sub']);
  });

  it('takes a formatter and column headings', () => {
    const { container } = render(<OddsTable rows={ROWS} headers={['Lot', 'Chances']} format={(o) => `${o * 100} pour cent`} />);
    expect([...container.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Lot', 'Chances']);
    expect(container.querySelector('tbody td')?.textContent).toBe('2 pour cent');
    expect(container.querySelector('caption')).toBeNull();
  });
});

describe('Tabs', () => {
  const TABS = [
    { id: 'box', label: 'Politibox', props: { id: 'shop-tab-box' } },
    { id: 'chars', label: 'Candidat·es', props: { id: 'shop-tab-chars' } },
    { id: 'parts', label: 'Pièces', props: { id: 'shop-tab-parts' } },
  ] as const;

  it('is a tablist of tab buttons, the active one selected and focusable', () => {
    render(<Tabs tabs={TABS} active="chars" onChange={() => {}} />);
    const list = screen.getByRole('tablist');
    expect(list.className).toBe('tabs');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.className)).toEqual(['tab', 'tab', 'tab']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs.map((t) => t.getAttribute('type'))).toEqual(['button', 'button', 'button']);
  });

  it('spreads each tab\'s props on its button', () => {
    render(<Tabs tabs={TABS} active="box" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Candidat·es' }).id).toBe('shop-tab-chars');
  });

  it('reports the picked tab', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="box" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Pièces' }).click();
    expect(onChange).toHaveBeenCalledWith('parts');
  });

  it('moves with the arrow keys, Home and End, wrapping around', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="parts" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('box');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('chars');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('box');
    fireEvent.keyDown(list, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('parts');
    fireEvent.keyDown(list, { key: 'a' });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('merges a consumer class and spreads nav props', () => {
    render(<Tabs tabs={TABS} active="box" onChange={() => {}} className="wide" id="shop-tabs" />);
    const list = screen.getByRole('tablist');
    expect(list.className).toBe('tabs wide');
    expect(list.id).toBe('shop-tabs');
  });
});
