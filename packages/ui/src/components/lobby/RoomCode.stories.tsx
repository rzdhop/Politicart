import type { Meta, StoryObj } from '@storybook/react-vite';

import { RoomCode } from './RoomCode';

const meta = {
  title: 'Lobby/RoomCode',
  component: RoomCode,
  parameters: {
    docs: {
      description: {
        component:
          'A room’s code, to read out or copy: the code in big gold display type with wide spacing, a ghost copy button that says it copied for a moment (the clipboard API where the page may use it), and a hint line.',
      },
    },
  },
  args: { code: 'ABCD', label: 'Salle', hint: 'Donnez ce code à vos ami·es', copyLabel: 'Copier', copiedLabel: 'Copié !' },
} satisfies Meta<typeof RoomCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The code alone, without a hint. */
export const CodeOnly: Story = { args: { hint: undefined, code: 'WXYZ' } };
