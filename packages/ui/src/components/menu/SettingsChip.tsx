import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface SettingsChipProps extends ComponentPropsWithRef<'button'> {
  /** A glyph before the label (a `MenuGlyph`); decorative. */
  icon?: ReactNode;
  /**
   * Lit: the gold rim of a setting that is on (the sound playing, the
   * detailed graphics). Purely visual; the label says the state in words.
   */
  active?: boolean;
  /**
   * Show the glyph alone on a phone (below 600px), the label kept for
   * assistive technology: for an entry whose glyph says it all
   * (« Commandes », a keyboard). A phone held sideways (under 600px tall) counts as one.
   */
  compact?: boolean;
}

/**
 * A small glass pill for a setting or a utility in a screen's corner: the
 * graphics level, the sound, the controls help, the admin's entries.
 *
 * A glyph and a short label in display type, 44px tall (a finger's target)
 * however short the label. The label is the button's whole text, so a
 * toggle names its state in words (« Son : activé ») rather than through
 * `aria-pressed`. A part of the label wrapped in `.chip-key` is dropped
 * visually on a phone (still read out), so « Graphismes : légers » can show
 * as « légers » beside its gem where room is short.
 *
 * Group them in a `.settings-strip` (a wrapping row, `role="group"` with a
 * name). `type="button"` by default; every native prop is spread.
 *
 * ```tsx
 * <div className="settings-strip" role="group" aria-label="Réglages">
 *   <SettingsChip id="b-mute" icon={<MenuGlyph name="sound" />} active onClick={toggle}>Son : activé</SettingsChip>
 *   <SettingsChip compact icon={<MenuGlyph name="help" />}>Commandes</SettingsChip>
 * </div>
 * ```
 */
export function SettingsChip({ icon, active = false, compact = false, className, children, type = 'button', ...rest }: SettingsChipProps) {
  return (
    <button
      type={type}
      className={cx('settings-chip', active && 'on', compact && 'compact', className)}
      {...rest}
    >
      {icon ? <span className="sc-icon">{icon}</span> : null}
      <span className="sc-label">{children}</span>
    </button>
  );
}
