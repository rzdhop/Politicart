import { type ComponentPropsWithRef, type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';

import { cx } from '../../cx';

export interface SheetProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** Whether the sheet shows. Closed, nothing renders at all. */
  open: boolean;
  /** Called on the × button, the Escape key and a tap on the dimmed backdrop. */
  onClose: () => void;
  /** The sheet's heading, which also names the dialog. */
  title: ReactNode;
  /** The × button's accessible name. Defaults to « Fermer ». */
  closeLabel?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal sheet over the screen: a bottom sheet on a phone, a centred glass
 * card from 600px. For help and small side panels that must not take the
 * player off the screen they are on (the title's « Commandes »).
 *
 * `role="dialog"`, `aria-modal`, named by its heading. While open the focus
 * moves to its × button, Tab cycles inside it, Escape and a tap on the
 * dimmed backdrop close it, and the focus goes back to whatever opened it.
 * Enter and Escape stop at the sheet, so a game listening on `window` (the
 * title reads Enter as « Jouer ») never hears a key meant for the sheet.
 *
 * Render it as a direct child of the `Screen`, not inside a `Panel`: the
 * panel's backdrop blur would become the fixed sheet's containing block. It
 * slides up on open (fx.css), still under `prefers-reduced-motion`.
 *
 * ```tsx
 * <Sheet open={help} onClose={() => setHelp(false)} title="Commandes">
 *   <ControlsGrid>…</ControlsGrid>
 * </Sheet>
 * ```
 */
export function Sheet({ open, onClose, title, closeLabel = 'Fermer', className, children, ...rest }: SheetProps) {
  const headingId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const before = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    close.current?.focus();
    return () => { before?.focus?.(); };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeFn.current(); return; }
    if (e.key === 'Enter') { e.stopPropagation(); return; }
    if (e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0]!, last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeFn.current(); }}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cx('sheet', className)}
        onKeyDown={onKeyDown}
        {...rest}
      >
        <div className="sheet-head">
          <h2 id={headingId} className="sheet-title">{title}</h2>
          <button ref={close} type="button" className="sheet-close" aria-label={closeLabel} onClick={() => closeFn.current()}>
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
