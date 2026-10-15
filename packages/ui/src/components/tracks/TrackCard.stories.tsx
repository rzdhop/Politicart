import type { Meta, StoryObj } from '@storybook/react-vite';

import { TrackPreview } from '../../stories/fixtures';
import { CardGrid } from './CardGrid';
import { TrackCard } from './TrackCard';

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
          'A selectable card for one circuit. The whole card is the hit target rather than a link buried in it, and it reports `aria-pressed` so the current choice is announced.',
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
