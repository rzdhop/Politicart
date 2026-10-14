import type { Meta, StoryObj } from '@storybook/react-vite';

import { RaceTimer } from './RaceTimer';

const meta = {
  title: 'HUD/RaceTimer',
  component: RaceTimer,
  parameters: {
    docs: {
      description: {
        component:
          'The race clock: monospace and muted, deliberately quiet, so a number that changes every frame does not pull the eye off the track. Formatting is the caller’s. This is the readout most worth driving through `setText` rather than a prop.',
      },
    },
  },
} satisfies Meta<typeof RaceTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: '1:12.46' } };

/** With a best lap appended, as the game shows it once a lap is complete. */
export const WithBestLap: Story = { args: { children: '1:12.46 · meilleur 0:35.20' } };

export const AtTheStart: Story = { args: { children: '0:00.00' } };
