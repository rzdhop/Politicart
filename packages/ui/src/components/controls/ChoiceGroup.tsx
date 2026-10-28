import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface ChoiceOption<V extends string> {
  /** What `onChange` receives when this chip is picked. */
  value: V;
  /** The chip's text. */
  label: ReactNode;
  /** An id for the chip's `<button>`, for consumers that address it. */
  id?: string;
  /**
   * Greys the chip out and makes picking it a no-op. It stays in the tab
   * order and reports `aria-disabled` rather than the `disabled` attribute,
   * so a `badge` inside it still takes a tap -- the Garage puts a grade badge
   * on an unowned option and a tap on it opens the shop.
   */
  disabled?: boolean;
  /** Something small after the label, inside the chip: a `GradeBadge`, a count. */
  badge?: ReactNode;
}

export interface ChoiceGroupProps<V extends string> extends Omit<ComponentPropsWithRef<'div'>, 'onChange'> {
  /** The group's caption, shown above the chips and used as its accessible name. */
  label: string;
  /** The choices, in display order. */
  options: readonly ChoiceOption<V>[];
  /** The value of the chip currently picked. */
  value: V;
  /** Called with the value of the chip the player picks. */
  onChange: (value: V) => void;
}

/**
 * One row of mutually exclusive chips: pick exactly one.
 *
 * Gold display caption over pill-shaped chips with a hairline border; the
 * picked chip fills gold. Every chip keeps the same size whatever its state,
 * so picking one never reflows the row -- which is why this exists instead of
 * swapping Button variants, and why it never competes with the row's single
 * primary Button. Each chip is a real `<button>` with `aria-pressed`, so the
 * group is fully keyboard-driven, and focus draws the system's white ring.
 *
 * An option can be `disabled` (muted, `aria-disabled`, picking it does
 * nothing) and carry a `badge` after its label; together they are how the
 * Garage shows an option the player does not own yet.
 *
 * ```tsx
 * <ChoiceGroup
 *   label="Roues"
 *   value={wheels}
 *   onChange={setWheels}
 *   options={[{ value: 'classic', label: 'Classiques' }, { value: 'gold', label: 'Dorées' }]}
 * />
 * ```
 */
export function ChoiceGroup<V extends string>({ label, options, value, onChange, className, ...rest }: ChoiceGroupProps<V>) {
  return (
    <div role="group" aria-label={label} className={cx('choice-group', className)} {...rest}>
      <span className="choice-label">{label}</span>
      <div className="choices">
        {options.map(o => (
          <button
            key={o.value}
            id={o.id}
            type="button"
            className="chip"
            aria-pressed={o.value === value}
            aria-disabled={o.disabled ? true : undefined}
            onClick={o.disabled ? undefined : () => onChange(o.value)}
          >
            {o.label}
            {o.badge === undefined ? null : <span className="chip-badge">{o.badge}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
