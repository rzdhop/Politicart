import type { Meta, StoryObj } from '@storybook/react-vite';

import { TRACK_CLIMATES, TRACK_FIGURES_BEST, TRACK_LAYOUTS, TrackPreview, TrackThumbnail } from '../../stories/fixtures';
import { CardGrid } from './CardGrid';
import { TrackCard } from './TrackCard';
import { TrackMeta } from './TrackMeta';

const meta = {
  title: 'Tracks/TrackCard',
  component: TrackCard,
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A selectable card for one circuit: its name, a 16:9 preview (the circuit’s outline while its rendered bird’s-eye thumbnail is on its way, with a light sweep, then the thumbnail), a description and a `TrackMeta`. The whole card is the hit target rather than a link buried in it, and it reports `aria-pressed` so the current choice is announced.',
      },
    },
  },
} satisfies Meta<typeof TrackCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'L’Élysée — Faubourg Saint-Honoré',
    description:
      'Tour du palais, de la cour d’honneur et des boutiques du Faubourg. Garde républicaine, berlines noires et meute de photographes.',
    preview: <TrackPreview />,
  },
};

export const Selected: Story = {
  args: { ...Default.args, selected: true },
};

/** The rendered thumbnail and the circuit's figures, as the circuits screen shows them. */
export const WithThumbnailAndMeta: Story = {
  args: {
    name: 'Montmartre — La Butte',
    description: 'Montée pavée vers le Sacré-Cœur, place du Tertre et ses peintres.',
    preview: <TrackThumbnail />,
    thumb: 'ready',
    meta: <TrackMeta items={TRACK_FIGURES_BEST} layouts={TRACK_LAYOUTS} layoutsLabel="Tracés" climates={TRACK_CLIMATES} climatesLabel="Climats" />,
    selected: true,
  },
};

/** The outline stands in while the thumbnail renders: the frame carries a slow sweep. */
export const ThumbnailPending: Story = {
  args: { ...Default.args, thumb: 'pending' },
};

/** Name only: no preview, no description. */
export const Minimal: Story = { args: { name: 'Versailles — jardins du Congrès' } };

/** The three circuits side by side, as the track screen shows them. */
export const InGrid: Story = {
  args: { name: '' },
  decorators: [],
  render: () => (
    <div style={{ width: 760 }}>
      <CardGrid>
        <TrackCard
          name="L’Élysée"
          description="Tour du palais et des boutiques du Faubourg."
          preview={<TrackPreview />}
          selected
        />
        <TrackCard
          name="Palais Bourbon"
          description="Quais de Seine, ponts et bateaux-mouches."
          preview={<TrackPreview />}
        />
        <TrackCard
          name="Versailles"
          description="Jardins du Congrès, gravier et parterres."
          preview={<TrackPreview />}
        />
      </CardGrid>
    </div>
  ),
};
