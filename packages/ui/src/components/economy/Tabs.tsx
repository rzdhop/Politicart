import type { ComponentPropsWithRef, KeyboardEvent, ReactNode } from 'react';

import { cx } from '../../cx';

export interface Tab<V extends string> {
  /** What `onChange` receives when this tab is picked. */
  id: V;
  /** The tab's text. */
  label: ReactNode;
  /**
   * Props for the tab's `<button>`, for a consumer that must address it --
   * the game gives each its test id (`#shop-tab-chars`), as DEC-012 asks.
   */
  props?: ComponentPropsWithRef<'button'>;
}

export interface TabsProps<V extends string> extends Omit<ComponentPropsWithRef<'nav'>, 'onChange'> {
  /** The tabs, in display order. */
  tabs: readonly Tab<V>[];
  /** The id of the tab currently shown. */
  active: V;
  /** Called with the id of the tab the player picks. */
  onChange: (id: V) => void;
}

/**
 * A row of tabs: pick which section to show.
 *
 * The same pill as a `ChoiceGroup` chip, a size up and 44px tall for a
 * thumb, under a `role="tablist"`. Each tab is a real `<button role="tab">`
 * with `aria-selected`; the active one takes the tab stop and the arrow
 * keys, Home and End move between them, so the row is driven from the
 * keyboard like everything else in the system. The consumer owns the panels
 * and their `aria-labelledby`.
 *
 * ```tsx
 * <Tabs
 *   active={tab}
 *   onChange={setTab}
 *   tabs={[
 *     { id: 'box', label: 'Plitibox', props: { id: 'shop-tab-box' } },
 *     { id: 'chars', label: 'Candidat·es', props: { id: 'shop-tab-chars' } },
 *   ]}
 * />
 * ```
 */
export function Tabs<V extends string>({ tabs, active, onChange, className, ...rest }: TabsProps<V>) {
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const index = tabs.findIndex((t) => t.id === active);
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    const tab = next === undefined ? undefined : tabs[next];
    if (tab === undefined) return;
    event.preventDefault();
    onChange(tab.id);
    const button = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next ?? 0];
    button?.focus();
  }

  return (
    <nav role="tablist" className={cx('tabs', className)} onKeyDown={onKeyDown} {...rest}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            {...tab.props}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
