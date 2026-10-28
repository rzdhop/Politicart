// The admin's cast: validation, applying it to the server's characters, and
// the two routes over HTTP (auth, limits, persistence, the lobby's AI names).
// Every password and hash here is made up at run time.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { BASE, CHARACTERS } from '../../game/src/engine/data.js';
import { hashPassword } from './accounts.js';
import { ensureAdmin } from './admin.js';
import { AD_MAX, applyCast, applyRoster, BODY_MAX, CHAR_IDS, castOf, emptyRoster, LIVERY_MAX, validateRoster } from './roster.js';
import { startServer } from './server.js';
import { openFileStore } from './store.js';

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

const ALL_IDS = ['victor', 'gege', 'maurice', 'capucine', 'hubert', 'lulu', 'bernadette', 'kevin', 'odile', 'patrick', 'lucie', 'gaspard', 'jeanmi', 'martine', 'aymeric', 'thierry'];
const resetCast = () => applyRoster(emptyRoster(), CHARACTERS, BASE);
afterAll(resetCast);

describe('validateRoster', () => {
  it('accepts an empty roster, and a full one, keeping only known keys', () => {
    expect(ok({})).toEqual({ chars: {}, ads: [] });
    const r = ok({
      chars: {
        victor: { name: ' Manu ', title: 'Président', quote: '« Bonjour. »', suit: '#AABBCC', kart: '#112233', livery: img('jpeg'), style: { body: '#FF0000', wheels: 'gold', number: 7, pods: false } },
        lucie: { livery: img('png') },
        odile: { livery: img('webp') },
        thierry: { name: 'Le Seizième' },
      },
      ads: [img('jpeg'), img('png'), img('webp')],
    });
    expect(r.chars.victor).toEqual({ name: 'Manu', title: 'Président', quote: '« Bonjour. »', suit: '#aabbcc', kart: '#112233', livery: img('jpeg'), style: { body: '#ff0000', wheels: 'gold', number: 7, pods: false } });
    expect(Object.keys(r.chars).sort()).toEqual(['lucie', 'odile', 'thierry', 'victor']);
    expect(r.ads).toHaveLength(3);
  });

  it('knows exactly the sixteen candidates, and takes an edit for each', () => {
    expect(CHAR_IDS).toEqual(ALL_IDS);
    expect(CHAR_IDS).toEqual(CHARACTERS.map(c => c.id));
    const chars = Object.fromEntries(ALL_IDS.map(id => [id, { name: 'Élu ' + id, suit: '#123456' }]));
    expect(Object.keys(ok({ chars }).chars)).toEqual(ALL_IDS);
  });

  it('rejects anything that is not an object', () => {
    for (const v of [null, [], 'x', 3, undefined]) expect(validateRoster(v)).toMatchObject({ ok: false, field: 'roster' });
    ko({ chars: [] }, 'chars');
    ko({ chars: 'x' }, 'chars');
    ko({ chars: { victor: 'Manu' } }, 'chars.victor');
    ko({ chars: { thierry: [] } }, 'chars.thierry');
  });

  it('rejects an unknown id, an unknown field, and a __proto__ key', () => {
    ko({ chars: { nobody: { name: 'X' } } }, 'chars.nobody');
    ko({ chars: { Victor: { name: 'X' } } }, 'chars.Victor');
    ko({ chars: { victor: { power: 'x' } } }, 'chars.victor.power');
    ko({ chars: { victor: { stats: { speed: 9 } } } }, 'chars.victor.stats');
    ko({ extra: 1 }, 'extra');
    ko(JSON.parse('{"chars":{"__proto__":{"name":"X"}}}'), 'chars.__proto__');
    ko(JSON.parse('{"__proto__":{"chars":{}}}'), '__proto__');
    ko(JSON.parse('{"chars":{"victor":{"__proto__":{"name":"X"}}}}'), 'chars.victor.__proto__');
    ko(JSON.parse('{"chars":{"victor":{"style":{"__proto__":{"body":"#000000"}}}}}'), 'chars.victor.style.__proto__');
    expect({}.name).toBeUndefined();
  });

  it('never reads a field from a prototype', () => {
    const victor = Object.create({ name: 'Hérité' });
    expect(ok({ chars: { victor } })).toEqual({ chars: {}, ads: [] });
  });

  it('caps text at 28, 40 and 64 characters, after cleaning', () => {
    ok({ chars: { martine: { name: 'n'.repeat(28), title: 't'.repeat(40), quote: 'q'.repeat(64) } } });
    ko({ chars: { martine: { name: 'n'.repeat(29) } } }, 'chars.martine.name');
    ko({ chars: { martine: { title: 't'.repeat(41) } } }, 'chars.martine.title');
    ko({ chars: { martine: { quote: 'q'.repeat(65) } } }, 'chars.martine.quote');
    ok({ chars: { martine: { name: `  ${'n'.repeat(28)}<>\u0000‮  ` } } });
    ko({ chars: { martine: { name: 42 } } }, 'chars.martine.name');
    ko({ chars: { martine: { quote: ['x'] } } }, 'chars.martine.quote');
  });

  it('strips C0/C1 controls, bidi controls and angle brackets; empty means default', () => {
    const r = ok({ chars: { victor: { name: '<b>Ma\u0000cr‮on</b>\n', title: '\t', quote: null }, gege: { name: '<>' }, jeanmi: { name: 'A\u0085B⁦C⁩D‏E؜F\u007f' } } });
    expect(r.chars.victor).toEqual({ name: 'bMacron/b' });
    expect(r.chars.gege).toBeUndefined();
    expect(r.chars.jeanmi).toEqual({ name: 'ABCDEF' });
  });

  it('wants #rrggbb colours and lowercases them', () => {
    expect(ok({ chars: { gege: { suit: '#ABCDEF' } } }).chars.gege.suit).toBe('#abcdef');
    for (const bad of ['red', '#abc', '#abcdeg', 'abcdef', '#abcdef0', 0xabcdef, ' #abcdef']) ko({ chars: { gege: { kart: bad } } }, 'chars.gege.kart');
    ko({ chars: { gege: { suit: 'rgb(0,0,0)' } } }, 'chars.gege.suit');
  });

  it('keeps a style only when every field survives cleanStyle', () => {
    expect(ok({ chars: { kevin: { style: { sticker: 'marianne', spoiler: 'wing', number: null } } } }).chars.kevin.style)
      .toEqual({ sticker: 'marianne', spoiler: 'wing', number: null });
    expect(ok({ chars: { kevin: { style: {} } } }).chars.kevin).toBeUndefined();
    expect(ok({ chars: { aymeric: { style: { accent: '#ABCDEF' } } } }).chars.aymeric.style).toEqual({ accent: '#abcdef' });
    ko({ chars: { kevin: { style: { wheels: 'square' } } } }, 'chars.kevin.style.wheels');
    ko({ chars: { kevin: { style: { number: 100 } } } }, 'chars.kevin.style.number');
    ko({ chars: { kevin: { style: { pods: 'yes' } } } }, 'chars.kevin.style.pods');
    ko({ chars: { kevin: { style: { glow: true } } } }, 'chars.kevin.style.glow');
    ko({ chars: { kevin: { style: 'gold' } } }, 'chars.kevin.style');
    ko({ chars: { kevin: { style: [] } } }, 'chars.kevin.style');
  });

  it('takes the new parts and a trail as kart defaults, and round-trips them', () => {
    const style = { trail: 'laser', exhaust: 'quad', underglow: 'rainbow', mast: 'pirate', nose: 'ram', skin: 'flames' };
    const stored = ok({ chars: { thierry: { style } } });
    expect(stored.chars.thierry.style).toEqual(style);
    expect(ok(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    ko({ chars: { thierry: { style: { trail: 'rainbow' } } } }, 'chars.thierry.style.trail');
    ko({ chars: { thierry: { style: { exhaust: 'none' } } } }, 'chars.thierry.style.exhaust');
  });

  it('takes a livery only as a JPEG, PNG or WebP whose bytes match', () => {
    expect(ok({ chars: { lulu: { livery: null } } })).toEqual({ chars: {}, ads: [] });
    ko({ chars: { lulu: { livery: img('png', 64, MAGIC.jpeg) } } }, 'chars.lulu.livery');       // mime says png, bytes are jpeg
    ko({ chars: { lulu: { livery: img('webp', 64, [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]) } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: img('jpeg', 64, [0, 0, 0, 0]) } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: img('jpeg').replace('image/jpeg', 'image/gif') } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: `data:image/png,${'x'.repeat(16)}` } } }, 'chars.lulu.livery');             // not base64
    ko({ chars: { lulu: { livery: 'https://example.test/a.jpg' } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: 'data:image/jpeg;base64,' } } }, 'chars.lulu.livery');                      // empty
    ko({ chars: { lulu: { livery: `${img('jpeg')}!` } } }, 'chars.lulu.livery');
    ko({ chars: { lulu: { livery: img('jpeg').slice(0, -1) } } }, 'chars.lulu.livery');   // not a whole base64 string
    ko({ chars: { lulu: { livery: 7 } } }, 'chars.lulu.livery');
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
    ko({ ads: { 0: img('jpeg') } }, 'ads');
    ko({ ads: [img('jpeg'), null] }, 'ads.1');
    ko({ ads: [img('jpeg', 64, MAGIC.png)] }, 'ads.0');
    expect(ok({ ads: null }).ads).toEqual([]);
  });

  it('leaves room in the body limit for every image at its cap', () => {
    // Sixteen liveries and eight posters at their caps come to 8 MB; the
    // texts, colours, styles and JSON around them must still fit, so a
    // roster that validates is never refused with 413. Revisit both together.
    const images = 16 * LIVERY_MAX + 8 * AD_MAX;
    expect(images).toBe(8 * 1024 * 1024);
    expect(BODY_MAX - images).toBeGreaterThanOrEqual(1024 * 1024);
  });
});

