import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, PORTRAIT, STAT_LABELS } from '../../stories/fixtures';
import { CharacterTile } from './CharacterTile';
import { PowerBox } from './PowerBox';
import { Roster } from './Roster';
import { SelectLayout } from './SelectLayout';
import { Showcase } from './Showcase';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const meta = {
  title: 'Select/SelectLayout',
  component: SelectLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The two-column character-select frame: roster left, showcase right. Below 760px it collapses to one column and the showcase moves above the roster, so the player can see who they have chosen without scrolling. Expects its two children in roster-then-showcase order — the reordering is done in CSS.',
      },
    },
  },
} satisfies Meta<typeof SelectLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const chosen = CAST[0]!;

export const Default: Story = {
  args: {
    style: { padding: 24 },
    children: (
      <>
        <Roster>
          {Array.from({ length: 11 }, (_, i) => {
            const c = CAST[i % CAST.length]!;
            return <CharacterTile key={i} name={c.name} image={PORTRAIT} selected={i === 0} />;
          })}
        </Roster>
        <Showcase name={chosen.name} title={chosen.title} quote={chosen.quote}>
          <StatGrid>
            {STAT_LABELS.map(([k, label]) => (
              <StatBar key={k} label={label} value={chosen.stats[k]} />
            ))}
          </StatGrid>
          <PowerBox name={`Pouvoir : ${chosen.power.name}`} hint="(touche F)">
            {chosen.power.desc}
          </PowerBox>
        </Showcase>
      </>
    ),
  },
};
