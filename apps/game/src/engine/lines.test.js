// The LINES table (DEC-038): every leaf well formed, variant 0 the sentence
// the game said before the table existed, placeholders declared, and the
// picker deterministic under a fixed rng.
import { afterEach, describe, expect, it } from 'vitest';

import { CHARACTERS, ITEMS } from './data.js';
import { LINE_VARS, LINES, line, plural, setLineRng, variants } from './lines.js';

afterEach(() => setLineRng(null));

/** Every leaf of LINES as [path, variants]. */
function leaves(node = LINES, prefix = '') {
  const out = [];
  for (const key of Object.keys(node)) {
    const v = node[key], path = prefix ? prefix + '.' + key : key;
    if (Array.isArray(v)) out.push([path, v]); else out.push(...leaves(v, path));
  }
  return out;
}

// What items.js and powers.js said before the table, copied from the source
// of that day. Grève surprise and Sondage truqué said nothing then: their
// `use` is new, the driver now reads their own drop like every other item.
const FORMER = {
  'item.turbo.use': '49.3 ! PASSAGE EN FORCE',
  'item.greve.use': 'GRÈVE SURPRISE : BARRICADE DÉPOSÉE',
  'item.dossier.use': 'FUITE : MEDIAPART EST SUR LE COUP',
  'item.dossier.hit': 'MEDIAPART ENQUÊTE SUR VOUS !',
  'item.motion.use': 'MOTION DE CENSURE !',
  'item.motion.hit': 'GOUVERNEMENT RENVERSÉ !',
  'item.immunite.use': 'IMMUNITÉ PARLEMENTAIRE',
  'item.sondage.use': 'SONDAGE TRUQUÉ : FAUSSE URNE DÉPOSÉE',
  'item.helico.use': 'HÉLICO PRÉSIDENTIEL',
  'item.remaniement.use': 'REMANIEMENT : ${n} MINISTRES LIMOGÉS',
  'item.remaniement.hit': 'REMANIEMENT : VOUS ÊTES LIMOGÉ·E !',
  'item.relance.use': 'PLAN DE RELANCE : 3 BOOSTS',
  'item.bravm.use': 'BRAV-M DÉPLOYÉE !',
  'item.bravm.hit': 'INTERPELLÉ PAR LA BRAV-M !',
  'item.lacrymo.use': 'NUAGE LACRYMOGÈNE LÂCHÉ',
  'item.casserolade.use': 'CASSEROLADE : ${n} SONNÉ${s}',
  'item.casserolade.hit': 'CASSEROLADE !',
  'item.dissolution.use': 'DISSOLUTION : ${n} KART${s} SONNÉ${s}',
  'item.dissolution.hit': 'DISSOLUTION DE L’ASSEMBLÉE !',
  'item.niche.use': 'NICHE FISCALE : INTOUCHABLE',
  'item.langue.use': 'LANGUE DE BOIS : PRÊT À NE RIEN DIRE',
  'item.cumul.use': 'CUMUL DES MANDATS : ${names}',
  'item.factcheck.use': 'FACT-CHECKING : VÉRIFICATION EN COURS',
  'item.factcheck.hit': 'FACT-CHECKÉ : C’ÉTAIT FAUX !',
  'item.pantouflage.use': 'PANTOUFLAGE : RECONVERTI DANS LE PRIVÉ',
  'item.referendum.use': 'RÉFÉRENDUM : LE OUI L’EMPORTE, BOOST POUR TOUS',
  'item.referendum.hit': 'RÉFÉRENDUM : LE OUI L’EMPORTE, BOOST !',
  'item.referendum.non': 'RÉFÉRENDUM : LE NON L’EMPORTE, ${n} SONNÉ${s}',
  'item.referendum.nonHit': 'RÉFÉRENDUM : LE NON L’EMPORTE !',
  'item.referendum.nul': 'RÉFÉRENDUM : 12 % DE PARTICIPATION, RÉSULTAT ANNULÉ',
  'power.debat.use': 'GRAND DÉBAT : TOUT LE MONDE ÉCOUTE',
  'power.debat.hit': 'GRAND DÉBAT : VOUS ÉCOUTEZ ${name}',
  'power.blocage.use': 'GRÈVE GÉNÉRALE !',
  'power.rondpoint.use': 'ROND-POINT INAUGURÉ',
  'power.deconstruction.use': 'DÉCONSTRUCTION : ${n} KART${s} DÉCONSTRUIT${s}',
  'power.deconstruction.hit': 'DÉCONSTRUIT·E PAR ${name} : PLUS RIEN NE TIENT',
  'power.deconstruction.none': 'RIEN À DÉCONSTRUIRE : ON PÉDALE',
  'power.amendement.use': 'AMENDEMENT ADOPTÉ : PLACE ÉCHANGÉE',
  'power.amendement.hit': 'AMENDEMENT : ${name} VOUS PREND LA PLACE',
  'power.amendement.none': 'AMENDEMENT : PERSONNE DEVANT, BOOST',
  'power.megaphone.use': 'MÉGAPHONE : ${n} KART${s} REPOUSSÉ${s}',
  'power.megaphone.hit': 'LE MÉGAPHONE DE ${name} VOUS REPOUSSE !',
  'power.chatons.use': 'LÂCHER DE CHATONS : ATTENTION, ILS SONT MIGNONS',
  'power.audience.use': 'VOL D’AUDIENCE : ${item}',
  'power.audience.hit': 'VOTRE OBJET A ÉTÉ VOLÉ !',
  'power.examen.use': 'MISE EN EXAMEN DE ${name}',
  'power.examen.hit': 'VOUS ÊTES MIS·E EN EXAMEN !',
  'power.examen.none': 'NON-LIEU : PERSONNE DEVANT, BOOST',
  'power.fauchage.use': 'FAUCHAGE VOLONTAIRE : ${m} PIÈGE${ms} ET ${n} KART${s} FAUCHÉS',
  'power.fauchage.hit': 'FAUCHÉ·E PAR ${name} !',
  'power.fauchage.none': 'RIEN À FAUCHER : LE TRACTEUR ACCÉLÈRE',
  'power.rattrapage.use': 'TEMPS DE PAROLE : RATTRAPAGE !',
  'power.rattrapage.early': 'TEMPS DE PAROLE : SEULEMENT À PARTIR DE LA 4e PLACE',
  'power.rabot.use': 'COUP DE RABOT : -15 % POUR TOUT LE MONDE SAUF VOUS',
  'power.rabot.hit': 'COUP DE RABOT BUDGÉTAIRE : -15 % DE VITESSE',
  'power.fakenews.use': 'FAKE NEWS : FAUSSES URNES DEVANT',
  'power.controle.use': 'CONTRÔLE D’IDENTITÉ : ${n} KART${s} ARRÊTÉ${s}',
  'power.controle.hit': 'CONTRÔLE D’IDENTITÉ : VOS PAPIERS !',
  'power.controle.none': 'RIEN À SIGNALER : BOOST',
  'power.directive.use': 'DIRECTIVE EUROPÉENNE : ADVERSAIRES BRIDÉS À 110',
  'power.directive.hit': 'DIRECTIVE EUROPÉENNE : LIMITÉ À 110 KM/H',
  'power.ralliement.use': 'RALLIEMENT À ${name} : ${power}',
  'power.ralliement.none': 'RALLIEMENT AU VAINQUEUR ANNONCÉ : BOOST',
  'hazard.lacrymo.hit': 'GAZ LACRYMOGÈNE !',
  'hazard.chatons.hit': 'CHATONS SUR LA ROUTE : ON PILE !',
  'hazard.lisier.hit': 'LISIER : ÇA GLISSE !',
  'hazard.rondpoint.hit': 'PRIORITÉ AU ROND-POINT !',
  'hazard.fakebox.hit': 'SONDAGE TRUQUÉ !',
  'hazard.barricade.hit': 'BLOQUÉ PAR LA GRÈVE !',
  'hazard.cortege.hit': 'RENVERSÉ PAR LE CORTÈGE !',
  'shield.parry': 'LANGUE DE BOIS : « JE NE FERAI AUCUN COMMENTAIRE »',
};

