import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

/** The glyphs the menus draw, one per entry of the title screen. */
export const MENU_GLYPHS = [
  'play',
  'multi',
  'shop',
  'garage',
  'account',
  'sound',
  'mute',
  'graphics',
  'help',
  'admin',
  'dashboard',
] as const;

export type MenuGlyphName = (typeof MENU_GLYPHS)[number];

export interface MenuGlyphProps extends Omit<ComponentPropsWithRef<'svg'>, 'children'> {
  /** Which glyph. */
  name: MenuGlyphName;
}

/** Each glyph's strokes, on a 24px grid, drawn in `currentColor`. */
const PATHS: Record<MenuGlyphName, ReactNode> = {
  // a chequered flag on its pole
  play: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4.5L18 13H5" />
      <path d="M9 4v9M13 4v9M5 8.5h11.5" strokeWidth="1.4" />
    </>
  ),
  // two helmets, face to face
  multi: (
    <>
      <path d="M2.5 16a6 6 0 0 1 12 0v2h-12z" />
      <path d="M9.5 16H14" />
      <path d="M12 9.6A6 6 0 0 1 21.5 15v2H17" />
    </>
  ),
  // a shopping bag with a coin's P
  shop: (
    <>
      <path d="M4.5 8h15l-1.2 12.5H5.7z" />
      <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" />
      <path d="M10.5 18v-6h2.2a1.7 1.7 0 0 1 0 3.4h-2.2" />
    </>
  ),
  // a wrench across a wheel: the kart's workshop
  garage: (
    <>
      <circle cx="9" cy="15" r="5.5" />
      <circle cx="9" cy="15" r="1.6" />
      <path d="M13 11l5.2-5.2" />
      <path d="M16.5 3.6a3 3 0 0 0 3.9 3.9l-1.8 1.8-3.9-3.9z" />
    </>
  ),
  // a bust
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  // a speaker and two waves
  sound: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  // a speaker, crossed out
  mute: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  // a gem: the detail level
  graphics: (
    <>
      <path d="M6.5 4h11L21 9l-9 11L3 9z" />
      <path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5" strokeWidth="1.4" />
    </>
  ),
  // a keyboard
  help: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h.01M9.3 10h.01M12.6 10h.01M15.9 10h.01M6 13.5h.01M18 10h.01M18 13.5h.01" strokeWidth="2.4" />
      <path d="M8.5 14.5h7" />
    </>
  ),
  // a spanner
  admin: (
    <path d="M14.5 4.5a4.5 4.5 0 0 0-4.2 6.1L4 16.9V20h3.1l6.3-6.3a4.5 4.5 0 0 0 6.1-4.2l-2.8 2.8-2.9-.9-.9-2.9z" />
  ),
  // three bars
  dashboard: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M6 20V12M12 20V5M18 20v-5.5" strokeWidth="3" />
    </>
  ),
};

/**
 * The menus' line glyphs: a flag, two helmets, a bag, a bust, the speaker
 * on and off, a gem for the detail level, a keyboard, a spanner and a bar
 * chart. 24px grid, round 2px strokes in `currentColor`, so a glyph takes
 * the colour and the size of the text around it (1.25em by default).
 *
 * Decorative: `aria-hidden`, never focusable, and no text node, so a
 * button's `textContent` (which the game's tests read) is its label alone.
 *
 * ```tsx
 * <MenuCard icon={<MenuGlyph name="shop" />} label="Boutique" />
 * ```
 */
export function MenuGlyph({ name, className, ...rest }: MenuGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cx('menu-glyph', className)}
      data-glyph={name}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
