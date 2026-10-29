// The game's content: the cast, the items, the circuits.
//
// The cast parodies real French politicians through pun names; the stats,
// powers and lines are satire, as the title screen says.
//
// These are mutable singletons rather than frozen data, deliberately. The
// workshop edits a candidate's name, colours and livery in place -- see
// custom.js -- so everything that reads a character sees the player's
// customisations without having to know they exist.
import { clamp } from './util.js';

// ---------- Cast (pun-name parodies) ----------
export const CHARACTERS = [
  { id: 'victor', name: 'Emmanuel Macaron', title: 'Le jeune président', quote: '« Disruptons ce virage. »', kart: 0x1f3a93,
    stats: { speed: 1.0, accel: 1.0, handling: 1.0, weight: 1.0 },
    power: { id: 'debat', name: 'Grand débat', desc: 'Prend la parole pendant 3 s : tous les adversaires doivent écouter et roulent au ralenti.' },
    look: { skin: 0xf1c27d, suit: 0x1a2a5e, shirt: 0xffffff, hair: 'slick', hairColor: 0x3b2a1a, acc: ['tie', 'phone'], tie: 0x2d6cdf } },
  { id: 'gege', name: 'Philippe Martini', title: 'Le syndicaliste', quote: '« Blocage total du circuit ! »', kart: 0xc1121f,
    stats: { speed: 1.08, accel: 0.85, handling: 0.82, weight: 1.35 },
    power: { id: 'blocage', name: 'Grève générale', desc: 'Déploie quatre barricades d’un coup derrière lui. Le trafic est interrompu jusqu’à nouvel ordre.' },
    look: { skin: 0xe8b48a, suit: 0xc1121f, shirt: 0x333333, hair: 'cap', hairColor: 0x222222, acc: ['moustache', 'vest'], belly: true } },
  { id: 'maurice', name: 'Jean Lassalle-des-Fêtes', title: 'Le maire de province', quote: '« Encore un rond-point et on y est. »', kart: 0xe0a030,
    stats: { speed: 0.95, accel: 1.0, handling: 1.15, weight: 1.1 },
    power: { id: 'rondpoint', name: 'Rond-point surprise', desc: 'Inaugure un rond-point au milieu de la route devant lui. Lui seul connaît la priorité.' },
    look: { skin: 0xf3c9a0, suit: 0xb8a070, shirt: 0xffffff, hair: 'sides', hairColor: 0x9a9a9a, acc: ['sash', 'glasses', 'rosette'], belly: true } },
  { id: 'capucine', name: 'Sandrine Ruisseau', title: 'L’écoféministe à vélo-cargo', quote: '« Il faut déconstruire ce virage. »', kart: 0x2e8b57, cargo: true,
    stats: { speed: 0.9, accel: 1.2, handling: 1.12, weight: 0.7 },
    power: { id: 'deconstruction', name: 'Déconstruction', desc: 'Déconstruit les karts à moins de 40 m : plus de turbo, plus d’immunité, plus d’objet, et un grand coup de frein. Son vélo-cargo, lui, repart.' },
    look: { skin: 0xd9a577, suit: 0x2e8b57, shirt: 0xf4e4c1, hair: 'helmet', hairColor: 0x5a3a1a, acc: ['backpack'] } },
  { id: 'hubert', name: 'Gérard L’Archiduc', title: 'Le sénateur éternel', quote: '« Je roule depuis 1974. »', kart: 0x5c1a33,
    stats: { speed: 1.05, accel: 0.8, handling: 0.95, weight: 1.4 },
    power: { id: 'amendement', name: 'Amendement de dernière minute', desc: 'Échange sa place avec le kart qui le précède. Adopté en commission, sans débat.' },
    look: { skin: 0xf5d6c6, suit: 0x2b2b2b, shirt: 0xffffff, hair: 'white', hairColor: 0xeeeeee, acc: ['monocle', 'bowtie', 'pocket'] } },
  { id: 'lulu', name: 'Jean-Luc Mélèche', title: 'Le tribun de la rue', quote: '« La République, c’est moi ! »', kart: 0x7b2cbf,
    stats: { speed: 1.15, accel: 0.95, handling: 0.72, weight: 0.9 },
    power: { id: 'megaphone', name: 'Mégaphone', desc: 'Onde de choc sonore : tous les karts proches sont repoussés et sonnés. Le message passe.' },
    look: { skin: 0xc68642, suit: 0x7b2cbf, shirt: 0xffffff, hair: 'wild', hairColor: 0x3a1f0f, acc: ['scarf', 'megaphone'] } },
  { id: 'bernadette', name: 'Marine Le Stylo', title: 'La reine du recadrage', quote: '« Ce n’est pas un virage, c’est un recadrage. »', kart: 0xe85d9a,
    stats: { speed: 1.02, accel: 1.05, handling: 1.05, weight: 0.9 },
    power: { id: 'chatons', name: 'Lâcher de chatons', desc: 'Lâche une portée de chatons derrière elle. Personne n’ose rouler dessus : les karts qui arrivent pilent et zigzaguent. Elle les reprendra après la course.' },
    look: { skin: 0xf5d6c6, suit: 0xe85d9a, shirt: 0xffffff, hair: 'bob', hairColor: 0xc9a227, acc: ['pearls', 'sunglasses'] } },
  { id: 'kevin', name: 'Jordan Mortadella', title: 'L’influenceur politique', quote: '« Likez, partagez, doublez. »', kart: 0x00c2cb,
    stats: { speed: 1.1, accel: 1.1, handling: 0.85, weight: 0.75 },
    power: { id: 'audience', name: 'Vol d’audience', desc: 'Pique l’objet du kart qui le précède. Sans kart devant, l’algorithme lui en offre un au hasard.' },
    look: { skin: 0xd9a577, suit: 0x222222, shirt: 0x00c2cb, hair: 'hoodie', hairColor: 0x222222, acc: ['selfie', 'ringlight'] } },
  { id: 'odile', name: 'Eva Joly-Jumper', title: 'La juge anticorruption', quote: '« Le dossier est instruit, le kart est saisi. »', kart: 0x2b2b2b,
    stats: { speed: 0.98, accel: 0.95, handling: 1.2, weight: 1.05 },
    power: { id: 'examen', name: 'Mise en examen', desc: 'Le kart qui la précède est immobilisé 1,8 s et perd son objet. Sans appel.' },
    look: { skin: 0xe8b48a, suit: 0x111111, shirt: 0xffffff, hair: 'bun', hairColor: 0x3a2a1a, acc: ['rabat', 'glasses'] } },
  { id: 'patrick', name: 'José Bovin', title: 'Le faucheur volontaire', quote: '« On ne fauche pas que les OGM. »', kart: 0x3f8a3a, tractor: true,
    stats: { speed: 0.88, accel: 0.9, handling: 0.9, weight: 1.6 },
    power: { id: 'fauchage', name: 'Fauchage volontaire', desc: 'Fauche tout ce qui pousse sur 60 m devant lui : barricades, urnes truquées et autres pièges disparaissent, et les karts pris dans l’andain partent en tête-à-queue.' },
    look: { skin: 0xe8b48a, suit: 0x2f55c7, shirt: 0xd9c45c, hair: 'strawhat', hairColor: 0x6b4a2b, acc: ['overalls', 'moustache', 'straw'] } },
  { id: 'lucie', name: 'Nathalie Artichaut', title: 'La candidate à 1 %', quote: '« Personne ne me voit venir. Littéralement. »', kart: 0xf2c14e,
    stats: { speed: 0.92, accel: 1.15, handling: 1.0, weight: 0.8 },
    power: { id: 'rattrapage', cd: 12, name: 'Temps de parole', desc: 'Égalité du temps de parole : énorme boost de rattrapage, uniquement quand elle est 4e ou moins. Se recharge deux fois plus vite.' },
    look: { skin: 0xc68642, suit: 0xf2c14e, shirt: 0x222222, hair: 'ponytail', hairColor: 0x1a1a1a, acc: ['badge'] } },
  { id: 'gaspard', name: 'Bruno Le Maigre', title: 'Le technocrate de Bercy', quote: '« Ce virage n’est pas budgété. »', kart: 0x5b6b82,
    stats: { speed: 1.0, accel: 0.92, handling: 1.12, weight: 0.95 },
    power: { id: 'rabot', name: 'Coup de rabot', desc: 'Rabot budgétaire général : la vitesse maximale de tous les adversaires baisse de 15 % pendant 4 s. Lui a trouvé des économies.' },
    look: { skin: 0xf1c27d, suit: 0x4a5568, shirt: 0xffffff, hair: 'sidepart', hairColor: 0x2a1f14, acc: ['glasses', 'tie', 'calculator'], tie: 0x1f3a93 } },
  { id: 'jeanmi', name: 'Éric Zemmoule', title: 'Le populiste de plateau télé', quote: '« Le système ne veut pas que je gagne ! »', kart: 0xd35400,
    stats: { speed: 1.12, accel: 1.0, handling: 0.8, weight: 1.15 },
    power: { id: 'fakenews', name: 'Fake news', desc: 'Sème une fausse rangée d’urnes dorées sur la piste devant lui. Ceux qui y croient calent. Lui sait que c’est faux.' },
    look: { skin: 0xe8b48a, suit: 0x2b2b2b, shirt: 0xd35400, hair: 'quiff', hairColor: 0x6b4a2b, acc: ['mic', 'opencollar'] } },
  { id: 'martine', name: 'Gérald Darmalin', title: 'Le ministre de l’Intérieur', quote: '« Circulez, y a rien à voir. »', kart: 0x1b2a49,
    stats: { speed: 1.0, accel: 1.05, handling: 0.95, weight: 1.2 },
    power: { id: 'controle', name: 'Contrôle d’identité', desc: 'Contrôle inopiné : les deux karts juste derrière lui sont arrêtés 1,2 s, le temps de sortir leurs papiers.' },
    look: { skin: 0xf5d6c6, suit: 0x1b2a49, shirt: 0xffffff, hair: 'kepi', hairColor: 0x8a6a3a, acc: ['whistle', 'sunglasses'] } },
  { id: 'aymeric', name: 'Michel Bananier', title: 'Le lobbyiste européen', quote: '« Ce n’est pas moi, c’est Bruxelles qui l’impose. »', kart: 0x003399,
    stats: { speed: 1.05, accel: 1.0, handling: 1.05, weight: 0.95 },
    power: { id: 'directive', name: 'Directive européenne', desc: 'Transposition immédiate : tous les adversaires sont bridés à 110 km/h pendant 3 s. Lui a obtenu une dérogation.' },
    look: { skin: 0xf3c9a0, suit: 0x1c2541, shirt: 0xbcd4ff, hair: 'slick', hairColor: 0xd9b56a, acc: ['tie', 'eurobadge', 'briefcase'], tie: 0xffcc00 } },
  { id: 'thierry', name: 'Manuel Valse', title: 'Le transfuge', quote: '« Je n’ai pas changé, c’est le parti qui a bougé. »', kart: 0x8e7cc3,
    stats: { speed: 1.0, accel: 1.08, handling: 1.0, weight: 1.0 },
    power: { id: 'ralliement', name: 'Ralliement', desc: 'Change de camp au bon moment : copie le pouvoir du kart qui le précède. En tête, il rallie le vainqueur annoncé et file.' },
    look: { skin: 0xe8b48a, suit: 0x8e7cc3, shirt: 0xffffff, hair: 'sides', hairColor: 0x5a5a5a, acc: ['weathervane', 'rosettes'] } },
];