describe('the LINES table', () => {
  it('has four to six distinct, non-empty variants per leaf', () => {
    for (const [path, v] of leaves()) {
      expect(v.length, path).toBeGreaterThanOrEqual(4); expect(v.length, path).toBeLessThanOrEqual(6);
      expect(new Set(v).size, path).toBe(v.length);
      for (const t of v) expect(typeof t === 'string' && t.trim().length > 0, path).toBe(true);
    }
  });

  it('is upper-case, placeholders and the ordinal e of "4e" aside', () => {
    for (const [path, v] of leaves()) for (const t of v) {
      const bare = t.replace(/\$\{\w+\}/g, '').replace(/(?<=\d)e\b/g, '');
      expect(bare, path + ': ' + t).toBe(bare.toUpperCase());
    }
  });

  it('keeps variant 0 as the sentence the game said before the table', () => {
    for (const [path, v] of leaves()) expect(v[0], path).toBe(FORMER[path]);
    expect(Object.keys(FORMER).sort()).toEqual(leaves().map(([p]) => p).sort());   // and nothing former was dropped
  });

  it('declares in LINE_VARS every placeholder a leaf uses', () => {
    for (const [path, v] of leaves()) {
      const used = new Set(); for (const t of v) for (const m of t.matchAll(/\$\{(\w+)\}/g)) used.add(m[1]);
      const declared = LINE_VARS[path] || [];
      for (const key of used) expect(declared, path + ' ${' + key + '}').toContain(key);
      expect(used.has('s') && !used.has('n'), path).toBe(false);         // a plural S always goes with its count
    }
    for (const path of Object.keys(LINE_VARS)) expect(() => variants(path), path).not.toThrow();
  });

  it('has a use line for every item and every power', () => {
    for (const id of Object.keys(ITEMS)) expect(LINES.item[id]?.use, id).toBeInstanceOf(Array);
    for (const c of CHARACTERS) expect(LINES.power[c.power.id]?.use, c.power.id).toBeInstanceOf(Array);
    expect(Object.keys(LINES.item).sort()).toEqual(Object.keys(ITEMS).sort());
    expect(Object.keys(LINES.power).sort()).toEqual(CHARACTERS.map(c => c.power.id).sort());
  });

  it('speaks to a victim in the second person', () => {
    const you = /VOUS|VOTRE|VOS|·E|ON PILE|PILEZ/;
    for (const [path, v] of leaves()) if (/\.hit$/.test(path)) expect(v.some(t => you.test(t)), path).toBe(true);
  });
});

