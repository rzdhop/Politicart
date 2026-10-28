import type { Meta, StoryObj } from '@storybook/react-vite';

import { GRADE_LABELS } from '../../stories/fixtures';
import { Row } from '../foundation/Row';
import { GRADES, GradeBadge } from './GradeBadge';

const meta = {
  title: 'Economy/GradeBadge',
  component: GradeBadge,
  parameters: {
    docs: {
      description: {
        component:
          'A pill naming an item’s grade in that grade’s colour. Common is quiet; rare carries a light sweep, mythic a breathing glow over sparkles, incredible a rotating rainbow ring. All motion is off under `prefers-reduced-motion`. The label is the game’s (French here); the default is the English id.',
      },
    },
  },
  args: { grade: 'rare', label: GRADE_LABELS.rare },
} satisfies Meta<typeof GradeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Common: Story = { args: { grade: 'common', label: GRADE_LABELS.common } };

export const Mythic: Story = { args: { grade: 'mythic', label: GRADE_LABELS.mythic } };

export const Incredible: Story = { args: { grade: 'incredible', label: GRADE_LABELS.incredible } };

/** The four grades side by side, in both sizes. */
export const AllFourGrades: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 14 }}>
      <Row>
        {GRADES.map((grade) => (
          <GradeBadge key={grade} grade={grade} label={GRADE_LABELS[grade]} />
        ))}
      </Row>
      <Row>
        {GRADES.map((grade) => (
          <GradeBadge key={grade} grade={grade} label={GRADE_LABELS[grade]} size="sm" />
        ))}
      </Row>
    </div>
  ),
};

/** Without a label: the English id, capitalised. */
export const DefaultLabel: Story = { args: { grade: 'mythic', label: undefined } };
