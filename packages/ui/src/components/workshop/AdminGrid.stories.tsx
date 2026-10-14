import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, PORTRAIT } from '../../stories/fixtures';
import { AdminCard } from './AdminCard';
import { AdminGrid } from './AdminGrid';
import { ColorSwatch } from './ColorSwatch';
import { ColorsRow } from './ColorsRow';
import { Field } from './Field';
import { FileInput } from './FileInput';
import { LiveryThumb } from './LiveryThumb';
import { TextInput } from './TextInput';

const meta = {
  title: 'Workshop/AdminGrid',
  component: AdminGrid,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The workshop’s form grid. **Every other workshop component depends on this wrapper** — they are all defined as descendants of `.admin`, so outside it they render unstyled. Keeping that scope is what stops the workshop’s input styling leaking onto the rest of the system.',
      },
    },
  },
} satisfies Meta<typeof AdminGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three candidate cards, as the workshop shows the cast. */
export const Default: Story = {
  args: {
    style: { padding: 24 },
    children: CAST.map((c) => (
      <AdminCard key={c.id}>
        <div className="name">
          {c.name}{' '}
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
            · {c.power.name}
          </span>
        </div>
        <Field label="Nom">
          <TextInput defaultValue={c.name} />
        </Field>
        <Field label="Fonction">
          <TextInput defaultValue={c.title} />
        </Field>
        <ColorsRow>
          <Field label="Costume">
            <ColorSwatch defaultValue="#1a2a5e" />
          </Field>
          <Field label="Kart">
            <ColorSwatch defaultValue="#1f3a93" />
          </Field>
        </ColorsRow>
        <Field label="Livrée">
          <FileInput accept="image/*" />
        </Field>
        <LiveryThumb src={PORTRAIT} alt="" />
      </AdminCard>
    )),
  },
};
