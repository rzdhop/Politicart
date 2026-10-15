import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tricolore } from './Tricolore';

const meta = {
  title: 'Brand/Tricolore',
  component: Tricolore,
  parameters: {
    docs: {
      description: {
        component:
          'The flag as a rule: three equal stripes in a 6px rounded bar. A slightly softened tricolore that belongs to the brand layer, which is why its colours are literals rather than the `--blue` and `--red` tokens.',
      },
    },
  },
} satisfies Meta<typeof Tricolore>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** It takes its width from its container, up to `min(420px, 80vw)`. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 160 }}>
        <Story />
      </div>
    ),
  ],
};
