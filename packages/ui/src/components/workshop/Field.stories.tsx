import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminGrid } from './AdminGrid';
import { ColorSwatch } from './ColorSwatch';
import { Field } from './Field';
import { FileInput } from './FileInput';
import { TextInput } from './TextInput';

const meta = {
  title: 'Workshop/Field',
  component: Field,
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
          'A labelled form control. Renders a real `<label>` wrapping its caption and control, so clicking the caption focuses the input with no matching id and htmlFor to keep in sync. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTextInput: Story = {
  args: { label: 'Nom', children: <TextInput defaultValue="Victor Lemarchand" /> },
};

export const WithColorSwatch: Story = {
  args: { label: 'Couleur du kart', children: <ColorSwatch defaultValue="#1f3a93" /> },
};

export const WithFileInput: Story = {
  args: { label: 'Livrée', children: <FileInput accept="image/*" /> },
};
