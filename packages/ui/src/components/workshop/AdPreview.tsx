import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type AdPreviewProps = ComponentPropsWithRef<'div'>;

/**
 * The strip of uploaded campaign posters.
 *
 * Sizes any `img` child to 90x34, covered, with a hairline border. Unlike the
 * rest of the workshop this is scoped to its own class rather than `.admin`,
 * so it works anywhere -- the game puts it outside the candidate grid.
 *
 * ```tsx
 * <AdPreview>
 *   {posters.map((src) => <img key={src} src={src} alt="" />)}
 * </AdPreview>
 * ```
 */
export function AdPreview({ className, ...rest }: AdPreviewProps) {
  return <div className={cx('ad-preview', className)} {...rest} />;
}
