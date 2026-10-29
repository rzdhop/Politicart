import type { Meta, StoryObj } from '@storybook/react-vite';

import { TRACK_CLIMATES, TRACK_FIGURES, TRACK_FIGURES_BEST, TRACK_LAYOUTS } from '../../stories/fixtures';
import { TrackMeta } from './TrackMeta';

const meta = {
  title: 'Tracks/TrackMeta',
  component: TrackMeta,
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A circuit at a glance, under its card’s preview: figure chips (length, climb, width, laps, the player’s best lap in gold), the names of its three layout variants, and the glyphs of the climates it can be raced in. Built from spans with list roles, so it fits inside the `TrackCard` button.',
      },
    },
  },
  args: {
    items: TRACK_FIGURES,
    layouts: TRACK_LAYOUTS,
    layoutsLabel: 'Tracés',
    climates: TRACK_CLIMATES,
    climatesLabel: 'Climats',
  },
} satisfies Meta<typeof TrackMeta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With the player's best lap on this circuit, from their stats. */
export const WithBestLap: Story = { args: { items: TRACK_FIGURES_BEST } };

/** Figures only. */
export const FiguresOnly: Story = { args: { layouts: undefined, climates: undefined } };
