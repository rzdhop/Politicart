import type { Meta, StoryObj } from '@storybook/react-vite';

import { Heading } from './Heading';

const meta = {
  title: 'Typography/Heading',
  component: Heading,
  parameters: {
    docs: {
      description: {
        component:
          'A section heading in the display face. Three sizes: the stylesheet’s own for a heading inside a Panel, and two larger inline clamps for headings that title a whole screen.',
      },
    },
  },
} satisfies Meta<typeof Heading>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Inside a panel: the pause and results screens. */
export const Panel: Story = { args: { children: 'Résultats du scrutin' } };

/** Titling a screen: character select and the workshop. */
export const ScreenSize: Story = {
  args: { size: 'screen', children: 'Choisissez votre candidat·e' },
};

/** Slightly larger, as the track select screen uses. */
export const ScreenWide: Story = {
  args: { size: 'screenWide', children: 'Choisissez le circuit' },
};

/** An h3 renders identically; the level is for document structure. */
export const Level3: Story = { args: { level: 3, children: 'Sous-section' } };
