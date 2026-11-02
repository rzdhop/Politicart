import type { Meta, StoryObj } from '@storybook/react-vite';

import { TitleLogo } from './TitleLogo';

const meta = {
  title: 'Menu/TitleLogo',
  component: TitleLogo,
  parameters: {
    docs: {
      description: {
        component:
          'The title screen’s logo: the tricolore rule, the game’s name in the tricolore display type at hero size (the page’s `<h1>`), and the gold subtitle. It arrives — the rule wipes open, the name slams down with a squash and a settle, the subtitle rises — then a light sweeps the letters every few seconds (clipped to the text with the tricolore). None of it under `prefers-reduced-motion`.',
      },
    },
  },
  args: { title: 'POLITIKART', subtitle: 'Grand Prix de l’Hémicycle' },
} satisfies Meta<typeof TitleLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NameOnly: Story = { args: { subtitle: undefined } };
