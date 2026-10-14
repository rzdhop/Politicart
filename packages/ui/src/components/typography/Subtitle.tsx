import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type SubtitleProps = ComponentPropsWithRef<'div'>;

/**
 * The gold strapline that sits under a title.
 *
 * Display face, uppercased, widely letterspaced at `0.12em`, in `--gold`. Used
 * for the subtitle on the title screen and for the one-line verdict above the
 * results table.
 *
 * ```tsx
 * <Subtitle>Grand Prix de l’Hémicycle</Subtitle>
 * ```
 */
export function Subtitle({ className, ...rest }: SubtitleProps) {
  return <div className={cx('sub', className)} {...rest} />;
}
