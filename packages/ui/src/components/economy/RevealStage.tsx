import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import type { Grade } from './GradeBadge';

/**
 * Where the opening is, as the game's timeline reports it:
 * - `idle` -- nothing on screen;
 * - `opening` -- the box is dropping, spinning, shaking on the canvas: a dim comes up;
 * - `burst` -- the lid flies: a white flash that fades to the grade colour;
 * - `reveal` -- the prize is out: the result card rises, its badge pops.
 */
export type RevealPhase = 'idle' | 'opening' | 'burst' | 'reveal';

export interface RevealStageProps extends ComponentPropsWithRef<'div'> {
  /** The prize's grade: tints the flash and the card's glow. */
  grade: Grade;
  /** The phase to show. Purely presentational -- the game drives it from its own clock. */
  phase: RevealPhase;
  /**
   * The result card, shown in `reveal`: text, a `GradeBadge` (which pops
   * in after the card rises), the buttons. Interactive in that phase only.
   */
  children?: ReactNode;
}

/**
 * The DOM half of the Plitibox opening: a full-screen overlay over the 3D
 * scene.
 *
 * It never intercepts input except for the result card in `reveal`, so a
 * tap anywhere else still reaches the canvas (which is how the game lets a
 * player skip the opening). No timers live here: the game's timeline
 * (`engine/lootbox.js`) owns the clock and sets `phase`; this component only
 * renders what that phase looks like, so the E2E never waits on an animation
 * it cannot see.
 *
 * `idle` renders nothing at all. The flash and the entrances are `fx.css`
 * keyframes, all off under `prefers-reduced-motion`.
 *
 * ```tsx
 * <RevealStage grade={drop.grade} phase={phase}>
 *   <Heading>Lucie Vasseur</Heading>
 *   <GradeBadge grade={drop.grade} label="Commun" />
 *   <Button onClick={again}>Encore une !</Button>
 * </RevealStage>
 * ```
 */
export function RevealStage({ grade, phase, children, className, ...rest }: RevealStageProps) {
  if (phase === 'idle') return null;
  return (
    <div
      className={cx('kr-reveal', `kr-reveal-${grade}`, `kr-reveal-phase-${phase}`, className)}
      data-phase={phase}
      aria-live={phase === 'reveal' ? 'polite' : undefined}
      {...rest}
    >
      <div className="kr-reveal-dim" />
      {phase === 'burst' ? <div className="kr-flash" aria-hidden="true" /> : null}
      {phase === 'reveal' ? <div className="kr-reveal-card kr-rise">{children}</div> : null}
    </div>
  );
}
