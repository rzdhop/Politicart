import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CenterAnnounce } from './CenterAnnounce';
import { DriftGauge, type DriftGaugeHandle } from './DriftGauge';
import { HitVignette, type HitVignetteHandle } from './HitVignette';
import { HudCorner } from './HudCorner';
import { HudHint } from './HudHint';
import { HudLayer } from './HudLayer';
import { ItemSlot, type ItemSlotHandle } from './ItemSlot';
import { LapCounter } from './LapCounter';
import { MinimapFrame } from './MinimapFrame';
import { PositionReadout, type PositionReadoutHandle } from './PositionReadout';
import { PowerGauge, type PowerGaugeHandle } from './PowerGauge';
import { RaceTimer } from './RaceTimer';
import { SpeedReadout, type SpeedReadoutHandle } from './SpeedReadout';
import { badgeValue, StatusBadges, type StatusBadgesHandle } from './StatusBadges';
import { Toast, type ToastHandle } from './Toast';
import { WrongWay, type WrongWayHandle } from './WrongWay';
import type { TextReadoutHandle } from './handles';

describe('HudLayer and HudCorner', () => {
  it('renders the layer and hides it with the hidden attribute', () => {
    const { container } = render(<HudLayer hidden />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.className).toBe('hud');
    expect(layer.hidden).toBe(true);
  });

  it.each([
    ['topLeft', 'hud-tl'],
    ['topRight', 'hud-tr'],
    ['bottomLeft', 'hud-bl'],
    ['bottomRight', 'hud-br'],
  ] as const)('maps the %s corner to .%s', (corner, expected) => {
    const { container } = render(<HudCorner corner={corner} />);
    expect(container.firstElementChild?.className).toBe(expected);
  });
});

describe('PositionReadout', () => {
  it('renders first place with the er suffix', () => {
    const { container } = render(<PositionReadout position={1} />);
    expect(container.firstElementChild?.textContent).toBe('1er');
  });

  it.each([2, 3, 6, 11])('renders position %s with the e suffix', (position) => {
    const { container } = render(<PositionReadout position={position} />);
    expect(container.firstElementChild?.textContent).toBe(`${position}e`);
  });

  it('updates both the number and the suffix through its handle', () => {
    // The suffix changes when a player takes the lead, so an imperative update
    // that only wrote the number would leave "1e" on screen.
    const ref = createRef<PositionReadoutHandle>();
    const { container } = render(<PositionReadout ref={ref} position={4} />);
    ref.current?.setPosition(1);
    expect(container.firstElementChild?.textContent).toBe('1er');
    ref.current?.setPosition(3);
    expect(container.firstElementChild?.textContent).toBe('3e');
  });
});

describe('text readouts', () => {
  it.each([
    ['LapCounter', LapCounter, 'lap'],
    ['RaceTimer', RaceTimer, 'timer'],
    ['HudHint', HudHint, 'hint'],
    ['CenterAnnounce', CenterAnnounce, 'center'],
  ] as const)('%s renders its class and children', (_name, Component, expected) => {
    const { container } = render(<Component>TOUR 1/3</Component>);
    expect(container.firstElementChild?.className).toBe(expected);
    expect(container.firstElementChild?.textContent).toBe('TOUR 1/3');
  });

  it.each([
    ['LapCounter', LapCounter],
    ['RaceTimer', RaceTimer],
    ['HudHint', HudHint],
    ['CenterAnnounce', CenterAnnounce],
  ] as const)('%s replaces its text through the handle', (_name, Component) => {
    const ref = createRef<TextReadoutHandle>();
    const { container } = render(<Component ref={ref}>avant</Component>);
    ref.current?.setText('après');
    expect(container.firstElementChild?.textContent).toBe('après');
  });
});

describe('SpeedReadout', () => {
  it('renders a rounded number with the default unit', () => {
    const { container } = render(<SpeedReadout value={141.7} />);
    expect(container.firstElementChild?.textContent).toBe('142 km/h');
  });

  it('accepts a different unit', () => {
    const { container } = render(<SpeedReadout value={88} unit="mph" />);
    expect(container.firstElementChild?.textContent).toBe('88 mph');
  });

  it('updates the number through the handle and leaves the unit alone', () => {
    const ref = createRef<SpeedReadoutHandle>();
    const { container } = render(<SpeedReadout ref={ref} value={0} />);
    ref.current?.setValue(97.4);
    expect(container.firstElementChild?.textContent).toBe('97 km/h');
  });

  it('shows zero rather than NaN for a bad value', () => {
    const { container } = render(<SpeedReadout value={Number.NaN} />);
    expect(container.firstElementChild?.textContent).toBe('0 km/h');
  });
});

