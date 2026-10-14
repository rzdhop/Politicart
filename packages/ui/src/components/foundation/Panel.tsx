import type { ComponentPropsWithRef } from 'react';

import { cx } from '../../cx';

export type PanelProps = ComponentPropsWithRef<'div'>;

/**
 * The frosted card every menu puts its content in.
 *
 * Translucent `--panel` fill over a 6px backdrop blur, a hairline `--line`
 * border and a 14px radius, capped at 980px wide. It is the surface that makes
 * menu text readable over a moving 3D scene, so prefer it over a bare `div`
 * whenever content sits above the canvas.
 *
 * A panel brings no layout of its own beyond its padding. Stack its contents
 * with a flex column or a `Row`.
 *
 * ```tsx
 * <Panel style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
 *   <Heading>Suspension de séance</Heading>
 *   <Row>
 *     <Button>Reprendre</Button>
 *     <Button variant="ghost">Quitter la course</Button>
 *   </Row>
 * </Panel>
 * ```
 */
export function Panel({ className, ...rest }: PanelProps) {
  return <div className={cx('panel', className)} {...rest} />;
}
