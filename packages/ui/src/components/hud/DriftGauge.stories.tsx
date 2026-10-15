import type { Meta, StoryObj } from '@storybook/react-vite';

import { DriftGauge } from './DriftGauge';

const meta = {
  title: 'HUD/DriftGauge',
  component: DriftGauge,
  decorators: [
    (Story) => (
      <div style={{ width: 200, textAlign: 'right' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The drift charge meter: fills while the player holds a drift, empties when they release it into a mini-turbo. It carries no label — the player learns it by feel. Distinct from Bar so the HUD can keep its own colour and sizing.',
      },
    },
  },
} satisfies Meta<typeof DriftGauge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { value: 0 } };

export const Charging: Story = { args: { value: 0.45 } };

/** Fully charged: a mini-turbo is available. */
export const Charged: Story = { args: { value: 1 } };

/** The game flashes the fill as the turbo becomes available. */
export const Flashing: Story = { args: { value: 1, color: '#fffaf0' } };
