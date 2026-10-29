import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import type { Grade } from './GradeBadge';

/**
 * Where the opening is, as the game's timeline reports it:
 * - `idle` -- nothing on screen;
 * - `opening` -- the box is dropping and spinning on the canvas: a dim comes up;
 * - `tease` -- the rarity build-up: a vignette in the grade colour pulses at
 *   the grade's rate (faster the rarer);
 * - `burst` -- the lid flies: a white flash that fades to the grade colour;
 * - `reveal` -- the prize is out: the result card rises, its badge pops;
 * - `next` -- between two openings of a bundle: the card sinks away before
 *   the next box drops.
 */
export type RevealPhase = 'idle' | 'opening' | 'tease' | 'burst' | 'reveal' | 'next';

export interface RevealStageProps extends ComponentPropsWithRef<'div'> {
  /** The prize's grade: tints the flash, the tease and the card's glow, and sets the tease's rate. */
  grade: Grade;
  /** The phase to show. Purely presentational -- the game drives it from its own clock. */
  phase: RevealPhase;
  /** How many openings this run holds (a bundle: 5). One, or omitted, shows no counter. */
  count?: number;
  /** Which opening is on screen, from 0; the counter reads "index + 1 / count". */
  index?: number;
  /** How the counter is printed; defaults to "2 / 5". */
  formatCounter?: (index: number, count: number) => ReactNode;
  /**
   * Props for the counter chip, for a consumer that must address it -- the
   * game gives it the id its test suite drives, as DEC-012 asks.
   */
  counterProps?: ComponentPropsWithRef<'span'>;
  /**
   * The result card, shown in `reveal` (and sinking away in `next`): text,
   * a `GradeBadge` (which pops in after the card rises), the buttons.
   * Interactive in `reveal` only.
   */
  children?: ReactNode;
}

/**
 * The DOM half of the Politibox opening: a full-screen overlay over the 3D
 * scene.
 *
 * It never intercepts input except for the result card in `reveal`, so a
 * tap anywhere else still reaches the canvas (which is how the game lets a
 * player skip the opening). No timers live here: the game's timeline
 * (`engine/lootbox.js`) owns the clock and sets `phase`; this component only
 * renders what that phase looks like, so the E2E never waits on an animation
 * it cannot see.
 *
 * `idle` renders nothing at all. The tease pulse, the flash and the
 * entrances are `fx.css` keyframes, all off under `prefers-reduced-motion`.
 * A bundle (`count` above 1) shows a counter chip at the top throughout.
 *
 * ```tsx
 * <RevealStage grade={drop.grade} phase={phase} count={5} index={2}>
 *   <RevealCard kind="char" name="Candidat : Lucie Vasseur" grade="common" gradeLabel="Commun" />
 * </RevealStage>
 * ```
 */
export function RevealStage({
  grade,
  phase,
  count = 1,
  index = 0,
  formatCounter = (i, n) => `${i + 1} / ${n}`,
  counterProps,
  children,
  className,
  ...rest
}: RevealStageProps) {
  if (phase === 'idle') return null;
  return (
    <div
      className={cx('kr-reveal', `kr-reveal-${grade}`, `kr-reveal-phase-${phase}`, className)}
      data-phase={phase}
      aria-live={phase === 'reveal' ? 'polite' : undefined}
      {...rest}
    >
      <div className="kr-reveal-dim" />
      {phase === 'tease' ? <div className="kr-tease" aria-hidden="true" /> : null}
      {phase === 'burst' ? <div className="kr-flash" aria-hidden="true" /> : null}
      {count > 1 ? (
        <span className="kr-counter" {...counterProps}>
          {formatCounter(index, count)}
        </span>
      ) : null}
      {phase === 'reveal' ? <div className="kr-reveal-card kr-rise">{children}</div> : null}
      {phase === 'next' ? (
        <div className="kr-reveal-card kr-sink" aria-hidden="true">
          {children}
        </div>
      ) : null}
    </div>
  );
}