/** The defaults, snapshotted before the workshop can touch CHARACTERS. */
export const BASE = CHARACTERS.map(c => ({ name: c.name, title: c.title, quote: c.quote, suit: c.look.suit, kart: c.kart }));

// ---------- Items ----------
export const ITEMS = {
  turbo:       { name: '49.3 Turbo',               icon: '⚡',  hint: 'Passage en force : boost immédiat.' },
  greve:       { name: 'Grève surprise',           icon: '🚧', hint: 'Dépose une barricade derrière vous.' },
  dossier:     { name: 'Dossier Mediapart',         icon: '📁', hint: 'Fuite ciblée sur le kart qui vous précède : Mediapart enquête sur lui.' },
  motion:      { name: 'Motion de censure',        icon: '🗳️', hint: 'Renverse le leader de la course.' },
  immunite:    { name: 'Immunité parlementaire',   icon: '🛡️', hint: 'Intouchable 6 secondes, et plus rapide.' },
  sondage:     { name: 'Sondage truqué',           icon: '📊', hint: 'Dépose une fausse urne : celui qui la ramasse cale.' },
  helico:      { name: 'Hélico présidentiel',      icon: '🚁', hint: 'Survol de la circonscription pendant 4 s : rapide, hors d’atteinte.' },
  remaniement: { name: 'Remaniement',              icon: '🔁', hint: 'Tous les karts devant vous perdent leur objet et hésitent.' },
  relance:     { name: 'Plan de relance',          icon: '💶', hint: 'Trois boosts successifs, financés par la dette.' },
  bravm:       { name: 'BRAV-M',                    icon: '🏍️', hint: 'Deux motos de la BRAV-M foncent et percutent les karts devant vous.' },
  lacrymo:     { name: 'Nuage lacrymogène',         icon: '💨', hint: 'Lâche un nuage de gaz : ceux qui le traversent ralentissent et perdent le cap.' },
  casserolade: { name: 'Casserolade',               icon: '🥘', hint: 'Concert de casseroles : les karts proches sont secoués et sonnés.' },
  dissolution: { name: 'Dissolution',               icon: '📜', hint: 'Dissout l’Assemblée : tous les autres karts sont sonnés un court instant.' },
  niche:       { name: 'Niche fiscale',             icon: '🧾', hint: 'Optimisation : intouchable, plus rapide et clignotant 5 s.' },
  langue:      { name: 'Langue de bois',            icon: '🤐', hint: 'Bouclier : le prochain coup reçu est esquivé sans commentaire.' },
  cumul:       { name: 'Cumul des mandats',         icon: '🎖️', hint: 'Deux mandats, deux objets : en tire deux au hasard et les utilise d’un coup.' },
  factcheck:   { name: 'Fact-checking',             icon: '🔍', hint: 'Vérifie le kart qui vous précède : traverse son immunité et le sonne.' },
  pantouflage: { name: 'Pantouflage',               icon: '🥿', hint: 'Reconversion express dans le privé : un bond en avant sur la piste.' },
  referendum:  { name: 'Référendum',                icon: '🗳', hint: 'Coup de poker : le oui booste tout le monde, le non sonne vos adversaires, l’abstention vous ralentit.' },
};
/** The statuses the HUD lists on the player's kart (payload.js statusOf, StatusBadges): glyph, name, and whether it helps. */
export const STATUSES = {
  slowed:   { icon: '🐌', name: 'Ralenti',        good: false },
  confused: { icon: '🌀', name: 'Désorienté',     good: false },
  capped:   { icon: '🇪🇺', name: 'Bridé à 110',    good: false },
  rabot:    { icon: '🪚', name: 'Raboté',         good: false },
  slip:     { icon: '💩', name: 'Ça glisse',      good: false },
  relance:  { icon: '💶', name: 'Plan de relance', good: true },
  shield:   { icon: '🤐', name: 'Langue de bois', good: true },
  immunity: { icon: '🛡️', name: 'Immunité',       good: true },
  phantom:  { icon: '🧾', name: 'Niche fiscale',  good: true },
  fly:      { icon: '🚁', name: 'Hélico',         good: true },
};
export const ITEM_ODDS = [
  { turbo: 24, greve: 26, dossier: 8, sondage: 16, casserolade: 10, niche: 6, langue: 12, referendum: 4 },
  { turbo: 20, greve: 14, dossier: 16, sondage: 10, bravm: 10, casserolade: 8, niche: 8, langue: 8, factcheck: 6, referendum: 6 },
  { turbo: 16, greve: 6, dossier: 16, sondage: 8, bravm: 12, motion: 8, casserolade: 8, lacrymo: 8, relance: 8, factcheck: 8, cumul: 6, pantouflage: 6 },
  { turbo: 12, dossier: 12, motion: 14, bravm: 12, lacrymo: 10, immunite: 8, relance: 8, niche: 8, factcheck: 8, cumul: 8, pantouflage: 8 },
  { turbo: 8, dossier: 10, motion: 14, bravm: 12, lacrymo: 10, helico: 10, dissolution: 10, relance: 6, niche: 4, cumul: 8, pantouflage: 10, referendum: 6 },
  { turbo: 6, motion: 12, bravm: 12, lacrymo: 10, helico: 14, dissolution: 14, immunite: 8, relance: 6, cumul: 8, pantouflage: 10 },
];
export function rollItem(rank) {
  const table = ITEM_ODDS[clamp(rank, 0, ITEM_ODDS.length - 1)];
  let total = 0; for (const k in table) total += table[k];
  let r = Math.random() * total;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return 'turbo';
}

