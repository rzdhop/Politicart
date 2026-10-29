// Regenerates the Design System files (bundle.js, per-component stories.js)
// from a copy of packages/ui, in the layout the artifact already publishes.
// Usage: node gen.mjs <treeRoot> <outDir> bundle|stories <Comp...>
// esbuild resolves from the repo's root node_modules (a vite dependency).
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const { build } = esbuild;
/** .design-sync/, beside this tools/ folder: config.json and preview-root.jsx. */
const SYNC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [, , ROOT, OUT, MODE, ...COMPS] = process.argv;
const PKG = join(ROOT, 'packages/ui');
const SRC = join(PKG, 'src');
// The repo root as the published files name it in their module comments: a
// fixed label of the output format, not a path this script reads. Every sync
// so far wrote it, so a re-sync keeps it or every changed file gains a diff.
const REAL = '/home/user/Politicart';
// esbuild prints module paths relative to cwd; the published files were built
// six levels below /, so mimic that (an empty folder) and then map the copy's
// root to REAL.
const CWD = '/tmp/a/b/c/d/e';
mkdirSync(CWD, { recursive: true });

const SHIM = `var R = window.React;
function np(p, k) { var o = {}; for (var x in p) if (x !== "children") o[x] = p[x]; if (k !== void 0) o.key = k; return o; }
function jsx(t, p, k) { var c = p && p.children; return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c); }
function jsxs(t, p, k) { return R.createElement.apply(R, [t, np(p, k)].concat(p.children)); }
module.exports = R;
module.exports.jsx = jsx;
module.exports.jsxs = jsxs;
module.exports.jsxDEV = function (t, p, k, s) { return (s ? jsxs : jsx)(t, p, k); };
module.exports.Fragment = R.Fragment;
`;
const DOMSHIM = `module.exports = window.ReactDOM;\n`;

function shimPlugin(dsMode) {
  return {
    name: 'ds-shims',
    setup(b) {
      b.onResolve({ filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, () => ({ path: 'react-shim', namespace: 'shim' }));
      b.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({ path: 'react-dom-shim', namespace: 'shim' }));
      b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({ contents: a.path === 'react-shim' ? SHIM : DOMSHIM, loader: 'js' }));
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      if (dsMode) {
        // A story's import of a library component resolves to the bundle global.
        b.onResolve({ filter: /^\.\.?\// }, (a) => {
          if (a.namespace !== 'file') return;
          const base = resolve(a.resolveDir, a.path);
          if (!base.startsWith(join(SRC, 'components'))) return;
          if (/\.stories(\.tsx?)?$/.test(base) || base.includes('/previews/')) return;
          let file = base;
          for (const ext of ['', '.tsx', '.ts']) if (existsSync(base + ext) && !base.endsWith('/')) { file = base + ext; if (ext || /\.[jt]sx?$/.test(base)) break; }
          return { path: file, namespace: 'ds' };
        });
        b.onLoad({ filter: /.*/, namespace: 'ds' }, () => ({ contents: 'module.exports = window.PolitikartUI;\n', loader: 'js' }));
      }
    },
  };
}

const common = {
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  logLevel: 'warning',
  absWorkingDir: CWD,
};

const fix = (s) => s.split(relative(CWD, resolve(ROOT))).join('../../../../../..' + REAL).split(resolve(ROOT)).join(REAL).split(resolve(ROOT).slice(1)).join(REAL.slice(1)).replace(/^"use strict";\n/, '');

