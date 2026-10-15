import type { Meta, StoryObj } from '@storybook/react-vite';

import { ControlsGrid } from './ControlsGrid';
import { KeyCap } from './KeyCap';

const meta = {
  title: 'Controls/KeyCap',
  component: KeyCap,
  // Shown inside a ControlsGrid on purpose: the chip is a descendant rule, so
  // a bare KeyCap renders as plain bold text and the preview would look broken
  // even though nothing is wrong with it.
  decorators: [
    (Story) => (
      <ControlsGrid>
        <div>
          <Story />
        </div>
      </ControlsGrid>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A single key, drawn as a monospace chip. **Must be rendered inside a ControlsGrid** — the style comes from `.controls b`.',
      },
    },
  },
} satisfies Meta<typeof KeyCap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Espace' } };

/** Single letters, arrows and named keys all sit on the same chip. */
export const Variety: Story = {
  render: () => (
    <>
      <KeyCap>Z</KeyCap> <KeyCap>↑</KeyCap> <KeyCap>Ctrl</KeyCap> <KeyCap>Maj</KeyCap>{' '}
      <KeyCap>Échap</KeyCap>
    </>
  ),
};
