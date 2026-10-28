// The game's real-name scan, run over any folder: a sync's staged files, the
// read-back of the published artifact, these tools.
// usage: node namescan.mjs <dir>
//
// The names and the matching are not copied here: they are read from the one
// list allowed to hold them, the scan in apps/game/src/engine/looks.test.js
// (REAL_NAMES through PATTERNS), so the two can never drift apart.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/game/src/engine/looks.test.js');
const src = readFileSync(TEST, 'utf8');
const from = src.indexOf('const REAL_NAMES = [');
const to = src.indexOf('/** The real names found in a text');
if (from < 0 || to < from) throw new Error('the scan moved in ' + TEST);
const { PATTERNS, fold } = new Function(`${src.slice(from, to)}\nreturn { PATTERNS, fold };`)();

/** The real names found in a text, as the patterns that matched. */
const realNames = (text) => { const t = fold(text); return PATTERNS.filter((re) => re.test(t)).map((re) => re.source); };

function* walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') yield* walk(p); }
    else if (/\.(js|jsx|cjs|mjs|ts|tsx|html|md|json|css|py|sh|txt|svg)$/.test(e.name)) yield p;
  }
}

const root = process.argv[2];
if (!root) throw new Error('usage: node namescan.mjs <dir>');
let hits = 0, files = 0;
for (const f of walk(root)) {
  files++;
  readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    for (const re of realNames(l)) { hits++; console.log(f.slice(root.length), i + 1, re); }
  });
}
console.log('scanned', files, 'files,', hits, 'hits');
