// Reading a JSON request body with a size cap, for any route that needs one.
//
// readJsonBody(req, limit) resolves to { ok: true, value } or
// { ok: false, status, close? }:
//   413  the body is larger than `limit` bytes;
//   400  it is not JSON, or the request broke off.
//
// A body declared (Content-Length) or found larger than the limit is not kept
// in memory. Up to twice the limit is still read and dropped, so the client,
// which is usually still uploading, gets the 413 instead of a reset socket.
// Beyond that the upload is cut: a declared size answers at once with
// `close: true` (the caller sends `connection: close`), an undeclared stream
// is destroyed.
export function readJsonBody(req, limit) {
  const cap = 2 * limit;
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > cap) return Promise.resolve({ ok: false, status: 413, close: true });
  return new Promise(ok => {
    let size = 0, over = false, parts = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > cap) { req.destroy(); ok({ ok: false, status: 413, close: true }); return; }
      if (size > limit) { over = true; parts = []; return; }
      parts.push(chunk);
    });
    req.on('end', () => {
      if (over) return ok({ ok: false, status: 413 });
      try { ok({ ok: true, value: JSON.parse(Buffer.concat(parts).toString('utf8')) }); }
      catch { ok({ ok: false, status: 400 }); }
    });
    req.on('error', () => ok({ ok: false, status: 400 }));
    req.on('close', () => { if (!req.complete) ok({ ok: false, status: 400 }); });   // cut off mid-upload
  });
}

/** Whether a request says its body is JSON (`application/json`, any parameters). */
export const isJson = req => /^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] ?? ''));
