import type { Meta, StoryObj } from '@storybook/react-vite';

import { OddsTable } from './OddsTable';

/** The game's odds (engine/catalog.js BOX_ODDS and COIN_DROPS). */
const ROWS = [
  { label: 'Candidat·e', odds: 0.02 },
  { label: 'Pièce ou traînée', odds: 0.04 },
  { label: 'Politicoins', odds: 0.94 },
  { label: '5 politicoins', odds: 0.4, sub: true },
  { label: '10 politicoins', odds: 0.3, sub: true },
  { label: '50 politicoins', odds: 0.16, sub: true },
  { label: '100 politicoins', odds: 0.06, sub: true },
  { label: '500 politicoins', odds: 0.02, sub: true },
];

const meta = {
  title: 'Economy/OddsTable',
  component: OddsTable,
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
          'The Politibox odds as a real table: each kind of prize and its share of every opening, the coin tiers indented under their line, with a caption for the price and the rules. Row headers carry the labels for screen readers. The game shows it on the shop’s Politibox tab.',
      },
    },
  },
  args: {
    caption:
      'Une urne dorée à 120 politicoins, ou cinq pour 550. On y trouve un·e candidat·e 2 % du temps, une pièce de kart ou une traînée 4 % du temps, et le reste du temps des politicoins. Un doublon est remboursé selon sa rareté.',
    rows: ROWS,
  },
} satisfies Meta<typeof OddsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With column headings and no caption. */
export const WithHeaders: Story = {
  args: { caption: undefined, headers: ['Lot', 'Chances'] },
};
