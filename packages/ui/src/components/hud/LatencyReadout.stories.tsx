import type { Meta, StoryObj } from '@storybook/react-vite';

import { LatencyReadout } from './LatencyReadout';

const fr = ({ rtt, delay }: { rtt: number | null; delay: number }) => `ping ${rtt ?? '…'} ms · délai ${delay} ms`;

const meta = {
  title: 'HUD/LatencyReadout',
  component: LatencyReadout,
  parameters: {
    docs: {
      description: {
        component:
          'A team race’s connection: the round trip and the render delay in the clock’s quiet monospace, after a dot coloured by the round trip (green under 90 ms, gold under 170, red past it, grey before the first measure). Hidden in solo play. The game drives it through `setLatency`, which writes only what changed.',
      },
    },
  },
  args: { format: fr },
} satisfies Meta<typeof LatencyReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Good: Story = { args: { latency: { rtt: 42, delay: 83 } } };
export const Fair: Story = { args: { latency: { rtt: 128, delay: 133 } } };
export const Poor: Story = { args: { latency: { rtt: 240, delay: 250 } } };
/** Connected, before the first pong. */
export const Measuring: Story = { args: { latency: { rtt: null, delay: 100 } } };
