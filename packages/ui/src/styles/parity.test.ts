import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Stage 2 gate: the library's stylesheets must carry the game's CSS verbatim.
 *
 * The declarations in `packages/ui/src/styles/` were split out of the single
 * `<style>` block in `index.html` mechanically. This suite re-derives both
 * sides and compares them, so a hand edit that drops a declaration, changes a
 * value, or quietly restyles something fails here rather than in a preview
 * nobody looks at closely.
 *
 * Two selectors are deliberately NOT shipped by the library (`#c`, the game's
 * WebGL canvas, and `#s-select`, one screen's layout override) and a short list
 * of selectors is renamed - IDs and bare element selectors cannot ship from a
 * component library. Both lists are asserted explicitly below, so widening
 * either one has to be a deliberate edit to this file.
 *
 * Self-retiring: stage 12 moves the game onto the library and removes its
 * inline `<style>` block. At that point the source side of this comparison no
 * longer exists and the suite skips itself rather than failing - the contract
 * it guards will have been satisfied by construction.
 */

type Rule = { selector: string; decls: string[]; media?: string };

/** The key both sides are compared on: media context plus renamed selector. */
function key(rule: Rule): string {
  const selector = RENAMES[rule.selector] ?? rule.selector;
  return rule.media ? `${rule.media} ${selector}` : selector;
}

function repoRoot(): string {
  let dir = import.meta.dirname;
  while (!existsSync(join(dir, 'package-lock.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('repo root not found');
    dir = up;
  }
  return dir;
}

/** Flatten a stylesheet into rules, inlining `@media` blocks with a prefix. */
function parse(css: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const ws = /\s+/y;
    ws.lastIndex = i;
    if (ws.exec(css)) {
      i = ws.lastIndex;
      continue;
    }
    if (css.startsWith('/*', i)) {
      i = css.indexOf('*/', i) + 2;
      continue;
    }
    if (css.startsWith('@import', i)) {
      i = css.indexOf(';', i) + 1;
      continue;
    }
    if (css.startsWith('@media', i)) {
      const brace = css.indexOf('{', i);
      const media = css.slice(i, brace).trim().replace(/\s+/g, ' ');
      let depth = 0;
      let j = brace;
      for (;;) {
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        j += 1;
      }
      for (const r of parse(css.slice(brace + 1, j))) {
        out.push({ selector: r.selector, decls: r.decls, media });
      }
      i = j + 1;
      continue;
    }
    const brace = css.indexOf('{', i);
    const end = css.indexOf('}', brace);
    out.push({
      selector: css.slice(i, brace).trim().replace(/\s+/g, ' '),
      decls: css
        .slice(brace + 1, end)
        .split(';')
        .map((d) => d.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .sort(),
    });
    i = end + 1;
  }
  return out;
}

/** Selectors the library intentionally does not ship. */
const GAME_LOCAL = ['#c', '#s-select'];

/**
 * Rules that are dead in the game and so are not shipped.
 *
 * `.tile .tname { font-size: 11px }` at index.html:50 is redeclared at :54 by a
 * rule of the same specificity setting 13px, and no media query touches
 * `.tname`'s size, so the 11px declaration can never win the cascade. Matched
 * on selector AND declarations, so editing either line surfaces here rather
 * than being silently tolerated.
 */
const DEAD_IN_SOURCE: Rule[] = [{ selector: '.tile .tname', decls: ['font-size:11px'] }];

function isDead(rule: Rule): boolean {
  return DEAD_IN_SOURCE.some(
    (d) =>
      d.selector === rule.selector &&
      d.decls.length === rule.decls.length &&
      d.decls.every((v, i) => v === rule.decls[i]),
  );
}

/** Selector-only rewrites. Values on both sides must stay identical. */
const RENAMES: Record<string, string> = {
  '#hud': '.hud',
  '#hud[hidden]': '.hud[hidden]',
  '#minimap': '.minimap',
  '#ad-preview img': '.ad-preview img',
  table: '.results-table',
  'td,th': '.results-table td,.results-table th',
  th: '.results-table th',
  'td.r': '.results-table td.r',
  'td.t': '.results-table td.t',
  '.you': '.results-table .you',
};

const root = repoRoot();
const gameHtml = readFileSync(join(root, 'index.html'), 'utf8');
const inlineStyle = /<style>([\s\S]*?)<\/style>/.exec(gameHtml);

function libraryRules(): Rule[] {
  const dir = resolve(import.meta.dirname);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .flatMap((f) => parse(readFileSync(join(dir, f), 'utf8')));
}

describe.skipIf(inlineStyle === null)('library CSS is the game CSS, verbatim', () => {
  const source = parse(inlineStyle?.[1] ?? '');
  const library = libraryRules();

  const byLibrarySelector = new Map(library.map((r) => [key(r), r]));

  it('parses a non-trivial amount of CSS from both sides', () => {
    // Guards the comparison itself: a regex that silently matched nothing would
    // otherwise make every assertion below vacuously true.
    expect(source.length).toBeGreaterThan(90);
    expect(library.length).toBeGreaterThan(90);
  });

  it.each(
    source
      .filter((r) => !GAME_LOCAL.includes(r.selector) && !isDead(r))
      .map((r) => [key(r), r] as const),
  )('carries %s with identical declarations', (selector, sourceRule) => {
    const libraryRule = byLibrarySelector.get(selector);
    expect(libraryRule, `selector missing from the library: ${selector}`).toBeDefined();
    expect(libraryRule?.decls).toEqual(sourceRule.decls);
  });

  it('ships nothing the game does not define', () => {
    const sourceKeys = new Set(source.map(key));
    const extra = library.map(key).filter((k) => !sourceKeys.has(k));
    expect(extra).toEqual([]);
  });

  it('renames the minimap inside the mobile media query too', () => {
    // Regression guard: the first split applied renames only to top-level
    // selectors, so the 600px shrink stayed bound to #minimap and never
    // reached the renamed .minimap component.
    expect(byLibrarySelector.has('@media (max-width:600px) .minimap')).toBe(true);
    const shipped = new Set(library.map((r) => r.selector));
    expect(shipped.has('#minimap')).toBe(false);
  });

  it('drops the dead rule and keeps the live one', () => {
    // The live .tname rule must still be there at its real size.
    const live = byLibrarySelector.get('.tile .tname');
    expect(live?.decls).toContain('font-size:13px');
    // And the dead one must be gone: exactly one .tile .tname rule ships.
    expect(library.filter((r) => r.selector === '.tile .tname')).toHaveLength(1);
  });

  it('withholds exactly the two game-local selectors', () => {
    const shipped = new Set(library.map((r) => r.selector));

    for (const selector of GAME_LOCAL) {
      expect(shipped.has(selector)).toBe(false);
    }
    // And they really are in the game, so the exclusion list cannot rot.
    const sourceSelectors = new Set(source.map((r) => r.selector));
    for (const selector of GAME_LOCAL) {
      expect(sourceSelectors.has(selector)).toBe(true);
    }
  });

  it('declares every design token, and nothing beyond color-scheme', () => {
    const tokens = byLibrarySelector.get(':root');
    expect(tokens).toBeDefined();
    const decls = tokens?.decls ?? [];
    const names = decls
      .filter((d) => d.startsWith('--'))
      .map((d) => d.split(':')[0]?.trim())
      .sort();
    expect(names).toEqual([
      '--bg',
      '--blue',
      '--fg',
      '--font-body',
      '--font-display',
      '--font-mono',
      '--gold',
      '--line',
      '--muted',
      '--panel',
      '--panel-2',
      '--red',
    ]);
    // The only non-token declaration in :root. If something else appears here
    // it is a global side effect hiding in the token layer.
    expect(decls.filter((d) => !d.startsWith('--'))).toEqual(['color-scheme:dark']);
  });
});
