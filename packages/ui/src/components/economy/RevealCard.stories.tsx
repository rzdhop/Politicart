import type { Meta, StoryObj } from '@storybook/react-vite';

import { GRADE_LABELS } from '../../stories/fixtures';
import { Button } from '../controls/Button';
import { Row } from '../foundation/Row';
import { CoinCount } from './CoinCount';
import { RevealCard } from './RevealCard';

const meta = {
  title: 'Economy/RevealCard',
  component: RevealCard,
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The result card of a Politibox opening: the kind’s glyph (a rosette, a wheel, a comet, coins), a caption, the prize’s name with a duplicate’s refund line under it, and its grade badge; the balance and the buttons come as children. It carries `grade-<g>` like a shop card, so a rare or better prize gets the grade’s motion.',
      },
    },
  },
  args: {
    kind: 'char',
    name: 'Candidat : Lucie Vasseur',
    grade: 'common',
    gradeLabel: GRADE_LABELS.common,
    caption: 'La Politibox vous offre',
  },
} satisfies Meta<typeof RevealCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <RevealCard {...args}>
      <CoinCount value={430} label="politicoins" />
      <Row>
        <Button>Encore une !</Button>
        <Button variant="ghost">Retour à la boutique</Button>
      </Row>
    </RevealCard>
  ),
};

/** A mythic part already owned: the refund line reads under the name. */
export const DuplicatePart: Story = {
  args: {
    kind: 'part',
    name: 'Pièce : Roues dorées',
    grade: 'mythic',
    gradeLabel: GRADE_LABELS.mythic,
    refund: 'Doublon : +400 politicoins remboursés',
  },
};

/** An incredible trail, with the rainbow ring. */
export const IncredibleTrail: Story = {
  args: { kind: 'trail', name: 'Traînée : Laser', grade: 'incredible', gradeLabel: GRADE_LABELS.incredible },
};

/** A big coin win takes a grade by its size. */
export const Coins: Story = {
  args: { kind: 'coins', name: '500 politicoins', grade: 'rare', gradeLabel: GRADE_LABELS.rare },
};
