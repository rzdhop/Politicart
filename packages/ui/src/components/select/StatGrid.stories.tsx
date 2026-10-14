import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, STAT_LABELS } from '../../stories/fixtures';
import { Showcase } from './Showcase';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const meta = {
  title: 'Select/StatGrid',
  component: StatGrid,
  // Wrapped in a Showcase because `.showcase .stats` is a descendant rule: on
  // its own the grid is an unstyled block and its bars fall into one column.
  decorators: [
    (Story) => (
      <Showcase name="Lucie Vasseur" title="L’outsider">
        <Story />
      </Showcase>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The three-across row of stat bars. **Must be inside a Showcase** — the grid comes from `.showcase .stats`. Three is the number the game shows: speed, acceleration and handling, with weight left out of the UI.',
      },
    },
  },
} satisfies Meta<typeof StatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: STAT_LABELS.map(([k, label]) => (
      <StatBar key={k} label={label} value={CAST[2]!.stats[k]} />
    )),
  },
};
