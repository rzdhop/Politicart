import { mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASE, CHARACTERS } from '../../game/src/engine/data.js';
import { AD_MAX, applyRoster, CHAR_IDS, createRosterStore, LIVERY_MAX, validateRoster } from './roster.js';

// Images built from their real leading bytes, padded to a given size.
const MAGIC = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')],
};
const img = (type, bytes = 64, magic = MAGIC[type]) => {
  const b = Buffer.alloc(bytes, 7); Buffer.from(magic).copy(b);
  return `data:image/${type};base64,${b.toString('base64')}`;
};
const ofLength = (type, length) => {
  const head = `data:image/${type};base64,`;
  return img(type, Math.floor((length - head.length) / 4) * 3);
};

const ok = input => { const r = validateRoster(input); expect(r.ok, r.error).toBe(true); return r.roster; };
const ko = (input, field) => { const r = validateRoster(input); expect(r.ok).toBe(false); expect(r.field).toBe(field); expect(r.error).toContain(field); return r; };

const tmp = () => mkdtempSync(join(tmpdir(), 'kr-roster-'));
const quiet = { warn: () => {} };

describe('validateRoster', () => {
  it('accepts an empty roster, and a full one, keeping only known keys', () => {
    expect(ok({})).toEqual({ chars: {}, ads: [] });
    const r = ok({
      chars: {
        victor: { name: ' Manu ', title: 'Président', quote: '« Bonjour. »', suit: '#AABBCC', kart: '#112233', livery: img('jpeg'), style: { body: '#FF0000', wheels: 'gold', number: 7, pods: false } },
        lucie: { livery: img('png') },
        odile: { livery: img('webp') },
      },
      ads: [img('jpeg'), img('png'), img('webp')],
    });
    expect(r.chars.victor).toEqual({ name: 'Manu', title: 'Président', quote: '« Bonjour. »', suit: '#aabbcc', kart: '#112233', livery: img('jpeg'), style: { body: '#ff0000', wheels: 'gold', number: 7, pods: false } });
    expect(Object.keys(r.chars).sort()).toEqual(['lucie', 'odile', 'victor']);
    expect(r.ads).toHaveLength(3);
  });

  it('knows exactly the eleven candidates', () => {
    expect(CHAR_IDS).toEqual(['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu', 'bernadette', 'kevin', 'odile', 'patrick', 'lucie']);
  });

  it('rejects anything that is not an object', () => {
    for (const v of [null, [], 'x', 3]) expect(validateRoster(v).ok).toBe(false);
    ko({ chars: [] }, 'chars');
    ko({ chars: { victor: 'Manu' } }, 'chars.victor');
  });

  it('rejects an unknown id, an unknown field, and a __proto__ key', () => {
    ko({ chars: { nobody: { name: 'X' } } }, 'chars.nobody');
    ko({ chars: { victor: { power: 'x' } } }, 'chars.victor.power');
    ko({ extra: 1 }, 'extra');
    ko(JSON.parse('{"chars":{"__proto__":{"name":"X"}}}'), 'chars.__proto__');
    ko(JSON.parse('{"__proto__":{"chars":{}}}'), '__proto__');
    ko(JSON.parse('{"chars":{"victor":{"__proto__":{"name":"X"}}}}'), 'chars.victor.__proto__');
    expect({}.name).toBeUndefined();
  });

  it('never reads a field from a prototype', () => {
    const victor = Object.create({ name: 'Hérité' });
    expect(ok({ chars: { victor } })).toEqual({ chars: {}, ads: [] });
  });

  it('caps text at 28, 40 and 64 characters, after cleaning', () => {
    ok({ chars: { victor: { name: 'n'.repeat(28), title: 't'.repeat(40), quote: 'q'.repeat(64) } } });
    ko({ chars: { victor: { name: 'n'.repeat(29) } } }, 'chars.victor.name');
    ko({ chars: { victor: { title: 't'.repeat(41) } } }, 'chars.victor.title');
    ko({ chars: { victor: { quote: 'q'.repeat(65) } } }, 'chars.victor.quote');
    ok({ chars: { victor: { name: `  ${'n'.repeat(28)}<>\u0000  ` } } });
    ko({ chars: { victor: { name: 42 } } }, 'chars.victor.name');
  });

  it('strips control characters, bidi overrides and angle brackets; empty means default', () => {
    const r = ok({ chars: { victor: { name: '<b>Ma\u0000cr‮on</b>\n', title: '\t', quote: null }, gege: { name: '<>' } } });
    expect(r.chars.victor).toEqual({ name: 'bMacron/b' });
    expect(r.chars.gege).toBeUndefined();
  });

  it('wants #rrggbb colours and lowercases them', () => {
    expect(ok({ chars: { gege: { suit: '#ABCDEF' } } }).chars.gege.suit).toBe('#abcdef');
    for (const bad of ['red', '#abc', '#abcdeg', 'abcdef', '#abcdef0', 0xabcdef]) ko({ chars: { gege: { kart: bad } } }, 'chars.gege.kart');
  });

  it('keeps a style only when every field survives cleanStyle', () => {
    expect(ok({ chars: { kevin: { style: { sticker: 'marianne', spoiler: 'wing', number: null } } } }).chars.kevin.style)
      .toEqual({ sticker: 'marianne', spoiler: 'wing', number: null });
    expect(ok({ chars: { kevin: { style: {} } } }).chars.kevin).toBeUndefined();
    ko({ chars: { kevin: { style: { wheels: 'square' } } } }, 'chars.kevin.style.wheels');
    ko({ chars: { kevin: { style: { number: 100 } } } }, 'chars.kevin.style.number');
    ko({ chars: { kevin: { style: { glow: true } } } }, 'chars.kevin.style.glow');
    ko({ chars: { kevin: { style: 'gold' } } }, 'chars.kevin.style');
  });

  it('takes a livery only as a JPEG, PNG or WebP whose bytes match', () => {
    expect(ok({ chars: { lulu: { livery: null } } })).toEqual({ chars: {}, ads: [] });
    ko({ chars: { lulu: { livery: img('png', 64, MAGIC.jpeg) } } }, 'chars.lulu.livery');       // mime says png, bytes are jpeg
    ko({ chars: { lulu: { livery: img('jpeg', 64, [0, 0, 0, 0]) } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: img('jpeg').replace('image/jpeg', 'image/gif') } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: 'https://example.test/a.jpg' } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: `${img('jpeg')}!` } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: img('jpeg').slice(0, -1) } } }, 'chars.lulu.livery');   // not a whole base64 string
  });

  it('caps a livery at 256 KB and a poster at 512 KB', () => {
    const livery = ofLength('jpeg', LIVERY_MAX);
    expect(livery.length).toBeLessThanOrEqual(LIVERY_MAX);
    expect(livery.length).toBeGreaterThan(LIVERY_MAX - 4);
    ok({ chars: { lulu: { livery } } });
    ko({ chars: { lulu: { livery: ofLength('jpeg', LIVERY_MAX + 8) } } }, 'chars.lulu.livery');
    ok({ ads: [ofLength('png', AD_MAX)] });
    ko({ ads: [img('png'), ofLength('png', AD_MAX + 8)] }, 'ads.1');
  });

  it('takes at most 8 posters, each a real image', () => {
    ok({ ads: Array.from({ length: 8 }, () => img('jpeg')) });
    ko({ ads: Array.from({ length: 9 }, () => img('jpeg')) }, 'ads');
    ko({ ads: img('jpeg') }, 'ads');
    ko({ ads: [img('jpeg'), null] }, 'ads.1');
    ko({ ads: [img('jpeg', 64, MAGIC.png)] }, 'ads.0');
  });
});

