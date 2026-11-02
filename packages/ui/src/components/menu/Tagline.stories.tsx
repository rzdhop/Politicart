import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tagline } from './Tagline';

const meta = {
  title: 'Menu/Tagline',
  component: Tagline,
  parameters: {
    docs: {
      description: {
        component:
          'A short line under a title that changes every few seconds — the game’s running joke, one quip at a time. Bold italic body type between two gold rules; each new line drops in with a tilt. `aria-live="off"`, so a screen reader is not interrupted. Under `prefers-reduced-motion`, and for a single line, the first line stays. `paused` holds the current line (a hidden screen).',
      },
    },
  },
  args: {
    lines: [
      'Trois tours, cinq adversaires, aucune cohabitation.',
      'Le premier sur la ligne forme le gouvernement.',
      'Ici, on double par la gauche comme par la droite.',
    ],
    interval: 2500,
  },
} satisfies Meta<typeof Tagline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Paused: Story = { args: { paused: true } };
