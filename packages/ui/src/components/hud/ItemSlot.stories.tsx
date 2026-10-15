import type { Meta, StoryObj } from '@storybook/react-vite';

import { ItemSlot } from './ItemSlot';

const meta = {
  title: 'HUD/ItemSlot',
  component: ItemSlot,
  parameters: {
    docs: {
      description: {
        component:
          'The held-item slot. When it holds something it gains a gold border and glow — the HUD’s one piece of "you can act now" signalling. Gold means an item; green means a power.',
      },
    },
  },
} satisfies Meta<typeof ItemSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty, as the slot starts every race. */
export const Empty: Story = { args: { icon: '·', label: 'aucun objet' } };

export const Holding: Story = { args: { icon: '🚀', label: '49.3 Turbo', filled: true } };

/** A long item name, which wraps rather than overflowing the square. */
export const LongName: Story = {
  args: { icon: '📄', label: 'Dossier Mediapart', filled: true },
};

/** Several of the fourteen items, so the glyph row reads as a set. */
export const Several: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <ItemSlot icon="🚀" label="49.3 Turbo" filled />
      <ItemSlot icon="🪧" label="Grève surprise" filled />
      <ItemSlot icon="🚁" label="Hélico présidentiel" filled />
      <ItemSlot icon="·" label="aucun objet" />
    </div>
  ),
};
