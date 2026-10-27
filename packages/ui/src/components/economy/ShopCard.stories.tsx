import type { Meta, StoryObj } from '@storybook/react-vite';

import { GRADE_LABELS, PORTRAIT, SHOP_ITEMS } from '../../stories/fixtures';
import { ShopCard } from './ShopCard';

const meta = {
  title: 'Economy/ShopCard',
  component: ShopCard,
  parameters: {
    docs: {
      description: {
        component:
          'One item for sale: grade badge, picture, name, and a footer with the price and one button. The button is primary when the item can be bought, disabled with the reason when it cannot, and disabled reading “owned” (with a gold tick ribbon) once it is. The card carries the grade’s motion like the badge does.',
      },
    },
  },
  args: {
    title: 'Lucie Vasseur',
    subtitle: "L'outsider",
    grade: 'common',
    gradeLabel: GRADE_LABELS.common,
    price: 300,
    image: PORTRAIT,
    buyLabel: 'Acheter',
    ownedLabel: 'Acquis',
    onBuy: () => {},
  },
} satisfies Meta<typeof ShopCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/* One card at its shop width. Per story rather than on the meta, since
   Storybook merges the two lists and the grid story must not be boxed in. */
const narrow: Story['decorators'] = [
  (Story) => (
    <div style={{ width: 260 }}>
      <Story />
    </div>
  ),
];

export const Default: Story = { decorators: narrow };

/** Locked: the button carries the reason and takes no click. */
export const Locked: Story = {
  decorators: narrow,
  args: {
    title: 'Patrick Groseille',
    subtitle: 'Le maire bâtisseur',
    grade: 'rare',
    gradeLabel: GRADE_LABELS.rare,
    price: 800,
    locked: 'Niveau 5 requis',
  },
};

/** Not enough coins: the same lock, another reason. */
export const TooExpensive: Story = {
  decorators: narrow,
  args: {
    title: 'Hubert de Vaulx',
    subtitle: 'Le notable',
    grade: 'mythic',
    gradeLabel: GRADE_LABELS.mythic,
    price: 2000,
    locked: 'Pas assez de politicoins',
  },
};

/** Owned: the tick ribbon and a quiet disabled button. */
export const Owned: Story = { decorators: narrow, args: { owned: true } };

/** A part rather than a candidate: a node in the image area, no subtitle. */
export const Part: Story = {
  decorators: narrow,
  args: {
    title: 'Roues dorées',
    subtitle: undefined,
    grade: 'mythic',
    gradeLabel: GRADE_LABELS.mythic,
    price: 400,
    image: (
      <svg viewBox="0 0 80 80" width="72" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="#a8801c" />
        <circle cx="40" cy="40" r="26" fill="#f2c14e" />
        <circle cx="40" cy="40" r="8" fill="#0c1230" />
      </svg>
    ),
  },
};

/** The shop grid at desktop width: one card per grade, every state. */
export const InGrid: Story = {
  render: (args) => (
    <div className="shop-grid" style={{ width: 'min(960px, 90vw)' }}>
      {SHOP_ITEMS.map((item, i) => (
        <ShopCard
          key={item.id}
          {...args}
          title={item.title}
          subtitle={item.subtitle}
          grade={item.grade}
          gradeLabel={GRADE_LABELS[item.grade]}
          price={item.price}
          owned={i === 0}
          locked={i === 3 ? 'Niveau 12 requis' : undefined}
          buyProps={{ id: `story-buy-${item.id}` }}
        />
      ))}
    </div>
  ),
};
