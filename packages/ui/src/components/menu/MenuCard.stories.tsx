import type { Meta, StoryObj } from '@storybook/react-vite';

import { CoinCount } from '../economy/CoinCount';
import { MenuCard } from './MenuCard';
import { MenuGlyph } from './MenuGlyph';

const fr = (n: number) => n.toLocaleString('fr-FR');

function CardRow() {
  return (
    <div className="menu-cards">
      <MenuCard icon={<MenuGlyph name="multi" />} label="Multijoueur" sub="Bleu contre Rouge" />
      <MenuCard tone="gold" icon={<MenuGlyph name="shop" />} label="Boutique" sub={<CoinCount size="sm" value={1250} format={fr} />} />
      <MenuCard tone="red" icon={<MenuGlyph name="account" />} label="Compte" sub="se connecter" />
    </div>
  );
}

const meta = {
  title: 'Menu/MenuCard',
  component: MenuCard,
  decorators: [(Story) => <div style={{ width: 220 }}><Story /></div>],
  parameters: {
    docs: {
      description: {
        component:
          'A secondary menu entry big enough to be a destination: a glass card with a coloured glyph tile (Marianne blue, republican red or parliament gold), the entry’s name in display type and one line of context (a balance, who is signed in). An optional red count bubble on its corner. Lifts and glows in its tone on hover and focus while its glyph wiggles; presses down like the gold button. In a `.menu-cards` row the cards share the width: glyph above the text when the row is narrow, beside it from 420px (and on a phone held sideways). At least 44px tall.',
      },
    },
  },
  args: { icon: <MenuGlyph name="multi" />, label: 'Multijoueur', sub: 'Bleu contre Rouge' },
} satisfies Meta<typeof MenuCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Gold: Story = {
  args: { tone: 'gold', icon: <MenuGlyph name="shop" />, label: 'Boutique', sub: <CoinCount size="sm" value={1250} format={fr} /> },
};

/** Signed in, with two friend requests waiting. */
export const WithBadge: Story = {
  args: { tone: 'red', icon: <MenuGlyph name="account" />, label: 'Compte', sub: 'Marianne · niv. 4', badge: '✉ 2', badgeLabel: '2 demandes d’ami' },
};

/** The title's row on a wide screen: glyph beside the text. */
export const Row: Story = {
  decorators: [(Story) => <div style={{ width: 560 }}><Story /></div>],
  render: () => <CardRow />,
};

/** The same row on a phone: glyph above the text. */
export const NarrowRow: Story = {
  decorators: [(Story) => <div style={{ width: 358 }}><Story /></div>],
  render: () => <CardRow />,
};
