// The 3D look of every candidate: shapes only, keyed by candidate id.
//
// One LOOK3D entry per CHARACTERS id says how the pilot is shaped: hair,
// build, outfit cut and fabric, face rig, pose, props and an optional stage
// tint. pilot.js builds every level of detail (stage, race-high, race-low,
// headless) from it (DEC-044), so what you pick on the podium is what races.
//
// Three rules hold the file together:
//
//   - **No colour lives here** except the tint override. Colours come from the
//     candidate's own `def.look` (skin, suit, shirt, tie, hairColor) and
//     `def.kart`, which the admin can edit (DEC-027), so a recoloured suit or
//     kart reaches the stage unchanged. Where a part needs a colour of its own
//     (pearls, gold, hi-vis orange), the vocabulary below names it as part of
//     the shape, as the game's accessories always have.
//   - **No name and no copy.** Entries are keyed by id and hold vocabulary
//     values and numbers only: pun names, titles, quotes and powers stay in
//     data.js (DEC-023), and no real politician's name appears anywhere in the
//     source (looks.test.js scans for them).
//   - **Every value is a word from an exported vocabulary**, each with the
//     one-line description pilot.js builds from. A value nobody uses is not
//     listed, so the builder implements exactly what the cast needs.
//
// Units are the design template's (head radius 0.42, shoulders at y 1.1, head
// centre at y 1.72, z -0.27, seat back at z -0.66, steering wheel at y 0.88,
// z 0.2; +z is forward). pilot.js scales the result by 1.45 into the game's
// seat (A-037). "Right hand" and "right" mean the template's `hand-right`
// side, at +x; "left" is -x.
//
// Where the plan (PLAN.md 3.1) leaves a call open, the comment above each
// entry says what was decided and why. The five candidates who are the same
// person as a template entry keep the game's identity (owner answer Q2): its
// colours and accessories, with the template's shapes and face rig.

// ---------- Vocabularies (pilot.js implements exactly these) ----------

/** Hair, hats and helmets: built on the head group, coloured by `look.hairColor` unless stated. */
export const HAIR_STYLES = Object.freeze({
  neat: 'The young leader\'s short neat hair: the slick technique (a cap shell a hair\'s thickness off the scalp, a back shell to the nape, sideburns to the ears) with a tidy parting on the left and the front combed across, lifted a touch over the brow; glossy but less than the slick.',
  slick: 'Glossy combed-back hair that follows the skull: a cap shell (r 0.462, theta 0 to 0.9) and a back shell to the nape, clearcoat 0.8, the front combed from a parting on the right, sideburns joining the ears, under a big rolled quiff (r 0.2, scale 1.7 x 0.85 x 1.35, a curl at its tip) lifted over the brow (the template slick, made the influencer\'s).',
  quiff: 'The slick base with its quiff scaled to 1.9 x 0.9 x 1.4 and pushed forward over the brow (centre at y 0.42, z 0.24): a glossy banana pompadour, the tallest hair on the grid.',
  tousled: 'Short cap and back shells under 10 big soft locks (r 0.12 to 0.17, seeded) tumbling forward over the brow, no clearcoat (the template tousled technique, blond here).',
  bob: 'Chin-length bob: a widened cap shell, a back shell flaring to the jaw line (theta 0 to 2.3) and a side-swept fringe shell over the forehead (the template bob).',
  wild: 'An indignant mane: a short cap shell under 14 large rough locks (r 0.15 to 0.22, seeded) standing out all round, plus a tuft over each ear (the game\'s wild, built with the template\'s curly-lock technique).',
  sides: 'Bald crown: only a fringe-ring shell round the back from ear to ear (the template fringe), thicker over each ear.',
  combover: 'Bald crown with the sides fringe ring, plus 4 long flat strands (capsules r 0.02) laid across the crown from a low parting above the right ear to the left ear: a comb-over that has visibly changed sides.',
  white: 'Thick senatorial hair swept back: cap shell (theta 0 to 0.95) and back shell with a low volume ridge along the hairline, matte, made for white.',
  sidepart: 'Receding cap shell (theta 0 to 0.74, the template receding) in the slick technique, combed flat across from a ruler-straight parting on the left (a thin line of scalp from the hairline to the crown), sideburns to the ears.',
  bun: 'Hair pulled back tight (cap and back shells, no fringe) into a round bun (sphere r 0.17) high at the back of the head, a thin dark band round its base.',
  ponytail: 'Cap and back shells with a high ponytail: a chain of 4 capsules tapering from r 0.07 to 0.04 from the crown down to the nape, a scrunchie torus at its root; it sways in the idle animation.',
  cap: 'Worker\'s cap: a flattened crown dome (shell r 0.47) and a curved peak at the front in the suit colour darkened 40%, a button on top; about 12 tight curls (the template curly technique, r 0.07 to 0.09) escape at the nape and over the ears.',
  strawhat: 'Wide straw hat: a brim disc (r 0.85) and a crown cylinder (r 0.45, height 0.3) in straw yellow #e0c060, a dark red band; one mèche (the template meche ellipsoid) escapes on the forehead under the brim.',
  kepi: 'Flat-topped kepi: a cylinder tapering from r 0.44 to 0.4 (height 0.32) in the suit colour, a glossy black peak, a gold braid ring at its base and a gold badge at the front; a short hair shell shows below at the back and sides.',
  bikehelmet: 'Vented cycling helmet: an elongated dome shell (r 0.5, theta 0 to 1.3) in the kart colour lightened 30%, three dark vent slots front to back, a chin strap down both cheeks; a short tail of hair (capsule) at the nape.',
});

