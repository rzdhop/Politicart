// The banner lines, one table (DEC-038).
//
// Every item, power and hazard used to carry one hard-coded sentence at its
// call site in items.js and powers.js. They live here instead, four to six
// variants per line, so a race does not repeat itself. Variant 0 of each
// leaf is the sentence the game said before this table existed; the others
// are new, in the same register. `line(path)` picks one with the engine's
// own `pick`, so Math.random drives it like everything else, and tests pin
// the choice with setLineRng.
//
// Leaves: `use` is what the driver who made the move reads; `hit` is what a
// driver it landed on reads, in the second person (DEC-018, DEC-029); `none`
// is the consolation for a move that found nobody; a few moves have their own
// extra outcomes (the three referendum results, the rattrapage refused
// before 4th place). `${n}`, `${s}` (the plural S), `${name}` and the like
// are filled in from `vars`; LINE_VARS says which each path may use, and a
// placeholder the call site does not supply throws, so a typo fails in the
// tests and never shows "undefined" on a banner.
import { pick } from './util.js';

export const LINES = {
  item: {
    turbo: { use: [
      '49.3 ! PASSAGE EN FORCE',
      '49.3 : SANS VOTE, SANS FREIN',
      'ARTICLE 49.3 : ON NE DÉBAT PLUS',
      '49.3 : LE PARLEMENT ATTENDRA',
      'PASSAGE EN FORCE, ENCORE UN',
    ] },
    greve: { use: [
      'GRÈVE SURPRISE : BARRICADE DÉPOSÉE',
      'PRÉAVIS DÉPOSÉ, BARRICADE AUSSI',
      'BARRICADE : LE TRAFIC EST PERTURBÉ',
      'GRÈVE SURPRISE : PERSONNE NE PASSE',
      'BARRICADE DERRIÈRE VOUS, JUSQU’À NOUVEL ORDRE',
    ] },
    dossier: {
      use: [
        'FUITE : MEDIAPART EST SUR LE COUP',
        'DOSSIER TRANSMIS À MEDIAPART',
        'FUITE ORGANISÉE : LA PRESSE ENQUÊTE',
        'MEDIAPART PUBLIE DEMAIN MATIN',
        'LE DOSSIER EST PARTI, BONNE CHANCE',
      ],
      hit: [
        'MEDIAPART ENQUÊTE SUR VOUS !',
        'VOUS FAITES LA UNE DE MEDIAPART !',
        'VOS NOTES DE FRAIS SONT EN LIGNE !',
        'RÉVÉLATIONS : VOUS ÊTES CUIT·E !',
        'LE DOSSIER PARLE DE VOUS !',
      ],
    },
    motion: {
      use: [
        'MOTION DE CENSURE !',
        'MOTION DE CENSURE DÉPOSÉE !',
        '289 VOIX : LA MOTION PART !',
        'LA CENSURE EST EN VOL !',
        'MOTION TRANSPARTISANE LANCÉE !',
      ],
      hit: [
        'GOUVERNEMENT RENVERSÉ !',
        'VOUS ÊTES CENSURÉ·E !',
        'MOTION ADOPTÉE : VOUS DÉMISSIONNEZ !',
        'RENVERSÉ·E PAR L’ASSEMBLÉE !',
        'VOTRE GOUVERNEMENT TOMBE !',
      ],
    },
    immunite: { use: [
      'IMMUNITÉ PARLEMENTAIRE',
      'IMMUNITÉ : INTOUCHABLE 6 SECONDES',
      'L’IMMUNITÉ EST LEVÉE... NON, ACCORDÉE',
      'PROTÉGÉ·E PAR LE MANDAT',
      'IMMUNITÉ : AUCUNE POURSUITE POSSIBLE',
    ] },
    sondage: { use: [
      'SONDAGE TRUQUÉ : FAUSSE URNE DÉPOSÉE',
      'FAUSSE URNE : 52 % D’INDÉCIS',
      'SONDAGE TRUQUÉ : MARGE D’ERREUR 100 %',
      'UNE URNE EN TROP SUR LA ROUTE',
      'SONDAGE TRUQUÉ : ÉCHANTILLON DE 3 PERSONNES',
    ] },
    helico: { use: [
      'HÉLICO PRÉSIDENTIEL',
      'HÉLICO : SURVOL DE LA CIRCONSCRIPTION',
      'DÉCOLLAGE DEPUIS L’ÉLYSÉE',
      'HÉLICO PRÉSIDENTIEL : HORS D’ATTEINTE',
      'L’HÉLICO EST PRÊT, MONSIEUR LE PRÉSIDENT',
    ] },
    remaniement: {
      use: [
        'REMANIEMENT : ${n} MINISTRES LIMOGÉS',
        'REMANIEMENT : ${n} MINISTÈRE${s} VACANT${s}',
        'REMANIEMENT : ${n} MAROQUIN${s} RETIRÉ${s}',
        'REMANIEMENT : ${n} DÉPART${s} EN BONS TERMES',
        'REMANIEMENT : ${n} MINISTRE${s} VERS LE PRIVÉ',
      ],
      hit: [
        'REMANIEMENT : VOUS ÊTES LIMOGÉ·E !',
        'REMANIEMENT : VOUS N’ÊTES PAS RECONDUIT·E !',
        'REMANIEMENT : ON VOUS REMERCIE !',
        'REMANIEMENT : VOTRE PORTEFEUILLE EST VIDE !',
        'REMANIEMENT : RENDEZ VOS DOSSIERS !',
      ],
    },
    relance: { use: [
      'PLAN DE RELANCE : 3 BOOSTS',
      'PLAN DE RELANCE : 3 BOOSTS À CRÉDIT',
      'RELANCE : 3 BOOSTS, FACTURE EN 2050',
      'QUOI QU’IL EN COÛTE : 3 BOOSTS',
      'PLAN DE RELANCE : LA DETTE PAIERA',
    ] },
    bravm: {
      use: [
        'BRAV-M DÉPLOYÉE !',
        'BRAV-M : DEUX MOTOS EN ROUTE !',
        'LA BRAV-M PREND LA PISTE !',
        'BRAV-M : MAINTIEN DE L’ORDRE !',
        'DEUX MOTOS, ZÉRO SOMMATION !',
      ],
      hit: [
        'INTERPELLÉ PAR LA BRAV-M !',
        'LA BRAV-M VOUS PLAQUE AU SOL !',
        'VOUS ÊTES EN GARDE À VUE !',
        'CONTRÔLE MUSCLÉ : VOUS RESTEZ LÀ !',
        'BRAV-M : VOUS NE BOUGEZ PLUS !',
      ],
    },
    lacrymo: { use: [
      'NUAGE LACRYMOGÈNE LÂCHÉ',
      'LACRYMO : ÇA PIQUE DERRIÈRE',
      'GAZ LÂCHÉ : DISPERSEZ-VOUS',
      'NUAGE LACRYMOGÈNE : SOMMATION FAITE',
      'LACRYMO : UN NUAGE ET BASTA',
    ] },
    casserolade: {
      use: [
        'CASSEROLADE : ${n} SONNÉ${s}',
        'CASSEROLADE : ${n} KART${s} ASSOURDI${s}',
        'CONCERT DE CASSEROLES : ${n} SONNÉ${s}',
        'CASSEROLADE : ${n} TYMPAN${s} EN GRÈVE',
        'LES CASSEROLES SONNENT : ${n} TOUCHÉ${s}',
      ],
      hit: [
        'CASSEROLADE !',
        'CASSEROLADE : VOUS N’ENTENDEZ PLUS RIEN !',
        'ON VOUS ACCUEILLE EN CASSEROLES !',
        'CASSEROLADE : CONCERT SOUS VOS FENÊTRES !',
        'VOUS ÊTES SONNÉ·E PAR LES CASSEROLES !',
      ],
    },
    dissolution: {
      use: [
        'DISSOLUTION : ${n} KART${s} SONNÉ${s}',
        'DISSOLUTION : ${n} SIÈGE${s} À REPOURVOIR',
        'DISSOLUTION : ${n} KART${s} EN CAMPAGNE',
        'ASSEMBLÉE DISSOUTE : ${n} SONNÉ${s}',
        'DISSOLUTION SURPRISE : ${n} DÉPUTÉ${s} AU TAPIS',
      ],
      hit: [
        'DISSOLUTION DE L’ASSEMBLÉE !',
        'DISSOLUTION : VOUS PERDEZ VOTRE SIÈGE !',
        'VOUS REPARTEZ EN CAMPAGNE !',
        'DISSOLUTION : RETOUR DEVANT LES ÉLECTEURS !',
        'VOTRE MANDAT S’ARRÊTE ICI !',
      ],
    },
    niche: { use: [
      'NICHE FISCALE : INTOUCHABLE',
      'NICHE FISCALE : OPTIMISATION EN COURS',
      'NICHE FISCALE : LE FISC NE VOUS VOIT PLUS',
      'INTOUCHABLE, ET DÉDUCTIBLE',
      'NICHE FISCALE : DOMICILIÉ·E AILLEURS',
    ] },
    langue: { use: [
      'LANGUE DE BOIS : PRÊT À NE RIEN DIRE',
      'LANGUE DE BOIS : ÉLÉMENTS DE LANGAGE CHARGÉS',
      'LANGUE DE BOIS : AUCUNE QUESTION, MERCI',
      'LANGUE DE BOIS : JE VOUS AI COMPRIS',
      'LANGUE DE BOIS : ON VERRA LE MOMENT VENU',
    ] },
    cumul: { use: [
      'CUMUL DES MANDATS : ${names}',
      'DEUX MANDATS, DEUX OBJETS : ${names}',
      'CUMUL : ${names}, SANS INDEMNITÉS',
      'CUMUL DES MANDATS : ${names} D’UN COUP',
      'MAIRE ET DÉPUTÉ : ${names}',
    ] },
    factcheck: {
      use: [
        'FACT-CHECKING : VÉRIFICATION EN COURS',
        'FACT-CHECKING : SOURCES EN ROUTE',
        'FACT-CHECKING : LA LOUPE EST LANCÉE',
        'VÉRIFICATION DES FAITS EN COURS',
        'FACT-CHECKING : ON RECOUPE',
      ],
      hit: [
        'FACT-CHECKÉ : C’ÉTAIT FAUX !',
        'FACT-CHECKÉ : VOS CHIFFRES SONT FAUX !',
        'FACT-CHECKING : VOUS AVEZ MENTI !',
        'VÉRIFIÉ : VOUS N’AVIEZ AUCUNE SOURCE !',
        'FACT-CHECKÉ : C’EST PLUS COMPLIQUÉ QUE ÇA !',
      ],
    },
    pantouflage: { use: [
      'PANTOUFLAGE : RECONVERTI DANS LE PRIVÉ',
      'PANTOUFLAGE : NOUVEAU POSTE, NOUVEAU SALAIRE',
      'PANTOUFLAGE : ON SE REVOIT DANS UNE BANQUE',
      'PANTOUFLAGE : LA DÉONTOLOGIE A VALIDÉ',
      'DÉPART VERS LE PRIVÉ : BON VENT',
    ] },
    referendum: {
      use: [
        'RÉFÉRENDUM : LE OUI L’EMPORTE, BOOST POUR TOUS',
        'RÉFÉRENDUM : OUI À 51 %, BOOST POUR TOUS',
        'RÉFÉRENDUM : LE OUI PASSE, TOUT LE MONDE ACCÉLÈRE',
        'LE PEUPLE A DIT OUI : BOOST GÉNÉRAL',
        'RÉFÉRENDUM : VICTOIRE DU OUI, BOOST POUR TOUS',
      ],
      hit: [
        'RÉFÉRENDUM : LE OUI L’EMPORTE, BOOST !',
        'RÉFÉRENDUM : LE OUI PASSE, VOUS ACCÉLÉREZ !',
        'LE PEUPLE A DIT OUI : BOOST POUR VOUS !',
        'RÉFÉRENDUM : OUI À 51 %, BOOST !',
        'RÉFÉRENDUM : VOUS PROFITEZ DU OUI !',
      ],
      non: [
        'RÉFÉRENDUM : LE NON L’EMPORTE, ${n} SONNÉ${s}',
        'RÉFÉRENDUM : NON À 55 %, ${n} SONNÉ${s}',
        'LE PEUPLE A DIT NON : ${n} KART${s} SONNÉ${s}',
        'RÉFÉRENDUM : LE NON PASSE, ${n} TOUCHÉ${s}',
        'RÉFÉRENDUM : NON MASSIF, ${n} SONNÉ${s}',
      ],
      nonHit: [
        'RÉFÉRENDUM : LE NON L’EMPORTE !',
        'RÉFÉRENDUM : LE PEUPLE VOUS DIT NON !',
        'RÉFÉRENDUM : VOUS AVEZ PERDU LE VOTE !',
        'LE NON L’EMPORTE : VOUS ENCAISSEZ !',
        'RÉFÉRENDUM : NON, ET C’EST POUR VOUS !',
      ],
      nul: [
        'RÉFÉRENDUM : 12 % DE PARTICIPATION, RÉSULTAT ANNULÉ',
        'RÉFÉRENDUM : PERSONNE N’EST VENU VOTER',
        'RÉFÉRENDUM : ABSTENTION RECORD, RÉSULTAT ANNULÉ',
        'RÉFÉRENDUM : 12 % DE VOTANTS, ON OUBLIE',
        'RÉFÉRENDUM : LE PEUPLE ÉTAIT À LA PLAGE',
      ],
    },
  },
  power: {
    debat: {
      use: [
        'GRAND DÉBAT : TOUT LE MONDE ÉCOUTE',
        'GRAND DÉBAT : 3 SECONDES DE MONOLOGUE',
        'GRAND DÉBAT : LA SALLE SE TAIT',
        'GRAND DÉBAT : VOUS AVEZ LA PAROLE',
        'GRAND DÉBAT : SIX HEURES EN 3 SECONDES',
      ],
      hit: [
        'GRAND DÉBAT : VOUS ÉCOUTEZ ${name}',
        'GRAND DÉBAT : ${name} PARLE, VOUS ÉCOUTEZ',
        'GRAND DÉBAT : ${name} NE S’ARRÊTE PLUS',
        'VOUS ASSISTEZ AU GRAND DÉBAT DE ${name}',
        'GRAND DÉBAT : ${name} A ENCORE UN POINT',
      ],
    },
    blocage: { use: [
      'GRÈVE GÉNÉRALE !',
      'GRÈVE GÉNÉRALE : QUATRE BARRICADES !',
      'GRÈVE GÉNÉRALE : TOUT EST BLOQUÉ !',
      'GRÈVE RECONDUCTIBLE : BARRICADES !',
      'GRÈVE GÉNÉRALE : JUSQU’AU RETRAIT !',
    ] },
    rondpoint: { use: [
      'ROND-POINT INAUGURÉ',
      'ROND-POINT INAUGURÉ : RUBAN COUPÉ',
      'UN ROND-POINT DE PLUS, DEVANT',
      'ROND-POINT : LA FRANCE EN COMPTE UN DE PLUS',
      'ROND-POINT INAUGURÉ, PRIORITÉ À LUI',
    ] },
    deconstruction: {
      use: [
        'DÉCONSTRUCTION : ${n} KART${s} DÉCONSTRUIT${s}',
        'DÉCONSTRUCTION : ${n} KART${s} REMIS EN QUESTION',
        'DÉCONSTRUCTION : ${n} PRIVILÈGE${s} ABOLI${s}',
        'DÉCONSTRUIT : ${n} KART${s} À NU',
        'DÉCONSTRUCTION : ${n} KART${s} DÉSARMÉ${s}',
      ],
      hit: [
        'DÉCONSTRUIT·E PAR ${name} : PLUS RIEN NE TIENT',
        'DÉCONSTRUIT·E PAR ${name} : VOS PRIVILÈGES TOMBENT',
        '${name} VOUS DÉCONSTRUIT : TOUT EST À REFAIRE',
        'DÉCONSTRUCTION : ${name} VOUS MET À NU',
        '${name} VOUS DÉCONSTRUIT : PLUS DE TURBO, PLUS RIEN',
      ],
      none: [
        'RIEN À DÉCONSTRUIRE : ON PÉDALE',
        'PERSONNE À DÉCONSTRUIRE : LE CARGO FILE',
        'RIEN À DÉCONSTRUIRE : BOOST À VÉLO',
        'DÉCONSTRUCTION SANS OBJET : ON PÉDALE',
        'RIEN DANS LES 40 M : ON PÉDALE',
      ],
    },
    amendement: {
      use: [
        'AMENDEMENT ADOPTÉ : PLACE ÉCHANGÉE',
        'AMENDEMENT ADOPTÉ EN COMMISSION : PLACE PRISE',
        'AMENDEMENT DE DERNIÈRE MINUTE : ÉCHANGE',
        'AMENDEMENT : LA PLACE CHANGE DE MAINS',
        'AMENDEMENT ADOPTÉ SANS DÉBAT',
      ],
      hit: [
        'AMENDEMENT : ${name} VOUS PREND LA PLACE',
        'AMENDEMENT : ${name} PASSE DEVANT VOUS',
        '${name} VOUS ÉCHANGE VOTRE PLACE',
        'AMENDEMENT DE ${name} : VOUS RECULEZ',
        'AMENDEMENT ADOPTÉ : ${name} A VOTRE PLACE',
      ],
      none: [
        'AMENDEMENT : PERSONNE DEVANT, BOOST',
        'AMENDEMENT SANS OBJET : BOOST',
        'AMENDEMENT : RIEN À ÉCHANGER, BOOST',
        'PERSONNE DEVANT : L’AMENDEMENT DEVIENT BOOST',
        'AMENDEMENT REJETÉ : BOOST QUAND MÊME',
      ],
    },
    megaphone: {
      use: [
        'MÉGAPHONE : ${n} KART${s} REPOUSSÉ${s}',
        'MÉGAPHONE : ${n} KART${s} SOUFFLÉ${s}',
        'LE MESSAGE PASSE : ${n} REPOUSSÉ${s}',
        'MÉGAPHONE : ${n} KART${s} À DISTANCE',
        'MÉGAPHONE : ${n} KART${s} RECULE${s}',
      ],
      hit: [
        'LE MÉGAPHONE DE ${name} VOUS REPOUSSE !',
        '${name} VOUS CRIE DESSUS AU MÉGAPHONE !',
        'MÉGAPHONE : ${name} VOUS SOUFFLE !',
        'LE MESSAGE DE ${name} EST PASSÉ !',
        '${name} HURLE : VOUS RECULEZ !',
      ],
    },
    chatons: { use: [
      'LÂCHER DE CHATONS : ATTENTION, ILS SONT MIGNONS',
      'LÂCHER DE CHATONS : TROIS SUR LA ROUTE',
      'LÂCHER DE CHATONS : PERSONNE N’OSERA',
      'CHATONS LÂCHÉS : ILS RONRONNENT',
      'LÂCHER DE CHATONS : À REPRENDRE APRÈS LA COURSE',
    ] },
    audience: {
      use: [
        'VOL D’AUDIENCE : ${item}',
        'VOL D’AUDIENCE : ${item} EN PRIME TIME',
        'VOL D’AUDIENCE : ${item}, MERCI L’ALGORITHME',
        'AUDIENCE VOLÉE : ${item}',
        'VOL D’AUDIENCE : ${item} POUR VOUS',
      ],
      hit: [
        'VOTRE OBJET A ÉTÉ VOLÉ !',
        'VOL D’AUDIENCE : VOTRE OBJET EST PARTI !',
        'ON VOUS A PIQUÉ VOTRE OBJET !',
        'VOTRE AUDIENCE VIENT D’ÊTRE VOLÉE !',
        'VOL D’AUDIENCE : LES MAINS VIDES !',
      ],
    },
    examen: {
      use: [
        'MISE EN EXAMEN DE ${name}',
        '${name} EST MIS·E EN EXAMEN',
        'MISE EN EXAMEN : ${name} CONVOQUÉ·E',
        '${name} : MIS·E EN EXAMEN, SANS APPEL',
        'LE JUGE CONVOQUE ${name}',
      ],
      hit: [
        'VOUS ÊTES MIS·E EN EXAMEN !',
        'MISE EN EXAMEN : VOUS ÊTES CONVOQUÉ·E !',
        'LE JUGE VOUS ATTEND !',
        'MIS·E EN EXAMEN : VOTRE OBJET EST SAISI !',
        'MISE EN EXAMEN : VOUS RESTEZ LÀ !',
      ],
      none: [
        'NON-LIEU : PERSONNE DEVANT, BOOST',
        'NON-LIEU : BOOST',
        'PERSONNE À CONVOQUER : BOOST',
        'NON-LIEU FAUTE DE PRÉVENU : BOOST',
        'CLASSÉ SANS SUITE : BOOST',
      ],
    },
    fauchage: {
      use: [
        'FAUCHAGE VOLONTAIRE : ${m} PIÈGE${ms} ET ${n} KART${s} FAUCHÉS',
        'FAUCHAGE : ${m} PIÈGE${ms} ET ${n} KART${s} DANS L’ANDAIN',
        'FAUCHAGE : ${m} PIÈGE${ms}, ${n} KART${s}, RIEN NE DÉPASSE',
        'LE TRACTEUR PASSE : ${m} PIÈGE${ms} ET ${n} KART${s} FAUCHÉS',
        'FAUCHAGE : ${m} PIÈGE${ms} ET ${n} KART${s} AU SOL',
      ],
      hit: [
        'FAUCHÉ·E PAR ${name} !',
        'FAUCHÉ·E : ${name} PASSE LA MOISSONNEUSE !',
        '${name} VOUS FAUCHE !',
        'FAUCHAGE VOLONTAIRE : ${name} VOUS A EU·E !',
        'PRIS·E DANS L’ANDAIN DE ${name} !',
      ],
      none: [
        'RIEN À FAUCHER : LE TRACTEUR ACCÉLÈRE',
        'RIEN À FAUCHER : BOOST AU DIESEL',
        'ROUTE DÉGAGÉE : LE TRACTEUR FILE',
        'RIEN À FAUCHER : ON RENTRE À LA FERME',
        'CHAMP VIDE : LE TRACTEUR ACCÉLÈRE',
      ],
    },
    rattrapage: {
      use: [
        'TEMPS DE PAROLE : RATTRAPAGE !',
        'TEMPS DE PAROLE : ÉGALITÉ RÉTABLIE !',
        'TEMPS DE PAROLE : LE CSA VOUS OFFRE UN BOOST !',
        'RATTRAPAGE : VOUS AVEZ LA PAROLE !',
        'TEMPS DE PAROLE : À VOUS LE MICRO !',
      ],
      early: [
        'TEMPS DE PAROLE : SEULEMENT À PARTIR DE LA 4e PLACE',
        'TEMPS DE PAROLE : VOUS PARLEZ DÉJÀ ASSEZ',
        'TEMPS DE PAROLE : RÉSERVÉ AUX PETITS CANDIDATS',
        'TEMPS DE PAROLE : PAS AVANT LA 4e PLACE',
        'TEMPS DE PAROLE : VOUS ÊTES TROP BIEN PLACÉ·E',
      ],
    },
    rabot: {
      use: [
        'COUP DE RABOT : -15 % POUR TOUT LE MONDE SAUF VOUS',
        'COUP DE RABOT : -15 % POUR LES AUTRES',
        'RABOT BUDGÉTAIRE : DES ÉCONOMIES, SAUF CHEZ VOUS',
        'COUP DE RABOT : LES ADVERSAIRES PAIENT',
        'COUP DE RABOT : -15 % AILLEURS, 0 % ICI',
      ],
      hit: [
        'COUP DE RABOT BUDGÉTAIRE : -15 % DE VITESSE',
        'COUP DE RABOT : VOTRE VITESSE EST RABOTÉE',
        'RABOT BUDGÉTAIRE : VOUS PERDEZ 15 %',
        'COUP DE RABOT : VOUS ROULEZ À L’ÉCONOMIE',
        'BERCY VOUS RABOTE DE 15 %',
      ],
    },
    fakenews: { use: [
      'FAKE NEWS : FAUSSES URNES DEVANT',
      'FAKE NEWS : TROIS URNES, ZÉRO BULLETIN',
      'FAKE NEWS : CE N’EST PAS FAUX, C’EST ALTERNATIF',
      'FAUSSES URNES DEVANT : QUI Y CROIT CALE',
      'FAKE NEWS : SONDAGE EXCLUSIF DEVANT',
    ] },
    controle: {
      use: [
        'CONTRÔLE D’IDENTITÉ : ${n} KART${s} ARRÊTÉ${s}',
        'CONTRÔLE D’IDENTITÉ : ${n} KART${s} AU BORD DE LA ROUTE',
        'CONTRÔLE : ${n} KART${s} SANS PAPIERS',
        'CONTRÔLE INOPINÉ : ${n} ARRÊTÉ${s}',
        'CONTRÔLE D’IDENTITÉ : ${n} KART${s} RETENU${s}',
      ],
      hit: [
        'CONTRÔLE D’IDENTITÉ : VOS PAPIERS !',
        'CONTRÔLE : VOS PAPIERS, S’IL VOUS PLAÎT !',
        'CONTRÔLE D’IDENTITÉ : VOUS RESTEZ LÀ !',
        'CONTRÔLE INOPINÉ : VOUS NE PASSEZ PAS !',
        'CONTRÔLE D’IDENTITÉ : ON VÉRIFIE !',
      ],
      none: [
        'RIEN À SIGNALER : BOOST',
        'RIEN À SIGNALER : CIRCULEZ, BOOST',
        'PERSONNE À CONTRÔLER : BOOST',
        'CONTRÔLE SANS OBJET : BOOST',
        'RAS : BOOST',
      ],
    },
    directive: {
      use: [
        'DIRECTIVE EUROPÉENNE : ADVERSAIRES BRIDÉS À 110',
        'DIRECTIVE EUROPÉENNE : 110 POUR EUX, DÉROGATION POUR VOUS',
        'TRANSPOSITION IMMÉDIATE : ADVERSAIRES À 110',
        'BRUXELLES A TRANCHÉ : ADVERSAIRES BRIDÉS',
        'DIRECTIVE EUROPÉENNE : 110 KM/H POUR LES AUTRES',
      ],
      hit: [
        'DIRECTIVE EUROPÉENNE : LIMITÉ À 110 KM/H',
        'DIRECTIVE EUROPÉENNE : VOUS ÊTES BRIDÉ·E À 110',
        'BRUXELLES VOUS LIMITE À 110 KM/H',
        'DIRECTIVE TRANSPOSÉE : 110 KM/H POUR VOUS',
        'DIRECTIVE EUROPÉENNE : PAS PLUS DE 110',
      ],
    },
    ralliement: {
      use: [
        'RALLIEMENT À ${name} : ${power}',
        'RALLIEMENT : ${name} VOUS PRÊTE ${power}',
        'TRANSFUGE : ${power} EMPRUNTÉ À ${name}',
        'RALLIEMENT À ${name}, ET ${power} AVEC',
        'CHANGEMENT DE CAMP : ${power} DE ${name}',
      ],
      none: [
        'RALLIEMENT AU VAINQUEUR ANNONCÉ : BOOST',
        'RALLIEMENT : PERSONNE DEVANT, BOOST',
        'EN TÊTE : LE TRANSFUGE SE RALLIE À LUI-MÊME',
        'RALLIEMENT AU VAINQUEUR : C’EST VOUS, BOOST',
        'RALLIEMENT : LE CAMP DU VAINQUEUR, BOOST',
      ],
    },
  },
  hazard: {
    lacrymo: { hit: [
      'GAZ LACRYMOGÈNE !',
      'LACRYMO : VOUS NE VOYEZ PLUS RIEN !',
      'VOUS TRAVERSEZ LE NUAGE !',
      'GAZ LACRYMOGÈNE : LES YEUX PIQUENT !',
      'LACRYMO : SORTEZ LE SÉRUM PHY !',
    ] },
    chatons: { hit: [
      'CHATONS SUR LA ROUTE : ON PILE !',
      'CHATONS ! VOUS PILEZ !',
      'TROIS CHATONS DEVANT : VOUS FREINEZ !',
      'CHATONS SUR LA ROUTE : PAS QUESTION DE ROULER DESSUS !',
      'CHATONS ! VOUS ZIGZAGUEZ !',
    ] },
    lisier: { hit: [
      'LISIER : ÇA GLISSE !',
      'LISIER : VOUS PATINEZ !',
      'ÉPANDAGE : VOUS GLISSEZ !',
      'LISIER FRAIS : VOUS DÉRAPEZ !',
      'LISIER : ADHÉRENCE ZÉRO !',
    ] },
    rondpoint: { hit: [
      'PRIORITÉ AU ROND-POINT !',
      'ROND-POINT : VOUS N’AVIEZ PAS LA PRIORITÉ !',
      'CÉDEZ LE PASSAGE ! TROP TARD !',
      'ROND-POINT : VOUS L’AVEZ PRIS À L’ENVERS !',
      'PRIORITÉ À GAUCHE ! ENFIN, NON !',
    ] },
    fakebox: { hit: [
      'SONDAGE TRUQUÉ !',
      'SONDAGE TRUQUÉ : VOUS Y AVEZ CRU !',
      'FAUSSE URNE : VOUS CALEZ !',
      'SONDAGE TRUQUÉ : L’URNE ÉTAIT VIDE !',
      'VOUS AVEZ RAMASSÉ UNE FAKE NEWS !',
    ] },
    barricade: { hit: [
      'BLOQUÉ PAR LA GRÈVE !',
      'GRÈVE : VOUS NE PASSEZ PAS !',
      'BARRICADE : VOUS ÊTES BLOQUÉ·E !',
      'PIQUET DE GRÈVE : ON NE PASSE PAS !',
      'BLOQUÉ·E : LES GRÉVISTES TIENNENT !',
    ] },
    cortege: { hit: [
      'RENVERSÉ PAR LE CORTÈGE !',
      'LE CORTÈGE VOUS RENVERSE !',
      'PRIS·E DANS LE CORTÈGE !',
      'CORTÈGE : VOUS ÊTES RENVERSÉ·E !',
      'LA MANIF VOUS PASSE DESSUS !',
    ] },
  },
  shield: {
    parry: [
      'LANGUE DE BOIS : « JE NE FERAI AUCUN COMMENTAIRE »',
      'LANGUE DE BOIS : « SANS COMMENTAIRE »',
      'LANGUE DE BOIS : « CE N’EST PAS LE SUJET »',
      'LANGUE DE BOIS : « JE NE RÉPONDRAI PAS À ÇA »',
      'LANGUE DE BOIS : « LAISSEZ LA JUSTICE TRAVAILLER »',
    ],
  },
};

