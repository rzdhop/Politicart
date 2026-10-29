import type { Meta, StoryObj } from '@storybook/react-vite';

import { InviteRow } from './InviteRow';

const meta = {
  title: 'Lobby/InviteRow',
  component: InviteRow,
  parameters: {
    docs: {
      description: {
        component:
          'Invite friends into the room: a ghost button per online friend who is not in it yet, after an optional caption, wrapping on a phone; a muted line when there is nobody to invite.',
      },
    },
  },
  args: {
    label: 'Inviter :',
    friends: [{ id: 'u2', name: 'Bob' }, { id: 'u3', name: 'Carla' }],
    onInvite: () => {},
    inviteLabel: (n: string) => 'Inviter ' + n,
    empty: 'Aucun·e ami·e en ligne à inviter. Donnez-leur le code.',
  },
} satisfies Meta<typeof InviteRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Nobody online to invite. */
export const Empty: Story = { args: { friends: [], label: undefined } };
