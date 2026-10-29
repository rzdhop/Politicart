import { useEffect, useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react';

import { cx } from '../../cx';
import { Button, type ButtonProps } from '../controls/Button';

export interface RoomCodeProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** The room's code, four letters, in big display type. */
  code: string;
  /** The word before the code. Defaults to "Room"; the game passes "Salle". */
  label?: ReactNode;
  /** A muted line under the code: what to do with it. */
  hint?: ReactNode;
  /** What the copy button puts on the clipboard. Defaults to the code. */
  copyText?: string;
  /** The copy button's text. Defaults to "Copy". */
  copyLabel?: ReactNode;
  /** What the button says for a moment once copied. Defaults to "Copied!". */
  copiedLabel?: ReactNode;
  /** Called after a copy, with what was copied (whether or not the clipboard took it). */
  onCopied?: (text: string) => void;
  /** Props for the copy button, for a consumer that must address it. */
  copyProps?: ButtonProps;
}

/** How long the button says "copied", ms. */
export const COPIED_MS = 1600;

/**
 * A room's code, to read out or copy: the label and the code in display
 * type, the code in gold with wide letter spacing, a ghost copy button that
 * says it copied for a moment, and a hint line.
 *
 * The copy goes through the asynchronous clipboard API where the browser
 * offers it (a secure page); without it the button still reports, so the
 * code on screen remains the way to share.
 *
 * ```tsx
 * <RoomCode id="lobby-room" code="ABCD" label="Salle" hint="Donnez ce code à vos ami·es" copyLabel="Copier" copiedLabel="Copié !" />
 * ```
 */
export function RoomCode({
  code,
  label = 'Room',
  hint,
  copyText,
  copyLabel = 'Copy',
  copiedLabel = 'Copied!',
  onCopied,
  copyProps,
  className,
  ...rest
}: RoomCodeProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = () => {
    const text = copyText ?? code;
    const done = () => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      onCopied?.(text);
    };
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip && typeof clip.writeText === 'function') clip.writeText(text).then(done, done);
    else done();
  };
  return (
    <div className={cx('room-code', className)} {...rest}>
      <span className="rc-line">
        <span className="rc-label">{label}</span> <span className="rc-code">{code}</span>
        <Button variant="ghost" className="rc-copy" onClick={copy} {...copyProps}>
          {copied ? copiedLabel : copyLabel}
        </Button>
      </span>
      {hint === undefined ? null : <span className="rc-hint">{hint}</span>}
    </div>
  );
}
