import type { Meta, StoryObj } from '@storybook/react-vite';

import { HeroButton } from './HeroButton';
import { MenuGlyph } from './MenuGlyph';

const meta = {
  title: 'Menu/HeroButton',
  component: HeroButton,
  decorators: [(Story) => <div style={{ width: 520, padding: 24 }}><Story /></div>],
  parameters: {
    docs: {
      description: {
        component:
          'The one call to action a screen is built around — the title’s « Jouer ». The gold arcade button at hero size (up to 64px display type, a 7px hard shadow it presses into, its column’s full width up to 560px), with a halo that breathes behind it and a light sweeping its face every few seconds; both stop under `prefers-reduced-motion`. An optional glyph before the label and a hint line under it (the keyboard shortcut). At most one per screen.',
      },
    },
  },
  args: { children: 'Jouer', icon: <MenuGlyph name="play" />, hint: 'ou appuyez sur Entrée' },
} satisfies Meta<typeof HeroButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** On a phone, where there is no keyboard to hint at. */
export const NoHint: Story = { args: { hint: undefined } };

export const LabelOnly: Story = { args: { icon: undefined, hint: undefined, children: 'Lancer la course !' } };
