import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { GRADE_LABELS } from '../../stories/fixtures';
import { Button } from '../controls/Button';
import { Panel } from '../foundation/Panel';
import { Row } from '../foundation/Row';
import { Heading } from '../typography/Heading';
import { Subtitle } from '../typography/Subtitle';
import { GRADES, type Grade, GradeBadge } from './GradeBadge';
import { type RevealPhase, RevealStage } from './RevealStage';

const PHASES: RevealPhase[] = ['idle', 'opening', 'burst', 'reveal'];

function ResultCard({ grade }: { grade: Grade }) {
  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <Subtitle style={{ fontSize: 14 }}>La Plitibox vous offre</Subtitle>
      <Heading>Lucie Vasseur</Heading>
      <GradeBadge grade={grade} label={GRADE_LABELS[grade]} />
      <Row>
        <Button>Encore une !</Button>
        <Button variant="ghost">Retour</Button>
      </Row>
    </Panel>
  );
}

const meta = {
  title: 'Economy/RevealStage',
  component: RevealStage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The DOM half of the Plitibox opening: a full-screen overlay over the 3D scene. `opening` dims the scene, `burst` flashes white into the grade colour, `reveal` raises the result card the game supplies and pops its badge. No timers: the game drives `phase` from its own clock. Nothing here takes a tap except the card in `reveal`.',
      },
    },
  },
  args: { grade: 'mythic', phase: 'reveal' },
} satisfies Meta<typeof RevealStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The reveal: the card has risen, the badge has popped. */
export const Reveal: Story = {
  render: (args) => (
    <div style={{ height: 420 }}>
      <RevealStage {...args}>
        <ResultCard grade={args.grade} />
      </RevealStage>
    </div>
  ),
};

/** The burst: the flash plays once on mount; reload the story to see it again. */
export const Burst: Story = {
  args: { phase: 'burst', grade: 'incredible' },
  render: (args) => (
    <div style={{ height: 420 }}>
      <RevealStage {...args} />
    </div>
  ),
};

/**
 * Interactive: step through the phases with the button, which stays
 * clickable because the overlay takes no pointer events outside the card.
 */
export const PlitiboxOpening: Story = {
  render: function Render(args) {
    const [phase, setPhase] = useState<RevealPhase>('idle');
    const [grade, setGrade] = useState<Grade>(args.grade);
    const next = PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length] ?? 'idle';
    return (
      <div style={{ height: 420, padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
        <Row style={{ justifyContent: 'flex-start' }}>
          <Button onClick={() => setPhase(next)}>
            {phase} → {next}
          </Button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>phase: {phase}</span>
        </Row>
        <Row style={{ justifyContent: 'flex-start' }}>
          {GRADES.map((g) => (
            <Button key={g} variant="ghost" onClick={() => setGrade(g)} aria-pressed={g === grade}>
              {GRADE_LABELS[g]}
            </Button>
          ))}
        </Row>
        <RevealStage {...args} grade={grade} phase={phase}>
          <ResultCard grade={grade} />
        </RevealStage>
      </div>
    );
  },
};
