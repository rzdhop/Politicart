import type { Meta, StoryObj } from '@storybook/react-vite';

import { PositionReadout } from './PositionReadout';

const meta = {
  title: 'HUD/PositionReadout',
  component: PositionReadout,
  parameters: {
    docs: {
      description: {
        component:
          'The biggest number on screen: the player’s position, with the ordinal suffix set at 45% size so "3e" reads as one glyph pair. The HUD’s anchor — it should stay the largest thing in any corner. Exposes `setPosition` for per-frame updates, since overtakes can happen several times a second.',
      },
    },
  },
} satisfies Meta<typeof PositionReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First place takes the "er" suffix; everything after takes "e". */
export const First: Story = { args: { position: 1 } };
export const Third: Story = { args: { position: 3 } };
export const Last: Story = { args: { position: 6 } };

/** Two digits, which is as wide as the readout ever gets with an eleven-strong cast. */
export const DoubleDigit: Story = { args: { position: 11 } };
