import type { Meta, StoryObj } from '@storybook/react-vite';

import { CONTROLS } from '../../stories/fixtures';
import { ControlsGrid } from './ControlsGrid';
import { KeyCap } from './KeyCap';

const meta = {
  title: 'Controls/ControlsGrid',
  component: ControlsGrid,
  parameters: {
    docs: {
      description: {
        component:
          'The keyboard legend: one line per control, in columns that reflow. Required for KeyCap to be styled at all, since the chip comes from the descendant rule `.controls b`.',
      },
    },
  },
} satisfies Meta<typeof ControlsGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The game's full legend. */
export const Default: Story = {
  args: {
    children: CONTROLS.map(([keys, action]) => (
      <div key={action}>
        {keys.map((k, i) => (
          <span key={k}>
            {i > 0 ? ' / ' : null}
            <KeyCap>{k}</KeyCap>
          </span>
        ))}{' '}
        {action}
      </div>
    )),
  },
};

/** Narrow enough to collapse to a single column. */
export const SingleColumn: Story = {
  args: {
    style: { maxWidth: 180 },
    children: (
      <>
        <div>
          <KeyCap>Échap</KeyCap> pause
        </div>
        <div>
          <KeyCap>M</KeyCap> son
        </div>
      </>
    ),
  },
};
