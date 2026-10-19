// The game's content: the cast, the items, the circuits.
//
// The cast parodies real French politicians through pun names (DEC-015); the
// stats, powers and lines are satire, as the title screen says.
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
  { id: 'capucine', name: 'Sandrine Ruisseau', title: 'L’écologiste à vélo-cargo', quote: '« Zéro émission, cent pour cent dérapage. »', kart: 0x2e8b57, cargo: true,
    stats: { speed: 0.9, accel: 1.2, handling: 1.12, weight: 0.7 },
    power: { id: 'zfe', name: 'Zone à faibles émissions', desc: 'Les karts à moins de 40 m voient leur vignette refusée et calent. Son vélo-cargo, lui, passe.' },
    look: { skin: 0xd9a577, suit: 0x2e8b57, shirt: 0xf4e4c1, hair: 'helmet', hairColor: 0x5a3a1a, acc: ['backpack'] } },
  { id: 'hubert', name: 'Gérard L’Archiduc', title: 'Le sénateur éternel', quote: '« Je roule depuis 1974. »', kart: 0x5c1a33,
    stats: { speed: 1.05, accel: 0.8, handling: 0.95, weight: 1.4 },
    power: { id: 'amendement', name: 'Amendement de dernière minute', desc: 'Échange sa place avec le kart qui le précède. Adopté en commission, sans débat.' },
    look: { skin: 0xf5d6c6, suit: 0x2b2b2b, shirt: 0xffffff, hair: 'white', hairColor: 0xeeeeee, acc: ['monocle', 'bowtie', 'pocket'] } },
  { id: 'lulu', name: 'Jean-Luc Mélèche', title: 'Le tribun de la rue', quote: '« La route nous appartient ! »', kart: 0x7b2cbf,
    stats: { speed: 1.15, accel: 0.95, handling: 0.72, weight: 0.9 },
    power: { id: 'megaphone', name: 'Mégaphone', desc: 'Onde de choc sonore : tous les karts proches sont repoussés et sonnés. Le message passe.' },
    look: { skin: 0xc68642, suit: 0x7b2cbf, shirt: 0xffffff, hair: 'wild', hairColor: 0x3a1f0f, acc: ['scarf', 'megaphone'] } },
  { id: 'bernadette', name: 'Marine Le Stylo', title: 'La reine du recadrage', quote: '« Ce n’est pas un virage, c’est un recadrage. »', kart: 0xe85d9a,
    stats: { speed: 1.02, accel: 1.05, handling: 1.05, weight: 0.9 },
    power: { id: 'elements', name: 'Éléments de langage', desc: 'Conférence de presse surprise : pendant 3 s, les adversaires proches ne savent plus où ils vont (le joueur a les commandes inversées).' },
    look: { skin: 0xf5d6c6, suit: 0xe85d9a, shirt: 0xffffff, hair: 'bob', hairColor: 0xc9a227, acc: ['pearls', 'sunglasses'] } },
  { id: 'kevin', name: 'Jordan Mortadella', title: 'L’influenceur politique', quote: '« Likez, partagez, doublez. »', kart: 0x00c2cb,
    stats: { speed: 1.1, accel: 1.1, handling: 0.85, weight: 0.75 },
    power: { id: 'audience', name: 'Vol d’audience', desc: 'Pique l’objet du kart qui le précède. Sans kart devant, l’algorithme lui en offre un au hasard.' },
    look: { skin: 0xd9a577, suit: 0x222222, shirt: 0x00c2cb, hair: 'hoodie', hairColor: 0x222222, acc: ['selfie', 'ringlight'] } },
  { id: 'odile', name: 'Eva Joly-Jumper', title: 'La juge anticorruption', quote: '« Le dossier est instruit, le kart est saisi. »', kart: 0x2b2b2b,
    stats: { speed: 0.98, accel: 0.95, handling: 1.2, weight: 1.05 },
    power: { id: 'examen', name: 'Mise en examen', desc: 'Le kart qui la précède est immobilisé 1,8 s et perd son objet. Sans appel.' },
    look: { skin: 0xe8b48a, suit: 0x111111, shirt: 0xffffff, hair: 'bun', hairColor: 0x3a2a1a, acc: ['rabat', 'glasses'] } },
  { id: 'patrick', name: 'José Bovin', title: 'L’agriculteur en colère', quote: '« On marche sur la tête, alors je roule dessus. »', kart: 0x3f8a3a, tractor: true,
    stats: { speed: 0.88, accel: 0.9, handling: 0.9, weight: 1.6 },
    power: { id: 'epandage', name: 'Épandage', desc: 'Répand du lisier derrière lui : les karts qui passent dessus glissent et ne tiennent plus la route.' },
    look: { skin: 0xe8b48a, suit: 0x2f55c7, shirt: 0xd9c45c, hair: 'strawhat', hairColor: 0x6b4a2b, acc: ['overalls', 'moustache', 'straw'] } },
  { id: 'lucie', name: 'Nathalie Artichaut', title: 'La candidate à 1 %', quote: '« Personne ne me voit venir. Littéralement. »', kart: 0xf2c14e,
    stats: { speed: 0.92, accel: 1.15, handling: 1.0, weight: 0.8 },
    power: { id: 'rattrapage', cd: 12, name: 'Temps de parole', desc: 'Égalité du temps de parole : énorme boost de rattrapage, uniquement quand elle est 4e ou moins. Se recharge deux fois plus vite.' },
    look: { skin: 0xc68642, suit: 0xf2c14e, shirt: 0x222222, hair: 'ponytail', hairColor: 0x1a1a1a, acc: ['badge'] } },
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
};
export const ITEM_ODDS = [
  { turbo: 26, greve: 30, dossier: 8, sondage: 18, casserolade: 10, niche: 8 },
  { turbo: 22, greve: 16, dossier: 20, sondage: 12, bravm: 10, casserolade: 10, niche: 10 },
  { turbo: 18, greve: 8, dossier: 20, sondage: 10, bravm: 14, motion: 10, casserolade: 8, lacrymo: 10, relance: 10 },
  { turbo: 14, dossier: 16, motion: 16, bravm: 14, lacrymo: 12, immunite: 10, relance: 8, niche: 10 },
  { turbo: 10, dossier: 12, motion: 16, bravm: 14, lacrymo: 12, helico: 12, dissolution: 12, relance: 6, niche: 6 },
  { turbo: 8, motion: 14, bravm: 14, lacrymo: 12, helico: 18, dissolution: 16, immunite: 10, relance: 8 },
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
    features: [{ t: 'pad', f: 0.12 }, { t: 'ramp', f: 0.30, h: 3.6, len: 10 }, { t: 'pit', f: 0.3167, len: 9, kind: 'manif' }, { t: 'pad', f: 0.47 }, { t: 'crossing', f: 0.60, color: 0x111111 }, { t: 'chicane', f: 0.78, n: 3, kind: 'vauban' }, { t: 'pad', f: 0.93 }] },
  { id: 'bourbon', name: 'Palais Bourbon — Quais de Seine', desc: 'Le long de la Seine devant l’Assemblée : bouquinistes, bateau-mouche, pont et obélisque. Rapide sur les quais, piégeux derrière.',
    ground: 0x7a9a60, sky: [0x4a8ad6, 0xd4e6f5], fog: 0xd4e6f5, kerb: [0x1f4ea8, 0xf6f1e4], pavement: 0xa4a39b,
    points: [[0, -100], [100, -105], [170, -70], [165, 10], [120, 60], [150, 130], [70, 165], [-20, 130], [-100, 165], [-170, 120], [-165, 30], [-120, -30], [-170, -80], [-100, -105]],
    features: [{ t: 'pad', f: 0.08 }, { t: 'ramp', f: 0.25, h: 3.4, len: 10 }, { t: 'pit', f: 0.2667, len: 9, kind: 'works' }, { t: 'pad', f: 0.43 }, { t: 'crossing', f: 0.56, color: 0xf6f1e4, taxi: true }, { t: 'chicane', f: 0.70, n: 3, kind: 'vauban' }, { t: 'ramp', f: 0.90, h: 1.8, len: 6 }] },
  { id: 'versailles', name: 'Versailles — Jardins du Congrès', desc: 'Allées de gravier entre bosquets, fontaines et parterres, château au fond. Le Congrès est réuni, le dérapage est autorisé.',
    ground: 0x8aa860, sky: [0x5a97dc, 0xe3eef8], fog: 0xe3eef8, kerb: [0xd9b24a, 0xf6f1e4], pavement: 0xcbb98a, gravel: true,
    points: [[0, -160], [110, -160], [150, -100], [110, -40], [150, 20], [120, 90], [40, 110], [-40, 110], [-120, 90], [-150, 20], [-110, -40], [-150, -100], [-110, -160]],
    features: [{ t: 'ramp', f: 0.20, h: 3.8, len: 10 }, { t: 'pit', f: 0.2167, len: 10, kind: 'water' }, { t: 'pad', f: 0.36 }, { t: 'chicane', f: 0.50, n: 4, kind: 'hedge' }, { t: 'pad', f: 0.64 }, { t: 'ramp', f: 0.72, h: 3.0, len: 8 }, { t: 'pit', f: 0.7333, len: 8, kind: 'water' }, { t: 'pad', f: 0.88 }] },
];
