import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST } from '../../stories/fixtures';
import { PowerBox } from './PowerBox';

const meta = {
  title: 'Select/PowerBox',
  component: PowerBox,
  parameters: {
    docs: {
      description: {
        component:
          'A callout for a character’s signature power. The one place in the system that uses a 4px gold accent edge, which is what makes a power read as special rather than as another paragraph.',
      },
    },
  },
} satisfies Meta<typeof PowerBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: `Pouvoir : ${CAST[0]!.power.name}`,
    hint: '(touche F)',
    children: CAST[0]!.power.desc,
  },
};

/** Without the key hint. */
export const NoHint: Story = {
  args: { name: `Pouvoir : ${CAST[1]!.power.name}`, children: CAST[1]!.power.desc },
};

/** A short description, showing the box at its minimum height. */
export const Short: Story = {
  args: { name: 'Pouvoir : Mégaphone', hint: '(touche F)', children: 'Assourdit les adversaires.' },
};
