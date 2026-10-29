// The themed builders by circuit id (generators: each yields between its sections, so the pre-build
// can slice the decor over frames); `scene` is the scale-1 decor group, `world` the real scene for
// pieces placed from G.samples or built in world units (landmarks whose domes and wheels must stay round).
import { buildBourbon, SURFACES as BOURBON } from './bourbon.js';
import { buildElysee, SURFACES as ELYSEE } from './elysee.js';
import { buildMarseille, SURFACES as MARSEILLE } from './marseille.js';
import { buildMontmartre, SURFACES as MONTMARTRE } from './montmartre.js';
import { buildVersailles, SURFACES as VERSAILLES } from './versailles.js';

export const BUILDERS = { elysee: buildElysee, bourbon: buildBourbon, versailles: buildVersailles, montmartre: buildMontmartre, marseille: buildMarseille };
/** The surface kinds each circuit's decor uses, by circuit id (track.js pre-bakes them with the road's and the ground's). */
export const DECOR_SURFACES = { elysee: ELYSEE, bourbon: BOURBON, versailles: VERSAILLES, montmartre: MONTMARTRE, marseille: MARSEILLE };
