import type { Meta, StoryObj } from '@storybook/react-vite';

import { TrailStrip } from './TrailStrip';

const meta = {
  title: 'Economy/TrailStrip',
  component: TrailStrip,
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 80 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A kart’s trail, previewed in CSS alone: a little kart at the right end and its trail streaming behind it (the tricolour ribbon, smoke, sparkles, confetti, a laser line). The stream scrolls through `fx.css` and stands still under reduced motion. The shop uses it as a trail’s `ShopCard` picture.',
      },
    },
  },
  args: { trail: 'ribbon', label: 'Ruban tricolore' },
} satisfies Meta<typeof TrailStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ribbon: Story = {};
export const Smoke: Story = { args: { trail: 'smoke', label: 'Fumée' } };
export const Sparkles: Story = { args: { trail: 'sparkles', label: 'Étincelles' } };
export const Confetti: Story = { args: { trail: 'confetti', label: 'Confettis' } };
export const Laser: Story = { args: { trail: 'laser', label: 'Laser' } };
