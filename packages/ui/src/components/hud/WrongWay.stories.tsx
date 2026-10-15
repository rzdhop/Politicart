import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { WrongWay } from './WrongWay';

const meta = {
  title: 'HUD/WrongWay',
  component: WrongWay,
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
          'The wrong-way warning: the only red text in the HUD, which is what makes it register instantly. Keep it mounted and toggle the `hidden` attribute — the engine re-evaluates the condition every frame.',
      },
    },
  },
} satisfies Meta<typeof WrongWay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warning: Story = { args: { children: 'SENS INTERDIT !' } };

/** Hidden, which is the state it is in for almost all of a race. */
export const Hidden: Story = { args: { hidden: true, children: 'SENS INTERDIT !' } };
