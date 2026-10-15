import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../controls/Button';
import { Heading } from '../typography/Heading';
import { Panel } from './Panel';
import { Row } from './Row';

const meta = {
  title: 'Foundation/Panel',
  component: Panel,
  parameters: {
    docs: {
      description: {
        component:
          'The frosted surface every menu puts its content on. Translucent fill over a backdrop blur, so menu text stays readable above a moving 3D scene.',
      },
    },
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The pause menu: the shape a panel most often takes. */
export const Default: Story = {
  args: {
    style: { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' },
    children: (
      <>
        <Heading>Suspension de séance</Heading>
        <Row>
          <Button>Reprendre</Button>
          <Button variant="ghost">Quitter la course</Button>
        </Row>
      </>
    ),
  },
};

/** With only text, showing the padding and the hairline border on their own. */
export const TextOnly: Story = {
  args: {
    children: 'Trois tours, cinq adversaires, aucune cohabitation.',
  },
};
