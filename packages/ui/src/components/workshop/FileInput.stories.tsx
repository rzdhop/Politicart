import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminGrid } from './AdminGrid';
import { Field } from './Field';
import { FileInput } from './FileInput';

const meta = {
  title: 'Workshop/FileInput',
  component: FileInput,
  decorators: [
    (Story) => (
      <AdminGrid style={{ width: 300 }}>
        <Story />
      </AdminGrid>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A file picker, styled only as 12px muted text. Deliberately plain: the browser’s own button is left alone so the control stays recognisable. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof FileInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One kart livery. */
export const Default: Story = { args: { accept: 'image/*' } };

/** Several campaign posters at once, as the workshop accepts them. */
export const Multiple: Story = {
  render: () => (
    <Field label="Affiches de campagne (jusqu’à 8 images)">
      <FileInput accept="image/*" multiple />
    </Field>
  ),
};