/** Fabrics, the material of a garment; fabric.js bakes the textured ones (one cached texture each, tinted per pilot). */
export const FABRICS = Object.freeze({
  wool: 'Suit wool: fine twill albedo and normal map (fabric.js wool, normal scale 0.75), roughness 0.86, sheen in the colour lightened 45% (the template jacket).',
  corduroy: 'Corduroy: vertical ribs (fabric.js corduroy), roughness 0.9, a strong sheen that runs along the ribs.',
  puffer: 'Quilted puffer: horizontal baffles about 0.12 apart (fabric.js puffer, normal scale 1.1), roughness 0.42, clearcoat 0.5; the garment shell is scaled 1.12 wide (the template puffer).',
  satin: 'Satin: no weave (fabric.js satin), roughness 0.3, clearcoat 0.3, a bright sheen.',
  hivis: 'Hi-vis polyester: fluorescent orange #ff8c00 whatever the suit (the game\'s vest), two silver retro-reflective bands (fabric.js hi-vis), a faint emissive lift so it pops under the stage lights.',
  fleece: 'Polar fleece: soft pilled noise (fabric.js fleece), roughness 0.95, a wide soft sheen.',
  cotton: 'Plain cotton: no map, roughness 0.7, a light white sheen (the template shirt material).',
  velvet: 'Velvet: no map, roughness 0.8, a strong sheen in the colour lightened 60% at grazing angles (the hemicycle seats\' velvet on a jacket).',
  ripstop: 'Ripstop nylon: a 6 mm square grid normal map, roughness 0.5, clearcoat 0.3. fabric.js has no ripstop texture yet: until it does, render it as cotton with clearcoat 0.3.',
});

/** The cut of the main garment: the torso, sleeves and neckline, in `look.suit` unless stated. */
export const CUTS = Object.freeze({
  suit: 'Lounge jacket: the template lathe torso with lapels, the shirt V and collar in the shirt colour, two buttons; a tie only when the props carry one.',
  mao: 'Band-collar jacket: the suit torso with a stand-up collar closed at the throat (torus, jacket colour), no lapels and no shirt V, five small buttons down the front.',
  tailleur: 'Collarless skirt-suit jacket: a round neckline showing the shirt colour, shoulders narrowed to 0.92, braid trim in the shirt colour along the neckline and the front edges, two gold buttons.',
  uniform: 'Police tunic: a stand collar over a white shirt-collar tab, an epaulette on each shoulder, two flapped breast pockets, gold buttons, a black leather belt at the waist.',
  turncoat: 'A suit worn inside out: split down the centre, the left half in the suit colour and the right half its satin lining in the suit colour\'s complement (hue + 180 degrees, same lightness), lapels following the split, a white care label stitched outside at the hem.',
  suithood: 'A blazer over a hoodie: the suit jacket and lapels; the shirt V is the hoodie front in the shirt colour with two white drawstrings, and the hood (a bunched half-torus shell, shirt colour) sits over the jacket collar at the back of the neck.',
  blouson: 'Zip-front work jacket: the suit torso without lapels, a centre zip (the template puffer zip), a turned-down point collar, a ribbed waistband.',
  pullover: 'Quarter-zip pullover: the suit torso without lapels, a high stand collar with a short zip at the throat left open on the shirt colour, ribbed cuffs.',
  robe: 'Judge\'s robe: the lathe torso extended down to the seat and flared 1.2 at the hem, wide bell sleeves (forearm radius x 1.6 at the cuff), seven small covered buttons, no lapels.',
  shirt: 'Shirt sleeves: torso and arms in the shirt colour, sleeves rolled to the elbow (skin forearms), a point collar open at the neck, one breast pocket.',
});

