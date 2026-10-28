import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHARACTERS } from './data.js';
import {
  ACCESSORIES, CUTS, FABRICS, FACIAL_HAIR, GLASSES, HAIR_STYLES, KART_SLOTS, LAYERS, LOOK3D, MOUTHS, POSES, POWER_PROPS, PROPS, RANGES,
} from './looks.js';

const IDS = CHARACTERS.map(c => c.id);
const entries = () => IDS.map(id => [CHARACTERS.find(c => c.id === id), LOOK3D[id]]);
const has = (list, v) => typeof v === 'string' && Object.hasOwn(list, v);
const inRange = (key, v) => typeof v === 'number' && v >= RANGES[key][0] && v <= RANGES[key][1];

describe('LOOK3D covers the cast', () => {
  it('has one entry per candidate id, in roster order, and none for an unknown id', () => {
    expect(Object.keys(LOOK3D)).toEqual(IDS);
  });

  it('is frozen all the way down', () => {
    for (const id of IDS) {
      expect(Object.isFrozen(LOOK3D[id])).toBe(true);
      expect(Object.isFrozen(LOOK3D[id].face.nose)).toBe(true);
      expect(Object.isFrozen(LOOK3D[id].props)).toBe(true);
    }
  });
});

describe('every value comes from a vocabulary', () => {
  it('has exactly the schema fields', () => {
    for (const [, L] of entries()) {
      expect(Object.keys(L).sort()).toEqual(['build', 'face', 'hair', 'outfit', 'pose', 'props', 'tint']);
      expect(Object.keys(L.build).sort()).toEqual(['belly', 'shoulders', 'tall']);
      expect(Object.keys(L.outfit).sort()).toEqual(['cut', 'fabric', 'layers']);
      expect(Object.keys(L.face).sort()).toEqual(['brow', 'browSize', 'ears', 'facial', 'glasses', 'jaw', 'lid', 'mouth', 'nose', 'shape']);
    }
  });

  it('takes hair, cut, fabrics, layers, mouth, eyewear, facial hair and pose from their lists', () => {
    for (const [def, L] of entries()) {
      const at = def.id;
      expect(has(HAIR_STYLES, L.hair), at).toBe(true);
      expect(has(CUTS, L.outfit.cut), at).toBe(true);
      expect(has(FABRICS, L.outfit.fabric), at).toBe(true);
      for (const layer of L.outfit.layers) {
        expect(Object.keys(layer).sort()).toEqual(['fabric', 'kind']);
        expect(has(LAYERS, layer.kind) && has(FABRICS, layer.fabric), at).toBe(true);
      }
      expect(has(MOUTHS, L.face.mouth), at).toBe(true);
      expect(L.face.glasses === null || has(GLASSES, L.face.glasses), at).toBe(true);
      expect(L.face.facial === null || has(FACIAL_HAIR, L.face.facial), at).toBe(true);
      expect(has(POSES, L.pose), at).toBe(true);
      expect(Array.isArray(L.props), at).toBe(true);
      for (const p of L.props) expect(has(PROPS, p), `${at} ${p}`).toBe(true);
    }
  });

  it('keeps every number inside its range', () => {
    for (const [def, L] of entries()) {
      const { tall, shoulders, belly } = L.build;
      expect(inRange('tall', tall) && inRange('shoulders', shoulders), def.id).toBe(true);
      expect(typeof belly).toBe('boolean');
      const f = L.face;
      for (const key of ['shape', 'nose']) {
        expect(f[key]).toHaveLength(3);
        for (const v of f[key]) expect(inRange(key, v), `${def.id} ${key}`).toBe(true);
      }
      for (const key of ['jaw', 'ears', 'brow', 'browSize', 'lid']) expect(inRange(key, f[key]), `${def.id} ${key}`).toBe(true);
    }
  });

  it('describes every vocabulary value in words pilot.js can build from', () => {
    const lists = { HAIR_STYLES, FABRICS, CUTS, LAYERS, MOUTHS, GLASSES, FACIAL_HAIR, KART_SLOTS };
    for (const [name, list] of Object.entries(lists)) {
      for (const [value, desc] of Object.entries(list)) expect(desc.length, `${name}.${value}`).toBeGreaterThan(30);
    }
    for (const [value, pose] of Object.entries(POSES)) {
      expect(typeof pose.hand, value).toBe('boolean');
      expect(pose.desc.length, value).toBeGreaterThan(30);
    }
    for (const [value, prop] of Object.entries(PROPS)) {
      const mounted = has(PROPS, prop.at) && PROPS[prop.at].at === 'hand';
      expect(['body', 'head', 'hand', 'kart'].includes(prop.at) || mounted, value).toBe(true);
      expect(prop.desc.length, value).toBeGreaterThan(30);
      expect(prop.at === 'kart' ? has(KART_SLOTS, prop.slot) : prop.slot === undefined, value).toBe(true);
      expect(prop.live === undefined || prop.live === true, value).toBe(true);
    }
  });

  it('lists no value that no candidate uses, so pilot.js builds nothing dead', () => {
    const all = Object.values(LOOK3D);
    const used = {
      HAIR_STYLES: all.map(L => L.hair),
      FABRICS: all.flatMap(L => [L.outfit.fabric, ...L.outfit.layers.map(l => l.fabric)]),
      CUTS: all.map(L => L.outfit.cut),
      LAYERS: all.flatMap(L => L.outfit.layers.map(l => l.kind)),
      MOUTHS: all.map(L => L.face.mouth),
      GLASSES: all.map(L => L.face.glasses),
      FACIAL_HAIR: all.map(L => L.face.facial),
      POSES: all.map(L => L.pose),
      PROPS: all.flatMap(L => L.props),
      KART_SLOTS: all.flatMap(L => L.props.map(p => PROPS[p].slot)),
    };
    const lists = { HAIR_STYLES, FABRICS, CUTS, LAYERS, MOUTHS, GLASSES, FACIAL_HAIR, POSES, PROPS, KART_SLOTS };
    for (const [name, list] of Object.entries(lists)) {
      for (const value of Object.keys(list)) expect(used[name], `${name}.${value}`).toContain(value);
    }
  });
});

