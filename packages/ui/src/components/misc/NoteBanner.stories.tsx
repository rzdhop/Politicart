import type { Meta, StoryObj } from '@storybook/react-vite';

import { NoteBanner } from './NoteBanner';

const meta = {
  title: 'Misc/NoteBanner',
  component: NoteBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A fixed note along the bottom of the viewport, clear of the device safe area and `pointer-events: none` so it never intercepts a click. It sits above whichever screen is showing, so it does not need repeating per screen. Keep it to one short line — it has no background, so long text over a bright track becomes hard to read.',
      },
    },
  },
} satisfies Meta<typeof NoteBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Jeu au clavier : ouvrez-le sur un ordinateur.' },
};
