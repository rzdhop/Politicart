import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminGrid } from './AdminGrid';
import { Field } from './Field';
import { PasswordInput } from './PasswordInput';
import { TextInput } from './TextInput';

const meta = {
  title: 'Workshop/PasswordInput',
  component: PasswordInput,
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
          'A single-line password input, styled exactly like TextInput with the characters masked. The `type` is fixed to `password`, since the style is bound to `.admin input[type=password]` and another type would silently lose it. **Must be inside an AdminGrid.**',
      },
    },
  },
} satisfies Meta<typeof PasswordInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { defaultValue: 'motdepasse', autoComplete: 'current-password' } };

export const Empty: Story = { args: { placeholder: 'Mot de passe', autoComplete: 'current-password' } };

/** A login form: the username is a TextInput, and both read as one family. */
export const LoginPair: Story = {
  render: () => (
    <>
      <Field label="Identifiant">
        <TextInput autoComplete="username" defaultValue="rida" />
      </Field>
      <Field label="Mot de passe">
        <PasswordInput autoComplete="current-password" />
      </Field>
    </>
  ),
};