describe('DriftGauge', () => {
  it('renders the fill at the given fraction', () => {
    const { container } = render(<DriftGauge value={0.35} />);
    expect(container.querySelector('.drift i')).toHaveProperty('style.width', '35%');
  });

  it('clamps and updates through the handle', () => {
    const ref = createRef<DriftGaugeHandle>();
    const { container } = render(<DriftGauge ref={ref} value={0} />);
    const fill = container.querySelector('.drift i') as HTMLElement;
    ref.current?.setValue(0.5);
    expect(fill.style.width).toBe('50%');
    ref.current?.setValue(3);
    expect(fill.style.width).toBe('100%');
    ref.current?.setValue(-2);
    expect(fill.style.width).toBe('0%');
  });

  it('recolours the fill and can be returned to the default', () => {
    const ref = createRef<DriftGaugeHandle>();
    const { container } = render(<DriftGauge ref={ref} value={1} />);
    const fill = container.querySelector('.drift i') as HTMLElement;
    ref.current?.setColor('#fff');
    expect(fill.style.background).toBe('rgb(255, 255, 255)');
    ref.current?.setColor(null);
    expect(fill.style.background).toBe('');
  });
});

describe('ItemSlot', () => {
  it('renders the glyph and the name, empty by default', () => {
    const { container } = render(<ItemSlot icon="·" label="aucun objet" />);
    const slot = container.firstElementChild;
    expect(slot?.className).toBe('item');
    expect(slot?.querySelector('.ico')?.textContent).toBe('·');
    expect(slot?.querySelector('.nm')?.textContent).toBe('aucun objet');
  });

  it('adds the has class when filled', () => {
    const { container } = render(<ItemSlot icon="🚀" label="Turbo" filled />);
    expect(container.firstElementChild?.className).toBe('item has');
  });

  it('swaps the item through the handle', () => {
    const ref = createRef<ItemSlotHandle>();
    const { container } = render(<ItemSlot ref={ref} icon="·" label="aucun objet" />);
    ref.current?.setItem({ icon: '📄', label: 'Dossier Mediapart', filled: true });
    const slot = container.firstElementChild as HTMLElement;
    expect(slot.querySelector('.ico')?.textContent).toBe('📄');
    expect(slot.querySelector('.nm')?.textContent).toBe('Dossier Mediapart');
    expect(slot.classList.contains('has')).toBe(true);
  });

  it('empties the slot when the item is cleared', () => {
    const ref = createRef<ItemSlotHandle>();
    const { container } = render(<ItemSlot ref={ref} icon="🚀" label="Turbo" filled />);
    ref.current?.setItem({ icon: null, label: null, filled: false });
    const slot = container.firstElementChild as HTMLElement;
    expect(slot.querySelector('.ico')?.textContent).toBe('');
    expect(slot.classList.contains('has')).toBe(false);
  });
});

describe('PowerGauge', () => {
  it('renders the name, the bar and the key hint', () => {
    const { container } = render(
      <PowerGauge name="Grand débat" charge={0.5} keyHint="F · recharge" />,
    );
    const gauge = container.firstElementChild;
    expect(gauge?.className).toBe('power');
    expect(gauge?.querySelector('.pn')?.textContent).toBe('Grand débat');
    expect(gauge?.querySelector('.pk')?.textContent).toBe('F · recharge');
    expect(gauge?.querySelector('.bar i')).toHaveProperty('style.width', '50%');
  });

  it('nests its bar inside .power, which is what recolours it green', () => {
    // `.power .bar i` is a descendant override of the shared gold fill.
    const { container } = render(<PowerGauge name="X" charge={1} />);
    expect(container.querySelector('.power .bar i')).not.toBeNull();
  });

  it('omits the key hint when not given', () => {
    const { container } = render(<PowerGauge name="X" charge={0} />);
    expect(container.querySelector('.pk')).toBeNull();
  });

  it('drives charge, ready state and name through the handle', () => {
    const ref = createRef<PowerGaugeHandle>();
    const { container } = render(<PowerGauge ref={ref} name="Grand débat" charge={0} />);
    const gauge = container.firstElementChild as HTMLElement;
    ref.current?.setCharge(0.75);
    expect((gauge.querySelector('.bar i') as HTMLElement).style.width).toBe('75%');
    ref.current?.setReady(true);
    expect(gauge.classList.contains('ready')).toBe(true);
    ref.current?.setReady(false);
    expect(gauge.classList.contains('ready')).toBe(false);
    ref.current?.setName('Grève générale');
    expect(gauge.querySelector('.pn')?.textContent).toBe('Grève générale');
  });
});

describe('MinimapFrame', () => {
  it('renders a canvas at twice its displayed size by default', () => {
    const { container } = render(<MinimapFrame />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.className).toBe('minimap');
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(300);
  });

  it('exposes the canvas element itself, so the engine can draw into it', () => {
    const ref = createRef<HTMLCanvasElement>();
    render(<MinimapFrame ref={ref} />);
    expect(ref.current?.tagName).toBe('CANVAS');
  });
});

