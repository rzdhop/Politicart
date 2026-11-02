import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { GoalTracker } from './GoalTracker';

const meta = {
  title: 'HUD/GoalTracker',
  component: GoalTracker,
  parameters: {
    docs: {
      description: {
        component:
          'The run’s three goals in the HUD’s corner: a box that ticks, the sentence and how far along it is. A goal reached turns gold and flashes once. Rows are patched in place through `setGoals`, never re-rendered mid-race.',
      },
    },
  },
  args: {
    label: 'Objectifs',
    goals: [
      { text: 'Réussir 2 super mini-turbos', have: 1, target: 2, done: false },
      { text: 'Ramasser 15 politicoins', have: 15, target: 15, done: true },
      { text: 'Finir sur le podium', have: 0, target: 1, done: false },
    ],
  },
  decorators: [
    (Story) => (
      <HudStage width={420} height={200}>
        <div style={{ position: 'absolute', left: 16, top: 16 }}>
          <Story />
        </div>
      </HudStage>
    ),
  ],
} satisfies Meta<typeof GoalTracker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MidRace: Story = {};

/** Every goal reached at the line. */
export const AllDone: Story = {
  args: {
    goals: [
      { text: 'Toucher 3 adversaires', have: 3, target: 3, done: true },
      { text: 'Utiliser 5 objets', have: 5, target: 5, done: true },
      { text: 'Gagner la course', have: 1, target: 1, done: true },
    ],
  },
};
