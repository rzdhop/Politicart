import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { HitVignette } from './HitVignette';

const meta = {
  title: 'HUD/HitVignette',
  component: HitVignette,
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
          'The screen’s edges, tinted: red when the player’s kart is hit, gold for a lap completed, blue while it boosts. A level from 0 to 1 the game sets every frame (the engine’s flash decays on its own, so the component holds no timer), plus a keyframed `flash()` that reduced motion switches off. Never takes a pointer.',
      },
    },
  },
} satisfies Meta<typeof HitVignette>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The instant after a hit: the edges at full red. */
export const Hit: Story = { args: { level: 1, tone: 'hit' } };

/** Fading out, half a second later. */
export const Fading: Story = { args: { level: 0.35, tone: 'hit' } };

/** A lap completed: the gold flash. */
export const Lap: Story = { args: { level: 0.8, tone: 'lap' } };

/** Boosting: a faint cool rim. */
export const Boost: Story = { args: { level: 0.3, tone: 'boost' } };
