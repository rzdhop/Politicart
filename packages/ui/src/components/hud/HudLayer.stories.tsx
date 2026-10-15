import type { Meta, StoryObj } from '@storybook/react-vite';

import { HudCorner } from './HudCorner';
import { HudHint } from './HudHint';
import { HudLayer } from './HudLayer';
import { ItemSlot } from './ItemSlot';
import { LapCounter } from './LapCounter';
import { MinimapFrame } from './MinimapFrame';
import { PositionReadout } from './PositionReadout';
import { PowerGauge } from './PowerGauge';
import { RaceTimer } from './RaceTimer';
import { DriftGauge } from './DriftGauge';
import { SpeedReadout } from './SpeedReadout';

const meta = {
  title: 'HUD/HudLayer',
  component: HudLayer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The in-race overlay: fixed to all four edges, `pointer-events: none` so clicks fall through to the game, and tabular numerals so a counting clock does not jitter as digits change width. Holds the four corners and the full-width overlays.',
      },
    },
  },
} satisfies Meta<typeof HudLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The whole HUD as it appears mid-race, over a stand-in for the track.
 *
 * This is the composition the system is really for: position, lap and clock
 * top-left; minimap top-right; item, power and hint bottom-left; speed and
 * drift bottom-right.
 */
export const MidRace: Story = {
  render: () => (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        background: 'linear-gradient(160deg,#5b86c4 0 38%,#6f9a55 38% 62%,#9a9a92 62% 100%)',
      }}
    >
      <HudLayer style={{ position: 'absolute' }}>
        <HudCorner corner="topLeft">
          <PositionReadout position={3} />
          <LapCounter>TOUR 2/3</LapCounter>
          <RaceTimer>1:12.46 · meilleur 0:35.20</RaceTimer>
        </HudCorner>
        <HudCorner corner="topRight">
          <MinimapFrame />
        </HudCorner>
        <HudCorner corner="bottomLeft">
          <ItemSlot icon="🚀" label="49.3 Turbo" filled />
          <PowerGauge name="Grand débat" charge={0.62} keyHint="F · recharge" />
          <HudHint>Appuyez sur Ctrl pour utiliser l’objet.</HudHint>
        </HudCorner>
        <HudCorner corner="bottomRight">
          <SpeedReadout value={138} />
          <DriftGauge value={0.45} />
        </HudCorner>
      </HudLayer>
    </div>
  ),
};
