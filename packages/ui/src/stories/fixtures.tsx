import type { ReactNode } from 'react';

/**
 * Sample content for the stories.
 *
 * Kept in one place so every preview shows the system carrying real Kart
 * République material -- French copy, plausible stats, the actual item and
 * circuit names -- rather than lorem ipsum. The design-sync converter
 * screenshots these stories, so what is in here is what people will see on the
 * component cards.
 *
 * All characters, parties and scandals are fictional, as the game insists.
 */

/** A stand-in portrait for roster tiles: the game renders these from 3D models. */
export const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
       <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#2f55c7"/><stop offset="1" stop-color="#0c1230"/>
       </linearGradient></defs>
       <rect width="120" height="120" fill="url(#g)"/>
       <circle cx="60" cy="46" r="20" fill="#f1c27d"/>
       <rect x="34" y="70" width="52" height="40" rx="8" fill="#1a2a5e"/>
       <rect x="56" y="70" width="8" height="40" fill="#f2c14e"/>
     </svg>`,
  );

/**
 * The placeholder a roster tile shows while its real portrait renders: the
 * candidate's kart colour and their initials, as the game draws it on a 2D
 * canvas before the 3D portrait is ready. Pair it with `pending` on the tile.
 */
export function placeholderPortrait(name: string, colour: string): string {
  const initials = name
    .split(/[\s-]+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
         <defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="#0c1230"/>
         </linearGradient></defs>
         <rect width="120" height="120" fill="url(#p)"/>
         <text x="60" y="46" text-anchor="middle" dominant-baseline="middle"
           font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34"
           fill="#fffaf0" fill-opacity="0.85">${initials}</text>
       </svg>`,
    )
  );
}

/**
 * A stand-in for the 3D podium, for `ShowcaseStage` stories.
 *
 * In the game the stage band is empty and the scene is drawn behind it on the
 * WebGL canvas; a story has no canvas, and an empty band would preview as
 * nothing. This fills the band with a still sketch of what goes there -- a
 * spotlit podium and a kart, bottom-centred as the scene frames them -- so
 * the band's size and place read at a glance. Static, so screenshots of it
 * are reproducible.
 */