describe('applyRoster', () => {
  it('renames the server’s characters, and falls back to the defaults', () => {
    const chars = CHARACTERS.map(c => ({ ...c }));
    applyRoster({ chars: { victor: { name: 'Manu', quote: '« Hop. »' }, thierry: { title: 'Le girouette' } }, ads: [] }, chars, BASE);
    expect(chars[0]).toMatchObject({ name: 'Manu', title: BASE[0].title, quote: '« Hop. »' });
    expect(chars[1].name).toBe(BASE[1].name);
    expect(chars[15]).toMatchObject({ id: 'thierry', name: BASE[15].name, title: 'Le girouette' });
    applyRoster({ chars: {}, ads: [] }, chars, BASE);
    expect(chars[0]).toMatchObject({ name: BASE[0].name, title: BASE[0].title, quote: BASE[0].quote });
    expect(chars[15].title).toBe(BASE[15].title);
    applyRoster(undefined, chars, BASE);
    expect(chars[0].name).toBe(BASE[0].name);
  });
});

describe('the cast handed to a race worker', () => {
  it('carries id, name, title and quote, and is copied over a fresh CHARACTERS', () => {
    const edited = CHARACTERS.map(c => ({ ...c }));
    applyRoster({ chars: { gaspard: { name: 'Bruno Le Gras' } } }, edited, BASE);
    const cast = castOf(edited);
    expect(cast).toHaveLength(16);
    expect(cast[11]).toEqual({ id: 'gaspard', name: 'Bruno Le Gras', title: BASE[11].title, quote: BASE[11].quote });
    expect(Object.keys(cast[0]).sort()).toEqual(['id', 'name', 'quote', 'title']);

    const worker = CHARACTERS.map(c => ({ ...c }));          // a worker's own copy, at the defaults
    applyCast(structuredClone(cast), worker);
    expect(worker[11].name).toBe('Bruno Le Gras');
    expect(worker[0].name).toBe(BASE[0].name);
  });

  it('ignores unknown ids, non-text values and a missing cast', () => {
    const worker = CHARACTERS.map(c => ({ ...c }));
    applyCast([{ id: 'nobody', name: 'X' }, { id: 'victor', name: 42, title: '' }, null, { id: 'gege', quote: '« Oui. »' }], worker);
    expect(worker[0]).toMatchObject({ name: BASE[0].name, title: BASE[0].title });
    expect(worker[1].quote).toBe('« Oui. »');
    for (const bad of [undefined, null, 'x', {}]) applyCast(bad, worker);
    expect(worker.find(c => c.id === 'nobody')).toBeUndefined();
  });
});