describe('applyRoster', () => {
  it('renames the server’s characters, and falls back to the defaults', () => {
    const chars = CHARACTERS.map(c => ({ ...c }));
    applyRoster({ chars: { victor: { name: 'Manu', quote: '« Hop. »' } }, ads: [] }, chars, BASE);
    expect(chars[0]).toMatchObject({ name: 'Manu', title: BASE[0].title, quote: '« Hop. »' });
    expect(chars[1].name).toBe(BASE[1].name);
    applyRoster({ chars: {}, ads: [] }, chars, BASE);
    expect(chars[0]).toMatchObject({ name: BASE[0].name, title: BASE[0].title, quote: BASE[0].quote });
    applyRoster(undefined, chars, BASE);
    expect(chars[0].name).toBe(BASE[0].name);
  });
});

describe('createRosterStore', () => {
  const edit = name => ({ chars: { victor: { name } }, ads: [] });

  it('starts empty, creating a missing dir', async () => {
    const dir = join(tmp(), 'nested', 'data');
    const store = createRosterStore({ dir });
    expect(await store.load()).toEqual({ chars: {}, ads: [] });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('saves atomically, leaves no temp file, and reloads what it saved', async () => {
    const dir = tmp();
    const store = createRosterStore({ dir });
    await store.load();
    const r = await store.save(edit('Manu'));
    expect(r).toEqual({ ok: true, roster: edit('Manu') });
    expect(readdirSync(dir)).toEqual(['roster.json']);
    expect(JSON.parse(readFileSync(join(dir, 'roster.json'), 'utf8'))).toEqual(edit('Manu'));
    expect(store.get()).toEqual(edit('Manu'));
    expect(Object.isFrozen(store.get().chars.victor)).toBe(true);
    expect(JSON.parse(store.json())).toEqual(edit('Manu'));
    const again = createRosterStore({ dir });
    expect(await again.load()).toEqual(edit('Manu'));
  });

  it('refuses an invalid roster without touching the file', async () => {
    const dir = tmp();
    const store = createRosterStore({ dir });
    await store.load(); await store.save(edit('Manu'));
    const r = await store.save({ chars: { nobody: {} } });
    expect(r).toMatchObject({ ok: false, field: 'chars.nobody' });
    expect(store.get()).toEqual(edit('Manu'));
    expect(JSON.parse(readFileSync(join(dir, 'roster.json'), 'utf8'))).toEqual(edit('Manu'));
  });

  it('moves a corrupt or invalid file aside and starts empty', async () => {
    for (const [i, content] of ['{ not json', '{"chars":{"nobody":{}}}', '[]'].entries()) {
      const dir = tmp();
      writeFileSync(join(dir, 'roster.json'), content);
      const warnings = [];
      const store = createRosterStore({ dir, now: () => 1000 + i, log: { warn: m => warnings.push(m) } });
      expect(await store.load()).toEqual({ chars: {}, ads: [] });
      expect(readdirSync(dir)).toEqual([`roster.json.corrupt-${1000 + i}`]);
      expect(readFileSync(join(dir, `roster.json.corrupt-${1000 + i}`), 'utf8')).toBe(content);
      expect(warnings).toHaveLength(1);
    }
  });

  it('clears temp files a crash left behind', async () => {
    const dir = tmp();
    writeFileSync(join(dir, '.roster.json.abc123.tmp'), '{');
    writeFileSync(join(dir, 'roster.json'), JSON.stringify(edit('Manu')));
    const store = createRosterStore({ dir, log: quiet });
    expect(await store.load()).toEqual(edit('Manu'));
    expect(readdirSync(dir)).toEqual(['roster.json']);
  });

  it('runs concurrent saves one at a time, in call order, the last one winning', async () => {
    const dir = tmp();
    const store = createRosterStore({ dir });
    await store.load();
    const order = [];
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    await Promise.all(names.map(n => store.save(edit(n)).then(r => { order.push(r.roster.chars.victor.name); })));
    expect(order).toEqual(names);
    expect(store.get()).toEqual(edit('F'));
    expect(JSON.parse(readFileSync(join(dir, 'roster.json'), 'utf8'))).toEqual(edit('F'));
    expect(readdirSync(dir)).toEqual(['roster.json']);
  });

  it('keeps going after a failed write', async () => {
    const dir = join(tmp(), 'data');
    const store = createRosterStore({ dir });
    writeFileSync(dir, 'x');                       // a file where the dir must be
    await expect(store.save(edit('X'))).rejects.toThrow();
    expect(store.get()).toEqual({ chars: {}, ads: [] });
    unlinkSync(dir);
    expect((await store.save(edit('Y'))).ok).toBe(true);
    expect(store.get()).toEqual(edit('Y'));
    expect(readdirSync(dir)).toEqual(['roster.json']);
  });

  it('lives in memory without a dir', async () => {
    const store = createRosterStore();
    await store.load();
    expect((await store.save(edit('Manu'))).ok).toBe(true);
    expect(store.get()).toEqual(edit('Manu'));
  });
});
