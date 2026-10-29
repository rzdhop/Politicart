import type { Meta, StoryObj } from '@storybook/react-vite';

import { GainBreakdown } from './GainBreakdown';

const meta = {
  title: 'Results/GainBreakdown',
  component: GainBreakdown,
  parameters: {
    docs: {
      description: {
        component:
          'What a race earned, line by line: experience, politicoins, the bonuses, each amount counting up from 0 in display type (fx.css, off under reduced motion; the figure stays in the DOM), then gold notes for a level reached or a candidate unlocked.',
      },
    },
  },
  args: {
    lines: [
      { key: 'xp', label: 'XP', value: 40, tone: 'xp' },
      { key: 'coins', label: 'politicoins', value: 60, tone: 'coin' },
      { key: 'daily', label: 'bonus du jour', value: 50, tone: 'bonus' },
    ],
  },
} satisfies Meta<typeof GainBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A level reached, its bonus and a new candidate. */
export const LevelUp: Story = {
  args: {
    lines: [
      { key: 'xp', label: 'XP', value: 90, tone: 'xp' },
      { key: 'coins', label: 'politicoins', value: 45, tone: 'coin' },
      { key: 'level', label: 'politicoins (niveau 2)', value: 200, tone: 'bonus' },
    ],
    notes: ['Niveau 2 atteint !', 'Débloqué : Nathalie Artichaut'],
  },
};
