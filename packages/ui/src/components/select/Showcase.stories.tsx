import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, StagePreview, STAT_LABELS } from '../../stories/fixtures';
import { PowerBox } from './PowerBox';
import { Showcase } from './Showcase';
import { ShowcaseStage } from './ShowcaseStage';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const meta = {
  title: 'Select/Showcase',
  component: Showcase,
  parameters: {
    docs: {
      description: {
        component:
          'The panel beside the roster that presents whoever is selected, over the live 3D model behind it. It is `pointer-events: none` — a caption for the scene, never something to click — so controls placed inside it will not be clickable. The optional `stage` slot takes a ShowcaseStage, rendered first: the band above the name that the scene draws into and the player drags, the one part that takes the pointer.',
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

/**
 * With the `stage` slot filled: the band takes all the free height above the
 * name, so the text keeps its place at the bottom and the scene gets the rest.
 * The podium here is a still stand-in for the 3D scene the game draws behind.
 */
export const WithStage: Story = {
  args: {
    name: CAST[0]!.name,
    title: CAST[0]!.title,
    quote: CAST[0]!.quote,
    style: { minHeight: 480, width: 560 },
    stage: (
      <ShowcaseStage aria-label="Le podium : glissez pour le faire pivoter">
        <StagePreview />
      </ShowcaseStage>
    ),
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
