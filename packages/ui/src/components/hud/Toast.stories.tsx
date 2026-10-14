import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { Toast } from './Toast';

const meta = {
  title: 'HUD/Toast',
  component: Toast,
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
          'The event ribbon. Fades over 200ms rather than appearing, so a burst of events during a race reads as a sequence instead of a flicker. The component holds no timeout of its own — hiding is the caller’s timer — so a race ending mid-toast leaves nothing pending.',
      },
    },
  },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Showing: what `show()` leaves on screen. */
export const Visible: Story = { args: { visible: true, children: 'Mini-turbo !' } };

/** A longer event message. */
export const Longer: Story = {
  args: { visible: true, children: 'Motion de censure sur Gégé Marteau !' },
};

/** Faded out. The text stays in the DOM so the message fades rather than vanishing. */
export const Hidden: Story = { args: { children: 'Mini-turbo !' } };
