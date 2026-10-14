import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../controls/Button';
import { Row } from './Row';

const meta = {
  title: 'Foundation/Row',
  component: Row,
  parameters: {
    docs: {
      description: {
        component:
          'A horizontal group that wraps: the system’s button bar. The wrap is what keeps a four-button row usable at phone width.',
      },
    },
  },
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One primary action beside its secondaries. */
export const Default: Story = {
  args: {
    children: (
      <>
        <Button>Jouer</Button>
        <Button variant="ghost">Retour</Button>
      </>
    ),
  },
};

/** The title screen's full bar, which wraps once the viewport narrows. */
export const Wrapping: Story = {
  args: {
    style: { maxWidth: 420 },
    children: (
      <>
        <Button>Jouer</Button>
        <Button variant="ghost">Graphismes : détaillés (ombres)</Button>
        <Button variant="ghost">Son : activé</Button>
        <Button variant="ghost">Atelier (admin)</Button>
      </>
    ),
  },
};
