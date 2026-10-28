import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, placeholderPortrait, PORTRAIT } from '../../stories/fixtures';
import { CharacterTile } from './CharacterTile';
import { Roster } from './Roster';

const meta = {
  title: 'Select/CharacterTile',
  component: CharacterTile,
  // One tile at its usual roster size; the grid stories widen the frame with
  // the `frameWidth` parameter.
  decorators: [
    (Story, { parameters }) => (
      <div style={{ width: (parameters.frameWidth as number | undefined) ?? 120 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'One square portrait in the roster, as a button. Selection is a gold border, a gold ring and a slight scale-up, which lifts the tile above its neighbours. Reports `aria-pressed`, so the current choice is announced rather than conveyed by colour alone. While its portrait renders, `pending` sweeps a light across the placeholder and sets `aria-busy`; the sweep is off under `prefers-reduced-motion`.',
      },
    },
  },
} satisfies Meta<typeof CharacterTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Kart colours for the placeholder portraits. */
const PLACEHOLDER_COLOURS = ['#2f55c7', '#e63946', '#3a9d5d'];

export const Default: Story = { args: { name: 'Victor Lemarchand', image: PORTRAIT } };

export const Selected: Story = {
  args: { name: 'Victor Lemarchand', image: PORTRAIT, selected: true },
};

/** No portrait yet: what an unloaded roster looks like. */
export const WithoutPortrait: Story = { args: { name: 'Lucie Vasseur' } };

/**
 * The portrait is still rendering: the candidate's colour and initials stand
 * in, and a light sweeps across them until the real portrait lands.
 */
export const Pending: Story = {
  args: { name: 'Gégé Marteau', image: placeholderPortrait('Gégé Marteau', '#e63946'), pending: true },
};

/** Pending and selected: the ring and the sweep together, as on first load. */
export const PendingSelected: Story = {
  args: {
    name: 'Victor Lemarchand',
    image: placeholderPortrait('Victor Lemarchand', '#2f55c7'),
    pending: true,
    selected: true,
  },
};

/**
 * A roster filling in: the first portraits are final, the rest still show
 * their placeholders under the sweep, staggered by column so it reads as one
 * wave across the grid.
 */
export const PendingInRoster: Story = {
  args: { name: '' },
  parameters: { frameWidth: 360 },
  render: () => (
    <Roster>
      {Array.from({ length: 12 }, (_, i) => {
        const c = CAST[i % CAST.length]!;
        const done = i < 5;
        return (
          <CharacterTile
            key={i}
            name={c.name}
            image={done ? PORTRAIT : placeholderPortrait(c.name, PLACEHOLDER_COLOURS[i % 3]!)}
            pending={!done}
            selected={i === 0}
          />
        );
      })}
    </Roster>
  ),
};

/** In the grid, with one selected -- the state the screen is normally in. */
export const InRoster: Story = {
  args: { name: '' },
  parameters: { frameWidth: 360 },
  render: () => (
    <Roster>
      {CAST.concat(CAST).map((c, i) => (
        <CharacterTile key={`${c.id}-${i}`} name={c.name} image={PORTRAIT} selected={i === 1} />
      ))}
    </Roster>
  ),
};