describe('line()', () => {
  it('returns variant 0 under a fixed rng and fills the placeholders in', () => {
    setLineRng(() => 0);
    expect(line('item.motion.hit')).toBe('GOUVERNEMENT RENVERSÉ !');
    expect(line('item.remaniement.use', { n: 2, s: plural(2) })).toBe('REMANIEMENT : 2 MINISTRES LIMOGÉS');
    expect(line('item.dissolution.use', { n: 1, s: plural(1) })).toBe('DISSOLUTION : 1 KART SONNÉ');
    expect(line('power.ralliement.use', { name: 'MICHEL BANANIER', power: 'DIRECTIVE EUROPÉENNE' })).toBe('RALLIEMENT À MICHEL BANANIER : DIRECTIVE EUROPÉENNE');
  });

  it('follows the rng index and wraps it into the leaf', () => {
    const v = variants('item.turbo.use');
    setLineRng(() => 1); expect(line('item.turbo.use')).toBe(v[1]);
    setLineRng(n => n - 1); expect(line('item.turbo.use')).toBe(v[v.length - 1]);
    setLineRng(n => n + 2); expect(line('item.turbo.use')).toBe(v[2]);
  });

  it('picks from the leaf with Math.random when no rng is set', () => {
    const v = new Set(variants('shield.parry')); const seen = new Set();
    for (let i = 0; i < 200; i++) { const t = line('shield.parry'); expect(v.has(t)).toBe(true); seen.add(t); }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('throws on an unknown path, never a silent undefined', () => {
    expect(() => line('item.motoin.hit')).toThrow(/unknown path/);
    expect(() => line('item.motion')).toThrow(/unknown path/);
    expect(() => line('')).toThrow(/unknown path/);
    expect(() => line('item.motion.hit.0')).toThrow(/unknown path/);
  });

  it('throws when a placeholder is not supplied', () => {
    setLineRng(() => 0);
    expect(() => line('item.dissolution.use', { n: 3 })).toThrow(/needs \$\{s\}/);
    expect(() => line('power.debat.hit')).toThrow(/needs \$\{name\}/);
  });

  it('pluralises past one', () => {
    expect(plural(0)).toBe(''); expect(plural(1)).toBe(''); expect(plural(2)).toBe('S');
  });
});