/**
 * The placeholders each path may use, the ones its call site supplies:
 * `n` a count and `s` its plural S, `m`/`ms` the same for a second count,
 * `name` a candidate's name, `power` a power's name, `item` an item's name,
 * `names` the joined item names of a cumul.
 */
export const LINE_VARS = {
  'item.remaniement.use': ['n', 's'],
  'item.casserolade.use': ['n', 's'],
  'item.dissolution.use': ['n', 's'],
  'item.cumul.use': ['names'],
  'item.referendum.non': ['n', 's'],
  'power.debat.hit': ['name'],
  'power.deconstruction.use': ['n', 's'],
  'power.deconstruction.hit': ['name'],
  'power.amendement.hit': ['name'],
  'power.megaphone.use': ['n', 's'],
  'power.megaphone.hit': ['name'],
  'power.audience.use': ['item'],
  'power.examen.use': ['name'],
  'power.fauchage.use': ['m', 'ms', 'n', 's'],
  'power.fauchage.hit': ['name'],
  'power.controle.use': ['n', 's'],
  'power.ralliement.use': ['name', 'power'],
};

let rng = null;

/** The plural S for a count: 'S' past one, '' otherwise. */
export const plural = n => (n > 1 ? 'S' : '');

/** The variants at `path` ('item.motion.hit'); throws when the path names nothing. */
export function variants(path) {
  let node = LINES;
  for (const key of path.split('.')) node = node != null && typeof node === 'object' ? node[key] : undefined;
  if (!Array.isArray(node)) throw new Error('lines: unknown path ' + path);
  return node;
}

/**
 * One variant of the line at `path`, its `${key}` placeholders filled from
 * `vars`. Throws on an unknown path or a placeholder `vars` does not carry.
 */
export function line(path, vars = {}) {
  const arr = variants(path);
  const text = rng ? arr[rng(arr.length) % arr.length] : pick(arr);
  return text.replace(/\$\{(\w+)\}/g, (_, key) => {
    if (!(key in vars)) throw new Error('lines: ' + path + ' needs ${' + key + '}');
    return String(vars[key]);
  });
}

/** Fix the choice: `fn(count)` returns the variant index. null restores `pick`. */
export function setLineRng(fn) { rng = fn; }