/** Layers worn over the cut, each a shell a few percent larger than the torso. */
export const LAYERS = Object.freeze({
  hivis: 'Sleeveless safety vest from the shoulders to the waist, open in a V at the front, 4% larger than the torso.',
  bib: 'Dungaree bib: a front panel from the waist to mid-chest with a chest pocket, two straps over the shoulders and two brass buttons, in the suit colour.',
  gilet: 'Sleeveless body warmer worn open, 8% larger than the torso, a stand collar, in the kart colour (def.kart).',
});

/** Mouths: the template's five plus two. Lips #8a3a36, inside #2a0d10, teeth #fbf8f0. */
export const MOUTHS = Object.freeze({
  smile: 'A half torus of lips curving up (the template smile).',
  smirk: 'The smile shifted 0.02 to one side and tilted 0.25 rad: one corner up (the template smirk).',
  grin: 'A wide open smile showing a half disc of teeth (the template grin).',
  flat: 'A straight thin capsule of lips (the template flat).',
  shout: 'A tall dark open oval with a bar of top teeth (the template shout).',
  pursed: 'A small tight ring of lips (torus r 0.035, tube 0.014) at the centre: puckered disapproval.',
  rant: 'An open mouth wider than tall (dark ellipsoid 1.2 x 0.5) with a bar of top teeth, set 0.03 off-centre: talking out of the corner, mid-sentence.',
});

/** Eyewear, part of the face rig (it moves with the head). */
export const GLASSES = Object.freeze({
  round: 'Thin dark metal round frames with clear lenses, temples and bridge (the template glasses rig).',
  rect: 'Narrow rectangular steel frames (rounded-rect rims 0.17 x 0.09) with thin temples: the technocrat.',
  peer: 'Thick rounded-square frames in signal red #d62828, worn 0.05 lower on the nose than round, the brows peering over the top.',
  shades: 'Oversized glossy black wraparound sunglasses: two near-opaque lenses (r 0.1) on one bar.',
  aviator: 'Mirrored teardrop aviators: a gold wire frame with a double bridge, lenses a metallic mirror (metalness 1, roughness 0.05).',
  monocle: 'A gold monocle ring over the right eye, with a thin gold chain looping down to the lapel.',
});

/** Facial hair, part of the face rig, in `look.hairColor`. */
export const FACIAL_HAIR = Object.freeze({
  brush: 'A thick straight brush moustache spanning the mouth (flattened capsule r 0.045, 0.2 long).',
  walrus: 'A big drooping moustache: a central mass covering the upper lip and two ends falling below the mouth corners (capsules r 0.04 curving 0.12 down).',
  sideburns: 'Mutton-chop sideburns from the temples to the jaw line (the template sideburn shells; no chin beard, no moustache).',
});

/**
 * Poses: where the right arm and hand go (the left hand always grips the
 * wheel). `hand` says whether the pose holds exactly one hand prop (true) or
 * none (false). Positions are the right hand, then the right elbow.
 */
export const POSES = Object.freeze({
  drive: { hand: false, desc: 'Both hands on the wheel: right hand [0.16, 0.9, 0.17], elbow [0.4, 0.8, -0.08] (the template drive).' },
  hold: { hand: true, desc: 'Right hand at chest height holding a prop: hand [0.3, 1.13, 0.22], elbow [0.45, 0.86, -0.02] (the template hold).' },
  raise: { hand: true, desc: 'Right arm raised, the prop brandished: hand [0.5, 1.62, -0.05], elbow [0.53, 1.16, -0.2] (the template raise).' },
  finger: { hand: false, desc: 'Right arm raised to ask for the floor: hand [0.42, 1.55, 0.02], elbow [0.5, 1.12, -0.15], index up and thumb out (the template raised finger).' },
  fist: { hand: false, desc: 'Right arm straight up in a clenched fist: hand [0.46, 1.72, -0.1], elbow [0.52, 1.22, -0.2], hand sphere squashed 1 x 0.85 x 1.05 with a knuckle bar.' },
  point: { hand: false, desc: 'Right arm straight forward at shoulder height, index pointing ahead (+z): hand [0.26, 1.18, 0.55], elbow [0.4, 1.02, 0.15]. Seen in three-quarter view it points at the viewer.' },
  wave: { hand: false, desc: 'Right arm raised with an open palm (hand flattened 1.1 x 1.2 x 0.45, four finger capsules and a thumb): hand [0.55, 1.6, -0.02], elbow [0.55, 1.15, -0.2]; the hand rocks 0.35 rad at 2 Hz in the idle animation.' },
  selfie: { hand: true, desc: 'Right arm stretched up and out holding the selfie stick: hand [0.55, 1.45, 0.35], elbow [0.55, 1.05, 0.05]; the head turns 0.25 rad towards the phone and tilts 0.12 rad.' },
  speak: { hand: true, desc: 'Right hand just under the chin holding a prop to the mouth: hand [0.06, 1.36, 0.16], elbow [0.38, 0.98, -0.02].' },
});

