import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { TeamPicker } from './TeamPicker';

const TEAMS = [
  { value: 'bleu', label: 'Bleu', color: 'var(--blue)', count: 2 },
  { value: 'rouge', label: 'Rouge', color: 'var(--red)', count: 1 },
] as const;

type Team = (typeof TEAMS)[number]['value'];

const meta = {
  title: 'Lobby/TeamPicker',
  component: TeamPicker<Team>,
  parameters: {
    docs: {
      description: {
        component:
          'Pick a team: a `ChoiceGroup` (DEC-024) whose chips carry the team’s colour as a dot before its name and how many players it holds. The picked chip fills gold, every state keeps its size, and it never competes with the row’s one primary button.',
      },
    },
  },
  args: { label: 'Équipe', teams: TEAMS, value: 'bleu', onChange: () => {} },
} satisfies Meta<typeof TeamPicker<Team>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [team, setTeam] = useState<Team>(args.value);
    return <TeamPicker label={args.label} teams={TEAMS} value={team} onChange={setTeam} />;
  },
};

/** The other team picked, without counts. */
export const RedNoCounts: Story = {
  args: { value: 'rouge', teams: TEAMS.map(({ count: _c, ...t }) => t) },
};
