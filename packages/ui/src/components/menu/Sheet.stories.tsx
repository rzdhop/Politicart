import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '../controls/Button';
import { ControlsGrid } from '../controls/ControlsGrid';
import { KeyCap } from '../controls/KeyCap';
import { Sheet, type SheetProps } from './Sheet';

const legend = (
  <ControlsGrid>
    <div><KeyCap>↑</KeyCap> / <KeyCap>Z</KeyCap> accélérer</div>
    <div><KeyCap>↓</KeyCap> / <KeyCap>S</KeyCap> freiner, reculer</div>
    <div><KeyCap>←</KeyCap> <KeyCap>→</KeyCap> tourner</div>
    <div><KeyCap>Espace</KeyCap> dérapage (mini-turbo)</div>
  </ControlsGrid>
);

function Toggle(args: SheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <Button variant="ghost" onClick={() => setOpen(true)}>Commandes</Button>
      <Sheet {...args} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

const meta = {
  title: 'Menu/Sheet',
  component: Sheet,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A modal sheet over the screen: a bottom sheet on a phone, a centred glass card from 600px, for help and small side panels (the title’s « Commandes »). `role="dialog"` named by its heading; the focus moves to its × button, Tab stays inside, Escape and a tap on the dimmed backdrop close it and the focus returns to what opened it. Enter and Escape stop at the sheet so a game listening on `window` never hears them. Closed, nothing renders. Slides up on open, still under `prefers-reduced-motion`.',
      },
    },
  },
  args: { open: true, onClose: () => {}, title: 'Commandes', children: legend },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Opened and closed from a button, as the title does. */
export const Toggled: Story = { render: (args) => <Toggle {...args} /> };
