import type { Meta, StoryObj } from '@storybook/react-vite';

import { SpeedReadout } from './SpeedReadout';

const meta = {
  title: 'HUD/SpeedReadout',
  component: SpeedReadout,
  parameters: {
    docs: {
      description: {
        component:
          'The speedometer. The number carries at 46px and the unit stays out of the way at 16px muted, which is also why `setValue` updates only the number.',
      },
    },
  },
} satisfies Meta<typeof SpeedReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { value: 138 } };

export const Stopped: Story = { args: { value: 0 } };

/** Values are rounded for display. */
export const Rounded: Story = { args: { value: 141.73 } };

/** The unit is a prop, for anything built on this system that is not a kart. */
export const OtherUnit: Story = { args: { value: 88, unit: 'mph' } };
