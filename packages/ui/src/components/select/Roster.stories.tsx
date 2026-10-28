import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, PORTRAIT } from '../../stories/fixtures';
import { Button } from '../controls/Button';
import { ControlsGrid } from '../controls/ControlsGrid';
import { KeyCap } from '../controls/KeyCap';
import { Row } from '../foundation/Row';
import { Disclaimer } from '../typography/Disclaimer';
import { CharacterTile } from './CharacterTile';
import { Roster } from './Roster';

const meta = {
  title: 'Select/Roster',
  component: Roster,
  decorators: [
    (Story) => (
      <div style={{ width: 380 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The four-across grid of character tiles. Four columns is deliberate rather than auto-fitting: the roster’s shape is part of the screen’s composition, so the eleven-strong cast reads as three full rows and a short one. The optional `footer` spans the grid under the last row: on wide screens, the button row, the keyboard legend and the small print, left-aligned with the tiles.',
      },
    },
  },
} satisfies Meta<typeof Roster>;

export default meta;
type Story = StoryObj<typeof meta>;

const fullCast = Array.from({ length: 11 }, (_, i) => {
  const c = CAST[i % CAST.length]!;
  return <CharacterTile key={i} name={c.name} image={PORTRAIT} selected={i === 0} />;
});

/** Eleven tiles, as the game has: three full rows and a short one. */
export const FullCast: Story = { args: { children: fullCast } };

/**
 * With the `footer` filled, as the wide select screen lays out its left
 * column: the game's three buttons (one primary, last, which wraps to its own
 * line in a 400px column), the keyboard legend, and the line that tells the
 * player the podium turns. Rows centre by default; in the footer they line up
 * with the tiles.
 */
export const WithFooter: Story = {
  args: {
    children: fullCast,
    footer: (
      <>
        <Row>
          <Button variant="ghost">Retour</Button>
          <Button variant="ghost">Garage</Button>
          <Button>Choisir le circuit →</Button>
        </Row>
        <ControlsGrid>
          <div>
            <KeyCap>←</KeyCap> <KeyCap>→</KeyCap> <KeyCap>↑</KeyCap> <KeyCap>↓</KeyCap> choisir ·{' '}
            <KeyCap>Entrée</KeyCap> valider
          </div>
        </ControlsGrid>
        <Disclaimer>Glissez sur la scène pour faire pivoter le podium.</Disclaimer>
      </>
    ),
  },
};
