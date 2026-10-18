// The game's content: the cast, the items, the circuits.
//
// All characters, parties and scandals are fictional, as the title screen
// says; the humour comes from archetypes.
//
// These are mutable singletons rather than frozen data, deliberately. The
// workshop edits a candidate's name, colours and livery in place -- see
// custom.js -- so everything that reads a character sees the player's
// customisations without having to know they exist.
import { clamp } from './util.js';

// ---------- Cast (all fictional) ----------
export const CHARACTERS = [
  { id: 'victor', name: 'Victor Lemarchand', title: 'Le jeune président', quote: '« Disruptons ce virage. »', kart: 0x1f3a93,
    stats: { speed: 1.0, accel: 1.0, handling: 1.0, weight: 1.0 },
    power: { id: 'debat', name: 'Grand débat', desc: 'Prend la parole pendant 3 s : tous les adversaires doivent écouter et roulent au ralenti.' },
    look: { skin: 0xf1c27d, suit: 0x1a2a5e, shirt: 0xffffff, hair: 'slick', hairColor: 0x3b2a1a, acc: ['tie', 'phone'], tie: 0x2d6cdf } },
  { id: 'gege', name: 'Gégé Marteau', title: 'Le syndicaliste', quote: '« Blocage total du circuit ! »', kart: 0xc1121f,
    stats: { speed: 1.08, accel: 0.85, handling: 0.82, weight: 1.35 },
    power: { id: 'blocage', name: 'Grève générale', desc: 'Déploie quatre barricades d’un coup derrière lui. Le trafic est interrompu jusqu’à nouvel ordre.' },
    look: { skin: 0xe8b48a, suit: 0xc1121f, shirt: 0x333333, hair: 'cap', hairColor: 0x222222, acc: ['moustache', 'vest'], belly: true } },
  { id: 'maurice', name: 'Maurice Ronpoint', title: 'Le maire de province', quote: '« Encore un rond-point et on y est. »', kart: 0xe0a030,
    stats: { speed: 0.95, accel: 1.0, handling: 1.15, weight: 1.1 },
    power: { id: 'rondpoint', name: 'Rond-point surprise', desc: 'Inaugure un rond-point au milieu de la route devant lui. Lui seul connaît la priorité.' },
    look: { skin: 0xf3c9a0, suit: 0xb8a070, shirt: 0xffffff, hair: 'sides', hairColor: 0x9a9a9a, acc: ['sash', 'glasses', 'rosette'], belly: true } },
  { id: 'capucine', name: 'Capucine Verdier', title: 'L’écologiste à vélo-cargo', quote: '« Zéro émission, cent pour cent dérapage. »', kart: 0x2e8b57, cargo: true,
    stats: { speed: 0.9, accel: 1.2, handling: 1.12, weight: 0.7 },
    power: { id: 'zfe', name: 'Zone à faibles émissions', desc: 'Les karts à moins de 40 m voient leur vignette refusée et calent. Son vélo-cargo, lui, passe.' },
    look: { skin: 0xd9a577, suit: 0x2e8b57, shirt: 0xf4e4c1, hair: 'helmet', hairColor: 0x5a3a1a, acc: ['backpack'] } },
  { id: 'hubert', name: 'Hubert de Castelmont', title: 'Le sénateur éternel', quote: '« Je roule depuis 1974. »', kart: 0x5c1a33,
    stats: { speed: 1.05, accel: 0.8, handling: 0.95, weight: 1.4 },
    power: { id: 'amendement', name: 'Amendement de dernière minute', desc: 'Échange sa place avec le kart qui le précède. Adopté en commission, sans débat.' },
    look: { skin: 0xf5d6c6, suit: 0x2b2b2b, shirt: 0xffffff, hair: 'white', hairColor: 0xeeeeee, acc: ['monocle', 'bowtie', 'pocket'] } },
  { id: 'lulu', name: 'Lulu Barricade', title: 'La tribune de la rue', quote: '« La route nous appartient ! »', kart: 0x7b2cbf,
    stats: { speed: 1.15, accel: 0.95, handling: 0.72, weight: 0.9 },
    power: { id: 'megaphone', name: 'Mégaphone', desc: 'Onde de choc sonore : tous les karts proches sont repoussés et sonnés. Le message passe.' },
    look: { skin: 0xc68642, suit: 0x7b2cbf, shirt: 0xffffff, hair: 'wild', hairColor: 0x3a1f0f, acc: ['scarf', 'megaphone'] } },
  { id: 'bernadette', name: 'Bernadette Roussel', title: 'La ministre de la Com’', quote: '« Ce n’est pas un virage, c’est un recadrage. »', kart: 0xe85d9a,
    stats: { speed: 1.02, accel: 1.05, handling: 1.05, weight: 0.9 },
    power: { id: 'elements', name: 'Éléments de langage', desc: 'Conférence de presse surprise : pendant 3 s, les adversaires proches ne savent plus où ils vont (le joueur a les commandes inversées).' },
    look: { skin: 0xf5d6c6, suit: 0xe85d9a, shirt: 0xffffff, hair: 'bob', hairColor: 0xc9a227, acc: ['pearls', 'sunglasses'] } },
  { id: 'kevin', name: 'Kevin Dubosq', title: 'L’influenceur politique', quote: '« Likez, partagez, doublez. »', kart: 0x00c2cb,
    stats: { speed: 1.1, accel: 1.1, handling: 0.85, weight: 0.75 },
    power: { id: 'audience', name: 'Vol d’audience', desc: 'Pique l’objet du kart qui le précède. Sans kart devant, l’algorithme lui en offre un au hasard.' },
    look: { skin: 0xd9a577, suit: 0x222222, shirt: 0x00c2cb, hair: 'hoodie', hairColor: 0x222222, acc: ['selfie', 'ringlight'] } },
  { id: 'odile', name: 'Odile Gravier', title: 'La juge anticorruption', quote: '« Le dossier est instruit, le kart est saisi. »', kart: 0x2b2b2b,
    stats: { speed: 0.98, accel: 0.95, handling: 1.2, weight: 1.05 },
    power: { id: 'examen', name: 'Mise en examen', desc: 'Le kart qui la précède est immobilisé 1,8 s et perd son objet. Sans appel.' },
    look: { skin: 0xe8b48a, suit: 0x111111, shirt: 0xffffff, hair: 'bun', hairColor: 0x3a2a1a, acc: ['rabat', 'glasses'] } },
  { id: 'patrick', name: 'Patrick Lebœuf', title: 'L’agriculteur en colère', quote: '« On marche sur la tête, alors je roule dessus. »', kart: 0x3f8a3a, tractor: true,
    stats: { speed: 0.88, accel: 0.9, handling: 0.9, weight: 1.6 },
    power: { id: 'epandage', name: 'Épandage', desc: 'Répand du lisier derrière lui : les karts qui passent dessus glissent et ne tiennent plus la route.' },
    look: { skin: 0xe8b48a, suit: 0x2f55c7, shirt: 0xd9c45c, hair: 'strawhat', hairColor: 0x6b4a2b, acc: ['overalls', 'moustache', 'straw'] } },
  { id: 'lucie', name: 'Lucie Flambeau', title: 'La candidate à 1 %', quote: '« Personne ne me voit venir. Littéralement. »', kart: 0xf2c14e,
    stats: { speed: 0.92, accel: 1.15, handling: 1.0, weight: 0.8 },
    power: { id: 'rattrapage', cd: 12, name: 'Temps de parole', desc: 'Égalité du temps de parole : énorme boost de rattrapage, uniquement quand elle est 4e ou moins. Se recharge deux fois plus vite.' },
    look: { skin: 0xc68642, suit: 0xf2c14e, shirt: 0x222222, hair: 'ponytail', hairColor: 0x1a1a1a, acc: ['badge'] } },
  { id: 'gaspard', name: 'Gaspard Tableur', title: 'Le technocrate de Bercy', quote: '« Ce virage n’est pas budgété. »', kart: 0x5b6b82,
    stats: { speed: 1.0, accel: 0.92, handling: 1.12, weight: 0.95 },
    power: { id: 'rabot', name: 'Coup de rabot', desc: 'Rabot budgétaire général : la vitesse maximale de tous les adversaires baisse de 15 % pendant 4 s. Lui a trouvé des économies.' },
    look: { skin: 0xf1c27d, suit: 0x4a5568, shirt: 0xffffff, hair: 'sidepart', hairColor: 0x2a1f14, acc: ['glasses', 'tie', 'calculator'], tie: 0x1f3a93 } },
  { id: 'jeanmi', name: 'Jean-Mi Vérité', title: 'Le populiste de plateau télé', quote: '« Le système ne veut pas que je gagne ! »', kart: 0xd35400,
    stats: { speed: 1.12, accel: 1.0, handling: 0.8, weight: 1.15 },
    power: { id: 'fakenews', name: 'Fake news', desc: 'Sème une fausse rangée d’urnes dorées sur la piste devant lui. Ceux qui y croient calent. Lui sait que c’est faux.' },
    look: { skin: 0xe8b48a, suit: 0x2b2b2b, shirt: 0xd35400, hair: 'quiff', hairColor: 0x6b4a2b, acc: ['mic', 'opencollar'] } },
  { id: 'martine', name: 'Martine Fichet', title: 'La ministre de l’Intérieur', quote: '« Circulez, y a rien à voir. »', kart: 0x1b2a49,
    stats: { speed: 1.0, accel: 1.05, handling: 0.95, weight: 1.2 },
    power: { id: 'controle', name: 'Contrôle d’identité', desc: 'Contrôle inopiné : les deux karts juste derrière elle sont arrêtés 1,2 s, le temps de sortir leurs papiers.' },
    look: { skin: 0xf5d6c6, suit: 0x1b2a49, shirt: 0xffffff, hair: 'kepi', hairColor: 0x8a6a3a, acc: ['whistle', 'sunglasses'] } },
  { id: 'aymeric', name: 'Aymeric de Bruxelles', title: 'Le lobbyiste européen', quote: '« Ce n’est pas moi, c’est Bruxelles qui l’impose. »', kart: 0x003399,
    stats: { speed: 1.05, accel: 1.0, handling: 1.05, weight: 0.95 },
    power: { id: 'directive', name: 'Directive européenne', desc: 'Transposition immédiate : tous les adversaires sont bridés à 110 km/h pendant 3 s. Lui a obtenu une dérogation.' },
    look: { skin: 0xf3c9a0, suit: 0x1c2541, shirt: 0xbcd4ff, hair: 'slick', hairColor: 0xd9b56a, acc: ['tie', 'eurobadge', 'briefcase'], tie: 0xffcc00 } },
  { id: 'thierry', name: 'Thierry Volte-Face', title: 'Le transfuge', quote: '« Je n’ai pas changé, c’est le parti qui a bougé. »', kart: 0x8e7cc3,
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
export const TRACKS = [
  { id: 'elysee', name: 'L’Élysée — Faubourg Saint-Honoré', desc: 'Tour du palais, de la cour d’honneur et des boutiques du Faubourg. Garde républicaine, berlines noires et meute de photographes.',
    ground: 0x6f9a55, sky: [0x3f7fd0, 0xc9dff2], fog: 0xc9dff2, kerb: [0xd83b4b, 0xf6f1e4], pavement: 0x9a9a92,
    points: [[0, -150], [90, -155], [160, -110], [175, -30], [150, 40], [165, 110], [90, 160], [0, 130], [-90, 160], [-165, 110], [-150, 40], [-175, -30], [-160, -110], [-90, -155]],
    scale: 1.5, boxRows: [0.18, 0.42, 0.54, 0.66, 0.74, 0.88],
    features: [{ t: 'pad', f: 0.12 }, { t: 'pad', f: 0.25 }, { t: 'ramp', f: 0.30, h: 3.6, len: 10 }, { t: 'pit', f: 0.3167, len: 9, kind: 'manif' }, { t: 'pad', f: 0.47 }, { t: 'crossing', f: 0.60, color: 0x111111 }, { t: 'ramp', f: 0.70, h: 3.2, len: 9 }, { t: 'chicane', f: 0.78, n: 3, kind: 'vauban' }, { t: 'pit', f: 0.845, len: 8, kind: 'works' }, { t: 'pad', f: 0.93 }] },
  { id: 'bourbon', name: 'Palais Bourbon — Quais de Seine', desc: 'Le long de la Seine devant l’Assemblée : bouquinistes, bateau-mouche, pont et obélisque. Rapide sur les quais, piégeux derrière.',
    ground: 0x7a9a60, sky: [0x4a8ad6, 0xd4e6f5], fog: 0xd4e6f5, kerb: [0x1f4ea8, 0xf6f1e4], pavement: 0xa4a39b,
    points: [[0, -100], [100, -105], [170, -70], [165, 10], [120, 60], [150, 130], [70, 165], [-20, 130], [-100, 165], [-170, 120], [-165, 30], [-120, -30], [-170, -80], [-100, -105]],
    scale: 1.5, boxRows: [0.18, 0.38, 0.52, 0.66, 0.84, 0.95],
    features: [{ t: 'pad', f: 0.08 }, { t: 'ramp', f: 0.25, h: 3.4, len: 10 }, { t: 'pit', f: 0.2667, len: 9, kind: 'works' }, { t: 'pad', f: 0.33 }, { t: 'pad', f: 0.45 }, { t: 'crossing', f: 0.56, color: 0xf6f1e4, taxi: true }, { t: 'chicane', f: 0.70, n: 3, kind: 'vauban' }, { t: 'pit', f: 0.79, len: 8, kind: 'manif' }, { t: 'ramp', f: 0.90, h: 1.8, len: 6 }] },
  { id: 'versailles', name: 'Versailles — Jardins du Congrès', desc: 'Allées de gravier entre bosquets, fontaines et parterres, château au fond. Le Congrès est réuni, le dérapage est autorisé.',
    ground: 0x8aa860, sky: [0x5a97dc, 0xe3eef8], fog: 0xe3eef8, kerb: [0xd9b24a, 0xf6f1e4], pavement: 0xcbb98a, gravel: true,
    points: [[0, -160], [110, -160], [150, -100], [110, -40], [150, 20], [120, 90], [40, 110], [-40, 110], [-120, 90], [-150, 20], [-110, -40], [-150, -100], [-110, -160]],
    scale: 1.5, boxRows: [0.12, 0.30, 0.40, 0.58, 0.80, 0.92],
    features: [{ t: 'pad', f: 0.08 }, { t: 'ramp', f: 0.20, h: 3.8, len: 10 }, { t: 'pit', f: 0.2167, len: 10, kind: 'water' }, { t: 'pad', f: 0.36 }, { t: 'ramp', f: 0.44, h: 2.6, len: 8 }, { t: 'chicane', f: 0.50, n: 4, kind: 'hedge' }, { t: 'pad', f: 0.64 }, { t: 'ramp', f: 0.72, h: 3.0, len: 8 }, { t: 'pit', f: 0.7333, len: 8, kind: 'water' }, { t: 'pad', f: 0.88 }, { t: 'pit', f: 0.97, len: 7, kind: 'works' }] },
];
