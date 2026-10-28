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
