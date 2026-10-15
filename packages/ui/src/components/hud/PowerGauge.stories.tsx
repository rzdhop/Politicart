import type { Meta, StoryObj } from '@storybook/react-vite';

import { PowerGauge } from './PowerGauge';

const meta = {
  title: 'HUD/PowerGauge',
  component: PowerGauge,
  parameters: {
    docs: {
      description: {
        component:
          'The special-power gauge. Its bar is the shared `.bar` track recoloured green by `.power .bar i`, which is why the component must keep its `.power` wrapper and why the HUD stylesheet loads after the foundation one. Ready state turns the border and glow green — the counterpart to the item slot’s gold.',
      },
    },
  },
} satisfies Meta<typeof PowerGauge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Recharging: the state the gauge spends most of a race in. */
export const Recharging: Story = {
  args: { name: 'Grand débat', charge: 0.42, keyHint: 'F · recharge' },
};

/** Full and ready to fire. */
export const Ready: Story = {
  args: { name: 'Grand débat', charge: 1, keyHint: 'F · prêt', ready: true },
};

export const JustUsed: Story = {
  args: { name: 'Grève générale', charge: 0, keyHint: 'F · recharge' },
};

/** A long power name wraps inside the 150px panel rather than overflowing it. */
export const LongName: Story = {
  args: { name: 'Amendement de dernière minute', charge: 0.7, keyHint: 'F · recharge' },
};
