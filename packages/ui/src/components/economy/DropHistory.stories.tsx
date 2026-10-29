import type { Meta, StoryObj } from '@storybook/react-vite';

import { DropHistory, type DropHistoryItem } from './DropHistory';

/** Ten drops, newest first, as the game's server keeps them. */
const DROPS: DropHistoryItem[] = [
  { kind: 'coins', grade: 'common', label: '10 politicoins' },
  { kind: 'part', grade: 'mythic', label: 'Roues dorées' },
  { kind: 'coins', grade: 'common', label: '5 politicoins' },
  { kind: 'trail', grade: 'incredible', label: 'Laser' },
  { kind: 'coins', grade: 'rare', label: '50 politicoins' },
  { kind: 'char', grade: 'rare', label: 'Gégé Marteau' },
  { kind: 'coins', grade: 'common', label: '10 politicoins' },
  { kind: 'part', grade: 'rare', label: 'Jantes chromées' },
  { kind: 'coins', grade: 'mythic', label: '500 politicoins' },
  { kind: 'coins', grade: 'common', label: '5 politicoins' },
];

const meta = {
  title: 'Economy/DropHistory',
  component: DropHistory,
  decorators: [
    (Story) => (
      <div style={{ width: 520 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The last Politibox drops as a row of chips, each in its grade’s colour with the kind’s glyph, newest first. Colour only on the chips (no grade sweep: ten of them would be noise under a result card); the newest slide in. The game shows it under the result card and in the shop.',
      },
    },
  },
  args: { title: 'Derniers tirages', drops: DROPS, emptyLabel: 'Aucun tirage pour l’instant.' },
} satisfies Meta<typeof DropHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A new account: the empty line. */
export const Empty: Story = {
  args: { drops: [] },
};

/** Only the last three. */
export const Three: Story = {
  args: { max: 3, title: undefined },
};
