import type { Meta, StoryObj } from '@storybook/react-vite';

import { GradeBadge } from '../economy/GradeBadge';
import { PORTRAIT, placeholderPortrait } from '../../stories/fixtures';
import { Button } from '../controls/Button';
import { PlayerCard } from './PlayerCard';
import { PlayerGrid } from './PlayerGrid';

const kart = (name: string) => (
  <>
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {name}
      <GradeBadge grade="common" label="Commun" size="sm" />
    </span>
    <span>—</span>
  </>
);

const meta = {
  title: 'Lobby/PlayerCard',
  component: PlayerCard,
  decorators: [
    (Story) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: 320 }}>
        <Story />
      </ul>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'One player in a team-race room: their candidate’s portrait, name and level, their team as a coloured left edge and pill, a status pill that turns green when they are ready, their kart under the name, and the admin’s buttons at the foot. `you` washes the viewer’s own card gold. A list item: put them in a `PlayerGrid`.',
      },
    },
  },
  args: {
    name: 'Alice',
    level: 'niv. 3',
    team: 'Bleu',
    teamColor: 'var(--blue)',
    status: 'hôte',
    portrait: PORTRAIT,
    kart: kart('Emmanuel Macaron'),
    you: true,
  },
} satisfies Meta<typeof PlayerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Host: Story = {};

/** A guest on the other team, ready. */
export const ReadyGuest: Story = {
  args: { name: 'Bob', tag: '(invité·e)', level: undefined, team: 'Rouge', teamColor: 'var(--red)', status: 'prêt·e', ready: true, you: false, portrait: placeholderPortrait('Philippe Martini', '#c1121f'), kart: kart('Philippe Martini') },
};

/** What the admin sees on someone else's card: move and exclude. */
export const WithAdminActions: Story = {
  args: {
    ...ReadyGuest.args,
    actions: (
      <>
        <Button variant="ghost">→ Bleu</Button>
        <Button variant="ghost">Exclure</Button>
      </>
    ),
  },
};

/** A room of three, as the lobby lays them out. */
export const InGrid: Story = {
  decorators: [],
  render: () => (
    <PlayerGrid>
      <PlayerCard name="Alice" level="niv. 3" team="Bleu" teamColor="var(--blue)" status="hôte" portrait={PORTRAIT} kart={kart('Emmanuel Macaron')} you />
      <PlayerCard name="Bob" tag="(invité·e)" team="Rouge" teamColor="var(--red)" status="prêt·e" ready portrait={placeholderPortrait('Philippe Martini', '#c1121f')} kart={kart('Philippe Martini')} />
      <PlayerCard name="Cid" level="niv. 7" team="Rouge" teamColor="var(--red)" status="…" portrait={placeholderPortrait('Sandrine Ruisseau', '#2e8b57')} kart={kart('Sandrine Ruisseau')} />
    </PlayerGrid>
  ),
};
