import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminGrid } from './AdminGrid';
import { ColorSwatch } from './ColorSwatch';
import { ColorsRow } from './ColorsRow';
import { Field } from './Field';

const meta = {
  title: 'Workshop/ColorsRow',
  component: ColorsRow,
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
        component: 'A row of colour swatches, 14px apart. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof ColorsRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <Field label="Costume">
          <ColorSwatch defaultValue="#1a2a5e" />
        </Field>
        <Field label="Kart">
          <ColorSwatch defaultValue="#1f3a93" />
        </Field>
        <Field label="Cravate">
          <ColorSwatch defaultValue="#2d6cdf" />
        </Field>
      </>
    ),
  },
};
