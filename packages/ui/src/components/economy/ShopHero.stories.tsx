import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../controls/Button';
import { ShopHero } from './ShopHero';

const meta = {
  title: 'Economy/ShopHero',
  component: ShopHero,
  parameters: {
    docs: {
      description: {
        component:
          'The Boutique’s headline banner: the golden urne on its turning rays, the title in gold display type, a tagline, the odds as chips and the buttons that open a Politibox. It outshines every card under it on purpose: it is the shop’s first call to action. Under reduced motion the rays and the urne stand still.',
      },
    },
  },
  args: {
    title: 'La Politibox',
    tagline: 'Un·e candidat·e, une pièce rare ou une traînée : tout peut sortir de l’urne.',
    perks: [
      { label: 'Candidat·e', value: '2 %' },
      { label: 'Pièce ou traînée', value: '4 %' },
      { label: 'Jackpot', value: '500' },
    ],
    flag: 'Jackpot !',
  },
} satisfies Meta<typeof ShopHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** As the game shows it: the two open buttons. */
export const Default: Story = {
  render: (args) => (
    <div style={{ width: 760 }}>
      <ShopHero {...args}>
        <Button>Ouvrir · 120</Button>
        <Button variant="ghost">Ouvrir ×5 · 550</Button>
      </ShopHero>
    </div>
  ),
};

/** Too poor to open one: the buttons wait. */
export const Broke: Story = {
  render: (args) => (
    <div style={{ width: 760 }}>
      <ShopHero {...args} flag={undefined}>
        <Button disabled>Ouvrir · 120</Button>
      </ShopHero>
    </div>
  ),
};

/** On a phone. */
export const Narrow: Story = {
  render: (args) => (
    <div style={{ width: 360 }}>
      <ShopHero {...args}>
        <Button>Ouvrir · 120</Button>
      </ShopHero>
    </div>
  ),
};
