import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminGrid } from './AdminGrid';
import { Field } from './Field';
import { TextInput } from './TextInput';

const meta = {
  title: 'Workshop/TextInput',
  component: TextInput,
  decorators: [
    (Story) => (
      <AdminGrid style={{ width: 260 }}>
        <Story />
      </AdminGrid>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A single-line text input: the body font at 14px on a translucent white fill. The `type` is fixed to `text`, since the style is bound to `.admin input[type=text]` and another type would silently lose it. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { defaultValue: 'Victor Lemarchand' } };

export const Empty: Story = { args: { placeholder: 'Nom du candidat' } };

/** Labelled, which is how the workshop always uses it. */
export const Labelled: Story = {
  render: () => (
    <Field label="Petite phrase">
      <TextInput defaultValue="« Disruptons ce virage. »" />
    </Field>
  ),
};
