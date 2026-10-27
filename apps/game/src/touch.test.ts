// @vitest-environment jsdom
// Touch mode and the held buttons: jsdom has no matchMedia, so touch mode
// starts off as it does on a computer, and the state and its listeners
// behave the same as in a browser. The context-menu guard needs a document.
import { afterEach, describe, expect, it } from 'vitest';

import { installNoContextMenu, isTouchMode, onTouchMode, releaseAll, setTouchMode, touchHeld } from './touch';

describe('touch mode', () => {
  it('starts off where there is no touch screen', () => {
    expect(isTouchMode()).toBe(false);
  });

  it('tells its listeners when it changes, and only then', () => {
    let calls = 0; const off = onTouchMode(() => { calls++; });
    setTouchMode(true); setTouchMode(true); setTouchMode(false);
    off(); setTouchMode(true); setTouchMode(false);
    expect(calls).toBe(2);
  });

  it('lets go of every button when the keyboard takes over', () => {
    setTouchMode(true);
    Object.assign(touchHeld, { left: true, brake: true, drift: true });
    setTouchMode(false);
    expect(touchHeld).toEqual({ left: false, right: false, brake: false, drift: false });
  });

  it('releases everything on demand', () => {
    Object.assign(touchHeld, { right: true, drift: true }); releaseAll();
    expect(Object.values(touchHeld).some(Boolean)).toBe(false);
  });
});

describe('installNoContextMenu', () => {
  /** Fire a cancelable `type` event from `el` and report whether a listener refused it. */
  const refused = (el: Element, type: string) => {
    const e = type === 'contextmenu' ? new MouseEvent(type, { bubbles: true, cancelable: true }) : new Event(type, { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  let uninstall: (() => void) | undefined;

  afterEach(() => { uninstall?.(); uninstall = undefined; setTouchMode(false); document.body.innerHTML = ''; });

  it('refuses the context menu on a button and leaves it to an input', () => {
    document.body.innerHTML = '<div id="ui"><button id="b-play"><span>Jouer</span></button><label>Nom <input id="acc-name"></label><p contenteditable="true">x</p></div>';
    uninstall = installNoContextMenu(document);
    expect(refused(document.querySelector('#b-play span')!, 'contextmenu')).toBe(true);
    expect(refused(document.querySelector('#acc-name')!, 'contextmenu')).toBe(false);
    expect(refused(document.querySelector('[contenteditable]')!, 'contextmenu')).toBe(false);
  });

  it('refuses a selection only in touch mode, and never in a field', () => {
    document.body.innerHTML = '<div id="ui"><button id="b-play">Jouer</button><textarea id="t"></textarea></div>';
    uninstall = installNoContextMenu(document);
    const button = document.querySelector('#b-play')!;
    expect(refused(button, 'selectstart')).toBe(false);
    setTouchMode(true);
    expect(refused(button, 'selectstart')).toBe(true);
    expect(refused(document.querySelector('#t')!, 'selectstart')).toBe(false);
  });

  it('uninstalls', () => {
    document.body.innerHTML = '<button id="b-play">Jouer</button>';
    uninstall = installNoContextMenu(document);
    uninstall(); uninstall = undefined;
    expect(refused(document.querySelector('#b-play')!, 'contextmenu')).toBe(false);
  });
});
