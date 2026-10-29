import type { Meta, StoryObj } from '@storybook/react-vite';

import { TeamStandings } from './TeamStandings';

const meta = {
  title: 'Results/TeamStandings',
  component: TeamStandings,
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The teams’ totals after a team race: rank in gold, the team’s swatch and name over a bar as long as its share of the best score, points in monospace. A table, styled like `ResultsTable`, so the two read as one page.',
      },
    },
  },
  args: {
    rankLabel: (n: number) => n + (n === 1 ? 'er' : 'e'),
    teams: [
      { key: 'bleu', name: 'Équipe Bleu', points: 24, detail: '3 pilotes', color: 'var(--blue)', you: true },
      { key: 'rouge', name: 'Équipe Rouge', points: 18, detail: '3 pilotes', color: 'var(--red)' },
    ],
  },
} satisfies Meta<typeof TeamStandings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A tie on points. */
export const Tie: Story = {
  args: {
    teams: [
      { key: 'rouge', name: 'Équipe Rouge', points: 20, detail: '2 pilotes', color: 'var(--red)' },
      { key: 'bleu', name: 'Équipe Bleu', points: 20, detail: '2 pilotes', color: 'var(--blue)' },
    ],
  },
};