describe('props', () => {
  it('holds exactly one hand prop in a holding pose and none otherwise', () => {
    for (const [def, L] of entries()) {
      const hand = L.props.filter(p => PROPS[p].at === 'hand');
      expect(hand, def.id).toHaveLength(POSES[L.pose].hand ? 1 : 0);
    }
  });

  it('mounts a prop on another only when that one is there, and never twice in a kart slot', () => {
    for (const [def, L] of entries()) {
      expect(new Set(L.props).size, def.id).toBe(L.props.length);
      for (const p of L.props) if (has(PROPS, PROPS[p].at)) expect(L.props, `${def.id} ${p}`).toContain(PROPS[p].at);
      const slots = L.props.map(p => PROPS[p].slot).filter(Boolean);
      expect(new Set(slots).size, def.id).toBe(slots.length);
    }
  });

  it('puts nothing on the cargo bike, which has no dashboard or deck', () => {
    for (const [def, L] of entries()) if (def.cargo) expect(L.props.filter(p => PROPS[p].at === 'kart'), def.id).toEqual([]);
  });

  it('carries every one of the game\'s accessories, as a prop, eyewear, facial hair or a layer', () => {
    for (const [def, L] of entries()) {
      for (const acc of def.look.acc) {
        const where = ACCESSORIES[acc];
        const at = `${def.id} ${acc}`;
        if (!where) expect(L.props, at).toContain(acc);
        else if (where.glasses) expect(where.glasses, at).toContain(L.face.glasses);
        else if (where.facial) expect(where.facial, at).toContain(L.face.facial);
        else expect(L.outfit.layers.map(l => l.kind), at).toContain(where.layer);
      }
    }
  });

  it('wears no eyewear, facial hair or layer the game\'s look does not have', () => {
    for (const [def, L] of entries()) {
      const from = kind => def.look.acc.flatMap(a => ACCESSORIES[a]?.[kind] ?? []);
      if (L.face.glasses !== null) expect(from('glasses'), def.id).toContain(L.face.glasses);
      if (L.face.facial === 'sideburns') expect(def.id).toBe('hubert');            // PLAN 3.1: the donor's beard shells as white sideburns
      else if (L.face.facial !== null) expect(from('facial'), def.id).toContain(L.face.facial);
      for (const l of L.outfit.layers) if (l.kind !== 'gilet') expect(def.look.acc.map(a => ACCESSORIES[a]?.layer), def.id).toContain(l.kind);
    }
  });

  it('gives every candidate the prop of their own power, and no one else\'s', () => {
    expect(Object.keys(POWER_PROPS).sort()).toEqual(CHARACTERS.map(c => c.power.id).sort());
    const powerProps = new Set(Object.values(POWER_PROPS));
    expect(powerProps.size).toBe(CHARACTERS.length);
    for (const [def, L] of entries()) {
      expect(L.props, def.id).toContain(POWER_PROPS[def.power.id]);
      expect(L.props.filter(p => powerProps.has(p)), def.id).toEqual([POWER_PROPS[def.power.id]]);
    }
  });

  it('takes none of the props the plan rules out: the border barrier, the novel, the cup', () => {
    for (const p of ['barrier', 'book', 'cup']) expect(has(PROPS, p), p).toBe(false);
  });
});

