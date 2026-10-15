import type { Meta, StoryObj } from '@storybook/react-vite';

import { TrackPreview } from '../../stories/fixtures';
import { CardGrid } from './CardGrid';
import { TrackCard } from './TrackCard';

const meta = {
  title: 'Tracks/CardGrid',
  component: CardGrid,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A responsive grid of cards: as many 230px columns as fit, capped at 980px. The three circuits sit in one row on a desktop and stack on a phone with no media query.',
      },
    },
  },
} satisfies Meta<typeof CardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    style: { padding: 24 },
    children: (
      <>
        <TrackCard name="L’Élysée" description="Tour du palais." preview={<TrackPreview />} />
        <TrackCard name="Palais Bourbon" description="Quais de Seine." preview={<TrackPreview />} />
        <TrackCard name="Versailles" description="Jardins du Congrès." preview={<TrackPreview />} />
      </>
    ),
  },
};
