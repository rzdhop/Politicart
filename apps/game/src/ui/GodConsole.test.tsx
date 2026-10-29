// @vitest-environment jsdom
// The admin's god console (DEC-031): what each button sends.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/stagegate.js', () => ({ hasPreview: () => false, makeThumbs: () => ({}), setPreview: () => {}, setPreviewFrame: () => {} }));
vi.mock('../engine/race.js', () => ({ startRace: vi.fn(), startField: vi.fn(), joinField: vi.fn() }));
vi.mock('../engine/minimap.js', () => ({ attachMinimap: vi.fn() }));
vi.mock('../engine/audio.js', () => ({ initAudio: () => {}, isMuted: () => false, toggleMute: () => false, sfx: () => {}, sfxFor: () => {} }));

import { GodConsole } from './GodConsole';

afterEach(cleanup);

const KARTS = [{ slot: 0, label: 'Macaron (IA)' }, { slot: 1, label: 'Rida ⚡' }, { slot: 2, label: 'Alice' }];
const $ = (c: HTMLElement, id: string) => c.querySelector('#' + id) as HTMLButtonElement;

describe('the god console', () => {
  it('aims at every kart by default and sends field-wide punishments and gifts', () => {
    const send = vi.fn();
    const { container } = render(<GodConsole karts={KARTS} self={1} send={send} reply="Course terminée." />);
    expect(container.querySelectorAll('#god-targets button')).toHaveLength(4);
    expect($(container, 'god-target-1').textContent).toContain('(vous)');
    fireEvent.click($(container, 'god-stun'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'stun', target: 'all', dur: 2 });
    fireEvent.click($(container, 'god-freeze'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'stun', target: 'all', dur: 6 });
    fireEvent.change(container.querySelector('#god-item-pick')!, { target: { value: 'helico' } });
    fireEvent.click($(container, 'god-give'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'give', target: 'all', item: 'helico' });
    // single-kart moves wait for a single target
    expect($(container, 'god-front').disabled).toBe(true);
    expect($(container, 'god-cast').disabled).toBe(true);
    expect($(container, 'god-reply').textContent).toBe('Course terminée.');
  });

  it('aims at one kart for moves, swaps, laps, casts and godhood, and runs the race', () => {
    const send = vi.fn();
    const { container } = render(<GodConsole karts={KARTS} self={1} send={send} reply={null} />);
    fireEvent.click($(container, 'god-target-2'));
    fireEvent.click($(container, 'god-front'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'front', target: 2 });
    fireEvent.click($(container, 'god-swap'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'swap', target: 2, with: 1 });
    fireEvent.click($(container, 'god-lap-minus'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'lap', target: 2, delta: -1 });
    fireEvent.change(container.querySelector('#god-power-pick')!, { target: { value: 'chatons' } });
    fireEvent.click($(container, 'god-cast'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'cast', target: 2, power: 'chatons' });
    fireEvent.change(container.querySelector('#god-hazard-pick')!, { target: { value: 'rondpoint' } });
    fireEvent.click($(container, 'god-hazard'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'hazard', target: 2, type: 'rondpoint' });
    fireEvent.click($(container, 'god-god-on'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'god', target: 2, on: true });
    fireEvent.click($(container, 'god-laps-5'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'laps', laps: 5 });
    fireEvent.click($(container, 'god-finish'));
    expect(send).toHaveBeenLastCalledWith({ cmd: 'finish' });
    // no swap with oneself
    fireEvent.click($(container, 'god-target-1'));
    expect($(container, 'god-swap').disabled).toBe(true);
  });

  it('offers no swap from the dashboard, where the admin drives no kart', () => {
    const { container } = render(<GodConsole karts={KARTS} self={null} send={() => {}} reply={null} idPrefix="dash" />);
    expect(container.querySelector('#dash-swap')).toBeNull();
    expect(container.querySelector('#dash-finish')).not.toBeNull();
  });
});
