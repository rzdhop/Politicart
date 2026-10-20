// The capped JSON body reader, on fake requests: a stream with headers.
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { isJson, readJsonBody } from './body.js';

/** A request whose body arrives in `chunks`; `length` is its Content-Length header, if any. */
function request(chunks, length) {
  const req = new PassThrough();
  req.headers = length === undefined ? {} : { 'content-length': String(length) };
  req.complete = false;
  queueMicrotask(() => { for (const c of chunks) req.write(c); req.complete = true; req.end(); });
  return req;
}

describe('readJsonBody', () => {
  it('parses a body up to the limit', async () => {
    const body = JSON.stringify({ a: 'x'.repeat(80) });
    expect(await readJsonBody(request([body.slice(0, 10), body.slice(10)], body.length), body.length)).toEqual({ ok: true, value: { a: 'x'.repeat(80) } });
  });

  it('answers 400 for what is not JSON, an empty body included', async () => {
    expect(await readJsonBody(request(['{ nope']), 100)).toEqual({ ok: false, status: 400 });
    expect(await readJsonBody(request([]), 100)).toEqual({ ok: false, status: 400 });
  });

  it('answers 413 past the limit, reading the rest without keeping it', async () => {
    expect(await readJsonBody(request(['"' + 'x'.repeat(120) + '"']), 100)).toEqual({ ok: false, status: 413 });
    expect(await readJsonBody(request(['"' + 'x'.repeat(60), 'x'.repeat(60) + '"']), 100)).toEqual({ ok: false, status: 413 });
  });

  it('answers 413 at once, closing, for a declared size past twice the limit', async () => {
    const req = request(['x'.repeat(10)], 1000);
    expect(await readJsonBody(req, 100)).toEqual({ ok: false, status: 413, close: true });
  });

  it('cuts an undeclared stream past twice the limit', async () => {
    const req = request(['x'.repeat(150), 'x'.repeat(150)]);
    expect(await readJsonBody(req, 100)).toEqual({ ok: false, status: 413, close: true });
    expect(req.destroyed).toBe(true);
  });

  it('answers 400 when the request breaks off', async () => {
    const req = new PassThrough(); req.headers = {}; req.complete = false;
    const p = readJsonBody(req, 100);
    req.write('{"a":'); req.destroy();
    expect(await p).toEqual({ ok: false, status: 400 });
  });
});

describe('isJson', () => {
  it('accepts application/json with or without parameters, nothing else', () => {
    const req = type => ({ headers: type === undefined ? {} : { 'content-type': type } });
    for (const t of ['application/json', 'Application/JSON', 'application/json; charset=utf-8', 'application/json;charset=UTF-8']) expect(isJson(req(t)), t).toBe(true);
    for (const t of [undefined, '', 'text/plain', 'application/jsonp', 'application/json-patch+json', 'text/json', 'multipart/form-data']) expect(isJson(req(t)), String(t)).toBe(false);
  });
});
