// The context the Storybook decorator provides, as a component.
//
// @politikart/ui is dark-only: its stylesheet paints `body` with the
// hemicycle-night background and every component assumes it. Storybook's
// preview decorator paints the canvas the same way. The design-sync preview
// cards and the designs built from this system do not run that decorator, so
// this root supplies the canvas instead: wrap a fragment in it and the
// system's background, foreground and body font apply. A full page already
// gets all three from the stylesheet's `body` rule; the wrapper is for
// fragments rendered on a page that is not the system's. No vertical padding:
// full-height stories (100vh HUD layers, screens) must fit the viewport exactly.
import { createElement } from 'react';

export function PreviewRoot({ children }) {
  return createElement(
    'div',
    { style: { background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font-body)', padding: '0 16px' } },
    children,
  );
}
