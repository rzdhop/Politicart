import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, StagePreview, STAT_LABELS } from '../../stories/fixtures';
import { Showcase } from './Showcase';
import { ShowcaseStage } from './ShowcaseStage';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const chosen = CAST[0]!;

const meta = {
  title: 'Select/ShowcaseStage',
  component: ShowcaseStage,
  // Always shown in a Showcase's `stage` slot: the band is `flex: 1` and only
  // has a size inside the showcase's column. The showcase is given a fixed
  // height so the band's share of it is visible; a story can change it with
  // the `showcaseMinHeight` parameter.
  decorators: [
    (Story, { parameters }) => (
      <div style={{ width: 520 }}>
        <Showcase
          name={chosen.name}
          title={chosen.title}
          quote={chosen.quote}
          stage={<Story />}
          style={{ minHeight: (parameters.showcaseMinHeight as number | undefined) ?? 420 }}
        >
          <StatGrid>
            {STAT_LABELS.map(([k, label]) => (
              <StatBar key={k} label={label} value={chosen.stats[k]} />
            ))}
          </StatGrid>
        </Showcase>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'The band of a Showcase that the 3D scene draws into: an empty `flex: 1` block (140px at least) above the candidate’s name, whose rect **is** the region the scene frames its model into, and the surface the player drags to turn the podium. The one part of a showcase with pointer events; `touch-action: pan-y` leaves vertical swipes to the page. Announced as an image with the `aria-label` you pass (required). In the game the band is empty and the scene shows through it from the canvas behind; these stories put a still sketch of the podium in it.',
      },
    },
  },
} satisfies Meta<typeof ShowcaseStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In place, with a stand-in for the scene the game draws behind it. */
export const Default: Story = {
  args: {
    'aria-label': 'Le podium : glissez pour le faire pivoter',
    children: <StagePreview />,
  },
};

/**
 * Empty, as the game renders it, with its rect outlined: everything inside
 * the dashes is the band the scene fits its model into and the drag target.
 * The outline is this story's, not the component's.
 */
export const BandOutlined: Story = {
  args: {
    'aria-label': 'Le podium : glissez pour le faire pivoter',
    style: { outline: '2px dashed var(--gold)', outlineOffset: -2, borderRadius: 10 },
  },
};

/**
 * A short showcase: the band never drops below its 140px floor, so the scene
 * always has room for the podium even when the text below it is long.
 */
export const AtItsFloor: Story = {
  args: {
    'aria-label': 'Le podium : glissez pour le faire pivoter',
    children: <StagePreview />,
  },
  parameters: { showcaseMinHeight: 0 },
};
