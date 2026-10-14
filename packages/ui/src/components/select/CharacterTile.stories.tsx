import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, PORTRAIT } from '../../stories/fixtures';
import { CharacterTile } from './CharacterTile';
import { Roster } from './Roster';

const meta = {
  title: 'Select/CharacterTile',
  component: CharacterTile,
  decorators: [
    (Story) => (
      <div style={{ width: 120 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'One square portrait in the roster, as a button. Selection is a gold border, a gold ring and a slight scale-up, which lifts the tile above its neighbours. Reports `aria-pressed`, so the current choice is announced rather than conveyed by colour alone.',
      },
    },
  },
} satisfies Meta<typeof CharacterTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { name: 'Victor Lemarchand', image: PORTRAIT } };

export const Selected: Story = {
  args: { name: 'Victor Lemarchand', image: PORTRAIT, selected: true },
};

/** No portrait yet: what an unloaded roster looks like. */
export const WithoutPortrait: Story = { args: { name: 'Lucie Vasseur' } };

/** In the grid, with one selected -- the state the screen is normally in. */
export const InRoster: Story = {
  args: { name: '' },
  decorators: [],
  render: () => (
    <div style={{ width: 360 }}>
      <Roster>
        {CAST.concat(CAST).map((c, i) => (
          <CharacterTile
            key={`${c.id}-${i}`}
            name={c.name}
            image={PORTRAIT}
            selected={i === 1}
          />
        ))}
      </Roster>
    </div>
  ),
};
