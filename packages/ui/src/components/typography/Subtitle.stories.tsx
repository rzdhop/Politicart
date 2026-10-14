import type { Meta, StoryObj } from '@storybook/react-vite';

import { Subtitle } from './Subtitle';

const meta = {
  title: 'Typography/Subtitle',
  component: Subtitle,
  parameters: {
    docs: {
      description: {
        component:
          'The gold strapline under a title: display face, uppercased, widely letterspaced.',
      },
    },
  },
} satisfies Meta<typeof Subtitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Grand Prix de l’Hémicycle' } };

/** The same component carries the verdict above the results table. */
export const AsVerdict: Story = {
  args: { children: 'Élu au premier tour', style: { fontSize: 16 } },
};
