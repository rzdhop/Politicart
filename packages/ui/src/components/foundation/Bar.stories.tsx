import type { Meta, StoryObj } from '@storybook/react-vite';

import { Bar } from './Bar';

const meta = {
  title: 'Foundation/Bar',
  component: Bar,
  decorators: [
    (Story) => (
      <div style={{ width: 220 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The 8px track-and-fill meter. StatBar and PowerGauge both build on it; the HUD recolours its fill green by nesting it inside `.power`.',
      },
    },
  },
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { value: 0.66 } };

/** Empty and full, the two ends of the range. */
export const Empty: Story = { args: { value: 0 } };
export const Full: Story = { args: { value: 1 } };

/** Labelled, which turns it into an announced progressbar. */
export const Labelled: Story = { args: { value: 0.42, label: 'Vitesse' } };

/** Out-of-range values are clamped rather than overflowing the track. */
export const Clamped: Story = { args: { value: 2.5 } };
