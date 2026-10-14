import type { Meta, StoryObj } from '@storybook/react-vite';

import { GameTitle } from './GameTitle';

const meta = {
  title: 'Typography/GameTitle',
  component: GameTitle,
  parameters: {
    docs: {
      description: {
        component:
          'The wordmark: display type with the tricolore painted through it. The fill is a gradient clipped to the glyphs, so `color` has no effect on this element.',
      },
    },
  },
} satisfies Meta<typeof GameTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'KART RÉPUBLIQUE' } };

/** The gradient's stops are tuned for a two-word mark; longer strings push the white band off centre. */
export const LongerMark: Story = { args: { children: 'GRAND PRIX DE L’HÉMICYCLE' } };
