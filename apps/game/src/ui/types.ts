// Shapes of the engine's content data, as the screens read them.
//
// The engine is plain JavaScript (engine/data.js); these are the fields the
// React screens actually touch, declared here so the screens type-check
// against them rather than against whatever TypeScript infers from the
// literals. Keep them in step with data.js.

export interface CharacterStats {
  speed: number;
  accel: number;
  handling: number;
}

export interface Character {
  id: string;
  name: string;
  title: string;
  quote: string;
  stats: CharacterStats;
  look: { suit: number };
  kart: number;
  livery?: string;
  power: { name: string; desc: string; cd?: number };
}

export interface BaseCharacter {
  name: string;
}

export interface Track {
  name: string;
  desc: string;
  points: [number, number][];
}

/** A full kart style, as engine/kartstyle.js defines it. */
export interface KartStyle {
  body: string;
  accent: string;
  wheels: string;
  spoiler: string;
  pods: boolean;
  number: number | null;
  sticker: string;
}

/** One character's edits in the workshop, keyed as the inputs' data-k attributes. */
export interface CustomCharacter {
  name?: string;
  title?: string;
  quote?: string;
  suit?: string;
  kart?: string;
  livery?: string;
}

export interface CustomData {
  chars: Record<string, CustomCharacter | undefined>;
  ads: string[];
}

/** A finished (or not) racer on the results screen. */
export interface Racer {
  rank: number;
  finished: boolean;
  finishTime: number;
  bestLap: number;
  powerUses: number;
  def: Character;
}
