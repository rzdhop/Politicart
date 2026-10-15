import type { Meta, StoryObj } from '@storybook/react-vite';

import { LapCounter } from './LapCounter';

const meta = {
  title: 'HUD/LapCounter',
  component: LapCounter,
  parameters: {
    docs: {
      description: {
        component:
          'The lap line, under the position. Takes its text as children rather than lap numbers, since the wording belongs to the game rather than the system.',
      },
    },
  },
} satisfies Meta<typeof LapCounter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Racing: Story = { args: { children: 'TOUR 2/3' } };

/** Once the player has crossed the line but the race is still running. */
export const Finished: Story = { args: { children: 'ARRIVÉE' } };
