import type { Meta, StoryObj } from '@storybook/react-vite';

import { GRADE_LABELS, KART_PARTS } from '../../stories/fixtures';
import { KartCard } from './KartCard';

const meta = {
  title: 'Economy/KartCard',
  component: KartCard,
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A compact card for one kart: the candidate and their grade badge, the parts as chips with a grade dot each, and the trail on its own line. The game shows it on the pause and results screens.',
      },
    },
  },
  args: {
    name: 'Gégé Marteau',
    title: 'Le syndicaliste',
    grade: 'common',
    gradeLabel: GRADE_LABELS.common,
    parts: KART_PARTS,
    trail: { label: 'Ruban tricolore', grade: 'rare' },
  },
} satisfies Meta<typeof KartCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A mythic candidate on a plain kart with no trail. */
export const PlainKart: Story = {
  args: {
    name: 'Hubert de Vaulx',
    title: 'Le notable',
    grade: 'mythic',
    gradeLabel: GRADE_LABELS.mythic,
    parts: KART_PARTS.map((p) => ({ ...p, grade: 'common' as const, value: 'Série' })),
    trail: null,
  },
};

/** The incredible candidate, every part a drop from the Plitibox. */
export const Incredible: Story = {
  args: {
    name: 'Aymeric de Castelbon',
    title: "L'héritier",
    grade: 'incredible',
    gradeLabel: GRADE_LABELS.incredible,
    trail: { label: 'Laser', grade: 'incredible' },
  },
};

/** With a thumbnail of the kart. */
export const WithImage: Story = {
  args: {
    image:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120" fill="#101a4a"/><rect x="70" y="40" width="160" height="44" rx="12" fill="#c8102e"/><circle cx="100" cy="92" r="16" fill="#222"/><circle cx="200" cy="92" r="16" fill="#222"/><circle cx="100" cy="92" r="7" fill="#f2c14e"/><circle cx="200" cy="92" r="7" fill="#f2c14e"/></svg>',
      ),
  },
};
