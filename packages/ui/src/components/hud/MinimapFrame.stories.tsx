import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';

import { MinimapFrame } from './MinimapFrame';

const meta = {
  title: 'HUD/MinimapFrame',
  component: MinimapFrame,
  parameters: {
    docs: {
      description: {
        component:
          'The minimap: a framed canvas for the engine to draw into, at twice its displayed size so the track line stays crisp on a dense screen. This component owns only the frame — drawing is the engine’s job through a plain canvas ref, with nothing about it going through React.',
      },
    },
  },
} satisfies Meta<typeof MinimapFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The empty frame, which is all the component itself renders. */
export const Empty: Story = {};

/** At its phone size. */
export const Small: Story = { args: { style: { width: 100, height: 100 } } };

/**
 * Drawn into, the way the engine uses it: one static frame of a track and six
 * kart dots, painted once on mount.
 */
export const Drawn: Story = {
  render: () => {
    function Painted() {
      const canvas = useRef<HTMLCanvasElement>(null);

      useEffect(() => {
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, 300, 300);
        context.strokeStyle = 'rgba(246,241,228,.5)';
        context.lineWidth = 16;
        context.beginPath();
        context.ellipse(150, 150, 100, 78, 0.3, 0, Math.PI * 2);
        context.stroke();
        // Five opponents, then the player in gold.
        const dots: Array<[number, number, string]> = [
          [150, 72, '#c8102e'],
          [236, 128, '#1f3a93'],
          [214, 216, '#9ad04f'],
          [96, 228, '#7cc4ff'],
          [62, 134, '#b9b3d8'],
          [118, 74, '#f2c14e'],
        ];
        for (const [x, y, colour] of dots) {
          context.fillStyle = colour;
          context.beginPath();
          context.arc(x, y, 11, 0, Math.PI * 2);
          context.fill();
        }
      }, []);

      return <MinimapFrame ref={canvas} />;
    }

    return <Painted />;
  },
};
