import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';

export interface ShopHeroPerk {
  /** What it is, short: « Candidat·e ». */
  label: ReactNode;
  /** Its figure: « 2 % », « ×5 ». */
  value: ReactNode;
}

export interface ShopHeroProps extends Omit<ComponentPropsWithRef<'section'>, 'title'> {
  /** The headline, in display type: « La Politibox ». */
  title: ReactNode;
  /** One line under it: what may come out. */
  tagline?: ReactNode;
  /** A few figures as chips under the tagline: the odds, the bundle's saving. */
  perks?: ShopHeroPerk[];
  /** A small flag over the art's corner: « Jackpot » , « Nouveau ». */
  flag?: ReactNode;
  /** The art: defaults to the golden urne, its « ? » and its rays. */
  art?: ReactNode;
  /** The calls to action: the open buttons. */
  children?: ReactNode;
}

/** The golden ballot box, its slot glowing and a « ? » on its front: the Politibox at rest. */
export function UrneArt() {
  return (
    <svg className="hero-urne" viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <linearGradient id="hero-urne-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset=".45" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#a8801c" />
        </linearGradient>
        <linearGradient id="hero-urne-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,.55)" />
          <stop offset="1" stopColor="rgba(255,255,255,.08)" />
        </linearGradient>
      </defs>
      <g className="hero-rays">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M80 80 L76 6 L84 6 Z" transform={`rotate(${i * 30} 80 80)`} />
        ))}
      </g>
      <g className="hero-box">
        <ellipse cx="80" cy="138" rx="46" ry="7" fill="rgba(0,0,0,.35)" />
        <rect x="36" y="56" width="88" height="78" rx="8" fill="url(#hero-urne-gold)" stroke="#7a5a10" strokeWidth="3" />
        <rect x="44" y="64" width="72" height="62" rx="5" fill="url(#hero-urne-glass)" />
        <rect x="30" y="46" width="100" height="14" rx="5" fill="#f2c14e" stroke="#7a5a10" strokeWidth="3" />
        <rect x="62" y="49" width="36" height="6" rx="3" fill="#0c1230" />
        <rect className="hero-envelope" x="66" y="30" width="28" height="22" rx="2" fill="#f6f1e4" stroke="#b9b3d8" strokeWidth="1.5" />
        <path d="M66 31 L80 42 L94 31" fill="none" stroke="#c8102e" strokeWidth="2" />
        <text x="80" y="112" textAnchor="middle" fontFamily="var(--font-display)" fontSize="44" fill="#0c1230">?</text>
        <rect x="36" y="92" width="10" height="16" fill="#1f3a93" />
        <rect x="114" y="92" width="10" height="16" fill="#c8102e" />
      </g>
    </svg>
  );
}

/**
 * The Boutique's banner for its headline offer -- the Politibox: the urne
 * glowing on its rays, the title, what may come out, a few figures as chips
 * and the buttons that open one. Its border and glow are parliament gold, so
 * it outshines every card below it; under reduced motion the rays and the
 * urne stand still.
 *
 * ```tsx
 * <ShopHero title="La Politibox" tagline="Candidat·es, pièces et traînées à gagner"
 *   perks={[{ label: 'Candidat·e', value: '2 %' }]} flag="Jackpot ×500">
 *   <Button>Ouvrir · 120</Button>
 * </ShopHero>
 * ```
 */
export function ShopHero({ title, tagline, perks, flag, art, children, className, ...rest }: ShopHeroProps) {
  return (
    <section className={cx('shop-hero', className)} {...rest}>
      <div className="hero-art">
        {art ?? <UrneArt />}
        {flag === undefined || flag === null ? null : <span className="hero-flag">{flag}</span>}
      </div>
      <div className="hero-body">
        <h3 className="hero-title">{title}</h3>
        {tagline === undefined || tagline === null ? null : <p className="hero-tagline">{tagline}</p>}
        {perks && perks.length ? (
          <ul className="hero-perks">
            {perks.map((p, i) => (
              <li key={i} className="hero-perk">
                <span className="hero-perk-value">{p.value}</span>
                <span className="hero-perk-label">{p.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {children === undefined || children === null ? null : <div className="hero-actions">{children}</div>}
      </div>
    </section>
  );
}
