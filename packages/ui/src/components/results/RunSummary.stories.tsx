import type { Meta, StoryObj } from '@storybook/react-vite';

import { RunSummary } from './RunSummary';

const meta = {
  title: 'Results/RunSummary',
  component: RunSummary,
  parameters: {
    docs: {
      description: {
        component:
          'What the run achieved, on the results screen: the three goals as stamps (gold ticks, a 2/3 count), the politicoins picked on the road and the podium streak as a flame. Pairs with GainBreakdown, which says what it all paid.',
      },
    },
  },
  args: {
    goals: [
      { text: 'Réussir 2 super mini-turbos', done: true },
      { text: 'Ramasser 15 politicoins', done: false },
      { text: 'Finir sur le podium', done: true },
    ],
    coins: 12,
    streak: 3,
  },
} satisfies Meta<typeof RunSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoOfThree: Story = {};

/** Every goal reached: the panel turns gold. */
export const Perfect: Story = {
  args: {
    goals: [
      { text: 'Toucher 3 adversaires', done: true },
      { text: 'Utiliser 5 objets', done: true },
      { text: 'Gagner la course', done: true },
    ],
    coins: 21,
    streak: 5,
  },
};

/** A guest's run: the same summary, and an invitation to cash it. */
export const Guest: Story = {
  args: { streak: 0, footer: 'Créez un compte pour encaisser vos objectifs et vos politicoins.' },
};
