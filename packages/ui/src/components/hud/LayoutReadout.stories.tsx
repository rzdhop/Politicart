import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { CenterAnnounce } from './CenterAnnounce';
import { LayoutReadout } from './LayoutReadout';

const meta = {
  title: 'HUD/LayoutReadout',
  component: LayoutReadout,
  parameters: {
    docs: {
      description: {
        component:
          'The layout the race’s seed drew: a gold caption over the variant’s name in a pill centred under the countdown. Shown during the countdown and the pause, hidden at the green light, on every screen size. The name goes through `setName`.',
      },
    },
  },
  args: { label: 'Tracé du jour', name: 'Jour de manif' },
  decorators: [
    (Story) => (
      <HudStage width={520} height={320}>
        <CenterAnnounce>3</CenterAnnounce>
        <Story />
      </HudStage>
    ),
  ],
} satisfies Meta<typeof LayoutReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AtTheCountdown: Story = {};

/** A longer name wraps inside the pill. */
export const LongName: Story = { args: { name: 'Travaux du Faubourg Saint-Honoré' } };
