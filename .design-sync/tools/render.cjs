// Renders preview.html cards locally the way the Design System page frames
// them (tokens.css, bundle.css, React 18, bundle.js preloaded; data-theme set),
// on a static server on port 8411, and saves a full-page PNG per card.
// usage: DS_SYNC=<work dir> DS_PUBLISHED=<project dir> [CHROMIUM=<chrome>] node render.cjs <outDir> <Comp[:width]>...
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// The work folder (stage/project, lib/ with React, cdn/ with the cached unpkg
// files) and a read-back copy of the artifact's project/ folder, from the environment.
const S = process.env.DS_SYNC, PUB = process.env.DS_PUBLISHED;
if (!S || !PUB) throw new Error('set DS_SYNC (the sync work folder) and DS_PUBLISHED (the published project/ copy)');
const STAGE = path.join(S, 'stage/project');
const [outDir, ...cards] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.jsx': 'text/babel', '.jpg': 'image/jpeg', '.png': 'image/png' };
const PRE = '<link rel="stylesheet" href="/project/tokens.css"><link rel="stylesheet" href="/project/components/bundle.css">' +
  '<script src="/lib/react.production.min.js"></script><script src="/lib/react-dom.production.min.js"></script>' +
  '<script src="/project/components/bundle.js"></script>';

function file(rel) {
  // stage (what will be published) wins over the published copy
  for (const base of [STAGE, PUB]) {
    const p = path.join(base, rel);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let p = null, body = null;
  if (u.startsWith('/lib/')) p = path.join(S, u);
  else if (u.startsWith('/project/')) {
    const rel = u.slice('/project/'.length);
    if (rel.endsWith('/card.html')) {
      const f = file(rel.replace('/card.html', '/preview.html'));
      if (f) body = fs.readFileSync(f, 'utf8').replace('<head>', '<head>' + PRE).replace('<html lang="fr">', '<html lang="fr" data-theme="dark">');
    } else p = file(rel);
  }
  if (body !== null) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(body); }
  if (!p || !fs.existsSync(p)) { res.writeHead(404); return res.end('404 ' + u); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(8411, '127.0.0.1', r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,   // Playwright's own browser unless CHROMIUM names one
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const heights = {};
  for (const spec of cards) {
    const [comp, w, h] = spec.split(':');
    const width = +(w || 900), vh = +(h || 700);
    const page = await browser.newPage({ viewport: { width, height: vh } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', (r) => errors.push('failed ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await page.goto(`http://127.0.0.1:8411/project/components/${comp}/card.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => ({
      h: Math.ceil((document.getElementById('g') || document.getElementById('r0')).getBoundingClientRect().bottom + 16),
      cells: [...document.querySelectorAll('.ds-cell')].map((c) => ({ name: c.querySelector('h4')?.textContent, w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height), text: c.innerText.slice(0, 60).replace(/\n/g, ' | ') })),
      errText: [...document.querySelectorAll('.ds-cell')].filter((c) => /Erreur/.test(c.textContent)).map((c) => c.textContent),
      font: getComputedStyle(document.querySelector('.big, .tname, .btn, h4') || document.body).fontFamily,
    }));
    heights[comp] = info.h;
    const name = `${comp}${w ? '-' + width + 'x' + vh : ''}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
    console.log(JSON.stringify({ comp, width, scrollHeight: info.h, cells: info.cells, errText: info.errText, errors }, null, 0));
    await page.close();
  }
  fs.writeFileSync(path.join(outDir, 'heights.json'), JSON.stringify(heights, null, 1));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
