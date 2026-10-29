#!/usr/bin/env node
// Precompress the built game (DEC-055): beside every text asset of dist/
// (scripts, styles, the page, SVG, JSON, text) a `.br` (brotli, quality 11)
// and a `.gz` (gzip, level 9) sibling, which the game server serves instead
// of compressing on every request (server.js). Node's zlib alone, no
// dependency. Files under 1 kB are left alone (the headers would outweigh the
// saving); the source maps too (a browser fetches one only when the
// developer tools ask for it). A sibling older than its file is rewritten,
// the others are kept.
//
//   node scripts/compress.mjs [dist]     (the game's build script runs it after vite build)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

export const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.webmanifest']);
const MIN_SIZE = 1024;

/** Every file under `dir`, recursively, as absolute paths. */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * Compress what needs it under `dir`. Returns one row per file considered:
 * `{ file, raw, br, gz, skipped }` (sizes in bytes; `skipped` when the file
 * is too small or not a text asset).
 */
export function compressDir(dir) {
  const rows = [];
  for (const file of walk(dir)) {
    const ext = file.slice(file.lastIndexOf('.'));
    if (ext === '.br' || ext === '.gz') continue;
    const st = statSync(file);
    if (!COMPRESSIBLE.has(ext) || st.size < MIN_SIZE) { rows.push({ file, raw: st.size, skipped: true }); continue; }
    const fresh = sibling => { try { return statSync(sibling).mtimeMs >= st.mtimeMs; } catch { return false; } };
    const data = readFileSync(file);
    let br, gz;
    if (fresh(file + '.br')) br = statSync(file + '.br').size;
    else { const out = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }); writeFileSync(file + '.br', out); br = out.length; }
    if (fresh(file + '.gz')) gz = statSync(file + '.gz').size;
    else { const out = gzipSync(data, { level: 9 }); writeFileSync(file + '.gz', out); gz = out.length; }
    rows.push({ file, raw: st.size, br, gz, skipped: false });
  }
  return rows;
}

const kb = n => (n / 1024).toFixed(1).padStart(8) + ' kB';
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dir = resolve(process.argv[2] ?? 'dist');
  const rows = compressDir(dir).filter(r => !r.skipped).sort((a, b) => b.raw - a.raw);
  for (const r of rows) console.log(r.file.slice(dir.length + 1).padEnd(40), 'raw' + kb(r.raw), ' gzip' + kb(r.gz), ' brotli' + kb(r.br));
  const sum = k => rows.reduce((n, r) => n + r[k], 0);
  console.log('total'.padEnd(40), 'raw' + kb(sum('raw')), ' gzip' + kb(sum('gz')), ' brotli' + kb(sum('br')));
}
