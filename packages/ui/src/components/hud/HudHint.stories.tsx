import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudHint } from './HudHint';

const meta = {
  title: 'HUD/HudHint',
  component: HudHint,
  parameters: {
    docs: {
      description: {
        component:
          'A line of coaching beside the item slot. **Hidden entirely below 600px**, so never put anything here a player must read — it is for teaching, not for state.',
      },
    },
  },
} satisfies Meta<typeof HudHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Ramassez une urne dorée pour obtenir un objet.' },
};

/** Explaining the held item, which is what the game mostly uses it for. */
export const ExplainingAnItem: Story = {
  args: { children: 'Motion de censure : renvoie le premier à la dernière place.' },
};
