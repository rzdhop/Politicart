import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, STAT_LABELS } from '../../stories/fixtures';
import { PowerBox } from './PowerBox';
import { Showcase } from './Showcase';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const meta = {
  title: 'Select/Showcase',
  component: Showcase,
  parameters: {
    docs: {
      description: {
        component:
          'The panel beside the roster that presents whoever is selected, over the live 3D model behind it. It is `pointer-events: none` — a caption for the scene, never something to click — so controls placed inside it will not be clickable.',
      },
    },
  },
} satisfies Meta<typeof Showcase>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Identity lines only. */
export const Default: Story = {
  args: { name: CAST[0]!.name, title: CAST[0]!.title, quote: CAST[0]!.quote },
};

/** The full composition, as the select screen shows it. */
export const Complete: Story = {
  args: {
    name: CAST[0]!.name,
    title: CAST[0]!.title,
    quote: CAST[0]!.quote,
    children: (
      <>
        <StatGrid>
          {STAT_LABELS.map(([k, label]) => (
            <StatBar key={k} label={label} value={CAST[0]!.stats[k]} />
          ))}
        </StatGrid>
        <PowerBox name={`Pouvoir : ${CAST[0]!.power.name}`} hint="(touche F)">
          {CAST[0]!.power.desc}
        </PowerBox>
      </>
    ),
  },
};

/** Name only: the optional lines are omitted rather than left as empty elements. */
export const NameOnly: Story = { args: { name: 'Lucie Vasseur' } };