describe('Toast', () => {
  it('is hidden until shown', () => {
    const { container } = render(<Toast>Mini-turbo !</Toast>);
    expect(container.firstElementChild?.className).toBe('toast');
  });

  it('shows and hides through the handle', () => {
    const ref = createRef<ToastHandle>();
    const { container } = render(<Toast ref={ref} />);
    const toast = container.firstElementChild as HTMLElement;
    ref.current?.show('Dissolution !');
    expect(toast.textContent).toBe('Dissolution !');
    expect(toast.classList.contains('on')).toBe(true);
    ref.current?.hide();
    expect(toast.classList.contains('on')).toBe(false);
    // The text stays put so the message fades rather than vanishing.
    expect(toast.textContent).toBe('Dissolution !');
  });

  it('respects the visible prop for a static render', () => {
    const { container } = render(<Toast visible>Motion de censure</Toast>);
    expect(container.firstElementChild?.className).toBe('toast on');
  });
});

describe('WrongWay', () => {
  it('toggles visibility through the handle', () => {
    const ref = createRef<WrongWayHandle>();
    render(
      <WrongWay ref={ref} hidden>
        SENS INTERDIT !
      </WrongWay>,
    );
    const banner = screen.getByText('SENS INTERDIT !');
    expect((banner as HTMLElement).hidden).toBe(true);
    ref.current?.setVisible(true);
    expect((banner as HTMLElement).hidden).toBe(false);
    ref.current?.setVisible(false);
    expect((banner as HTMLElement).hidden).toBe(true);
  });
});

describe('part props (DEC-012)', () => {
  it('SpeedReadout spreads valueProps onto the number span, apart from the unit', () => {
    const { container } = render(<SpeedReadout value={42} valueProps={{ id: 'h-speed' }} />);
    expect(container.querySelector('span#h-speed')?.textContent).toBe('42');
    expect(container.querySelector('.speed')?.id).toBe('');
  });

  it('DriftGauge spreads fillProps onto the fill element, whose inline width is the gauge', () => {
    const { container } = render(<DriftGauge value={0.5} fillProps={{ id: 'h-drift' }} />);
    expect((container.querySelector('i#h-drift') as HTMLElement | null)?.style.width).toBe('50%');
  });

  it('PowerGauge spreads nameProps, fillProps and keyHintProps onto their parts', () => {
    const { container } = render(
      <PowerGauge name="49.3" charge={0.25} keyHint="F · recharge" nameProps={{ id: 'h-pname' }} fillProps={{ id: 'h-pbar' }} keyHintProps={{ id: 'h-pkey' }} />,
    );
    expect(container.querySelector('.pn#h-pname')?.textContent).toBe('49.3');
    expect((container.querySelector('i#h-pbar') as HTMLElement | null)?.style.width).toBe('25%');
    expect(container.querySelector('.pk#h-pkey')?.textContent).toBe('F · recharge');
  });

  it('part props never override the handle: setValue still reaches the span', () => {
    const ref = createRef<SpeedReadoutHandle>();
    const { container } = render(<SpeedReadout value={1} valueProps={{ id: 'h-speed' }} ref={ref} />);
    ref.current?.setValue(77);
    expect(container.querySelector('#h-speed')?.textContent).toBe('77');
  });

  it('PowerGauge rewrites the key line through setKeyHint, with a change guard', () => {
    const ref = createRef<PowerGaugeHandle>();
    const { container } = render(<PowerGauge name="49.3" charge={0} keyHint="F · recharge" ref={ref} />);
    ref.current?.setKeyHint('F · PRÊT !');
    expect(container.querySelector('.pk')?.textContent).toBe('F · PRÊT !');
    ref.current?.setKeyHint('F · PRÊT !');
    expect(container.querySelector('.pk')?.textContent).toBe('F · PRÊT !');
  });
});

// Stage 4's motion (DEC-053): every keyframe is a class the handles put on, the keyframes themselves in fx.css.
describe('HitVignette', () => {
  it('renders an inert full-screen layer at its level and tone', () => {
    const { container } = render(<HitVignette level={0.5} tone="lap" />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.className).toBe('hit-vignette');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.dataset.tone).toBe('lap');
    expect(layer.style.getPropertyValue('--hit')).toBe('0.50');
  });

  it('sets the level (clamped), the tone and a flash through its handle', () => {
    const ref = createRef<HitVignetteHandle>();
    const { container } = render(<HitVignette ref={ref} />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.style.getPropertyValue('--hit')).toBe('0.00');
    ref.current?.setLevel(0.734);
    expect(layer.style.getPropertyValue('--hit')).toBe('0.73');
    ref.current?.setLevel(7);
    expect(layer.style.getPropertyValue('--hit')).toBe('1.00');
    ref.current?.setLevel(Number.NaN);
    expect(layer.style.getPropertyValue('--hit')).toBe('0.00');
    ref.current?.setTone('boost');
    expect(layer.dataset.tone).toBe('boost');
    ref.current?.flash();
    expect(layer.classList.contains('flash')).toBe(true);
  });
});