/** Where a kart prop sits, relative to the seat so it lands on any body (standard kart or tractor). */
export const KART_SLOTS = Object.freeze({
  dash: 'On the dashboard in front of the steering wheel: [0, 0.66, 0.5].',
  deck: 'On the rear deck behind the seat back: [0, 0.72, -1.15].',
  side: 'Outboard on the right of the seat: [0.62, 0.62, 0.25].',
  roof: 'On a short mast above the rear deck: [0, 1.1, -1.08].',
});

/**
 * Props. `at` is where the prop is built: 'body' (on the torso, merged with
 * it), 'head' (on the head group), 'hand' (in the right hand's group), 'kart'
 * (in a KART_SLOTS `slot`), or on another prop named by `on`. `live` marks
 * props that animate, which the race LODs keep out of the merge. Glowing
 * parts are emissive with no point light (PLAN 1.2 A.4).
 */
export const PROPS = Object.freeze({
  // ---- body: the game's accessories
  tie: { at: 'body', desc: 'Silk tie down the shirt V in look.tie: the template extruded tie, roughness 0.3, high sheen.' },
  bowtie: { at: 'body', desc: 'Red silk bow tie (#c8102e) at the collar: two pinched lobes and a knot.' },
  pocket: { at: 'body', desc: 'Gold pocket square (#f2c14e) folded in three points out of the left breast pocket.' },
  scarf: { at: 'body', desc: 'Thick red scarf (#c8102e, fleece) wrapped once round the neck, one end hanging down the left of the chest.' },
  sash: { at: 'body', desc: 'Mayor\'s tricolore sash: three bands (#2f55c7, #ffffff, #e63946) from the right shoulder to the left hip, a gold fringe knot at the hip.' },
  rosette: { at: 'body', desc: 'One tricolore cockade (three concentric discs, blue outside) pinned on the left lapel.' },
  rosettes: { at: 'body', desc: 'A row of five party rosettes in five colours (#2f55c7, #c8102e, #2e8b57, #f2c14e, #7b2cbf) across the chest, one per party he has belonged to.' },
  pearls: { at: 'body', desc: 'A string of large pearls (#f6f1e4, clearcoat 1) lying round the base of the neck.' },
  badge: { at: 'body', desc: 'A round campaign pin on the left chest: white disc with a red centre.' },
  eurobadge: { at: 'body', desc: 'A round EU pin on the left lapel: blue disc (#003399) with a ring of twelve gold stars.' },
  whistle: { at: 'body', desc: 'A gold whistle on a red lanyard hanging on the chest.' },
  opencollar: { at: 'body', desc: 'The shirt collar worn open over the jacket lapels, no tie, a thin gold chain at the throat.' },
  rabat: { at: 'body', desc: 'White judicial rabat: two short white bands falling from the collar over the robe front.' },
  backpack: { at: 'body', desc: 'A dark grey backpack (#3a3a3a) on the back, its flap in the kart colour, straps over both shoulders.' },
  phone: { at: 'body', desc: 'A smartphone standing out of the left breast pocket, its top third showing, the screen lit with the animated screen shader.', live: true },
  stopwatch: { at: 'body', desc: 'A big chrome stopwatch (disc r 0.09, white face, a red hand that sweeps) on a lanyard round the neck, resting on the chest.', live: true },
  // ---- head
  straw: { at: 'head', desc: 'A stalk of straw (#e0c060, thin capsule) poking out of the right mouth corner under the moustache.' },
  weathervane: { at: 'head', desc: 'A gold weathervane bolted to the crown: a mast, a compass cross and an arrow with a tail fin that turns slowly and swings back.', live: true },
  // ---- hand
  megaphone: { at: 'hand', desc: 'The template lathe megaphone: a cream cone with a red rim and grip, pointing forward and up.' },
  selfie: { at: 'hand', desc: 'A telescopic selfie stick (dark, 1 long) rising from the hand, a phone at its tip turned towards the face, its screen the template\'s animated phone shader.', live: true },
  hourglass: { at: 'hand', desc: 'The template lathe hourglass in gold caps, its sand nearly all run through: the last minute.', live: true },
  scissors: { at: 'hand', desc: 'Giant gold inauguration scissors (blades 0.35 long), a tricolore ribbon cut and fluttering from the blades.' },
  spanner: { at: 'hand', desc: 'An oversized chrome adjustable spanner (0.4 long), held up head first: ready to take anything apart.' },
  calculator: { at: 'hand', desc: 'A desk calculator held like the template book: dark body, a green LCD strip, a 4 x 4 grid of light keys.' },
  banana: { at: 'hand', desc: 'A yellow banana held against a steel ruler (a curvature gauge, 0.3 long): the directive checks its bend.' },
  scythe: { at: 'hand', desc: 'A scythe resting on the right shoulder: a wooden snath (1.4 long) rising behind the head and a curved steel blade above it.' },
  mic: { at: 'hand', desc: 'A chrome handheld microphone held to the mouth, a red foam cube round the shaft (a TV channel\'s, unmarked).' },
  // ---- on the selfie stick
  ringlight: { at: 'selfie', desc: 'A white emissive ring light (torus r 0.2) round the phone at the tip of the selfie stick.' },
  hearts: { at: 'selfie', desc: 'Three glossy red hearts bubbling up from the phone, rising and fading in a loop: the audience he steals.', live: true },
  // ---- kart
  debatemic: { at: 'kart', slot: 'dash', desc: 'A gooseneck lectern microphone clamped to the dashboard, bent towards the pilot, a red tally light lit: he has the floor.', live: true },
  thermos: { at: 'kart', slot: 'side', desc: 'The template brushed-steel thermos with a green cap and gold band, clipped upright beside the seat: coffee for the picket line.' },
  barricade: { at: 'kart', slot: 'deck', desc: 'A strike barricade strapped on the rear deck: a wooden pallet on its edge with an old tyre leaning against it.' },
  barbecue: { at: 'kart', slot: 'deck', desc: 'The template kettle barbecue: enamel bowl, chrome grate, three merguez and emissive glowing coals (no point light).', live: true },
  kitten: { at: 'kart', slot: 'dash', desc: 'A kitten sitting on the dashboard facing the pilot: ginger body (sphere), head with two cone ears, a curled tail that flicks.', live: true },
  catbasket: { at: 'kart', slot: 'deck', desc: 'A wicker cat basket (woven brown half-cylinder with a lid) on the rear deck, two kitten heads peeking out of it.' },
  dossier: { at: 'kart', slot: 'dash', desc: 'A thick stack of buff case files bound with a red strap, lying on the dashboard.' },
  wheelclamp: { at: 'kart', slot: 'deck', desc: 'A yellow wheel clamp (two jaws and an arm, #f2c14e) hanging on the rear deck: the next kart is seized.' },
  tractormirror: { at: 'kart', slot: 'side', desc: 'The template tractor mirror: a dark stalk rising to a round mirror head turned towards the pilot.' },
  rabot: { at: 'kart', slot: 'dash', desc: 'A carpenter\'s wood plane on the dashboard mid-stroke, a long wood shaving curling off it: budget cuts, starting with his own kart.' },
  goldurn: { at: 'kart', slot: 'dash', desc: 'A small golden ballot box (a miniature of the race\'s item urn) on the dashboard, slightly crooked, its slot a dark bar.' },
  gyrophare: { at: 'kart', slot: 'roof', desc: 'The template gyrophare: blue and red emissive capsules side by side on a short mast, flashing alternately (no point light).', live: true },
  briefcase: { at: 'kart', slot: 'deck', desc: 'A brown leather briefcase with gold clasps and a gold edge band, strapped on the rear deck, a few papers sticking out.' },
});

