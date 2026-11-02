import type { Meta, StoryObj } from '@storybook/react-vite';

import { MENU_GLYPHS, MenuGlyph } from './MenuGlyph';

const meta = {
  title: 'Menu/MenuGlyph',
  component: MenuGlyph,
  parameters: {
    docs: {
      description: {
        component:
          'The menus’ line glyphs: a chequered flag, two helmets, a shopping bag, a bust, the speaker on and off, a gem for the detail level, a keyboard, a spanner and a bar chart. 24px grid, round 2px strokes in `currentColor`, 1.25em by default, so a glyph takes the colour and size of the text around it. Decorative (`aria-hidden`) and without a text node, so a button’s text is its label alone.',
      },
    },
  },
  args: { name: 'play' },
} satisfies Meta<typeof MenuGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { style: { width: 48, height: 48, color: 'var(--gold)' } } };

/** Every glyph, named. */
export const All: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 96px)', gap: 16, color: 'var(--fg)', fontSize: 28 }}>
      {MENU_GLYPHS.map((g) => (
        <div key={g} style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
          <MenuGlyph name={g} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{g}</span>
        </div>
      ))}
    </div>
  ),
};
