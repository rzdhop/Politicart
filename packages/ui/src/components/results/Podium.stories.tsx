import type { Meta, StoryObj } from '@storybook/react-vite';

import { PORTRAIT, placeholderPortrait } from '../../stories/fixtures';
import { Podium } from './Podium';

const ordinal = (n: number) => n + (n === 1 ? 'er' : 'e');

const meta = {
  title: 'Results/Podium',
  component: Podium,
  parameters: {
    docs: {
      description: {
        component:
          'The top three on a podium: portraits over their steps, the winner in the middle on the tallest, second left, third right, with name, detail and time. An ordered list in finishing order for screen readers; the steps rise in one after the other (fx.css), still under reduced motion.',
      },
    },
  },
  args: {
    placeLabel: ordinal,
    entries: [
      { key: 'victor', name: 'Emmanuel Macaron', detail: 'Le jeune président', portrait: PORTRAIT, value: '2:14.07', you: true },
      { key: 'gege', name: 'Philippe Martini', detail: 'Le syndicaliste', portrait: placeholderPortrait('Philippe Martini', '#c1121f'), value: '2:15.80' },
      { key: 'capucine', name: 'Sandrine Ruisseau', detail: 'L’écoféministe', portrait: placeholderPortrait('Sandrine Ruisseau', '#2e8b57'), value: '2:16.02' },
    ],
  },
} satisfies Meta<typeof Podium>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Only two finished before the race was called. */
export const TwoFinishers: Story = {
  args: { entries: [{ name: 'Alice', detail: 'Équipe Bleu', portrait: PORTRAIT, value: '1:58.40' }, { name: 'Bob', detail: 'Équipe Rouge', value: '2:01.12' }] },
};
