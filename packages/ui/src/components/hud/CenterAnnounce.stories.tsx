import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { CenterAnnounce } from './CenterAnnounce';

const meta = {
  title: 'HUD/CenterAnnounce',
  component: CenterAnnounce,
  // Absolutely positioned across the upper third, so it needs a stage.
  decorators: [
    (Story) => (
      <HudStage>
        <Story />
      </HudStage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The loudest thing the system can say: white display type with a gold outer glow, pinned across the upper third. The game uses it for the countdown and the word that starts the race, and nothing else. Leave it mounted and empty rather than unmounting it — it occupies no layout space.',
      },
    },
  },
} satisfies Meta<typeof CenterAnnounce>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Countdown: Story = { args: { children: '3' } };

export const Go: Story = { args: { children: 'PARTEZ !' } };