describe('shape agrees with the game', () => {
  it('keeps the game\'s bellies', () => {
    for (const [def, L] of entries()) expect(L.build.belly, def.id).toBe(!!def.look.belly);
  });

  it('gives each candidate a silhouette of their own (hair, cut and pose)', () => {
    const sig = Object.values(LOOK3D).map(L => `${L.hair}/${L.outfit.cut}/${L.pose}`);
    expect(new Set(sig).size).toBe(sig.length);
  });

  it('overrides the stage tint exactly where the kart is too dark or too grey to derive one', () => {
    const hsl = c => {
      const r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
      return { l, s: max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1)) };
    };
    const needs = CHARACTERS.filter(c => { const { l, s } = hsl(c.kart); return l < 0.2 || s < 0.15; }).map(c => c.id);
    expect(needs).toEqual(['odile', 'martine']);
    for (const [def, L] of entries()) {
      if (needs.includes(def.id)) {
        expect(Number.isInteger(L.tint) && L.tint >= 0 && L.tint <= 0xffffff, def.id).toBe(true);
        expect(hsl(L.tint).l, def.id).toBeGreaterThanOrEqual(0.55);
      } else expect(L.tint, def.id).toBeNull();
    }
  });
});

describe('no name and no copy', () => {
  const strings = o => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []);

  it('holds only vocabulary words as strings', () => {
    const words = new Set([HAIR_STYLES, FABRICS, CUTS, LAYERS, MOUTHS, GLASSES, FACIAL_HAIR, POSES, PROPS].flatMap(l => Object.keys(l)));
    for (const s of strings(LOOK3D)) {
      expect(words, s).toContain(s);
      expect(s, s).toMatch(/^[a-z]+$/);                      // an identifier, never prose
    }
  });

  it('carries none of the cast\'s names, titles, quotes or powers', () => {
    const text = JSON.stringify(LOOK3D);
    for (const c of CHARACTERS) {
      for (const copy of [c.name, c.title, c.quote, c.power.name, c.power.desc]) expect(text.includes(copy), copy).toBe(false);
    }
    for (const key of ['name', 'title', 'quote', 'desc', 'power']) expect(text.includes(`"${key}"`), key).toBe(false);
  });
});

