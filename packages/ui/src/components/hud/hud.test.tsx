import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CenterAnnounce } from './CenterAnnounce';
import { DriftGauge, type DriftGaugeHandle } from './DriftGauge';
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
