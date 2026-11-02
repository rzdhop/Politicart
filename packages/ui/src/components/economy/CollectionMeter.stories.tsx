import type { Meta, StoryObj } from '@storybook/react-vite';

import { CollectionMeter } from './CollectionMeter';

const meta = {
  title: 'Economy/CollectionMeter',
  component: CollectionMeter,
  parameters: {
    docs: {
      description: {
        component:
          'How much of the catalogue the player owns: the label, the figure, and one bar filled grade by grade in the grades’ colours, so rare finds read as coloured progress and the empty part as what is left to unlock.',
      },
    },
  },
  args: {
    label: 'Collection',
    have: 14,
    total: 60,
    shares: [
      { grade: 'common', have: 5, total: 5 },
      { grade: 'rare', have: 6, total: 26 },
      { grade: 'mythic', have: 2, total: 16 },
      { grade: 'incredible', have: 1, total: 13 },
    ],
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof CollectionMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A new account: the starters only. */
export const Beginner: Story = { args: { have: 5, shares: [{ grade: 'common', have: 5, total: 5 }] } };

/** Without shares: one gold bar. */
export const Plain: Story = { args: { shares: undefined, figure: '23 %' } };