export function StagePreview() {
  return (
    <svg
      viewBox="0 0 320 180"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMax meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="stage-spot" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="#2f55c7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2f55c7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="100" rx="150" ry="80" fill="url(#stage-spot)" />
      <ellipse cx="160" cy="152" rx="118" ry="22" fill="#0c1230" />
      <ellipse cx="160" cy="148" rx="112" ry="20" fill="#1a2a5e" stroke="#f2c14e" strokeWidth="3" />
      <ellipse cx="160" cy="148" rx="78" ry="13" fill="none" stroke="#f6f1e4" strokeOpacity="0.18" strokeWidth="2" />
      <g>
        <rect x="104" y="112" width="112" height="26" rx="10" fill="#2f55c7" />
        <rect x="196" y="100" width="30" height="8" rx="3" fill="#f2c14e" />
        <rect x="150" y="112" width="10" height="26" fill="#fffaf0" />
        <rect x="160" y="112" width="10" height="26" fill="#e63946" />
        <circle cx="118" cy="140" r="12" fill="#0c1230" stroke="#3b4574" strokeWidth="3" />
        <circle cx="202" cy="140" r="12" fill="#0c1230" stroke="#3b4574" strokeWidth="3" />
        <rect x="146" y="88" width="28" height="26" rx="8" fill="#1a2a5e" />
        <circle cx="160" cy="76" r="16" fill="#f1c27d" />
        <path d="M144 74 a16 16 0 0 1 32 0 z" fill="#3b2a1e" />
      </g>
    </svg>
  );
}

/** A stand-in circuit preview for track cards: the game draws the real spline. */
export function TrackPreview() {
  return (
    <svg viewBox="0 0 240 150" width="100%" style={{ display: 'block' }} aria-hidden="true">
      <rect width="240" height="150" fill="rgba(0,0,0,.25)" rx="8" />
      <path
        d="M40 110 C20 70 40 30 90 32 C140 34 150 70 190 62 C220 56 230 100 190 116 C150 132 70 140 40 110 Z"
        fill="none"
        stroke="#f6f1e4"
        strokeOpacity="0.55"
        strokeWidth="7"
      />
      <circle cx="40" cy="110" r="5" fill="#f2c14e" />
    </svg>
  );
}

export interface SampleCharacter {
  id: string;
  name: string;
  title: string;
  quote: string;
  stats: { speed: number; accel: number; handling: number };
  power: { name: string; desc: string };
}

/** Three of the eleven candidates, spanning the stat range. */
export const CAST: SampleCharacter[] = [
  {
    id: 'victor',
    name: 'Victor Lemarchand',
    title: 'Le jeune président',
    quote: '« Disruptons ce virage. »',
    stats: { speed: 0.66, accel: 0.66, handling: 0.66 },
    power: {
      name: 'Grand débat',
      desc: 'Prend la parole pendant 3 s : tous les adversaires doivent écouter et roulent au ralenti.',
    },
  },
  {
    id: 'gege',
    name: 'Gégé Marteau',
    title: 'Le syndicaliste',
    quote: '« Blocage total du circuit ! »',
    stats: { speed: 0.8, accel: 0.41, handling: 0.36 },
    power: {
      name: 'Grève générale',
      desc: 'Bloque le circuit : les adversaires ralentissent pendant 4 s.',
    },
  },
  {
    id: 'lucie',
    name: 'Lucie Vasseur',
    title: "L'outsider",
    quote: '« On rattrape le peloton. »',
    stats: { speed: 0.55, accel: 0.9, handling: 0.85 },
    power: { name: 'Temps de parole', desc: 'Recharge deux fois plus vite que les autres.' },
  },
];

/** Labels for the three stats the showcase displays. */
export const STAT_LABELS: Array<[keyof SampleCharacter['stats'], string]> = [
  ['speed', 'Vitesse'],
  ['accel', 'Accélération'],
  ['handling', 'Tenue de route'],
];

/** A finished race, with the player third. */
export const RESULTS = [
  {
    id: 'victor',
    rank: '1er',
    name: 'Victor Lemarchand',
    detail: 'Le jeune président',
    time: '2:14.07',
  },
  { id: 'gege', rank: '2e', name: 'Gégé Marteau', detail: 'Le syndicaliste', time: '2:15.80' },
  {
    id: 'lucie',
    rank: '3e',
    name: 'Lucie Vasseur',
    detail: "L'outsider",
    time: '2:16.44',
    highlighted: true,
  },
  { id: 'hubert', rank: '4e', name: 'Hubert de Vaulx', detail: 'Le notable', time: '2:21.19' },
  { id: 'kevin', rank: '5e', name: 'Kévin Brasseur', detail: 'Le candidat viral', time: 'en course…' },
];

/** The game's keyboard legend. */
export const CONTROLS: Array<[string[], string]> = [
  [['↑', 'Z'], 'accélérer'],
  [['↓', 'S'], 'freiner, reculer'],
  [['←', '→'], 'tourner'],
  [['Espace'], 'dérapage (mini-turbo)'],
  [['Ctrl', 'E'], "utiliser l'objet"],
  [['F', 'Maj'], 'pouvoir spécial'],
  [['Échap'], 'pause'],
];

/**
 * A bounded stand-in for the race screen, for HUD stories.
 *
 * The real `HudLayer` is `position: fixed; inset: 0` over the WebGL canvas,
 * and its corners position against the viewport. A story needs somewhere
 * smaller to sit, so this overrides the positioning to `relative` inside a
 * fixed-size box and paints a suggestion of track underneath -- the HUD is
 * designed to stay readable over a bright, moving scene, and a preview on flat
 * black would not show whether it does.
 *
 * Stories here are deliberately static: nothing animates, so the screenshots
 * design-sync takes of them are reproducible.
 */
export function HudStage({
  children,
  width = 440,
  height = 260,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: 12,
        overflow: 'hidden',
        background:
          'linear-gradient(160deg,#5b86c4 0 38%,#6f9a55 38% 62%,#9a9a92 62% 100%)',
      }}
    >
      <div className="hud" style={{ position: 'absolute', inset: 0 }}>
        {children}
      </div>
    </div>
  );
}

/** The French grade names, as the game's catalogue prints them. */
export const GRADE_LABELS = {
  common: 'Commun',
  rare: 'Rare',
  mythic: 'Mythique',
  incredible: 'Incroyable',
} as const;

/** A few items from the shop, one per grade and state. */
export const SHOP_ITEMS = [
  { id: 'lucie', title: 'Lucie Vasseur', subtitle: "L'outsider", grade: 'common', price: 300 },
  { id: 'kevin', title: 'Kévin Brasseur', subtitle: 'Le candidat viral', grade: 'rare', price: 800 },
  { id: 'hubert', title: 'Hubert de Vaulx', subtitle: 'Le notable', grade: 'mythic', price: 2000 },
  { id: 'aymeric', title: 'Aymeric de Castelbon', subtitle: "L'héritier", grade: 'incredible', price: 5000 },
] as const;

/** A fully fitted kart, for the kart card. */
export const KART_PARTS = [
  { id: 'wheels', label: 'Roues', value: 'Dorées', grade: 'mythic' },
  { id: 'spoiler', label: 'Aileron', value: 'Grand aileron', grade: 'rare' },
  { id: 'exhaust', label: 'Échappement', value: 'Turbine', grade: 'incredible' },
  { id: 'underglow', label: 'Néons', value: 'Aucun', grade: 'common' },
  { id: 'sticker', label: 'Autocollant', value: 'Tricolore', grade: 'common' },
] as const;
