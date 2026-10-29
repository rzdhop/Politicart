import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { GRADE_LABELS } from '../../stories/fixtures';
import { Button } from '../controls/Button';
import { Row } from '../foundation/Row';
import { GRADES, type Grade } from './GradeBadge';
import { RevealCard } from './RevealCard';
import { type RevealPhase, RevealStage } from './RevealStage';

const PHASES: RevealPhase[] = ['idle', 'opening', 'tease', 'burst', 'reveal', 'next'];

function ResultCard({ grade }: { grade: Grade }) {
  return (
    <RevealCard kind="char" name="Candidat : Lucie Vasseur" grade={grade} gradeLabel={GRADE_LABELS[grade]} caption="La Politibox vous offre">
      <Row>
        <Button>Encore une !</Button>
        <Button variant="ghost">Retour</Button>
      </Row>
    </RevealCard>
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
          'The DOM half of the Politibox opening: a full-screen overlay over the 3D scene. `opening` dims the scene, `tease` pulses a vignette in the grade colour at the grade’s rate, `burst` flashes white into the grade colour, `reveal` raises the result card the game supplies and pops its badge, `next` sinks it away between two openings of a bundle, whose counter sits at the top. No timers: the game drives `phase` from its own clock. Nothing here takes a tap except the card in `reveal`.',
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
    <div style={{ height: 460 }}>
      <RevealStage {...args}>
        <ResultCard grade={args.grade} />
      </RevealStage>
    </div>
  ),
};

/** The tease: the vignette pulses in the grade colour, faster the rarer (an incredible prize here). */
export const Tease: Story = {
  args: { phase: 'tease', grade: 'incredible' },
  render: (args) => (
    <div style={{ height: 420 }}>
      <RevealStage {...args} />
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

/** A bundle of five, on its third reveal: the counter at the top keeps the place. */
export const Bundle: Story = {
  args: { phase: 'reveal', grade: 'rare', count: 5, index: 2 },
  render: (args) => (
    <div style={{ height: 460 }}>
      <RevealStage {...args}>
        <ResultCard grade={args.grade} />
      </RevealStage>
    </div>
  ),
};

/**
 * Interactive: step through the phases with the button, which stays
 * clickable because the overlay takes no pointer events outside the card.
 */
export const PolitiboxOpening: Story = {
  render: function Render(args) {
    const [phase, setPhase] = useState<RevealPhase>('idle');
    const [grade, setGrade] = useState<Grade>(args.grade);
    const next = PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length] ?? 'idle';
    return (
      <div style={{ height: 460, padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
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
        <RevealStage {...args} grade={grade} phase={phase} count={5} index={1}>
          <ResultCard grade={grade} />
        </RevealStage>
      </div>
    );
  },
};
