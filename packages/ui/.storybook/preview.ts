import type { Preview } from '@storybook/react-vite';

// The whole point of the preview: load the real stylesheet, including the
// self-hosted fonts, so a story shows what a consumer actually gets. Importing
// src/styles.css rather than dist/ means stories reflect the working tree
// without a build step in between.
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    // The system is dark-only by design (`color-scheme: dark`), so the canvas
    // is painted the game's background rather than Storybook's default white.
    // A light canvas would make every story look wrong and hide real contrast
    // problems.
    backgrounds: { disable: true },
    layout: 'centered',
  },
  // `body` carries the system's background and `overflow: hidden`; the preview
  // iframe needs the background but not the scroll lock, since a story is a
  // fragment of a page rather than a full-screen game.
  decorators: [
    (Story) => {
      document.documentElement.style.background = 'var(--bg)';
      document.body.style.overflow = 'visible';
      return Story();
    },
  ],
};

export default preview;
