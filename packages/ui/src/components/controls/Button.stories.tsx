import type { Meta, StoryObj } from '@storybook/react-vite';

import { Row } from '../foundation/Row';
import { Button } from './Button';

const meta = {
  title: 'Controls/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'The system’s button. Gold and sitting on a 5px hard shadow for the primary action; transparent with a hairline border for everything else. Keyboard focus draws a white ring — do not suppress it, the game is played from the keyboard.',
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { children: 'Lancer la course !' } };

export const Ghost: Story = { args: { variant: 'ghost', children: 'Retour' } };

export const Disabled: Story = { args: { disabled: true, children: 'Jouer' } };

/** At most one primary per row: it marks the action that moves the player forward. */
export const InARow: Story = {
  render: () => (
    <Row>
      <Button>Choisir le circuit →</Button>
      <Button variant="ghost">Retour</Button>
    </Row>
  ),
};

/** The ghost variant also carries the title screen's toggles. */
export const Toggles: Story = {
  render: () => (
    <Row>
      <Button variant="ghost">Graphismes : détaillés (ombres)</Button>
      <Button variant="ghost">Son : activé</Button>
    </Row>
  ),
};
