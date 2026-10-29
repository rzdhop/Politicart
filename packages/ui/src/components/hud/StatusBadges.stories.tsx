import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusBadges } from './StatusBadges';

const meta = {
  title: 'HUD/StatusBadges',
  component: StatusBadges,
  parameters: {
    docs: {
      description: {
        component:
          'What is happening to the player’s kart: one badge per status, glyph, name and time left. Hindrances read red, help reads green; a new badge slides in (off under reduced motion). Timers change every frame, so the game drives the list through `setStatuses`, which keeps each badge by id and rewrites a timer only when its tenth changes. On a phone the names fold away and the glyphs and timers stay.',
      },
    },
  },
} satisfies Meta<typeof StatusBadges>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Caught in a tear-gas cloud: slowed and confused. */
export const Gassed: Story = {
  args: {
    statuses: [
      { id: 'slowed', icon: '🐌', label: 'Ralenti', time: 1.3 },
      { id: 'confused', icon: '🌀', label: 'Désorienté', time: 0.8 },
    ],
  },
};

/** A European directive and a budget cut at once. */
export const Capped: Story = {
  args: {
    statuses: [
      { id: 'capped', icon: '🇪🇺', label: 'Bridé à 110', time: 2.6 },
      { id: 'rabot', icon: '🪚', label: 'Raboté', time: 3.4 },
    ],
  },
};

/** What helps: a shield waiting, a relance with two boosts left, a loophole. */
export const Helped: Story = {
  args: {
    statuses: [
      { id: 'shield', icon: '🤐', label: 'Langue de bois', time: 21.7, tone: 'good' },
      { id: 'relance', icon: '💶', label: 'Plan de relance', count: 2, tone: 'good' },
      { id: 'phantom', icon: '🧾', label: 'Niche fiscale', time: 4.2, tone: 'good' },
    ],
  },
};

/** Nothing on the kart: the list is empty and takes no room. */
export const Clear: Story = { args: { statuses: [] } };
