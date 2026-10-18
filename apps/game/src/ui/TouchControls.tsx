import { useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';

import { isNetRace } from '../engine/netrace.js';
import { isTouchMode, onTouchMode, releaseAll, touchHeld } from '../touch';
import { actions } from './store';

/**
 * The touch buttons' live readouts, filled in when the buttons mount and
 * written by game.js's HUD writer every frame -- the same imperative path the
 * HUD readouts use, so the item icon and the power charge never go through
 * React state at 60 fps.
 */
export const touchHud: {
  item: ((icon: string, filled: boolean) => void) | null;
  power: ((charge: number, ready: boolean) => void) | null;
} = { item: null, power: null };

/** Whether the player is playing by touch (touch.ts), as a React value: the menus swap their key legends for it. */
export const useTouchMode = () => useSyncExternalStore(onTouchMode, isTouchMode, isTouchMode);

type Hold = 'brake' | 'drift';

/** Pointer handlers for a button that counts while a finger is on it. */
function holdHandlers(key: Hold) {
  const on = (e: ReactPointerEvent<HTMLElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); touchHeld[key] = true; e.currentTarget.classList.add('on'); };
  const off = (e: ReactPointerEvent<HTMLElement>) => { touchHeld[key] = false; e.currentTarget.classList.remove('on'); };
  return { onPointerDown: on, onPointerUp: off, onPointerCancel: off, onLostPointerCapture: off };
}

/**
 * The steering pad: one surface split down the middle, so a thumb can roll
 * from ◀ to ▶ without lifting. The half under the finger is written straight
 * to the element's data-dir for the highlight, without a React render.
 */
function SteerPad() {
  const steer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const left = e.clientX - r.left < r.width / 2;
    touchHeld.left = left; touchHeld.right = !left; e.currentTarget.dataset.dir = left ? 'left' : 'right';
  };
  const release = (e: ReactPointerEvent<HTMLDivElement>) => { touchHeld.left = false; touchHeld.right = false; e.currentTarget.dataset.dir = ''; };
  return (
    <div
      id="t-steer"
      className="touch-steer"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); steer(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) steer(e); }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="touch-half" aria-label="Tourner à gauche">◀</span>
      <span className="touch-half" aria-label="Tourner à droite">▶</span>
    </div>
  );
}

/**
 * On-screen controls for phones and tablets: steering under the left thumb;
 * brake, drift, item and power under the right one; pause (solo only: a team
 * race cannot be paused) and full screen at the top. Shown in touch mode during a race (touch.ts); the kart accelerates
 * by itself meanwhile, so there is no accelerate button.
 */
export function TouchControls({ live, paused }: { live: boolean; paused: boolean }) {
  const touch = useTouchMode();
  const itemIco = useRef<HTMLSpanElement>(null);
  const itemBtn = useRef<HTMLButtonElement>(null);
  const powerBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    touchHud.item = (icon, filled) => {
      if (itemIco.current && itemIco.current.textContent !== icon) itemIco.current.textContent = icon;
      itemBtn.current?.classList.toggle('ready', filled);
    };
    touchHud.power = (charge, ready) => {
      powerBtn.current?.style.setProperty('--charge', String(Math.max(0, Math.min(1, charge))));
      powerBtn.current?.classList.toggle('ready', ready);
    };
    return () => { touchHud.item = null; touchHud.power = null; };
  }, []);

  // a race that ends (or pauses) under a finger must not leave a button held
  useEffect(() => { if (!live || paused) releaseAll(); }, [live, paused]);

  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* refused: stay windowed */ });
  };

  return (
    <div id="touch" className="touch" hidden={!touch || !live || paused}>
      <div className="touch-top">
        {!isNetRace() && <button id="t-pause" type="button" className="touch-small" aria-label="Pause" onClick={actions.pauseIfSolo}>❚❚</button>}
        {canFullscreen && <button id="t-full" type="button" className="touch-small" aria-label="Plein écran" onClick={toggleFullscreen}>⛶</button>}
      </div>
      <SteerPad />
      <button id="t-brake" type="button" className="touch-btn touch-brake" aria-label="Freiner, reculer" {...holdHandlers('brake')}>
        <span className="touch-ico">▼</span><span className="touch-lbl">Frein</span>
      </button>
      <button id="t-drift" type="button" className="touch-btn touch-drift" aria-label="Dérapage" {...holdHandlers('drift')}>
        <span className="touch-ico">↯</span><span className="touch-lbl">Dérapage</span>
      </button>
      <button
        id="t-item"
        ref={itemBtn}
        type="button"
        className="touch-btn touch-item"
        aria-label="Utiliser l’objet"
        onPointerDown={(e) => { e.preventDefault(); actions.useItem(); }}
      >
        <span className="touch-ico" ref={itemIco}>·</span><span className="touch-lbl">Objet</span>
      </button>
      <button
        id="t-power"
        ref={powerBtn}
        type="button"
        className="touch-btn touch-power"
        aria-label="Pouvoir spécial"
        onPointerDown={(e) => { e.preventDefault(); actions.usePower(); }}
      >
        <span className="touch-ico">★</span><span className="touch-lbl">Pouvoir</span>
      </button>
    </div>
  );
}