// ---------- The real-name scan (DEC-023, Q11) ----------
//
// The design template's cast carries eleven real politicians' names. None may
// reach the game's or the library's source: not in copy, not in a comment,
// not as an identifier. Matching is accent- and case-insensitive on whole
// words, with any spacing, hyphen or underscore (or none) between the parts,
// so "Mélenchon", "jean_luc_melenchon" and "lePen" all match while the game's
// pun names ("Gérald Darmalin", "Bruno Le Maigre") do not. A surname that is
// also a common word or first name ("Philippe", "Bertrand", "le maire") only
// matches with its first name, or written as one word ("lemaire").
//
// This list is the only place the names may appear; the scan skips this file.
const REAL_NAMES = [
  { first: 'Marine', last: 'Le Pen', alone: true },
  { first: 'Jordan', last: 'Bardella', alone: true },
  { first: 'Édouard', last: 'Philippe', alone: false },
  { first: 'Gabriel', last: 'Attal', alone: true },
  { first: 'Jean-Luc', last: 'Mélenchon', alone: true },
  { first: 'Raphaël', last: 'Glucksmann', alone: true },
  { first: 'François', last: 'Ruffin', alone: true },
  { first: 'Laurent', last: 'Wauquiez', alone: true },
  { first: 'Xavier', last: 'Bertrand', alone: false },
  { first: 'Gérald', last: 'Darmanin', alone: true },
  { first: 'Bruno', last: 'Le Maire', alone: false },
];

const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const parts = s => fold(s).split(/[\s-]+/);
const words = ws => new RegExp(`\\b${ws.join('[\\s_-]*')}\\b`);
const PATTERNS = REAL_NAMES.flatMap(({ first, last, alone }) => [
  words([...parts(first), ...parts(last)]),
  ...(alone ? [words(parts(last))] : []),
  ...(parts(last).length > 1 ? [new RegExp(`\\b${parts(last).join('')}\\b`)] : []),
]);

/** The real names found in a text, as the patterns that matched. */
function realNames(text) {
  const t = fold(text);
  return PATTERNS.filter(re => re.test(t)).map(re => re.source);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SELF = fileURLToPath(import.meta.url);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'storybook-static', 'test-results', 'playwright-report', '.vite']);
const TEXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css', '.html', '.md', '.mdx', '.txt', '.svg', '.yml', '.yaml']);

function* sourceFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* sourceFiles(p); }
    else if (e.isFile() && TEXT.has(extname(e.name)) && p !== SELF) yield p;
  }
}

describe('the real-name scan', () => {
  it('finds every real name in its plain, accented, joined and shouted forms', () => {
    const hits = [
      'Marine Le Pen', 'LE PEN', 'lePen', 'Jordan Bardella', 'bardella', 'Édouard Philippe', 'edouard_philippe', 'Gabriel Attal', 'attal',
      'Jean-Luc Mélenchon', 'jean luc melenchon', 'MÉLENCHON', 'Raphaël Glucksmann', 'François Ruffin', 'ruffin', 'Laurent Wauquiez', 'wauquiez',
      'Xavier Bertrand', 'xavierBertrand', 'Gérald Darmanin', 'darmanin', 'Bruno Le Maire', 'brunoLeMaire', 'lemaire',
      '// the cats of Marine Le Pen', "{id:'melenchon'}",
    ];
    for (const s of hits) expect(realNames(s), s).not.toEqual([]);
  });

  it('lets the game\'s pun names, titles and ordinary words through', () => {
    const misses = [
      'Gérald Darmalin', 'Bruno Le Maigre', 'Jean-Luc Mélèche', 'Marine Le Stylo', 'Jordan Mortadella', 'Philippe Martini', 'Le maire de province',
      'Le maire bâtisseur', 'Prend la parole pendant 3 s', 'Bertrand', 'Philippe', 'battalion', 'ruffing', 'repentir', 'la parole penche',
    ];
    for (const s of misses) expect(realNames(s), s).toEqual([]);
    for (const c of CHARACTERS) {
      for (const copy of [c.name, c.title, c.quote, c.power.name, c.power.desc]) expect(realNames(copy), copy).toEqual([]);
    }
  });

  it('finds no real name anywhere in apps/ or packages/', () => {
    const found = [];
    let files = 0;
    for (const top of ['apps', 'packages']) {
      for (const file of sourceFiles(join(ROOT, top))) {
        files++;
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          for (const re of realNames(line)) found.push(`${relative(ROOT, file)}:${i + 1} ${re}`);
        });
      }
    }
    expect(files).toBeGreaterThan(100);          // the walk really reached the source
    expect(found).toEqual([]);
  });
});
