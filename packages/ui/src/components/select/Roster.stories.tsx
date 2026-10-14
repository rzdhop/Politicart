import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, PORTRAIT } from '../../stories/fixtures';
import { CharacterTile } from './CharacterTile';
import { Roster } from './Roster';

const meta = {
  title: 'Select/Roster',
  component: Roster,
  decorators: [
    (Story) => (
      <div style={{ width: 380 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The four-across grid of character tiles. Four columns is deliberate rather than auto-fitting: the roster’s shape is part of the screen’s composition, so the eleven-strong cast reads as three full rows and a short one.',
      },
    },
  },
} satisfies Meta<typeof Roster>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Eleven tiles, as the game has: three full rows and a short one. */
export const FullCast: Story = {
  args: {
    children: Array.from({ length: 11 }, (_, i) => {
      const c = CAST[i % CAST.length]!;
      return (
        <CharacterTile key={i} name={c.name} image={PORTRAIT} selected={i === 0} />
      );
    }),
  },
};
