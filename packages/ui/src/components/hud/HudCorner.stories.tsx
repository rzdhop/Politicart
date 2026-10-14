import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudStage } from '../../stories/fixtures';
import { DriftGauge } from './DriftGauge';
import { HudCorner } from './HudCorner';
import { LapCounter } from './LapCounter';
import { MinimapFrame } from './MinimapFrame';
import { PositionReadout } from './PositionReadout';
import { RaceTimer } from './RaceTimer';
import { SpeedReadout } from './SpeedReadout';

const meta = {
  title: 'HUD/HudCorner',
  component: HudCorner,
  parameters: {
    docs: {
      description: {
        component:
          'One of the HUD’s four corner groups. Each is inset from the viewport edge, padded past the device safe areas, and stacks its children in the direction that reads outward from that corner.',
      },
    },
  },
} satisfies Meta<typeof HudCorner>;

export default meta;
type Story = StoryObj<typeof meta>;

// These stories compose several components, so they use `render` and supply the
// required props only to satisfy the story type -- `render` ignores args.

/** All four at once, with the assignment the game uses. */
export const FourCorners: Story = {
  args: { corner: 'topLeft' },
  render: () => (
    <HudStage>
      <HudCorner corner="topLeft">
        <PositionReadout position={1} />
        <LapCounter>TOUR 3/3</LapCounter>
        <RaceTimer>2:01.88</RaceTimer>
      </HudCorner>
      <HudCorner corner="topRight">
        <MinimapFrame style={{ width: 100, height: 100 }} />
      </HudCorner>
      <HudCorner corner="bottomLeft">
        <LapCounter>bas gauche</LapCounter>
      </HudCorner>
      <HudCorner corner="bottomRight">
        <SpeedReadout value={96} />
        <DriftGauge value={0.8} />
      </HudCorner>
    </HudStage>
  ),
};

/** The top-left group on its own: a column, stacked downward. */
export const TopLeft: Story = {
  args: { corner: 'topLeft' },
  render: () => (
    <HudStage height={180}>
      <HudCorner corner="topLeft">
        <PositionReadout position={6} />
        <LapCounter>TOUR 1/3</LapCounter>
        <RaceTimer>0:04.12</RaceTimer>
      </HudCorner>
    </HudStage>
  ),
};
