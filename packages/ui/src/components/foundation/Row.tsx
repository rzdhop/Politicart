import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type RowProps = ComponentPropsWithRef<'div'>;

/**
 * A horizontal group that wraps: the system's button bar.
 *
 * Flex, wrapping, centred on both axes, 12px gap. This is how every menu lays
 * out its actions, and the wrap is what keeps a four-button row usable at phone
 * width.
 *
 * ```tsx
 * <Row>
 *   <Button>Jouer</Button>
 *   <Button variant="ghost">Atelier (admin)</Button>
 * </Row>
 * ```
 */
export function Row({ className, ...rest }: RowProps) {
  return <div className={cx('row', className)} {...rest} />;
}