// ---------- Tracks ----------
// A circuit: its loop (`points` at `scale`), its surface and colours, its
// `roadHalfWidth` (DEC-050), its elevation `profile` ([[f, y], ...] control
// points over the lap, f = 0 first, closed at f = 1), the fixed skeleton of
// `features`, three named `variants` of extra features one of which each race
// draws (DEC-049, engine/layout.js), the riders' count range `cyclists` and the
// `climates` it allows. Feature types: pad, ramp, pit, crossing (one per track,
// in the skeleton: snapshots list crossings by index), chicane, obstacle
// (kind: sedan, van, barrier, stall, bins, scaffold; lat within hw - 3), narrow
// (the road pinches to half-width w over len samples), bank (camber a over len),
// wind (lateral push over len, Marseille's mistral), bump (a short hump of h).
export const TRACKS = [
  { id: 'elysee', name: 'L’Élysée — Faubourg Saint-Honoré', desc: 'Tour du palais, de la cour d’honneur et des boutiques du Faubourg. Garde républicaine, berlines noires et meute de photographes.',
    ground: 0x6f9a55, sky: [0x3f7fd0, 0xc9dff2], fog: 0xc9dff2, kerb: [0xd83b4b, 0xf6f1e4], pavement: 0x9a9a92,
    points: [[0, -150], [90, -155], [160, -110], [175, -30], [150, 40], [165, 110], [90, 160], [0, 130], [-90, 160], [-165, 110], [-150, 40], [-175, -30], [-160, -110], [-90, -155]],
    scale: 3, boxRows: [0.06, 0.18, 0.36, 0.42, 0.54, 0.66, 0.74, 0.88, 0.97],
    roadHalfWidth: 13, profile: [[0, 0]], climates: ['golden', 'night', 'overcast'], cyclists: { min: 14, max: 22 },
    features: [{ t: 'pad', f: 0.12 }, { t: 'pad', f: 0.25 }, { t: 'ramp', f: 0.30, h: 3.6, len: 10 }, { t: 'pit', f: 0.30833, len: 9, kind: 'manif' }, { t: 'bank', f: 0.36, len: 60, a: 0.08 }, { t: 'pad', f: 0.47 }, { t: 'crossing', f: 0.60, color: 0x111111 }, { t: 'ramp', f: 0.70, h: 3.2, len: 9 }, { t: 'pit', f: 0.845, len: 8, kind: 'works' }, { t: 'pad', f: 0.93 }],
    variants: [
      { name: 'Visite officielle', features: [{ t: 'chicane', f: 0.78, n: 3, kind: 'vauban' }, { t: 'obstacle', f: 0.52, lat: -6, kind: 'sedan' }, { t: 'obstacle', f: 0.545, lat: 6, kind: 'sedan' }, { t: 'obstacle', f: 0.64, lat: 0, kind: 'barrier' }, { t: 'narrow', f: 0.40, len: 40, w: 9 }] },
      { name: 'Jour de manif', features: [{ t: 'chicane', f: 0.78, n: 2, kind: 'vauban' }, { t: 'obstacle', f: 0.44, lat: -7, kind: 'barrier' }, { t: 'obstacle', f: 0.455, lat: 7, kind: 'barrier' }, { t: 'pit', f: 0.53, len: 7, kind: 'manif' }, { t: 'obstacle', f: 0.57, lat: -5, kind: 'bins' }, { t: 'obstacle', f: 0.66, lat: 4, kind: 'van' }, { t: 'obstacle', f: 0.88, lat: 6, kind: 'stall' }] },
      { name: 'Travaux du Faubourg', features: [{ t: 'obstacle', f: 0.41, lat: -8, kind: 'scaffold' }, { t: 'obstacle', f: 0.43, lat: -8, kind: 'scaffold' }, { t: 'obstacle', f: 0.55, lat: 5, kind: 'bins' }, { t: 'narrow', f: 0.74, len: 50, w: 8 }, { t: 'pit', f: 0.76, len: 6, kind: 'works' }, { t: 'obstacle', f: 0.90, lat: -5, kind: 'van' }, { t: 'bump', f: 0.96, len: 6, h: 0.6 }] },
    ] },
  { id: 'bourbon', name: 'Palais Bourbon — Quais de Seine', desc: 'Le long de la Seine devant l’Assemblée : bouquinistes, bateau-mouche, pont et obélisque. Rapide sur les quais, piégeux derrière.',
    ground: 0x7a9a60, sky: [0x4a8ad6, 0xd4e6f5], fog: 0xd4e6f5, kerb: [0x1f4ea8, 0xf6f1e4], pavement: 0xa4a39b,
    points: [[0, -100], [100, -105], [170, -70], [165, 10], [120, 60], [150, 130], [70, 165], [-20, 130], [-100, 165], [-170, 120], [-165, 30], [-120, -30], [-170, -80], [-100, -105]],
    scale: 3, boxRows: [0.05, 0.18, 0.30, 0.38, 0.52, 0.62, 0.66, 0.84, 0.95],
    // two bridges: humps of 6 m, one on each half of the lap
    roadHalfWidth: 15, profile: [[0, 0], [0.14, 0], [0.20, 6], [0.26, 0], [0.84, 0], [0.90, 6], [0.96, 0]], climates: ['dawn', 'noon', 'dusk'], cyclists: { min: 16, max: 26 },
    features: [{ t: 'pad', f: 0.08 }, { t: 'pad', f: 0.33 }, { t: 'ramp', f: 0.42, h: 3.4, len: 10 }, { t: 'pit', f: 0.42833, len: 9, kind: 'works' }, { t: 'pad', f: 0.50 }, { t: 'crossing', f: 0.56, color: 0xf6f1e4, taxi: true }, { t: 'pad', f: 0.72 }, { t: 'pit', f: 0.79, len: 8, kind: 'manif' }, { t: 'pad', f: 0.98 }],
    variants: [
      { name: 'Quais en fête', features: [{ t: 'chicane', f: 0.70, n: 3, kind: 'vauban' }, { t: 'obstacle', f: 0.62, lat: 7, kind: 'stall' }, { t: 'obstacle', f: 0.645, lat: -7, kind: 'stall' }, { t: 'obstacle', f: 0.30, lat: 5, kind: 'bins' }, { t: 'bump', f: 0.53, len: 6, h: 0.5 }] },
      { name: 'Bouquinistes', features: [{ t: 'obstacle', f: 0.10, lat: 9, kind: 'stall' }, { t: 'obstacle', f: 0.115, lat: 9, kind: 'stall' }, { t: 'obstacle', f: 0.13, lat: 9, kind: 'stall' }, { t: 'obstacle', f: 0.36, lat: -6, kind: 'van' }, { t: 'narrow', f: 0.62, len: 60, w: 10 }, { t: 'obstacle', f: 0.74, lat: -8, kind: 'stall' }, { t: 'obstacle', f: 0.90, lat: 7, kind: 'bins' }] },
      { name: 'Crue de la Seine', features: [{ t: 'pit', f: 0.12, len: 8, kind: 'water' }, { t: 'pit', f: 0.30, len: 7, kind: 'water' }, { t: 'obstacle', f: 0.60, lat: -4, kind: 'barrier' }, { t: 'obstacle', f: 0.615, lat: 4, kind: 'barrier' }, { t: 'chicane', f: 0.70, n: 2, kind: 'vauban' }, { t: 'obstacle', f: 0.86, lat: 6, kind: 'sedan' }] },
    ] },
  { id: 'versailles', name: 'Versailles — Jardins du Congrès', desc: 'Allées de gravier entre bosquets, fontaines et parterres, château au fond. Le Congrès est réuni, le dérapage est autorisé.',
    ground: 0x8aa860, sky: [0x5a97dc, 0xe3eef8], fog: 0xe3eef8, kerb: [0xd9b24a, 0xf6f1e4], pavement: 0xcbb98a, gravel: true,
    points: [[0, -160], [110, -160], [150, -100], [110, -40], [150, 20], [120, 90], [40, 110], [-40, 110], [-120, 90], [-150, 20], [-110, -40], [-150, -100], [-110, -160]],
    scale: 3, boxRows: [0.04, 0.12, 0.30, 0.40, 0.58, 0.66, 0.80, 0.92],
    // two terraces: the allées drop 4 m twice (Latone, then the tapis vert) and climb back before the line
    roadHalfWidth: 17, profile: [[0, 0], [0.28, 0], [0.32, -4], [0.58, -4], [0.62, -8], [0.80, -8], [0.92, 0]], climates: ['noon', 'golden', 'overcast'], cyclists: { min: 12, max: 20 },
    features: [{ t: 'pad', f: 0.08 }, { t: 'ramp', f: 0.20, h: 3.8, len: 10 }, { t: 'pit', f: 0.20833, len: 10, kind: 'water' }, { t: 'pad', f: 0.36 }, { t: 'ramp', f: 0.44, h: 2.6, len: 8 }, { t: 'pad', f: 0.64 }, { t: 'ramp', f: 0.72, h: 3.0, len: 8 }, { t: 'pit', f: 0.72667, len: 8, kind: 'water' }, { t: 'crossing', f: 0.85, color: 0x2f6b3a }, { t: 'pad', f: 0.88 }, { t: 'pit', f: 0.97, len: 7, kind: 'works' }],
    variants: [
      { name: 'Jour du Congrès', features: [{ t: 'chicane', f: 0.50, n: 4, kind: 'hedge' }, { t: 'obstacle', f: 0.56, lat: -8, kind: 'sedan' }, { t: 'obstacle', f: 0.575, lat: 8, kind: 'sedan' }, { t: 'obstacle', f: 0.92, lat: 0, kind: 'barrier' }] },
      { name: 'Grandes Eaux', features: [{ t: 'pit', f: 0.30, len: 7, kind: 'water' }, { t: 'chicane', f: 0.50, n: 2, kind: 'hedge' }, { t: 'pit', f: 0.58, len: 7, kind: 'water' }, { t: 'obstacle', f: 0.14, lat: 9, kind: 'bins' }, { t: 'bump', f: 0.78, len: 6, h: 0.5 }] },
      { name: 'Labyrinthe', features: [{ t: 'narrow', f: 0.26, len: 50, w: 11 }, { t: 'chicane', f: 0.48, n: 5, kind: 'hedge' }, { t: 'chicane', f: 0.54, n: 3, kind: 'hedge' }, { t: 'obstacle', f: 0.80, lat: 10, kind: 'stall' }] },
    ] },
  // Tracks are referenced by index (saved stats, the lobby, the server's byTrack), so new ones are appended, never inserted.
  { id: 'montmartre', name: 'Montmartre — La Butte', desc: 'Montée pavée vers le Sacré-Cœur, place du Tertre et ses peintres, funiculaire et terrasses de café. Le Congrès est loin, les pigeons non.',
    ground: 0x6f9a55, sky: [0x86b0e0, 0xf2dcd8], fog: 0xf2dcd8, kerb: [0x24357a, 0xf6f1e4], pavement: 0xcdbf9e, cobble: true,
    points: [[0, -165], [95, -170], [165, -130], [175, -60], [180, 40], [150, 110], [100, 165], [30, 150], [-40, 172], [-120, 160], [-175, 100], [-160, 20], [-175, -80], [-110, -160]],
    scale: 3, boxRows: [0.05, 0.13, 0.26, 0.40, 0.50, 0.57, 0.66, 0.82, 0.95],
    // the butte: a real climb of 22 m up the long right-hand straight, the place du Tertre on top, the descent down the other side (DEC-050 replaces A-035's ramps in series)
    roadHalfWidth: 11, profile: [[0, 0], [0.10, 2], [0.22, 14], [0.32, 22], [0.42, 22], [0.50, 20], [0.62, 14], [0.72, 8], [0.85, 2], [0.94, 0]], climates: ['dusk', 'night', 'dawn'], cyclists: { min: 12, max: 18 },
    features: [{ t: 'pad', f: 0.08 }, { t: 'bump', f: 0.26, len: 6, h: 0.5 }, { t: 'bump', f: 0.275, len: 6, h: 0.5 }, { t: 'bump', f: 0.29, len: 6, h: 0.5 }, { t: 'pad', f: 0.30 }, { t: 'ramp', f: 0.36, h: 2.6, len: 8 }, { t: 'pad', f: 0.46 }, { t: 'crossing', f: 0.60, color: 0xf6f1e4, taxi: true }, { t: 'pad', f: 0.63 }, { t: 'pit', f: 0.84, len: 8, kind: 'works' }, { t: 'pad', f: 0.92 }],
    variants: [
      { name: 'Place du Tertre', features: [{ t: 'chicane', f: 0.78, n: 3, kind: 'vauban' }, { t: 'obstacle', f: 0.40, lat: 5, kind: 'stall' }, { t: 'obstacle', f: 0.415, lat: -5, kind: 'stall' }, { t: 'obstacle', f: 0.55, lat: 4, kind: 'sedan' }, { t: 'obstacle', f: 0.70, lat: -6, kind: 'bins' }] },
      { name: 'Fête des vendanges', features: [{ t: 'obstacle', f: 0.12, lat: 6, kind: 'stall' }, { t: 'obstacle', f: 0.135, lat: -6, kind: 'stall' }, { t: 'pit', f: 0.44, len: 8, kind: 'manif' }, { t: 'obstacle', f: 0.52, lat: 0, kind: 'barrier' }, { t: 'chicane', f: 0.78, n: 2, kind: 'vauban' }, { t: 'obstacle', f: 0.88, lat: 5, kind: 'van' }] },
      { name: 'Nuit blanche', features: [{ t: 'obstacle', f: 0.16, lat: -7, kind: 'scaffold' }, { t: 'narrow', f: 0.50, len: 50, w: 8 }, { t: 'obstacle', f: 0.66, lat: -5, kind: 'sedan' }, { t: 'obstacle', f: 0.68, lat: 5, kind: 'sedan' }, { t: 'obstacle', f: 0.80, lat: 6, kind: 'bins' }, { t: 'bump', f: 0.90, len: 6, h: 0.6 }] },
    ] },
  { id: 'marseille', name: 'Marseille — Vieux-Port', desc: 'Les quais du Vieux-Port : bateaux, grande roue, Bonne Mère sur sa colline et terrasses de pastis. Rapide le long de l’eau, serré derrière. Le pastis n’est pas un carburant.',
    ground: 0x8aa860, sky: [0x2b7fd6, 0xcfe9fb], fog: 0xcfe9fb, kerb: [0x2a7fd4, 0xf6f1e4], pavement: 0xd8c9a3,
    points: [[0, -170], [110, -168], [172, -125], [178, -40], [165, 50], [175, 120], [110, 168], [30, 140], [-50, 170], [-120, 150], [-170, 95], [-140, 30], [-175, -50], [-120, -150]],
    scale: 3, boxRows: [0.05, 0.17, 0.31, 0.44, 0.52, 0.61, 0.74, 0.83, 0.96],
    // flat along the quays, then the back half climbs 14 m to the Corniche, banked along the sea, in the mistral, and drops back to the port
    roadHalfWidth: 14, profile: [[0, 0], [0.45, 0], [0.55, 6], [0.65, 14], [0.78, 14], [0.88, 6], [0.96, 0]], climates: ['noon', 'golden', 'overcast'], cyclists: { min: 14, max: 24 },
    features: [{ t: 'pad', f: 0.08 }, { t: 'ramp', f: 0.25, h: 3.4, len: 10 }, { t: 'pit', f: 0.25833, len: 9, kind: 'manif' }, { t: 'pad', f: 0.34 }, { t: 'pit', f: 0.40, len: 8, kind: 'works' }, { t: 'pad', f: 0.47 }, { t: 'crossing', f: 0.56, color: 0xf6f1e4, taxi: true }, { t: 'pad', f: 0.64 }, { t: 'bank', f: 0.68, len: 70, a: 0.12 }, { t: 'wind', f: 0.73, len: 60, push: 3.5 }, { t: 'ramp', f: 0.80, h: 2.8, len: 8 }, { t: 'pad', f: 0.86 }, { t: 'pit', f: 0.93, len: 8, kind: 'water' }],
    variants: [
      { name: 'Jour de mistral', features: [{ t: 'chicane', f: 0.17, n: 3, kind: 'vauban' }, { t: 'obstacle', f: 0.44, lat: -6, kind: 'bins' }, { t: 'wind', f: 0.58, len: 50, push: 4 }, { t: 'obstacle', f: 0.90, lat: 7, kind: 'stall' }] },
      { name: 'Fête du pastis', features: [{ t: 'obstacle', f: 0.12, lat: 8, kind: 'stall' }, { t: 'obstacle', f: 0.135, lat: 8, kind: 'stall' }, { t: 'obstacle', f: 0.15, lat: -8, kind: 'stall' }, { t: 'chicane', f: 0.17, n: 2, kind: 'vauban' }, { t: 'pit', f: 0.52, len: 7, kind: 'manif' }, { t: 'obstacle', f: 0.76, lat: -5, kind: 'van' }] },
      { name: 'Jour de match', features: [{ t: 'pit', f: 0.18, len: 8, kind: 'manif' }, { t: 'obstacle', f: 0.30, lat: -5, kind: 'barrier' }, { t: 'obstacle', f: 0.315, lat: 5, kind: 'barrier' }, { t: 'obstacle', f: 0.44, lat: 6, kind: 'sedan' }, { t: 'chicane', f: 0.60, n: 2, kind: 'vauban' }, { t: 'obstacle', f: 0.90, lat: -7, kind: 'bins' }] },
    ] },
];
