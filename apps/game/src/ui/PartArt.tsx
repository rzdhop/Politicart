import type { ReactNode } from 'react';

import type { Grade } from './store';

/**
 * A part option's picture for its shop card (DEC-073): the category's
 * shape drawn as that option looks -- gold wheels in gold, a rainbow neon in
 * a rainbow, a camo body in camo -- on a halo in the grade's colour, so
 * every card on a shelf reads apart at a glance. Pure SVG, no request.
 */
export function PartArt({ category, value, grade }: { category: string; value: string; grade: Grade }) {
  const id = 'pa-' + category + '-' + value;
  return (
    <svg className="part-art" viewBox="0 0 96 72" width="100%" height="100%" aria-hidden="true" data-part={category + ':' + value}>
      <defs>
        <radialGradient id={id + '-halo'} cx="50%" cy="55%" r="60%">
          <stop offset="0" stopColor={`var(--grade-${grade})`} stopOpacity=".55" />
          <stop offset="1" stopColor={`var(--grade-${grade})`} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id + '-rainbow'} x1="0" x2="1">
          <stop offset="0" stopColor="#ff4fd8" /><stop offset=".25" stopColor="#ffb400" /><stop offset=".5" stopColor="#9ad04f" />
          <stop offset=".75" stopColor="#4fa3ff" /><stop offset="1" stopColor="#b14cff" />
        </linearGradient>
        <linearGradient id={id + '-metal'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#b8bcc6" /><stop offset="1" stopColor="#6c707a" />
        </linearGradient>
        <linearGradient id={id + '-gold'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b0" /><stop offset=".5" stopColor="#f2c14e" /><stop offset="1" stopColor="#a8801c" />
        </linearGradient>
      </defs>
      <rect width="96" height="72" fill={`url(#${id}-halo)`} />
      {draw(category, value, id)}
    </svg>
  );
}

const BODY = '#1f3a93';
/** A side view of a kart body, the canvas most parts are drawn on. */
const kart = (fill = BODY, extra: ReactNode = null) => (
  <>
    <path d="M14 46 L22 34 H58 L70 40 H84 L86 48 H14 Z" fill={fill} stroke="#0c1230" strokeWidth="2" />
    {extra}
    <circle cx="28" cy="52" r="8" fill="#15171d" /><circle cx="72" cy="52" r="8" fill="#15171d" />
    <circle cx="28" cy="52" r="3" fill="#8a8f99" /><circle cx="72" cy="52" r="3" fill="#8a8f99" />
  </>
);

function draw(category: string, value: string, id: string): ReactNode {
  switch (category) {
    case 'wheels': {
      const fill = value === 'gold' ? `url(#${id}-gold)` : value === 'chrome' ? `url(#${id}-metal)` : '#5f6670';
      return (
        <g transform="translate(48 37)">
          <circle r="26" fill="#15171d" strokeDasharray={value === 'offroad' ? '5 4' : undefined} stroke={value === 'offroad' ? '#2e3340' : '#0c1230'} strokeWidth={value === 'offroad' ? 7 : 3} />
          <circle r="15" fill={fill} />
          {[0, 72, 144, 216, 288].map(a => <rect key={a} x="-2.5" y="-14" width="5" height="11" rx="2" fill="#0c1230" opacity=".45" transform={`rotate(${a})`} />)}
          <circle r="4.5" fill="#0c1230" />
          {value === 'chrome' || value === 'gold' ? <path d="M-10 -9 A14 14 0 0 1 4 -14" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" /> : null}
        </g>
      );
    }
    case 'spoiler':
      return kart(BODY, value === 'none' ? null : value === 'wing'
        ? <><rect x="6" y="14" width="30" height="6" rx="2" fill="#c8102e" stroke="#0c1230" strokeWidth="1.5" /><rect x="12" y="20" width="3" height="15" fill="#0c1230" /><rect x="26" y="20" width="3" height="15" fill="#0c1230" /></>
        : <><rect x="10" y="26" width="20" height="4" rx="1.5" fill="#c8102e" /><rect x="18" y="30" width="3" height="5" fill="#0c1230" /></>);
    case 'sticker': {
      const art = value === 'rosette'
        ? <><circle cx="44" cy="40" r="7" fill="#c8102e" /><circle cx="44" cy="40" r="4.5" fill="#f6f1e4" /><circle cx="44" cy="40" r="2" fill={BODY} /></>
        : value === 'etoile' ? <path d="M44 32l2.3 5 5.4.6-4 3.7 1.1 5.4L44 44l-4.8 2.7 1.1-5.4-4-3.7 5.4-.6z" fill="#f2c14e" />
        : value === 'marianne' ? <><path d="M38 46c0-7 3-12 8-12 3 0 5 2 5 5l-3 2 1 4z" fill="#f6f1e4" /><path d="M39 36c2-5 9-6 12-2l-3 3z" fill="#c8102e" /></>
        : value === 'tricolore' ? <><rect x="34" y="36" width="7" height="8" fill={BODY} stroke="#f6f1e4" /><rect x="41" y="36" width="7" height="8" fill="#f6f1e4" /><rect x="48" y="36" width="7" height="8" fill="#c8102e" /></>
        : null;
      return kart('#2c4fb8', art);
    }
    case 'exhaust': {
      const n = value === 'quad' ? 4 : value === 'double' ? 2 : 1;
      if (value === 'turbine') return (
        <g transform="translate(48 36)">
          <circle r="24" fill={`url(#${id}-metal)`} stroke="#0c1230" strokeWidth="3" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(a => <path key={a} d="M0 0 L5 -20 L-3 -20 Z" fill="#2e3340" transform={`rotate(${a})`} />)}
          <circle r="6" fill="#ff7a1a" /><circle r="3" fill="#ffd34d" />
        </g>
      );
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const y = 36 + (i - (n - 1) / 2) * 11;
            return (
              <g key={i}>
                <rect x={value === 'side' ? 20 : 26} y={y - 4} width="40" height="8" rx="3" fill={`url(#${id}-metal)`} stroke="#0c1230" strokeWidth="1.5" transform={value === 'side' ? `rotate(-14 48 ${y})` : undefined} />
                <ellipse cx={value === 'side' ? 68 : 66} cy={value === 'side' ? y - 5 : y} rx="4" ry="5" fill="#15171d" />
                <path d={`M${value === 'side' ? 72 : 70} ${value === 'side' ? y - 5 : y} l12 -3 -4 3 4 3 z`} fill="#ff7a1a" />
              </g>
            );
          })}
        </g>
      );
    }
    case 'underglow': {
      const c = value === 'blue' ? '#4fa3ff' : value === 'red' ? '#ff4a5a' : value === 'gold' ? '#f2c14e' : `url(#${id}-rainbow)`;
      return (
        <>
          <ellipse cx="50" cy="60" rx="40" ry="7" fill={c} opacity=".85" />
          <ellipse cx="50" cy="60" rx="30" ry="4" fill="#fff" opacity=".45" />
          {kart('#15204f')}
        </>
      );
    }
    case 'mast': {
      const flag = value === 'europe'
        ? <><rect x="52" y="10" width="30" height="20" fill="#1f3a93" />{Array.from({ length: 8 }, (_, i) => <circle key={i} cx={67 + Math.cos(i / 8 * Math.PI * 2) * 6} cy={20 + Math.sin(i / 8 * Math.PI * 2) * 6} r="1.3" fill="#f2c14e" />)}</>
        : value === 'pirate' ? <><rect x="52" y="10" width="30" height="20" fill="#15171d" /><circle cx="67" cy="18" r="4.5" fill="#f6f1e4" /><path d="M60 26l14-4M60 22l14 4" stroke="#f6f1e4" strokeWidth="2" /></>
        : value === 'tricolore' ? <><rect x="52" y="10" width="10" height="20" fill={BODY} /><rect x="62" y="10" width="10" height="20" fill="#f6f1e4" /><rect x="72" y="10" width="10" height="20" fill="#c8102e" /></>
        : value === 'antenna' ? <circle cx="52" cy="8" r="3" fill="#ff4a5a" />
        : null;
      return kart(BODY, value === 'none' ? null : <><rect x="50" y={value === 'antenna' ? 8 : 10} width="2.5" height={value === 'antenna' ? 26 : 24} fill="#2e3340" />{flag}</>);
    }
    case 'nose': {
      const nose = value === 'splitter' ? <rect x="78" y="46" width="14" height="3" fill="#15171d" />
        : value === 'wedge' ? <path d="M70 40 L92 46 L84 48 Z" fill="#c8102e" />
        : value === 'bull' ? <><rect x="84" y="34" width="4" height="16" fill={`url(#${id}-metal)`} /><rect x="82" y="38" width="10" height="3" fill={`url(#${id}-metal)`} /><rect x="82" y="44" width="10" height="3" fill={`url(#${id}-metal)`} /></>
        : value === 'ram' ? <><rect x="80" y="40" width="12" height="6" fill="#8b5a2b" /><path d="M92 37 c6 0 6 12 0 12 c-2-3 3-4 0-6 c3-2-2-3 0-6z" fill="#b8bcc6" /></>
        : null;
      return kart(BODY, nose);
    }
    case 'skin': {
      const pid = id + '-pat';
      const pattern = value === 'stripes' ? <pattern id={pid} width="12" height="40" patternUnits="userSpaceOnUse"><rect width="12" height="40" fill={BODY} /><rect x="3" width="4" height="40" fill="#f6f1e4" /></pattern>
        : value === 'carbon' ? <pattern id={pid} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#1b1d22" /><rect width="3" height="3" fill="#33363d" /><rect x="3" y="3" width="3" height="3" fill="#33363d" /></pattern>
        : value === 'camo' ? <pattern id={pid} width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#5d6b3a" /><path d="M2 3c5-2 8 2 6 5s-7 2-6-5zM13 9c4-3 9 0 8 4s-9 2-8-4z" fill="#3c4626" /><circle cx="18" cy="3" r="2.5" fill="#8a7a4a" /></pattern>
        : value === 'flames' ? <pattern id={pid} width="96" height="40" patternUnits="userSpaceOnUse"><rect width="96" height="40" fill="#15171d" /><path d="M60 46 C50 38 56 30 48 24 C52 32 40 34 42 26 C34 32 36 40 30 36 C28 42 34 46 40 46 Z M86 46 C80 40 84 34 78 30 C78 38 70 36 70 30 C62 36 66 44 60 44Z" fill="#ff7a1a" /></pattern>
        : null;
      return <>{pattern ? <defs>{pattern}</defs> : null}{kart(pattern ? `url(#${pid})` : BODY)}</>;
    }
    default:
      return kart();
  }
}
