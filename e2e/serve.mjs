/**
 * A dependency-free static server for the game, used by the Playwright suite.
 *
 * The game is a single HTML file that needs no build, so a real dev server
 * would be overkill -- and adding a server dependency just to run tests would
 * put a package between the suite and the thing it is testing. This serves the
 * repository root over http, which is all `index.html` asks for.
 *
 * It exists because `file://` is not good enough: the game writes to
 * localStorage, which browsers treat as opaque-origin for file URLs, so the
 * workshop persistence test could not pass over `file://`.
 */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;

  // Keep the server inside the repository: a traversal would otherwise expose
  // the whole filesystem to anything that can reach this port.
  const path = join(ROOT, normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    if (!statSync(path).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    // The suite must never be served a stale game between stages.
    'cache-control': 'no-store',
  });
  createReadStream(path).pipe(response);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`serving ${ROOT} on http://127.0.0.1:${PORT}\n`);
});
