import type { Meta, StoryObj } from '@storybook/react-vite';

import { PORTRAIT } from '../../stories/fixtures';
import { Disclaimer } from '../typography/Disclaimer';
import { AdPreview } from './AdPreview';

const meta = {
  title: 'Workshop/AdPreview',
  component: AdPreview,
  parameters: {
    docs: {
      description: {
        component:
          'The strip of uploaded campaign posters. Sizes any `img` child to 90x34, covered, with a hairline border. Unlike the rest of the workshop this is scoped to its own class rather than `.admin`, so it works anywhere — the game puts it outside the candidate grid.',
      },
    },
  },
} satisfies Meta<typeof AdPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four posters uploaded. */
export const Default: Story = {
  args: {
    style: { display: 'flex', gap: 8 },
    children: Array.from({ length: 4 }, (_, i) => <img key={i} src={PORTRAIT} alt="" />),
  },
};

/** Empty, with the fallback message the game shows in its place. */
export const Empty: Story = {
  args: {
    children: (
      <Disclaimer>
        Aucune affiche personnalisée : les panneaux du jeu sont utilisés.
      </Disclaimer>
    ),
  },
};
