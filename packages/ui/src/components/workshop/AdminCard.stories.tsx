import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminCard } from './AdminCard';
import { AdminGrid } from './AdminGrid';
import { ColorSwatch } from './ColorSwatch';
import { ColorsRow } from './ColorsRow';
import { Field } from './Field';
import { TextInput } from './TextInput';

const meta = {
  title: 'Workshop/AdminCard',
  component: AdminCard,
  // Inside an AdminGrid because the static treatment comes from `.admin .card`:
  // on its own it would render as an interactive-looking card.
  decorators: [
    (Story) => (
      <div style={{ width: 300 }}>
        <AdminGrid>
          <Story />
        </AdminGrid>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'One editable entry in the workshop: the TrackCard surface made static. A plain div rather than a button, with the pointer cursor and hover lift removed, because it holds form controls and must not behave like something you click.',
      },
    },
  },
} satisfies Meta<typeof AdminCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <div className="name">Victor Lemarchand</div>
        <Field label="Nom">
          <TextInput defaultValue="Victor Lemarchand" />
        </Field>
        <ColorsRow>
          <Field label="Costume">
            <ColorSwatch defaultValue="#1a2a5e" />
          </Field>
          <Field label="Kart">
            <ColorSwatch defaultValue="#1f3a93" />
          </Field>
        </ColorsRow>
      </>
    ),
  },
};
