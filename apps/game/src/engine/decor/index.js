// The themed builders by circuit id; `scene` is the scale-1 decor group, `world` the real scene for
// pieces placed from G.samples or built in world units (landmarks whose domes and wheels must stay round).
import { buildBourbon } from './bourbon.js';
import { buildElysee } from './elysee.js';
import { buildMarseille } from './marseille.js';
import { buildMontmartre } from './montmartre.js';
import { buildVersailles } from './versailles.js';

export const BUILDERS = { elysee: buildElysee, bourbon: buildBourbon, versailles: buildVersailles, montmartre: buildMontmartre, marseille: buildMarseille };