/** Each game power's prop (by power id): the power, seen on the podium. */
export const POWER_PROPS = Object.freeze({
  debat: 'debatemic',        // Grand débat: he has the floor
  blocage: 'barricade',      // Grève générale: pallets and tyres
  rondpoint: 'scissors',     // Rond-point surprise: he inaugurates it
  deconstruction: 'spanner', // Déconstruction: takes karts apart
  amendement: 'hourglass',   // Amendement de dernière minute
  megaphone: 'megaphone',
  chatons: 'kitten',         // Lâcher de chatons
  audience: 'hearts',        // Vol d'audience
  examen: 'wheelclamp',      // Mise en examen: the kart is seized
  fauchage: 'scythe',        // Fauchage volontaire
  rattrapage: 'stopwatch',   // Temps de parole
  rabot: 'rabot',            // Coup de rabot, literally
  fakenews: 'goldurn',       // Fake news: the fake golden urns
  controle: 'gyrophare',     // Contrôle d'identité
  directive: 'banana',       // Directive européenne, on bananas
  ralliement: 'weathervane', // Ralliement: turns with the wind
});

/**
 * Where each of the game's accessories (def.look.acc) lands. Most are props
 * of the same name; these go to the face rig or the outfit instead.
 */
export const ACCESSORIES = Object.freeze({
  glasses: { glasses: ['round', 'rect', 'peer'] },
  sunglasses: { glasses: ['shades', 'aviator'] },
  monocle: { glasses: ['monocle'] },
  moustache: { facial: ['brush', 'walrus'] },
  vest: { layer: 'hivis' },
  overalls: { layer: 'bib' },
});

