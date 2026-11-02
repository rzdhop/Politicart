import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeroButton } from './HeroButton';
import { MenuCard } from './MenuCard';
import { MENU_GLYPHS, MenuGlyph } from './MenuGlyph';
import { SettingsChip } from './SettingsChip';
import { Sheet } from './Sheet';
import { Tagline } from './Tagline';
import { TitleLayout } from './TitleLayout';
import { TitleLogo } from './TitleLogo';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MenuGlyph', () => {
  it('draws every glyph as a decorative svg with no text', () => {
    const { container } = render(<>{MENU_GLYPHS.map((g) => <MenuGlyph key={g} name={g} />)}</>);
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(MENU_GLYPHS.length);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('class')).toBe('menu-glyph');
      expect(svg.textContent).toBe('');
      expect(svg.children.length).toBeGreaterThan(0);
    }
    expect(svgs.map((s) => s.getAttribute('data-glyph'))).toEqual([...MENU_GLYPHS]);
  });
});

describe('HeroButton', () => {
  it('is a button with the label, the glyph and the hint', () => {
    const onClick = vi.fn();
    render(<HeroButton id="b-play" icon={<MenuGlyph name="play" />} hint="ou appuyez sur Entrée" onClick={onClick}>Jouer</HeroButton>);
    const btn = screen.getByRole('button');
    expect(btn.id).toBe('b-play');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.className).toBe('hero-btn');
    expect(btn.querySelector('.hero-btn-label')?.textContent).toBe('Jouer');
    expect(btn.querySelector('.hero-btn-icon svg')).not.toBeNull();
    expect(btn.querySelector('.hero-btn-hint')?.textContent).toBe('ou appuyez sur Entrée');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('leaves the glyph and the hint out when not given', () => {
    render(<HeroButton className="big">Jouer</HeroButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toBe('hero-btn big');
    expect(btn.textContent).toBe('Jouer');
    expect(btn.querySelector('.hero-btn-hint')).toBeNull();
    expect(btn.querySelector('.hero-btn-icon')).toBeNull();
  });
});

describe('MenuCard', () => {
  it('lays out the glyph, the label and the sub-line, blue by default', () => {
    render(<MenuCard id="b-multi" icon={<MenuGlyph name="multi" />} label="Multijoueur" sub="Bleu contre Rouge" />);
    const card = screen.getByRole('button');
    expect(card.id).toBe('b-multi');
    expect(card.getAttribute('type')).toBe('button');
    expect(card.getAttribute('data-tone')).toBe('blue');
    expect(card.querySelector('.mc-icon svg')).not.toBeNull();
    expect(card.querySelector('.mc-label')?.textContent).toBe('Multijoueur');
    expect(card.querySelector('.mc-sub')?.textContent).toBe('Bleu contre Rouge');
    expect(card.querySelector('.mc-badge')).toBeNull();
    expect(card.textContent).toBe('MultijoueurBleu contre Rouge');
  });

  it('shows a named badge, and none for 0', () => {
    const { rerender } = render(<MenuCard tone="red" icon={null} label="Compte" badge="✉ 2" badgeLabel="2 demandes d’ami" />);
    const badge = screen.getByRole('img', { name: '2 demandes d’ami' });
    expect(badge.className).toBe('mc-badge');
    expect(badge.textContent).toBe('✉ 2');
    expect(screen.getByRole('button').getAttribute('data-tone')).toBe('red');
    expect(screen.getByRole('button').querySelector('.mc-sub')).toBeNull();
    rerender(<MenuCard icon={null} label="Compte" badge={0} />);
    expect(screen.getByRole('button').querySelector('.mc-badge')).toBeNull();
  });

  it('passes clicks through', () => {
    const onClick = vi.fn();
    render(<MenuCard icon={null} label="Boutique" tone="gold" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsChip', () => {
  it('keeps its text to the label, so a toggle reads as its words', () => {
    render(<SettingsChip id="b-mute" icon={<MenuGlyph name="sound" />} active>Son : activé</SettingsChip>);
    const chip = screen.getByRole('button');
    expect(chip.textContent).toBe('Son : activé');
    expect(chip.className).toBe('settings-chip on');
    expect(chip.getAttribute('type')).toBe('button');
    expect(chip.querySelector('.sc-icon svg')).not.toBeNull();
  });

  it('marks the compact chip and an inactive one', () => {
    render(<SettingsChip compact>Commandes</SettingsChip>);
    const chip = screen.getByRole('button', { name: 'Commandes' });
    expect(chip.className).toBe('settings-chip compact');
    expect(chip.querySelector('.sc-icon')).toBeNull();
  });
});

describe('Sheet', () => {
  function Harness({ onClose = () => {} }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Ouvrir</button>
        <Sheet open={open} onClose={() => { onClose(); setOpen(false); }} title="Commandes" id="help-sheet">
          <p>Le kart accélère tout seul</p>
          <button type="button">Dernier</button>
        </Sheet>
      </>
    );
  }

  it('renders nothing while closed', () => {
    const { container } = render(<Sheet open={false} onClose={() => {}} title="Commandes">x</Sheet>);
    expect(container.innerHTML).toBe('');
  });

  it('opens as a named modal dialog with the focus on its close button, and gives the focus back', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Commandes' });
    expect(dialog.id).toBe('help-sheet');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: 'Fermer' });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape and on the backdrop, not on a click inside, and keeps Enter from the window', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener('keydown', spy);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Fermer' }), { key: 'Enter' });
    expect(seen).toEqual([]);
    fireEvent.click(screen.getByText('Le kart accélère tout seul'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
    window.removeEventListener('keydown', spy);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(document.querySelector('.sheet-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cycles Tab inside the sheet', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const close = screen.getByRole('button', { name: 'Fermer' });
    const last = screen.getByRole('button', { name: 'Dernier' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe('Tagline', () => {
  const LINES = ['Un.', 'Deux.', 'Trois.'];

  it('turns the lines over at its interval, then from the top again', () => {
    vi.useFakeTimers();
    const { container } = render(<Tagline lines={LINES} interval={1000} />);
    const text = () => container.querySelector('.tagline .tagline-line')?.textContent;
    expect(container.querySelector('.tagline')?.getAttribute('aria-live')).toBe('off');
    expect(text()).toBe('Un.');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(text()).toBe('Deux.');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(text()).toBe('Un.');
  });

  it('holds while paused, and under reduced motion', () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<Tagline lines={LINES} interval={1000} paused />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.textContent).toBe('Un.');
    unmount();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    const calm = render(<Tagline lines={LINES} interval={1000} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(calm.container.textContent).toBe('Un.');
  });

  it('renders nothing for no lines', () => {
    const { container } = render(<Tagline lines={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('TitleLogo', () => {
  it('renders the rule, the h1 and the subtitle', () => {
    const { container } = render(<TitleLogo title="POLITIKART" subtitle="Grand Prix de l’Hémicycle" />);
    const logo = container.firstElementChild!;
    expect(logo.className).toBe('title-logo');
    expect(logo.querySelector('.tricolore')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('POLITIKART');
    expect(logo.querySelector('.sub.title-logo-sub')?.textContent).toBe('Grand Prix de l’Hémicycle');
  });

  it('leaves the subtitle out when not given', () => {
    const { container } = render(<TitleLogo title="POLITIKART" />);
    expect(container.querySelector('.sub')).toBeNull();
  });
});

describe('TitleLayout', () => {
  it('puts each slot in its area, in reading order', () => {
    const { container } = render(
      <TitleLayout
        id="tl"
        corner={<span>coin</span>}
        brand={<span>marque</span>}
        stage={<div className="showcase-stage" />}
        stageCaption={<>Au volant : <b>Macaron</b></>}
        actions={<span>actions</span>}
        footer={<span>notice</span>}
      />,
    );
    const root = container.firstElementChild!;
    expect(root.id).toBe('tl');
    expect(root.className).toBe('title-layout');
    expect([...root.children].map((c) => c.className)).toEqual(['tl-corner', 'tl-brand', 'tl-stage', 'tl-actions', 'tl-footer']);
    expect(root.querySelector('.tl-stage .showcase-stage')).not.toBeNull();
    expect(root.querySelector('.tl-stage .tl-caption')?.textContent).toBe('Au volant : Macaron');
  });

  it('drops the empty slots and says when there is no stage', () => {
    const { container } = render(<TitleLayout brand="b" actions="a" />);
    const root = container.firstElementChild!;
    expect(root.className).toBe('title-layout no-stage');
    expect([...root.children].map((c) => c.className)).toEqual(['tl-brand', 'tl-actions']);
  });
});
