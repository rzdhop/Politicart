import type { Meta, StoryObj } from '@storybook/react-vite';

import { PORTRAIT, placeholderPortrait } from '../../stories/fixtures';
import { PlayerCard } from './PlayerCard';
import { PlayerGrid } from './PlayerGrid';

const meta = {
  title: 'Lobby/PlayerGrid',
  component: PlayerGrid,
  parameters: {
    docs: {
      description: {
        component:
          'The players of a room as a responsive grid of `PlayerCard`s: as many 260px columns as fit, capped at 720px, one column on a phone. A list, so its cards read as one.',
      },
    },
  },
} satisfies Meta<typeof PlayerGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    style: { width: 640 },
    children: (
      <>
        <PlayerCard name="Alice" level="niv. 3" team="Bleu" teamColor="var(--blue)" status="hôte" portrait={PORTRAIT} you />
        <PlayerCard name="Bob" tag="(invité·e)" team="Rouge" teamColor="var(--red)" status="prêt·e" ready portrait={placeholderPortrait('Philippe Martini', '#c1121f')} />
        <PlayerCard name="Admin" tag="(dieu)" status="prêt·e" ready portrait={placeholderPortrait('Manuel Valse', '#8e7cc3')} />
      </>
    ),
  },
};
