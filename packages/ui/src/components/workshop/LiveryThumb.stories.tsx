import type { Meta, StoryObj } from '@storybook/react-vite';

import { PORTRAIT } from '../../stories/fixtures';
import { AdminGrid } from './AdminGrid';
import { LiveryThumb } from './LiveryThumb';

const meta = {
  title: 'Workshop/LiveryThumb',
  component: LiveryThumb,
  decorators: [
    (Story) => (
      <AdminGrid>
        <Story />
      </AdminGrid>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A 64x40 preview of an uploaded kart livery. Covers its box over a dark backing, so a transparent or very light image still reads as a thumbnail. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof LiveryThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { src: PORTRAIT, alt: '' } };

/** Nothing uploaded yet: the dark backing is what the empty slot looks like. */
export const NoImage: Story = { args: { alt: '' } };
