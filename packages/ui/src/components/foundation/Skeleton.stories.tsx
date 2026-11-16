import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './Skeleton';

const meta = {
  title: 'Foundation/Skeleton',
  component: Skeleton,
  decorators: [
    (Story) => (
      <div style={{ width: 260, display: 'grid', gap: 10 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A placeholder in the shape of what is loading: a dim block crossed by the light sweep the pending tiles and thumbnails use. The caller sizes it, so nothing shifts when the content arrives.',
      },
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A block the caller sizes: a card, a stage, a panel. */
export const Default: Story = { args: { style: { height: 120 } } };

/** Announced: a busy status under the label it is given. */
export const Labelled: Story = { args: { label: 'Chargement des statistiques', style: { height: 80 } } };

/** Lines in place of a paragraph. */
export const Lines: Story = {
  args: { shape: 'line' },
  render: (args) => (
    <>
      <Skeleton {...args} style={{ width: '90%' }} />
      <Skeleton {...args} style={{ width: '70%' }} />
      <Skeleton {...args} style={{ width: '45%' }} />
    </>
  ),
};

/** A portrait or an icon. */
export const Circle: Story = { args: { shape: 'circle', style: { width: 64, height: 64 } } };