// ---------- over HTTP ----------

const password = () => randomBytes(12).toString('hex');
const quiet = () => {};
let staticDir;
beforeAll(() => {
  staticDir = mkdtempSync(join(tmpdir(), 'kr-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>kr</title>');
});

/**
 * A server on `store` (a fresh memory store by default) with an admin seeded
 * as main.js does, the admin's token, and a normal account's token.
 */
async function serve({ store = openFileStore(null), admin } = {}) {
  const pw = password();
  admin ??= { user: 'rida', hash: await hashPassword(pw) };
  await ensureAdmin(store, admin, quiet);
  const races = [];
  const runRace = (room, roster) => { races.push(roster); return { input() {}, leave() {}, stop() {} }; };
  const srv = await startServer({ port: 0, host: '127.0.0.1', staticDir, runRace, store, loginTries: 1000, admin });
  const url = p => `http://127.0.0.1:${srv.port}${p}`;
  const post = (p, body) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const login = async (name, pass) => (await (await post('/api/login', { name, password: pass })).json()).token;
  const register = async name => (await (await post('/api/register', { name, password: 'secret1' })).json()).token;
  const put = (body, token, type = 'application/json') => fetch(url('/api/admin/roster'), {
    method: 'PUT', headers: { ...(type ? { 'content-type': type } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const get = () => fetch(url('/api/roster'));
  return { srv, store, admin, pw, url, login, register, put, get, races, adminToken: await login(admin.user, pw) };
}

const named = name => ({ chars: { victor: { name } }, ads: [] });

describe('the roster over HTTP', () => {
  let s, userToken;
  beforeAll(async () => {
    s = await serve();
    userToken = await s.register('Citoyenne');
  });
  afterAll(() => s.srv.close());
  afterEach(() => vi.restoreAllMocks());

  it('serves an empty roster publicly, to every origin, never cached', async () => {
    const r = await fetch(s.url('/api/roster'), { headers: { origin: 'https://rzdhop.github.io' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ chars: {}, ads: [] });
  });

  it('lets a page on another origin send the PUT preflight', async () => {
    const r = await fetch(s.url('/api/admin/roster'), { method: 'OPTIONS', headers: { origin: 'https://rzdhop.github.io', 'access-control-request-method': 'PUT' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('access-control-allow-methods')).toMatch(/\bPUT\b/);
    expect(r.headers.get('access-control-allow-headers')).toMatch(/authorization/);
    expect(r.headers.get('access-control-allow-headers')).toMatch(/content-type/);
  });

  it('answers 401 to anyone but the admin, a normal account included, and changes nothing', async () => {
    for (const token of [null, userToken, 'f'.repeat(64)]) {
      const r = await s.put(named('Pirate'), token);
      expect(r.status, String(token)).toBe(401);
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
      expect((await r.json()).error).toMatch(/administrateur/);
    }
    expect(await (await s.get()).json()).toEqual({ chars: {}, ads: [] });
    expect(await s.store.getDoc('roster')).toBeNull();
    expect(CHARACTERS[0].name).toBe(BASE[0].name);
  });

  it('wants JSON (415) within the body limit (413) that it can read (400)', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', null, 'application/jsonp']) {
      const r = await s.put(named('X'), s.adminToken, type);
      expect(r.status, String(type)).toBe(415);
    }
    expect((await s.put(named('X'), s.adminToken, 'application/json; charset=utf-8')).status).toBe(200);
    const huge = JSON.stringify({ ads: ['A'.repeat(BODY_MAX)] });
    const big = await s.put(huge, s.adminToken);
    expect(big.status).toBe(413);
    expect((await big.json()).error).toMatch(new RegExp(`${BODY_MAX / 1024 / 1024} Mo`));
    const bad = await s.put('{ not json', s.adminToken);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Requête illisible.' });
    expect(await (await s.get()).json()).toEqual(named('X'));
  });

  it('refuses an invalid roster with 400 naming the field, keeping the previous one', async () => {
    expect((await s.put(named('Avant'), s.adminToken)).status).toBe(200);
    for (const [body, field] of [
      [{ chars: { nobody: {} } }, 'chars.nobody'],
      [{ chars: { lucie: { livery: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` } } }, 'chars.lucie.livery'],
      [{ ads: [img('png', 64, MAGIC.jpeg)] }, 'ads.0'],
      [[], 'roster'],
    ]) {
      const r = await s.put(body, s.adminToken);
      expect(r.status).toBe(400);
      const j = await r.json();
      expect(j.field).toBe(field);
      expect(j.error).toContain(field);
    }
    expect(await (await s.get()).json()).toEqual(named('Avant'));
    expect(CHARACTERS[0].name).toBe('Avant');
  });

  it('stores the cleaned roster, serves it to everyone, and renames the server’s cast', async () => {
    const chars = Object.fromEntries(ALL_IDS.map(id => [id, { name: ` Élu ${id} `, title: 'Titre ' + id }]));
    chars.victor.livery = img('jpeg'); chars.victor.suit = '#ABCDEF'; chars.kevin.style = { wheels: 'gold' };
    const r = await s.put({ chars, ads: [img('webp')] }, s.adminToken);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const stored = await r.json();
    expect(stored.chars.victor).toEqual({ name: 'Élu victor', title: 'Titre victor', suit: '#abcdef', livery: img('jpeg') });
    expect(stored.chars.kevin.style).toEqual({ wheels: 'gold' });
    expect(stored.ads).toEqual([img('webp')]);
    expect(await (await s.get()).json()).toEqual(stored);
    expect(await s.store.getDoc('roster')).toEqual(stored);
    for (const c of CHARACTERS) expect(c).toMatchObject({ name: 'Élu ' + c.id, title: 'Titre ' + c.id });
  });

  it('names the AI karts of a lobby’s race as edited', async () => {
    const chars = Object.fromEntries(ALL_IDS.map(id => [id, { name: 'IA ' + id }]));
    expect((await s.put({ chars }, s.adminToken)).status).toBe(200);
    const ws = new WebSocket(`ws://127.0.0.1:${s.srv.port}/ws`);
    const seen = [];
    ws.on('message', raw => seen.push(JSON.parse(String(raw))));
    /** The first unread message matching `test`, waiting for it if needed. */
    const next = test => new Promise(ok => {
      const take = () => { const i = seen.findIndex(test); if (i < 0) return false; ok(seen.splice(i, 1)[0]); return true; };
      if (take()) return;
      const on = () => { if (take()) ws.off('message', on); };
      ws.on('message', on);
    });
    await new Promise(ok => ws.once('open', ok));
    ws.send(JSON.stringify({ t: 'hello', token: userToken }));
    await next(m => m.t === 'welcome');
    ws.send(JSON.stringify({ t: 'create' }));
    await next(m => m.t === 'room');
    const before = s.races.length;
    ws.send(JSON.stringify({ t: 'start' }));
    await next(m => m.t === 'room' && m.room.phase === 'race');
    ws.close();
    expect(s.races).toHaveLength(before + 1);
    const ai = s.races.at(-1).filter(slot => slot.isAI);
    expect(ai).toHaveLength(5);
    for (const slot of ai) expect(slot.name).toBe('IA ' + slot.charId);
  });

  it('runs concurrent saves one at a time: each answer is its own roster, and the last stored is the one served', async () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const answers = await Promise.all(names.map(n => s.put(named(n), s.adminToken).then(async r => [n, r.status, await r.json()])));
    for (const [n, status, body] of answers) { expect(status).toBe(200); expect(body).toEqual(named(n)); }
    const served = await (await s.get()).json();
    expect(names.map(named)).toContainEqual(served);
    expect(await s.store.getDoc('roster')).toEqual(served);
    expect(CHARACTERS[0].name).toBe(served.chars.victor.name);
  });

  it('answers 500 and applies nothing when the store cannot write', async () => {
    expect((await s.put(named('Stable'), s.adminToken)).status).toBe(200);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(s.store, 'putDoc').mockRejectedValueOnce(new Error('disk full'));
    const r = await s.put(named('Perdu'), s.adminToken);
    expect(r.status).toBe(500);
    expect(await (await s.get()).json()).toEqual(named('Stable'));
    expect(CHARACTERS[0].name).toBe('Stable');
    expect((await s.put(named('Ensuite'), s.adminToken)).status).toBe(200);    // the next save is not blocked
    expect(CHARACTERS[0].name).toBe('Ensuite');
  });
});

describe('the roster across a restart', () => {
  afterEach(() => { vi.restoreAllMocks(); resetCast(); });

  it('persists in its own file next to the accounts, and is applied at boot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-roster-'));
    const file = join(dir, 'politikart-accounts.json');
    const a = await serve({ store: openFileStore(file) });
    const roster = { chars: { victor: { name: 'Manu', livery: img('png') }, thierry: { quote: '« Je reste. »' } }, ads: [img('jpeg')] };
    expect((await a.put(roster, a.adminToken)).status).toBe(200);
    await a.srv.close(); await a.store.close();

    expect(JSON.parse(readFileSync(join(dir, 'politikart-docs', 'roster.json'), 'utf8'))).toEqual(roster);
    expect(readFileSync(file, 'utf8')).not.toContain('Manu');                  // not in the accounts file
    resetCast();
    expect(CHARACTERS[0].name).toBe(BASE[0].name);

    const b = await serve({ store: openFileStore(file), admin: a.admin });
    try {
      expect(await (await b.get()).json()).toEqual(roster);
      expect(CHARACTERS[0].name).toBe('Manu');
      expect(CHARACTERS[15].quote).toBe('« Je reste. »');
    } finally { await b.srv.close(); await b.store.close(); }
  });

  it('boots on the default cast when the stored roster is invalid or not JSON', async () => {
    for (const content of ['{"chars":{"nobody":{"name":"X"}}}', '{"chars":{"victor":{"name":"' + 'n'.repeat(40) + '"}}}', '{ not json']) {
      const dir = mkdtempSync(join(tmpdir(), 'kr-roster-'));
      mkdirSync(join(dir, 'politikart-docs'));
      writeFileSync(join(dir, 'politikart-docs', 'roster.json'), content);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      applyRoster(named('Résidu'), CHARACTERS, BASE);
      const s = await serve({ store: openFileStore(join(dir, 'politikart-accounts.json')) });
      try {
        expect(await (await s.get()).json()).toEqual({ chars: {}, ads: [] });
        expect(CHARACTERS[0].name).toBe(BASE[0].name);
        expect(warn).toHaveBeenCalledTimes(1);
        // the admin can still save over it
        expect((await s.put(named('Neuf'), s.adminToken)).status).toBe(200);
        expect(JSON.parse(readFileSync(join(dir, 'politikart-docs', 'roster.json'), 'utf8'))).toEqual(named('Neuf'));
      } finally { await s.srv.close(); await s.store.close(); vi.restoreAllMocks(); }
    }
  });

  it('keeps nothing on disk for a memory store', async () => {
    const s = await serve();
    try {
      expect((await s.put(named('Volatile'), s.adminToken)).status).toBe(200);
      expect(s.store.kind).toBe('memory');
      expect(existsSync(join(process.cwd(), 'politikart-docs'))).toBe(false);
    } finally { await s.srv.close(); }
  });
});
