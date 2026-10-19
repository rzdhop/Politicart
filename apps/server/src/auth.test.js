import { randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  checkMutation, clientIp, createAdmin, createRateLimiter, createSessions, hashPassword, hashPasswordSync,
  isPasswordHash, parseCookies, requestScheme, safeEqual, sessionCookie, verifyPassword,
} from './auth.js';

// Generated per run: no password or real hash ever lands in the repo.
const PASSWORD = `pw-${randomBytes(9).toString('base64url')}-é`;
let HASH;
beforeAll(async () => { HASH = await hashPassword(PASSWORD); });

const fakeReq = (headers = {}, remoteAddress = '10.0.0.1') => ({ headers, socket: { remoteAddress } });

describe('password hash', () => {
  it('round-trips in the self-describing scrypt format', async () => {
    expect(HASH).toMatch(/^scrypt\$N=16384,r=8,p=1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
    expect(isPasswordHash(HASH)).toBe(true);
    expect(await verifyPassword(PASSWORD, HASH)).toBe(true);
    // Salted: the same password never hashes the same twice.
    expect(await hashPassword(PASSWORD)).not.toBe(HASH);
  });

  it('hashes synchronously into the same format, which verifies', async () => {
    const sync = hashPasswordSync(PASSWORD);
    expect(sync).toMatch(/^scrypt\$N=16384,r=8,p=1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
    expect(isPasswordHash(sync)).toBe(true);
    expect(await verifyPassword(PASSWORD, sync)).toBe(true);
    expect(await verifyPassword(PASSWORD.normalize('NFD'), sync)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}x`, sync)).toBe(false);
    expect(() => hashPasswordSync(undefined)).toThrow(TypeError);
  });

  it('accepts the same accented password whatever its Unicode form', async () => {
    expect(await verifyPassword(PASSWORD.normalize('NFD'), HASH)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    expect(await verifyPassword(`${PASSWORD}x`, HASH)).toBe(false);
    expect(await verifyPassword('', HASH)).toBe(false);
    expect(await verifyPassword(undefined, HASH)).toBe(false);
  });

  it('answers false, never throws, on a malformed or empty stored hash', async () => {
    const [, , salt, key] = HASH.split('$');
    for (const bad of [
      undefined, null, '', 'scrypt', PASSWORD, `${HASH}x`,
      HASH.replace('scrypt$', 'bcrypt$'),
      `scrypt$N=16383,r=8,p=1$${salt}$${key}`,          // not a power of two
      `scrypt$N=1073741824,r=8,p=1$${salt}$${key}`,     // absurd cost
      `scrypt$N=16384,r=8,p=1$${salt}`,                 // no key
      `scrypt$N=16384,r=8,p=1$AAAA$${key}`,             // salt too short
      `scrypt$N=16384,r=8,p=1$${salt}$!!!!`,            // not base64
      `scrypt$N=16384,r=8,p=1$${salt}$${key}$extra`,
    ]) {
      expect(isPasswordHash(bad)).toBe(false);
      await expect(verifyPassword(PASSWORD, bad)).resolves.toBe(false);
    }
  });

  it('compares strings in constant time, lengths included', () => {
    expect(safeEqual('rida', 'rida')).toBe(true);
    expect(safeEqual('rida', 'rid')).toBe(false);
    expect(safeEqual('', 'rida')).toBe(false);
  });
});

describe('sessions', () => {
  it('creates, reads and expires a token on an injected clock', () => {
    let t = 1_000;
    const s = createSessions({ ttlMs: 10_000, now: () => t });
    const token = s.create('rida');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.get(token)).toEqual({ user: 'rida', expires: 11_000 });
    t = 10_999; expect(s.get(token)?.user).toBe('rida');
    t = 11_000; expect(s.get(token)).toBeNull();
    expect(s.size).toBe(0);
  });

  it('sweeps expired sessions and bounds the map', () => {
    let t = 0;
    const s = createSessions({ ttlMs: 100, now: () => t, max: 3 });
    s.create('a'); s.create('b');
    t = 200; s.create('c');
    expect(s.size).toBe(1);
    const tokens = [s.create('d'), s.create('e'), s.create('f')];
    expect(s.size).toBe(3);
    expect(s.get(tokens[2])?.user).toBe('f');
  });

  it('ignores garbage tokens and destroys on logout', () => {
    const s = createSessions();
    for (const bad of [undefined, null, '', 'x', 42, {}, '__proto__']) expect(s.get(bad)).toBeNull();
    const token = s.create('rida');
    s.destroy(token);
    expect(s.get(token)).toBeNull();
  });
});

describe('rate limiter', () => {
  it('allows 5 failures per IP per minute, then waits for the window', () => {
    let t = 0;
    const rl = createRateLimiter({ now: () => t });
    for (let i = 0; i < 5; i++) expect(rl.take('1.1.1.1').ok).toBe(true);
    const blocked = rl.take('1.1.1.1');
    expect(blocked).toEqual({ ok: false, retryAfterS: 60 });
    expect(rl.take('2.2.2.2').ok).toBe(true);            // another client is unaffected
    t = 59_999; expect(rl.take('1.1.1.1').ok).toBe(false);
    t = 60_000; expect(rl.take('1.1.1.1').ok).toBe(true);
  });

  it('caps failures across all IPs, so rotating addresses does not help', () => {
    let t = 0;
    const rl = createRateLimiter({ now: () => t });
    for (let i = 0; i < 30; i++) expect(rl.take(`10.0.0.${i}`).ok).toBe(true);
    expect(rl.take('10.9.9.9').ok).toBe(false);
    t = 60_000; expect(rl.take('10.9.9.9').ok).toBe(true);
    expect(rl.size).toBe(1);                              // stale IPs are swept
  });

  it('a success clears its own IP but does not reset the global window', () => {
    let t = 0;
    const rl = createRateLimiter({ now: () => t });
    for (let i = 0; i < 4; i++) rl.take('1.1.1.1');
    rl.take('1.1.1.1').success();
    for (let i = 0; i < 5; i++) expect(rl.take('1.1.1.1').ok).toBe(true);
    // 9 failures so far; 21 more from elsewhere reach the global cap of 30.
    for (let i = 0; i < 21; i++) expect(rl.take(`10.0.0.${i}`).ok).toBe(true);
    rl.take('1.1.1.1');                                   // per-IP blocked anyway
    expect(rl.take('10.9.9.9').ok).toBe(false);
  });
});

describe('cookies', () => {
  it('parses defensively', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies(['kr_admin=a'])).toEqual({});
    expect({ ...parseCookies('a=1; b = 2 ;c="3";; =x; noeq; d=') }).toEqual({ a: '1', b: '2', c: '3', d: '' });
    expect(parseCookies('kr_admin=first; kr_admin=second').kr_admin).toBe('first');
    expect(parseCookies('v=%E9%ZZ').v).toBe('%E9%ZZ');    // undecodable stays raw
    expect(parseCookies('v=a%20b').v).toBe('a b');
    expect(parseCookies('v=a=b').v).toBe('a=b');
    const proto = parseCookies('__proto__=x; constructor=y');
    expect(Object.getPrototypeOf(proto)).toBeNull();
    expect(proto.__proto__).toBe('x');
  });

  it('serialises the session cookie with its flags', () => {
    expect(sessionCookie('tok', { secure: false, maxAgeS: 43200 })).toBe('kr_admin=tok; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200');
    expect(sessionCookie('', { secure: true, maxAgeS: 0 })).toBe('kr_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure');
  });
});

describe('request context', () => {
  it('believes proxy headers only when told to', () => {
    const req = fakeReq({ 'x-forwarded-proto': 'https', 'fly-client-ip': '203.0.113.7' });
    expect(requestScheme(req, false)).toBe('http');
    expect(clientIp(req, false)).toBe('10.0.0.1');
    expect(requestScheme(req, true)).toBe('https');
    expect(clientIp(req, true)).toBe('203.0.113.7');
    expect(requestScheme(fakeReq({ 'x-forwarded-proto': 'https, http' }), true)).toBe('https');
    expect(requestScheme(fakeReq({ 'x-forwarded-proto': 'gopher' }), true)).toBe('http');
    expect(clientIp(fakeReq({}), true)).toBe('10.0.0.1');
  });

  it('accepts only same-origin JSON mutations', () => {
    const ok = { 'content-type': 'application/json; charset=utf-8', host: 'kart.test:8080', origin: 'http://kart.test:8080' };
    expect(checkMutation(fakeReq(ok), false)).toBeNull();
    expect(checkMutation(fakeReq({ ...ok, 'content-type': 'text/plain' }), false)?.status).toBe(415);
    expect(checkMutation(fakeReq({ ...ok, 'content-type': undefined }), false)?.status).toBe(415);
    expect(checkMutation(fakeReq({ ...ok, origin: undefined }), false)?.status).toBe(403);
    expect(checkMutation(fakeReq({ ...ok, origin: 'null' }), false)?.status).toBe(403);
    expect(checkMutation(fakeReq({ ...ok, origin: 'http://evil.test:8080' }), false)?.status).toBe(403);
    expect(checkMutation(fakeReq({ ...ok, origin: 'https://kart.test:8080' }), false)?.status).toBe(403);
    expect(checkMutation(fakeReq({ ...ok, host: undefined }), false)?.status).toBe(403);
    // Behind the proxy the browser's origin is https on the default port.
    const fly = { ...ok, host: 'kart.fly.dev', origin: 'https://kart.fly.dev', 'x-forwarded-proto': 'https' };
    expect(checkMutation(fakeReq(fly), true)).toBeNull();
    expect(checkMutation(fakeReq(fly), false)?.status).toBe(403);
  });
});

describe('admin account', () => {
  it('is disabled without a well-formed hash', async () => {
    for (const passwordHash of [undefined, '', 'nope']) {
      const a = createAdmin({ passwordHash });
      expect(a.enabled).toBe(false);
      expect(await a.verify('rida', PASSWORD)).toBe(false);
    }
  });

  it('verifies the configured user and password only', async () => {
    const a = createAdmin({ user: 'rida', passwordHash: HASH });
    expect(a.enabled).toBe(true);
    expect(await a.verify('rida', PASSWORD)).toBe(true);
    expect(await a.verify('Rida', PASSWORD)).toBe(false);
    expect(await a.verify('rida', 'wrong-password')).toBe(false);
    expect(await a.verify(['rida'], PASSWORD)).toBe(false);
    expect(await a.verify('rida', [PASSWORD])).toBe(false);
  });

  it('finds the admin behind a session cookie', () => {
    const a = createAdmin({ passwordHash: HASH });
    const token = a.sessions.create('rida');
    expect(a.requireAdmin(fakeReq({ cookie: `other=1; kr_admin=${token}` }))).toEqual({ user: 'rida' });
    expect(a.requireAdmin(fakeReq({ cookie: 'kr_admin=forged' }))).toBeNull();
    expect(a.requireAdmin(fakeReq({}))).toBeNull();
  });
});
