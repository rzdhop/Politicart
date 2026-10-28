import type { Meta, StoryObj } from '@storybook/react-vite';

import { Row } from '../foundation/Row';
import { Button } from '../controls/Button';
import { CoinCount } from './CoinCount';

const meta = {
  title: 'Economy/CoinCount',
  component: CoinCount,
  parameters: {
    docs: {
      description: {
        component:
          'A politicoin total: the coin glyph and the number in gold display type, with tabular digits so a ticking count never jitters. The number is its own element (`valueProps`), which is where the game puts `id="coins"`. Formatting is the consumer’s: the game passes an `fr-FR` formatter.',
      },
    },
  },
  args: { value: 1250, format: (n: number) => n.toLocaleString('fr-FR') },
} satisfies Meta<typeof CoinCount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = { args: { label: 'politicoins' } };

/** The three sizes: a price, a title-bar total, a race reward. */
export const Sizes: Story = {
  render: (args) => (
    <Row>
      <CoinCount {...args} value={300} size="sm" />
      <CoinCount {...args} value={1250} />
      <CoinCount {...args} value={12000} size="lg" label="politicoins" />
    </Row>
  ),
};

/** In a title bar, beside the shop button, as the game shows it. */
export const InTitleBar: Story = {
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: 420 }}>
      <CoinCount {...args} valueProps={{ id: 'story-coins' }} />
      <Button variant="ghost">Boutique</Button>
    </div>
  ),
};

export const Zero: Story = { args: { value: 0 } };
