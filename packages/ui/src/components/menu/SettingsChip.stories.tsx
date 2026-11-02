import type { Meta, StoryObj } from '@storybook/react-vite';

import { MenuGlyph } from './MenuGlyph';
import { SettingsChip } from './SettingsChip';

const meta = {
  title: 'Menu/SettingsChip',
  component: SettingsChip,
  parameters: {
    docs: {
      description: {
        component:
          'A small glass pill for a setting or a utility in a screen’s corner: a glyph in a round well and a short label in display type, 44px tall. `active` lights the well in gold for a setting that is on. The label names the state in words (« Son : activé »); a `.chip-key` part of it is dropped visually below 600px, and `compact` keeps only the glyph there (the label is still read out). Group them in a `.settings-strip`.',
      },
    },
  },
  args: { icon: <MenuGlyph name="sound" />, active: true, children: 'Son : activé' },
} satisfies Meta<typeof SettingsChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Off: Story = { args: { icon: <MenuGlyph name="mute" />, active: false, children: 'Son : coupé' } };

/** The title's corner strip. */
export const Strip: Story = {
  render: () => (
    <div className="settings-strip" role="group" aria-label="Réglages">
      <SettingsChip icon={<MenuGlyph name="graphics" />} active>
        <span className="chip-key">Graphismes : </span>détaillés (ombres)
      </SettingsChip>
      <SettingsChip icon={<MenuGlyph name="sound" />} active>Son : activé</SettingsChip>
      <SettingsChip compact icon={<MenuGlyph name="help" />}>Commandes</SettingsChip>
      <SettingsChip icon={<MenuGlyph name="admin" />}>Atelier (admin)</SettingsChip>
    </div>
  ),
};
