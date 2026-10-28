// Runs the character-select template locally (bundle and cast from stage/, the
// rest from the published copy, unpkg served from a local cache) and captures it.
// usage: DS_SYNC=<work dir> DS_PUBLISHED=<project dir> [CHROMIUM=<chrome>] node tplshot.cjs <outDir> <WxH> <sel,...>
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
// The work folder (stage/project, lib/ with React, cdn/ with the cached unpkg
// files) and a read-back copy of the artifact's project/ folder, from the environment.
const S = process.env.DS_SYNC, PUB = process.env.DS_PUBLISHED;
if (!S || !PUB) throw new Error('set DS_SYNC (the sync work folder) and DS_PUBLISHED (the published project/ copy)');
const STAGE = path.join(S, 'stage/project');
const [outDir, size, sels, prefix] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jsx': 'text/plain' };
const file = (rel) => [STAGE, PUB].map((b) => path.join(b, rel)).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const p = u.startsWith('/project/') ? file(u.slice(9)) : null;
  if (!p) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(8411, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,   // Playwright's own browser unless CHROMIUM names one
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.route('https://unpkg.com/**', (route) => {
    const rel = route.request().url().replace('https://unpkg.com/', '');
    const p = path.join(S, 'cdn', rel);
    if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: 'missing ' + rel });
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(p), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('http://127.0.0.1:8411/project/templates/character-select/CharacterSelect.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.Stage3D && window.__portraits && window.__portraits.length, null, { timeout: 120000 }).catch((e) => errors.push('wait: ' + e.message));
  for (const s of sels.split(',').map(Number)) {
    await page.evaluate((s) => { const tiles = document.querySelectorAll('.tile'); tiles[s] && tiles[s].click(); }, s);
    await page.waitForTimeout(+(process.env.WAIT || 2500));
    const name = `${prefix || 'template'}-${W}x${H}-sel${s}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    const info = await page.evaluate(() => ({ big: document.querySelector('.showcase .big')?.textContent, tiles: [...document.querySelectorAll('.tile')].map((t) => t.textContent).join(' / '), pending: document.querySelectorAll('.tile.pending').length, stage: (() => { const r = document.querySelector('.showcase-stage')?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height].map(Math.round); })() }));
    console.log(name, JSON.stringify(info));
  }
  console.log('errors', JSON.stringify(errors.slice(0, 20)));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