describe('StatusBadges', () => {
  const slowed = { id: 'slowed', icon: '🐌', label: 'Ralenti', time: 1.26 };
  const shield = { id: 'shield', icon: '🤐', label: 'Langue de bois', time: 20, tone: 'good' as const };

  it('formats a timer to the tenth with a French comma, and a count with a times sign', () => {
    expect(badgeValue({ time: 1.26 })).toBe('1,3 s');
    expect(badgeValue({ time: -2 })).toBe('0,0 s');
    expect(badgeValue({ count: 3 })).toBe('×3');
    expect(badgeValue({})).toBe('');
  });

  it('renders one badge per status, coloured by tone', () => {
    const { container } = render(<StatusBadges statuses={[slowed, shield]} />);
    const badges = [...container.querySelectorAll('.status-badge')] as HTMLElement[];
    expect(badges.map((b) => b.dataset.status)).toEqual(['slowed', 'shield']);
    expect(badges[0]?.className).toContain('tone-bad');
    expect(badges[1]?.className).toContain('tone-good');
    expect(badges[0]?.textContent).toBe('🐌Ralenti1,3 s');
  });

  it('keeps, adds, reorders and removes badges by id through its handle, rewriting only the timers', () => {
    const ref = createRef<StatusBadgesHandle>();
    const { container } = render(<StatusBadges ref={ref} />);
    const ids = () => [...container.querySelectorAll('.status-badge')].map((b) => (b as HTMLElement).dataset.status);
    ref.current?.setStatuses([slowed]);
    expect(ids()).toEqual(['slowed']);
    const first = container.querySelector('[data-status="slowed"]');
    expect(first?.classList.contains('kr-badge-in')).toBe(true);    // a new badge slides in
    ref.current?.setStatuses([shield, { ...slowed, time: 0.4 }]);
    expect(ids()).toEqual(['shield', 'slowed']);
    expect(container.querySelector('[data-status="slowed"]')).toBe(first);   // the same element, kept
    expect(first?.querySelector('.sb-time')?.textContent).toBe('0,4 s');
    ref.current?.setStatuses([]);
    expect(ids()).toEqual([]);
  });
});

describe('HUD motion through the handles', () => {
  it('spins the item roulette and flashes the slot when the item goes', () => {
    const ref = createRef<ItemSlotHandle>();
    const { container } = render(<ItemSlot ref={ref} icon="·" label="aucun objet" />);
    const slot = container.firstElementChild as HTMLElement;
    ref.current?.setRolling(true);
    expect(slot.classList.contains('rolling')).toBe(true);
    ref.current?.setRolling(false);
    expect(slot.classList.contains('rolling')).toBe(false);
    ref.current?.flashUsed();
    expect(slot.classList.contains('used')).toBe(true);
    expect(render(<ItemSlot icon="🗳️" label="…" rolling />).container.firstElementChild?.className).toBe('item rolling');
  });

  it('pops the position up on a place won and down on a place lost, and not when it stays', () => {
    const ref = createRef<PositionReadoutHandle>();
    const { container } = render(<PositionReadout ref={ref} position={4} />);
    const pos = container.firstElementChild as HTMLElement;
    ref.current?.setPosition(4);
    expect(pos.className).toBe('pos');
    ref.current?.setPosition(3);
    expect(pos.classList.contains('gain')).toBe(true);
    ref.current?.setPosition(5);
    expect(pos.classList.contains('loss')).toBe(true);
    expect(pos.classList.contains('gain')).toBe(false);
  });

  it('beats the centre announcement on every new word, never on an empty one', () => {
    const ref = createRef<TextReadoutHandle>();
    const { container } = render(<CenterAnnounce ref={ref} />);
    const center = container.firstElementChild as HTMLElement;
    ref.current?.setText('');
    expect(center.classList.contains('beat')).toBe(false);
    ref.current?.setText('3');
    expect(center.textContent).toBe('3');
    expect(center.classList.contains('beat')).toBe(true);
  });

  it('pops the power gauge once when it charges, and keeps it ready', () => {
    const ref = createRef<PowerGaugeHandle>();
    const { container } = render(<PowerGauge ref={ref} name="Grand débat" charge={0} />);
    const gauge = container.firstElementChild as HTMLElement;
    ref.current?.setReady(false);
    expect(gauge.classList.contains('charged')).toBe(false);
    ref.current?.setReady(true);
    expect(gauge.classList.contains('ready')).toBe(true);
    expect(gauge.classList.contains('charged')).toBe(true);
  });
});
