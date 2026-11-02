import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { CoinMeter } from './CoinMeter';

const meta = {
  title: 'HUD/CoinMeter',
  component: CoinMeter,
  parameters: {
    docs: {
      description: {
        component:
          'The politicoins the kart carries: a gold coin, the count over the most it can carry and a bar that fills with them. A rise pops the meter, a full meter glows. Written through `setCoins` from the game loop.',
      },
    },
  },
  args: { coins: 4, max: 10 },
  decorators: [
    (Story) => (
      <HudStage width={320} height={120}>
        <div style={{ position: 'absolute', left: 16, top: 16 }}>
          <Story />
        </div>
      </HudStage>
    ),
  ],
} satisfies Meta<typeof CoinMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Carrying: Story = {};

/** Nothing picked yet. */
export const Empty: Story = { args: { coins: 0 } };

/** The most a kart carries: the meter glows. */
export const Full: Story = { args: { coins: 10 } };