/** Inclusive bounds of the numeric fields. */
export const RANGES = Object.freeze({
  tall: [0.88, 1.1],      // torso height scale (the template's `tall`)
  shoulders: [0.85, 1.15], // shoulder width scale
  shape: [0.88, 1.15],    // head width, height, depth scale (the template's `face`)
  jaw: [0.9, 1.2],        // jaw sphere scale on top of the head width
  nose: [0.85, 1.25],     // nose x, y, z scale (the template's `nose`)
  ears: [0.9, 1.35],      // ear scale
  brow: [-0.1, 0.1],      // brow tilt: > 0 frowns (inner ends down), < 0 worries (the template's `brow`)
  browSize: [0.9, 1.7],   // brow thickness
  lid: [0, 1.25],         // eyelid cover in radians of the lid cap, 0 = no lid (the template's `lid`)
});

// ---------- The cast ----------
//
// An entry's fields:
//   hair      HAIR_STYLES
//   build     { tall, shoulders, belly }: torso height and shoulder width
//             scales (RANGES); `belly` is the game's own flag, a jacket-fabric
//             ellipsoid (r 0.3, 1.1 x 0.9 x 0.8) at [0, 0.62, -0.08] pushing the
//             jacket front out over the seat.
//   outfit    { cut: CUTS, fabric: FABRICS, layers: [{ kind: LAYERS, fabric }] },
//             layers listed from the inside out.
//   face      { shape, jaw, nose, ears, brow, browSize, lid } as RANGES says,
//             mouth: MOUTHS, glasses: GLASSES or null, facial: FACIAL_HAIR or null.
//   pose      POSES
//   props     PROPS, at most one per kart slot, one hand prop iff the pose holds one.
//   tint      null to derive the stage tint from def.kart, or a colour where
//             the kart is too dark or grey to give one (A-036).

const face = (f) => ({ shape: [1, 1, 1], jaw: 1, nose: [1, 1, 1], ears: 1, brow: 0, browSize: 1, lid: 0, glasses: null, facial: null, ...f });
const build = (b = {}) => ({ tall: 1, shoulders: 1, belly: false, ...b });
const outfit = (cut, fabric, layers = []) => ({ cut, fabric, layers });