async function bundle() {
  const entry = join(SRC, 'bundle-entry.js');
  writeFileSync(entry, `export * from './index.ts';\nexport { PreviewRoot } from '../../../.design-sync/preview-root.jsx';\n`);
  const r = await build({ ...common, entryPoints: [entry], globalName: 'PolitikartUI', plugins: [shimPlugin(false)] });
  let js = fix(r.outputFiles[0].text);
  // Header: component order = export order of index.ts (PascalCase components only).
  const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
  const names = [];
  for (const m of idx.matchAll(/export\s*\{([^}]*)\}\s*from\s*'\.\/components\/[^']+'/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim();
      if (/^[A-Z][A-Za-z0-9]*$/.test(n) && !/Props$|Handle$/.test(n) && n !== 'GRADES') names.push(n);
    }
  }
  const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'PolitikartUI', components: names.map((name) => ({ name })) })} */\n`;
  js = header + js + 'window.PolitikartUI=PolitikartUI.__dsMainNs?Object.assign({},PolitikartUI,PolitikartUI.__dsMainNs,{__dsMainNs:undefined}):PolitikartUI;\n';
  if (/<\/script|<!--/i.test(js)) throw new Error('bundle contains </script or <!--');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'bundle.js'), js);
  console.log('bundle.js', js.length, names.length, 'components');
}

function findStory(comp) {
  for (const g of readdirSync(join(SRC, 'components'))) {
    const f = join(SRC, 'components', g, `${comp}.stories.tsx`);
    if (existsSync(f)) return { group: g, file: f };
  }
  throw new Error('no story for ' + comp);
}

const MOUNT = (mode, primary, skip) => `
// Mounts every story of this component into the card: a grid of cells, one column, or the primary story alone.
(function () {
  var MODE = ${JSON.stringify(mode)}, PRIMARY = ${JSON.stringify(primary)}, SKIP = ${JSON.stringify(skip)};
  var E = [];
  for (var k in __dsPreview) { if (typeof __dsPreview[k] === 'function' && /^[A-Z]/.test(k) && SKIP.indexOf(k) < 0) E.push(k); }
  var g = document.getElementById('g');
  if (MODE === 'column') { g.className += ' ds-col'; var i0 = PRIMARY ? E.indexOf(PRIMARY) : -1; if (i0 > 0) { E.splice(i0, 1); E.unshift(PRIMARY); } }
  function mount(id, key) {
    try { ReactDOM.createRoot(document.getElementById(id)).render(React.createElement(window.PolitikartUI.PreviewRoot, {}, React.createElement(__dsPreview[key]))); }
    catch (e) { document.getElementById(id).textContent = 'Erreur : ' + (e && e.message || e); }
  }
  if (MODE === 'single' && E.length) {
    var pick = E.indexOf(PRIMARY) >= 0 ? PRIMARY : E[0];
    var s = document.createElement('div'); s.id = 'r0'; document.body.style.padding = '0';
    g.parentNode.replaceChild(s, g); mount('r0', pick);
  } else {
    for (var i = 0; i < E.length; i++) {
      var cell = document.createElement('section'); cell.className = 'ds-cell';
      var h4 = document.createElement('h4'); h4.textContent = E[i]; cell.appendChild(h4);
      var root = document.createElement('div'); root.id = 'r' + i; cell.appendChild(root);
      g.appendChild(cell); mount('r' + i, E[i]);
    }
  }
})();
`;

const COMPOSE = `function compose(S, key) {
  const meta = S.default ?? {};
  const st = S[key];
  const args = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  const at = { ...(meta.argTypes ?? {}), ...(st && st.argTypes ? st.argTypes : {}) };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === "object" && args[k] in m) args[k] = m[args[k]];
  }
  const title = typeof meta.title === "string" ? meta.title : "";
  const ctx = {
    args,
    name: key,
    title,
    kind: title,
    id: "",
    componentId: "",
    globals: {},
    viewMode: "story",
    parameters: (st && st.parameters) ?? meta.parameters ?? {}
  };
  let render = null;
  if (st && typeof st.render === "function") render = () => st.render(args, ctx);
  else if (typeof st === "function") render = () => st(args, ctx);
  else if (typeof meta.render === "function") render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  const decorators = [].concat((st && st.decorators) ?? []).concat(meta.decorators ?? []);
  return decorators.reduce((inner, dec) => () => {
    const out = dec(inner, ctx);
    return out === void 0 ? inner() : out;
  }, render);
}
`;

async function stories(comp, mode, primary, skip) {
  const { group, file } = findStory(comp);
  const src = readFileSync(file, 'utf8');
  const keys = [...src.matchAll(/^export const ([A-Z][A-Za-z0-9]*)\b/gm)].map((m) => m[1]);
  const dir = join(SRC, 'components', group, 'previews');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, `${comp}.tsx`);
  let code = `import * as React from 'react';\nimport * as S from '../${comp}.stories';\n${COMPOSE}`;
  // A story laid out with position: fixed (a Screen) has no height in the card's
  // flow; it renders inside a sized frame whose transform contains it.
  const frames = FRAMED[comp] ?? {};
  for (const k of keys) {
    if (frames[k]) code += `const FRAME_${k} = { position: "relative", height: ${JSON.stringify(frames[k])}, transform: "translateZ(0)", overflow: "hidden" };\nconst ${k}Story = compose(S, ${JSON.stringify(k)});\nexport const ${k} = () => React.createElement("div", { style: FRAME_${k} }, React.createElement(${k}Story));\n`;
    else code += `export const ${k} = /* ${k} */ compose(S, ${JSON.stringify(k)});\n`;
  }
  const r = await build({ ...common, stdin: { contents: code, resolveDir: dir, sourcefile: entry, loader: 'tsx' }, globalName: '__dsPreview', plugins: [shimPlugin(true)] });
  let js = '"use strict";\n' + fix(r.outputFiles[0].text) + MOUNT(mode, primary, skip);
  if (/<\/script|<!--/i.test(js)) throw new Error(comp + ': stories contains </script or <!--');
  mkdirSync(join(OUT, comp), { recursive: true });
  writeFileSync(join(OUT, comp, 'stories.js'), js);
  console.log(comp, 'stories', keys.join(','));
  return { keys, group };
}

const FRAMED = {
  SelectLayout: { WithStage: '720px' },
  // RevealStage is a fixed overlay; each story's own box height becomes its frame.
  RevealStage: { Reveal: '460px', Tease: '420px', Burst: '420px', Bundle: '460px', PolitiboxOpening: '460px' },
};
const cfg = JSON.parse(readFileSync(join(SYNC, 'config.json'), 'utf8'));
if (MODE === 'bundle') await bundle();
else
  for (const c of COMPS) {
    const o = cfg.overrides[c] ?? {};
    const skipIds = o.skip ?? [];
    // story ids -> export keys: "results-resultstable--empty" -> "Empty"
    const skip = skipIds.map((id) => id.split('--')[1].replace(/(^|-)([a-z])/g, (_, __, ch) => ch.toUpperCase()));
    await stories(c, o.cardMode ?? 'grid', o.primaryStory ?? '', skip);
  }
