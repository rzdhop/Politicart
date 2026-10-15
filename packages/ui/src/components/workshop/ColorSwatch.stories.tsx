import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminGrid } from './AdminGrid';
import { ColorSwatch } from './ColorSwatch';
import { ColorsRow } from './ColorsRow';
import { Field } from './Field';

const meta = {
  title: 'Workshop/ColorSwatch',
  component: ColorSwatch,
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
          'A colour picker drawn as a bare 44x30 swatch — no border, no padding: the swatch is the control. Reads and writes `#rrggbb` strings, so a caller storing colours as numbers converts at this boundary. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof ColorSwatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { defaultValue: '#1f3a93' } };

/** The pair the workshop shows per candidate, suit and kart. */
export const Pair: Story = {
  render: () => (
    <ColorsRow>
      <Field label="Costume">
        <ColorSwatch defaultValue="#1a2a5e" />
      </Field>
      <Field label="Kart">
        <ColorSwatch defaultValue="#c8102e" />
      </Field>
    </ColorsRow>
  ),
};