const CAST = {
  // victor: the template's young-leader donor. Neat short hair with a parting (the game's slick, kept tidy: the big quiff is the influencer's), a grin with
  // teeth, and the raised index of a man asking for the floor (finger). Ears up
  // a notch: the friendliest caricature lever on a smooth young face. The power
  // prop is a lectern mic on the dashboard; the game's phone goes in the breast
  // pocket, always on.
  victor: {
    hair: 'neat', build: build(), outfit: outfit('suit', 'wool'),
    face: face({ shape: [0.96, 1, 1], nose: [0.9, 0.95, 0.95], ears: 1.3, brow: -0.03, mouth: 'grin' }),
    pose: 'finger', props: ['tie', 'phone', 'debatemic'], tint: null,
  },
  // gege: the template's worker-and-terroir donor. A red corduroy work blouson
  // under the game's hi-vis vest, the cap with curls escaping under it, a brush
  // moustache. The raised fist and the shout are the union-leader read; the
  // template's thermos rides beside the seat and the power's barricade (pallet
  // and tyre) on the deck.
  gege: {
    hair: 'cap', build: build({ shoulders: 1.12, belly: true }), outfit: outfit('blouson', 'corduroy', [{ kind: 'hivis', fabric: 'hivis' }]),
    face: face({ shape: [1.06, 1, 1], jaw: 1.15, brow: 0.06, browSize: 1.4, mouth: 'shout', facial: 'brush' }),
    pose: 'fist', props: ['thermos', 'barricade'], tint: null,
  },
  // maurice: the template's provincial rond-point donor. Big, round and jovial:
  // tall, broad, the belly, a round face with jowls, the template's round
  // glasses. The sash and rosette make him the mayor; the giant scissors
  // inaugurate the roundabout (his power) and the template's barbecue is the
  // village fête that follows.
  maurice: {
    hair: 'sides', build: build({ tall: 1.08, shoulders: 1.1, belly: true }), outfit: outfit('suit', 'wool'),
    face: face({ shape: [1.12, 1, 1.02], jaw: 1.1, nose: [1.15, 1, 1.05], brow: -0.02, mouth: 'smile', glasses: 'round' }),
    pose: 'hold', props: ['sash', 'rosette', 'scissors', 'barbecue'], tint: null,
  },
  // capucine: from scratch. The bike helmet, the backpack and the cargo bike
  // already say "à vélo"; the green ripstop blouson (PLAN 3.1) is the rain
  // jacket. The power prop is an oversized spanner held up: déconstruction,
  // literally. No kart props: the cargo bike has nowhere to put them.
  capucine: {
    hair: 'bikehelmet', build: build(), outfit: outfit('blouson', 'ripstop'),
    face: face({ brow: 0.03, mouth: 'smile' }),
    pose: 'hold', props: ['backpack', 'spanner'], tint: null,
  },
  // hubert: the template's elder-statesman donor. Tall, heavy-lidded to the
  // point of dozing, white sideburns from the template's beard shells, bushy
  // white brows and bigger old ears. The game's monocle, bow tie and pocket
  // square on a velvet jacket: the archduke. The template's hourglass, nearly
  // run through, is both "depuis 1974" and the last-minute amendment.
  hubert: {
    hair: 'white', build: build({ tall: 1.08 }), outfit: outfit('suit', 'velvet'),
    face: face({ shape: [1, 1.04, 1], jaw: 1.08, nose: [1, 1.1, 1.05], ears: 1.2, browSize: 1.6, lid: 1.2, mouth: 'flat', glasses: 'monocle', facial: 'sideburns' }),
    pose: 'hold', props: ['bowtie', 'pocket', 'hourglass'], tint: null,
  },
  // lulu: same person as the template's tribune. The template's shout, raise
  // pose, lathe megaphone and wider face and nose; the game's purple, red scarf
  // and dark wild hair (Q2: the template's grey swept hair is a likeness change
  // we do not take). Band collar instead of lapels: the tribune's jacket, under
  // the game's scarf.
  lulu: {
    hair: 'wild', build: build(), outfit: outfit('mao', 'wool'),
    face: face({ shape: [1.05, 1, 1], nose: [1.15, 1.05, 1.1], brow: 0.07, browSize: 1.3, mouth: 'shout' }),
    pose: 'raise', props: ['scarf', 'megaphone'], tint: null,
  },
  // bernadette: same person as the template's first entry. The template's bob,
  // smile, drive pose and face; the game's pink skirt-suit jacket (a collarless
  // tailleur under the pearls), blonde, sunglasses. Her power is the cats: a
  // kitten on the dashboard and a basket of them on the deck, never the
  // template's border barrier.
  bernadette: {
    hair: 'bob', build: build(), outfit: outfit('tailleur', 'wool'),
    face: face({ brow: 0.02, mouth: 'smile', glasses: 'shades' }),
    pose: 'drive', props: ['pearls', 'kitten', 'catbasket'], tint: null,
  },
  // kevin: same person as the template's second entry. The template's slick hair
  // with its quiff, smirk, heavy lids and animated phone screen; the game's
  // black jacket and cyan shirt, and its hoodie, kept as a hoodie worn under the
  // blazer (the influencer in a politician's suit). The selfie pose turns his
  // head to the phone; the stolen audience bubbles out as hearts.
  kevin: {
    hair: 'slick', build: build(), outfit: outfit('suithood', 'wool'),
    face: face({ shape: [0.97, 1, 1], nose: [0.9, 0.95, 0.95], brow: -0.01, lid: 1, mouth: 'smirk' }),
    pose: 'selfie', props: ['selfie', 'ringlight', 'hearts'], tint: null,
  },
  // odile: from scratch. The judge: black satin robe and white rabat, the bun,
  // bold red glasses she peers over, pursed lips, and a finger pointed straight
  // at the next defendant (point). The case files ride on the dashboard and the
  // wheel clamp of her power on the deck. Her kart is near-black, so the stage
  // tint is overridden with the Republic's gold.
  odile: {
    hair: 'bun', build: build(), outfit: outfit('robe', 'satin'),
    face: face({ shape: [0.98, 1.04, 1], brow: 0.05, mouth: 'pursed', glasses: 'peer' }),
    pose: 'point', props: ['rabat', 'dossier', 'wheelclamp'], tint: 0xf2c14e,
  },
  // patrick: the template's rural donor. The template's puffer becomes a quilted
  // gilet in the kart's green over the game's blue overalls and a shirt; the
  // straw hat with a mèche under its brim, a walrus moustache with the straw
  // under it. The scythe on his shoulder is the faucheur volontaire; the
  // template's tractor mirror suits his tractor.
  patrick: {
    hair: 'strawhat', build: build({ shoulders: 1.06 }), outfit: outfit('shirt', 'cotton', [{ kind: 'bib', fabric: 'cotton' }, { kind: 'gilet', fabric: 'puffer' }]),
    face: face({ shape: [1.04, 1, 1], jaw: 1.05, nose: [1.1, 1, 1.05], brow: 0.03, browSize: 1.3, mouth: 'flat', facial: 'walrus' }),
    pose: 'hold', props: ['straw', 'scythe', 'tractormirror'], tint: null,
  },
  // lucie: from scratch. The candidate nobody sees is the smallest pilot on the
  // grid (tall 0.9), waving to be noticed, eager grin, worried brows. A yellow
  // fleece quarter-zip (PLAN 3.1), the game's ponytail and pin, and a stopwatch
  // for the speaking time she is owed.
  lucie: {
    hair: 'ponytail', build: build({ tall: 0.9, shoulders: 0.92 }), outfit: outfit('pullover', 'fleece'),
    face: face({ shape: [1, 0.98, 1], brow: -0.05, mouth: 'grin' }),
    pose: 'wave', props: ['badge', 'stopwatch'], tint: null,
  },
  // gaspard: same person as the template's last entry. The template's receding
  // hair (as the game's ruler-straight side parting), smirk, lids, nose and
  // book-style hold, here holding the game's calculator. "Le Maigre": narrow
  // shoulders and a long face. The power is a real rabot planing his own
  // dashboard, never the template's novel.
  gaspard: {
    hair: 'sidepart', build: build({ shoulders: 0.88 }), outfit: outfit('suit', 'wool'),
    face: face({ shape: [0.92, 1.08, 1], nose: [1.1, 1.05, 1.05], brow: -0.02, lid: 1.05, mouth: 'smirk', glasses: 'rect' }),
    pose: 'hold', props: ['tie', 'calculator', 'rabot'], tint: null,
  },
  // jeanmi: from scratch. The TV-set polemicist: the biggest quiff, an open
  // collar with a chain, a foam-cube mic held to his mouth mid-rant, the
  // indignant brows. The face stays neutral on purpose: the joke is the
  // plateau-télé persona, not his features. The fake golden urn on the dashboard
  // is his power.
  jeanmi: {
    hair: 'quiff', build: build(), outfit: outfit('suit', 'wool'),
    face: face({ shape: [0.95, 1.04, 1], brow: 0.07, lid: 0.9, mouth: 'rant' }),
    pose: 'speak', props: ['opencollar', 'mic', 'goldurn'], tint: null,
  },
  // martine: same person as the template's riot-helmet entry. The template's
  // stern brow (0.09), flat mouth, drive pose, wider face and the gyrophare
  // (Contrôle d'identité); the game's kepi instead of the helmet, its whistle
  // and sunglasses (as cop aviators), and the minister dressed as a police
  // officer (uniform). The kart is navy, so the tint is the gyrophare's blue.
  martine: {
    hair: 'kepi', build: build({ shoulders: 1.06 }), outfit: outfit('uniform', 'wool'),
    face: face({ shape: [1.05, 1, 1], jaw: 1.1, brow: 0.09, browSize: 1.2, mouth: 'flat', glasses: 'aviator' }),
    pose: 'drive', props: ['whistle', 'gyrophare'], tint: 0x4c7dff,
  },
  // aymeric: the template's European donor. The template's tousled locks on the
  // game's blond, its hold pose (the cup becomes a banana and a ruler: the
  // directive on the curvature of bananas, and his pun name). Tall with a long
  // face, EU pin, yellow tie; the game's briefcase rides on the deck.
  aymeric: {
    hair: 'tousled', build: build({ tall: 1.06 }), outfit: outfit('suit', 'wool'),
    face: face({ shape: [0.95, 1.08, 1], brow: -0.02, mouth: 'smile' }),
    pose: 'hold', props: ['tie', 'eurobadge', 'banana', 'briefcase'], tint: null,
  },
  // thierry: from scratch. The turncoat, three times over: the weathervane on
  // his head (his power), a lavender suit worn inside out ("retourner sa veste")
  // and a comb-over that has changed sides. Five party rosettes, an innocent
  // brow, the smirk of a man who has not changed.
  thierry: {
    hair: 'combover', build: build(), outfit: outfit('turncoat', 'wool'),
    face: face({ brow: -0.04, mouth: 'smirk' }),
    pose: 'drive', props: ['rosettes', 'weathervane'], tint: null,
  },
};

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

/** The look spec of every candidate, by id. Frozen: it is code data, not part of the roster document (Q8). */
export const LOOK3D = deepFreeze(CAST);
