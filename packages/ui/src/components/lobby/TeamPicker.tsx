import type { ReactNode } from 'react';

import { cx } from '../../cx';
import { ChoiceGroup, type ChoiceGroupProps } from '../controls/ChoiceGroup';

/** One team to pick: its value, its name and its colour. */
export interface TeamOption<V extends string> {
  value: V;
  /** The team's name, on the chip. */
  label: ReactNode;
  /** Any CSS colour: the dot before the name. */
  color: string;
  /** An id for the chip's button. */
  id?: string;
  /** How many players it has, shown after the name. */
  count?: number;
  disabled?: boolean;
}

export interface TeamPickerProps<V extends string> extends Omit<ChoiceGroupProps<V>, 'options'> {
  /** The teams, in display order. */
  teams: readonly TeamOption<V>[];
}

/**
 * Pick a team: a `ChoiceGroup` (DEC-024) whose chips carry the team's
 * colour as a dot before its name, and how many players it has. The picked
 * chip fills gold like any choice, so the row never reflows and never
 * competes with the screen's one primary button.
 *
 * ```tsx
 * <TeamPicker label="Équipe" value={me.team} onChange={setTeam} teams={[
 *   { value: 'bleu', label: 'Bleu', color: 'var(--blue)', id: 'b-mp-team-bleu', count: 2 },
 *   { value: 'rouge', label: 'Rouge', color: 'var(--red)', id: 'b-mp-team-rouge', count: 1 },
 * ]} />
 * ```
 */
export function TeamPicker<V extends string>({ teams, className, ...rest }: TeamPickerProps<V>) {
  return (
    <ChoiceGroup
      className={cx('team-picker', className)}
      options={teams.map((t) => ({
        value: t.value,
        id: t.id,
        disabled: t.disabled,
        label: (
          <>
            <i className="team-dot" aria-hidden="true" style={{ background: t.color }} />
            {t.label}
          </>
        ),
        badge: t.count === undefined ? undefined : <span className="team-count">{t.count}</span>,
      }))}
      {...rest}
    />
  );
}
