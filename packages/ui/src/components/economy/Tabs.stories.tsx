import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Tabs } from './Tabs';

const SHOP_TABS = [
  { id: 'box', label: 'Politibox', props: { id: 'story-tab-box' } },
  { id: 'chars', label: 'Candidat·es', props: { id: 'story-tab-chars' } },
  { id: 'parts', label: 'Pièces', props: { id: 'story-tab-parts' } },
] as const;

type ShopTab = (typeof SHOP_TABS)[number]['id'];

const meta = {
  title: 'Economy/Tabs',
  component: Tabs<ShopTab>,
  parameters: {
    docs: {
      description: {
        component:
          'A row of tabs under `role="tablist"`: the ChoiceGroup chip a size up and 44px tall for a thumb. The active tab reports `aria-selected` and takes the tab stop; the arrow keys, Home and End move between tabs. The consumer owns the panels.',
      },
    },
  },
  args: { tabs: SHOP_TABS, active: 'box', onChange: () => {} },
} satisfies Meta<typeof Tabs<ShopTab>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AnotherActive: Story = { args: { active: 'parts' } };

/** Interactive: click or arrow through the tabs. */
export const Interactive: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<ShopTab>('chars');
    return (
      <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
        <Tabs {...args} active={active} onChange={setActive} />
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          onglet : <b style={{ color: 'var(--fg)' }}>{active}</b>
        </div>
      </div>
    );
  },
};
