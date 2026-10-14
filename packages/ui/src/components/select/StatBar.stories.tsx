import type { Meta, StoryObj } from '@storybook/react-vite';

import { CAST, STAT_LABELS } from '../../stories/fixtures';
import { Showcase } from './Showcase';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const meta = {
  title: 'Select/StatBar',
  component: StatBar,
  decorators: [
    (Story) => (
      <div style={{ width: 140 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A labelled stat meter: muted caption over a gold bar. Normalising a raw stat into the 0–1 range stays with the caller, since the game’s 0.6–1.2 scale is balance rather than presentation.',
      },
    },
  },
} satisfies Meta<typeof StatBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: 'Vitesse', value: 0.66 } };

export const Low: Story = { args: { label: 'Tenue de route', value: 0.2 } };

export const Maxed: Story = { args: { label: 'Accélération', value: 1 } };

/** The three stats as the showcase presents them, for a heavyweight character. */
export const InShowcase: Story = {
  args: { label: '', value: 0 },
  decorators: [],
  render: () => {
    const gege = CAST[1]!;
    return (
      <Showcase name={gege.name} title={gege.title}>
        <StatGrid>
          {STAT_LABELS.map(([k, label]) => (
            <StatBar key={k} label={label} value={gege.stats[k]} />
          ))}
        </StatGrid>
      </Showcase>
    );
  },
};
