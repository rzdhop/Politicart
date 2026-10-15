import type { Meta, StoryObj } from '@storybook/react-vite';

import { RESULTS } from '../../stories/fixtures';
import { Button } from '../controls/Button';
import { Panel } from '../foundation/Panel';
import { Row } from '../foundation/Row';
import { Heading } from '../typography/Heading';
import { Subtitle } from '../typography/Subtitle';
import { ResultsTable } from './ResultsTable';

const meta = {
  title: 'Results/ResultsTable',
  component: ResultsTable,
  parameters: {
    docs: {
      description: {
        component:
          'Who finished where, in what time. The rank is gold display type in a narrow column, the time is monospace and right-aligned so digits line up, and the player’s row is washed in translucent gold. Scoped to `.results-table`, so unlike the game’s original CSS it cannot restyle other tables on the page.',
      },
    },
  },
} satisfies Meta<typeof ResultsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { rows: RESULTS, columns: ['', 'Candidat·e', 'Temps'] },
};

/** Without headers, which is what you get if you pass no columns. */
export const NoHeaders: Story = { args: { rows: RESULTS } };

/**
 * The whole results screen, as the game assembles it. Uses `render`, so its
 * args are only there to satisfy the story type.
 */
export const InContext: Story = {
  args: { rows: RESULTS },
  render: () => (
    <Panel style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <Heading>Résultats du scrutin</Heading>
      <Subtitle style={{ fontSize: 16 }}>Troisième tour — podium manqué</Subtitle>
      <ResultsTable rows={RESULTS} columns={['', 'Candidat·e', 'Temps']} />
      <Row>
        <Button>Rejouer</Button>
        <Button variant="ghost">Menu</Button>
      </Row>
    </Panel>
  ),
};

/** An empty field, which the component renders without complaint. */
export const Empty: Story = { args: { rows: [] } };
