# design-sync notes

Findings a future sync needs and the converter cannot infer. Written as they
were discovered; kept in the repo on purpose.

## Repo shape

- The design system is `packages/ui` (`@politikart/ui`), an npm workspace.
  The repo root holds `package-lock.json`, so the install step is `npm ci`.
- The library is extracted from the game at `index.html`, whose single `<style>`
  block was the only definition of the look before this work. See
  `.claude/DECISIONS.md` DEC-001..008 for why the extraction exists at all.

## Fonts -- RESOLVED, self-hosted in the package

The look depends on two families the game loads from Google Fonts with a
`<link>`: Lilita One (`--font-display`) and Nunito 500/700/900
(`--font-body`). Anything rendered from the published bundle has no such link,
so previews and designs would have fallen back to Arial Black and Segoe UI.

Both are now self-hosted. `packages/ui/src/fonts/` holds four woff2 subsets
(92 kB total: each family's `latin` and `latin-ext`), declared by
`src/styles/fonts.css`, which `styles.css` imports first.

**The fonts end up embedded in `dist/styles.css` as base64, not as separate
files, and that is deliberate.** Vite's library mode always inlines assets
referenced from CSS, since a library stylesheet cannot know the consumer's base
path -- `assetsInlineLimit` has no effect there. It also happens to be the
right outcome for the sync: a rendered design receives only `styles.css` and
its `@import` closure, so there is no `fonts/` directory that could go missing.
Cost: `dist/styles.css` is ~127 kB. **So the converter needs no font
configuration** -- do not go looking for a `fonts/` directory to wire up.

Two things to know if these are ever touched:

- Nunito is declared once per subset with `font-weight: 400 900` rather than
  once per weight. It is a variable font: Google serves the identical file for
  500, 700 and 900, which a static font could not do without synthetic
  emboldening. Declaring it per weight embedded the same two files three times
  each and produced 328 kB of CSS. If a preview ever shows no weight contrast
  between body text and a bold label, this assumption is where to look first.
- Only `latin` and `latin-ext` ship. Google also serves cyrillic, cyrillic-ext
  and vietnamese for Nunito; this is a French game.
- **Inherited glyph gap:** the `latin` subset covers U+2191 and U+2193 (the up
  and down arrows in the controls legend) but not U+2190 or U+2192, so the left
  and right arrows fall back to a system font. The game has this gap today too,
  via the same subsets -- not introduced by the port, and not worth a custom
  subset.

## CSS extraction

- The split from `index.html` to `packages/ui/src/styles/*.css` was done
  mechanically, not transcribed. `packages/ui/src/styles/parity.test.ts` is the
  permanent guard: it re-parses both sides and compares declaration sets, so a
  drifted value fails the suite. It skips itself once the game no longer has an
  inline `<style>` block (stage 12), which is the point at which its contract is
  satisfied by construction.
- **Two selectors are withheld from the library** because they belong to the
  game shell, not the design system: `#c` (the WebGL canvas) and `#s-select`
  (one screen's layout override). They stay with the game app.
- **Ten selectors are renamed, declarations untouched**, because an ID cannot
  appear twice on a page and a bare element selector would restyle every table
  in a consuming app: `#hud`->`.hud`, `#minimap`->`.minimap`,
  `#ad-preview img`->`.ad-preview img`, and `table`/`td`/`th`/`td.r`/`td.t`/
  `.you` all scoped under `.results-table`.
- **One dead rule is dropped.** `.tile .tname { font-size: 11px }` at
  index.html:50 is redeclared at :54 at the same specificity with 13px, and no
  media query touches `.tname`'s size, so it could never win the cascade. The
  parity test pins this as a deliberate exclusion.
- **`body { overflow: hidden }` is shipped, faithfully, but is game-shaped.**
  The game is a fixed full-screen canvas and must never scroll. Any page built
  with this system that needs to scroll has to override it. Worth a line in the
  conventions header.
- **`build.cssTarget` is pinned** in `packages/ui/vite.config.ts`. Left at its
  default, Vite 8's minifier rewrites `@media (max-width:600px)` into range
  syntax `(width<=600px)`, which older browsers do not parse -- the HUD would
  silently stop shrinking on them. The game never asked for that baseline.
- Vite's minifier injects `--lightningcss-light` / `--lightningcss-dark` custom
  properties into `:root` in `dist/index.css`. Harmless artifact of how it
  handles `color-scheme`, not a token. Ignore them when reading the built CSS.

## Toolchain

- Node v26.10.0, npm 11.13.0. No pnpm, yarn or bun on this machine.
- React 19.3.1, Vite 8.3.4, TypeScript 7.0.2, Vitest 5.0.4 all install and run
  clean on this Node. Storybook 10.6.2 and Playwright 1.64.1 are planned but
  not yet proven here.

## The controls legend says Z, the code says KeyW

`inputState()` reads `keys.ArrowUp || keys.KeyW` -- there is no `KeyZ` anywhere
in the game, even though the title screen's legend reads "↑ / Z accélérer" and
the README's table says "↑ / Z / W".

That is correct, not a bug: the game listens on `e.code`, which is
layout-independent, and the physical key printed **Z** on an AZERTY keyboard
emits `KeyW`. Likewise the legend's **Q** and **D** for steering are `KeyA` and
`KeyD`. Reading codes is what makes the same physical keys work for AZERTY and
QWERTY players alike.

Two consequences: the E2E suite drives `ArrowUp` and `w` (not `z`), and the
React port must keep reading `e.code` rather than `e.key`, or French players
lose their steering.

## Cleanup candidates found while splitting the engine (stage 9)

All carried over unchanged rather than fixed, because stage 9 is a
repackaging: a behaviour change hidden inside a 1200-line move is exactly what
the staging exists to avoid. Worth doing as their own task.

- **`CAST` is a dead flag.** `apps/game/src/engine/primitives.js` keeps a
  `CAST` boolean that `tag()` reads as `CAST && SHADOWS()`, but nothing ever
  sets it to `false` -- the three call sites outside the module
  (`startRace`, `useItem`'s rebuild, `setPreview`) all set it `true`. So the
  expression is just `SHADOWS()`, and both the flag and its three assignments
  could go.
- **No `<meta name="viewport">`.** The game declares a custom
  `claude:viewport-fit-sides` meta but not the standard viewport one, so a
  phone renders it at a 980px layout width and the `600px`/`760px` media
  queries never match. The game tells players to use a computer, so this has
  never mattered in practice -- but the HUD's phone layout and the select
  screen's stacked layout are therefore unreachable on a real phone, which is
  worth knowing before anyone tests them there.
- **Two dead locals surfaced by the stage 9d split.** `buildBourbon` in
  `engine/track.js` declares `hw` and `pb` without using either. Both predate
  the split and were carried over as-is; `tsc --noUnusedLocals` over the game
  sources lists exactly these, so a later cleanup can re-run that check to
  confirm nothing else has joined them. (A third finding, an unused
  `ITEM_ODDS` import in `game.js`, went away in stage 11 when that import
  line was rewritten for the seam.)

## design-sync run (stage 15, 2026-10-14)

Learnings from the storybook-shape sync of `packages/ui`, in the order found.

- **[GENERAL] The product card paints its page white; this system is dark-only.**
  The card template sets `body{background:#fff}`, so without context every
  component rendered on white (ghost buttons invisible, cream text gone).
  Storybook only looks right because `.storybook/preview.ts` paints the canvas
  `var(--bg)` from a decorator. The decorator bundle fails to build
  (`No loader is configured for ".woff2"` -- the preview imports the source
  stylesheet, whose fonts are local files), and `cfg.storyImports.loaders`
  does not reach that bundle. Fix: `cfg.provider = {component: "PreviewRoot"}`
  with `cfg.extraEntries = ["../../.design-sync/preview-root.jsx"]` -- a
  repo-owned component that wraps each story in the system's background,
  foreground and body font, exactly what the decorator supplied. It ships in
  the bundle as `window.PolitikartUI.PreviewRoot`; a full page does not
  need it (the stylesheet's `body` rule does the same), fragments on a foreign
  page do.
- **[GENERAL] `[FONT_MISSING] "Arial Black", "Impact"` is the fallback stack,
  not a missing font.** `--font-display` is `"Lilita One","Arial Black",Impact,
  sans-serif`; Lilita One and Nunito ship embedded in `styles.css`. Accepted
  as substitutes; nothing to add.
- **[GENERAL] Thirteen `[GRID_OVERFLOW]` warnings on the first validate**, all
  from stories wider than a grid cell (full-width HUD banners, rosters, card
  grids, the title) or fixed-position screens. Applied the overrides the
  validator named: `cardMode: "column"` for Tricolore, CenterAnnounce,
  HudCorner, Toast, WrongWay, CharacterTile, SelectLayout, CardGrid,
  TrackCard, GameTitle, AdminGrid; `cardMode: "single"` with a `primaryStory`
  for Screen (TitleScreen) and NoteBanner (Default), which position content
  with `position: fixed`.
- **The storybook reference crops wide stories at the story root's width**
  (e.g. CharacterTile "In Roster" shows two of four columns). The raw `__sb`
  capture confirms the content; judge from it when the sheet's left side
  looks truncated.
- **ResultsTable "Empty"** renders an empty table -- no root content in
  Storybook either (`sb-error`). To be skipped via
  `cfg.overrides.ResultsTable.skip` together with any other empty-state story
  the roster pass finds; batched into one rebuild.
- **[GENERAL] The compare sheet shrinks the preview side.** The preview is
  captured at 900x700 and scaled about 0.5x on the sheet while the storybook
  side is a tight crop, so previews look smaller. Raw PNGs show identical
  absolute sizes (confirmed on Button, DriftGauge 160x8, CenterAnnounce
  440x260, ItemSlot 96px, Showcase). Judge from the raw captures.
- **[GENERAL] Full-height stories overflowed the capture.** HudLayer's
  "Mid Race" story root is `height: 100vh`; with `PreviewRoot` padding 16px
  on all sides the root overflowed the viewport and the bottom corners were
  clipped. Fix: `PreviewRoot` now pads horizontally only (`0 16px`), so a
  100vh story fits the viewport exactly.
- **Wave 1 of the fan-out (26 components) needed no owned previews**: the
  generated story-module previews were faithful everywhere, including the
  workshop components whose styling is scoped under `.admin` (the story
  module carries the AdminGrid context). AdminGrid wraps to two columns in
  the preview where Storybook shows three: a narrower container, not a defect.
- **[GENERAL] Storybook's `layout: 'centered'` shrink-wraps a story; a
  full-width preview cell does not.** Paint that depends on the element's
  own width differs: GameTitle's tricolore gradient (`32%/68%` stops clipped
  to text) landed on different glyphs. Owned preview
  `.design-sync/previews/GameTitle.tsx` wraps the story in
  `width: fit-content`. The same wrapper was tried on Disclaimer, Heading and
  Subtitle and made no visible difference, so those owned files were removed
  again (an owned preview shadows the generated one forever).
- **Fixed-position stories need a sized frame.** Screen (a full-screen
  overlay, `position: fixed; inset: 0`) and NoteBanner (a fixed bottom note)
  have no height in the card's flow: the generated previews rendered 0px
  tall (`[RENDER_THIN]` / `[RENDER_BLANK]`). Owned previews
  `.design-sync/previews/{Screen,NoteBanner}.tsx` wrap the story in a
  `position: relative; height: calc(100vh - 48px); transform: translateZ(0)`
  frame (the 48px is the card page's own body padding), which contains the
  fixed content. Both grade match.
- **HudLayer "Mid Race" is accepted as `close`.** The story frame is
  `100vh`; the card page pads its body 24px top and bottom, so the bottom
  48px of the frame is clipped in the capture. HUD content, positions and
  sizes are identical; the card scrolls. The card template is app-contract
  and cannot be changed; PreviewRoot already pads horizontally only.
- **Wave 2 (foundation, brand, controls, typography, workshop inputs)**:
  Lilita One and Nunito confirmed rendering on the preview side from raw
  captures; Tricolore "Narrow" overflows its 160px story wrapper on both
  sides (the component is `min(420px, 80vw)` wide) and only the storybook
  crop hides it.

## Re-sync risks

- `.design-sync/preview-root.jsx` is a bundle entry (`cfg.extraEntries`) and
  the `cfg.provider`. It ships as `PreviewRoot` in `_ds_bundle.js`. If the
  stylesheet's tokens are renamed (`--bg`, `--fg`, `--font-body`) it goes
  stale silently: previews render on a wrong background with no error.
- The three owned previews (GameTitle, Screen, NoteBanner) import the story
  modules by path (`@ds-stories/packages/ui/src/components/...`). Renaming or
  moving those story files breaks the preview build (`! preview build
  failed`); re-derive from the generated cache twin and re-apply the wrapper.
- `cfg.overrides.ResultsTable.skip` names the story id
  `results-resultstable--empty`; a retitled story changes the id and the skip
  silently stops applying (the sb-error returns).
- Thirteen `cardMode` overrides are keyed by component name; a renamed
  component drops its override and the `[GRID_OVERFLOW]` warn returns.
- `[FONT_MISSING] "Arial Black", "Impact"` is a known, accepted warn (the
  display font's fallback stack). `[STORY_CAP]` never fired: no component has
  more than six stories.
- Verified on Node v26.10.0, Storybook 10.6.2, the skill's converter of
  2026-10-14, Chromium via Playwright in `.ds-sync/`. The reference
  storybook must be rebuilt whenever `packages/ui/src` changes.
- **[GENERAL] Line endings move every grade key (found on the 2026-10-15
  re-sync).** The story-file fingerprint and the owned previews are hashed as
  raw bytes, and this machine runs `core.autocrlf=true`. The merge to `main`
  and the checkout back rewrote the working tree with CRLF, so the driver
  reported 41 of 46 components "changed" and asked for 115 re-grades with
  `git diff` empty. The anchor was built from a mixed tree: 41 story files,
  the three owned previews, `preview-root.jsx` and `conventions.md` were LF;
  the CharacterTile, HudCorner, ResultsTable, StatBar and TrackCard story
  files were already CRLF. Recovery that matched the anchor exactly
  (46/46 unchanged, nothing to upload): strip `\r` from every story file
  except those five, plus the files under `.design-sync/` named above, then
  re-run the driver. Before grading a mass `[STORY_CHANGED]`, check
  `git diff` first: empty means line endings, not design drift. Lasting fix,
  not yet applied: a `.gitattributes` with `* text=auto eol=lf`, after which
  one full re-grade re-anchors on LF everywhere.
- The synced `.d.ts` files type each HUD readout's `ref` as a bare
  `React.Ref`; the handle methods (`setValue`, `setText`, ...) appear only in
  the package's own `dist/components/hud/*.d.ts` and the bundle. The
  conventions header is what tells the design agent about them; keep its
  handle list in step with `packages/ui/src/components/hud/handles.ts`.

## Target moved to a Claude artifact (2026-10-28)

The Claude Design project `b7586fe5-3495-4448-ab55-58afb71f3c81` moved to
Claude on 2026-10-28: the system is now the Design System artifact
`https://claude.ai/code/artifact/1db9db24-1aee-4f65-93d7-a58ce488b52d`
(short link `https://claude.ai/artifact/4fuDJ8382P9nZfdTeiqAhi`), kept in
files under `project/` in the Design System format: `components/bundle.js`,
`components/bundle.css`, `components/index.d.ts`, `tokens.json`,
`tokens.css`, `fonts/`, and per component `components/<Name>/README.md`,
`preview.html`, `<Name>.d.ts` and `stories.js`. `config.json` points at it
(`projectId` is the artifact id; `artifactUrl` the address). The same day the
game was renamed Politikart: the package scope is `@politikart/*` and the bundle
global `PolitikartUI`; the design system's namespace follows. A re-sync must
write that layout, not the storybook-shape one this file describes above.

## Re-sync to the artifact: the 3D select (2026-10-28, stage 10b)

Synced from `52aa0e2` (stage 10a's `f840fcc` included; it touched only
`apps/game`, so the bundle and its CSS are what `c81ba4d` produced). Version 16
of the artifact.

- **What changed.** New component `ShowcaseStage` (README, preview, `.d.ts`,
  stories). `Showcase` (`stage` slot), `CharacterTile` (`pending`), `Roster`
  (`footer`) and `SelectLayout` (the short-landscape pin; its props are
  unchanged) got new stories, READMEs and previews. `components/bundle.js`
  (54 components), `bundle.css` (the `.tricolore` `flex-shrink: 0`, the
  `.roster-foot`, `.tile.pending` sweep, `.showcase-stage` and
  `max-height: 520px` landscape rules) and `index.d.ts` were regenerated.
  Tokens are unchanged.
- **The economy components and `ChoiceGroup` needed no re-sync.** Their
  `stories.js` regenerate byte for byte from the current tree, so the
  follow-up in the checkpoint is closed. (`RevealStage`'s published
  `stories.js` frames each story in a 420px box: an owned preview with no file
  under `previews/`. Regenerating it would lose the frame; it was left alone.)
- **Naming.** The index title, `tokens.json` `name` and `tokens.css` line 1
  now say "Politikart Design System"; every `.d.ts` header (54 files and
  `index.d.ts`) said `@kart-republique/ui` and now says `@politikart/ui`.
  `assets/notes/COMPONENTS.md` and `MIGRATION-REPORT.md` still say
  "Politicart": they are the move's record and list paths that no longer
  exist, so they were left as written.
- **The template's cast now uses the game's pun names.**
  `templates/character-select/cast.js` holds the game's own copy
  (`apps/game/src/engine/data.js`): ids, names, titles, quotes, powers, and the
  stats as the game shows them, `(stat - 0.6) / 0.6`, keyed as in the plan's
  section 3.1, slot by slot (the first slot -> `bernadette` ... the
  eleventh -> `gaspard`; `tools/castgen.py` holds the order). Each
  entry keeps the template's `look`, which is 3D technique data, not
  identity. `app.jsx` reads `window.PolitikartUI` (it read
  `KartRepubliqueUI`), uses the game's labels and copy, and composes the new
  parts: `Showcase stage={<ShowcaseStage/>}`, `CharacterTile pending` until a
  portrait lands, and the button, legend and parody lines in `Roster footer`.
  `CharacterSelect.html` loaded `../../styles.css` and `../../_ds_bundle.js`,
  which no longer exist in this layout, so the template could not run at all;
  it now loads `../../tokens.css`, `../../components/bundle.css` and
  `../../components/bundle.js`. The game's real-name scan
  (`apps/game/src/engine/looks.test.js`) finds nothing in any file sent.
- **Not fixed: the eleven `screenshots/*.jpg` show the real names in their
  pixels** (tile labels and the showcase heading of the old template). They
  are images, not text; replacing them needs the owner's call. Fresh captures
  of the fixed template are possible, but under SwiftShader its hall renders
  as a dark silhouette, so they would not be like for like.

### How the files were produced: `.design-sync/tools/`

The storybook-shape converter is not in this repo, so this sync reproduced its
output with esbuild 0.28 from the root `node_modules`, with the scripts now
kept in `.design-sync/tools/`. None holds a machine path: each takes its
folders as arguments or from the environment, and finds the repo from its own
location.

- `assemble.sh <sync dir> <published project dir> [Comp...]`: the whole
  regeneration. `<sync dir>` is a work folder holding `repo/` (a copy of this
  repo at the commit being synced, `npm ci` done); it fills `out-cur/` and
  `stage/project/` there. `<published project dir>` is a read-back of the
  artifact's `project/` folder. `Comp...` defaults to the five select parts.
- `gen.mjs <tree root> <out dir> bundle|stories <Comp...>`: `bundle.js` and
  each `stories.js`. It reads `config.json` and `preview-root.jsx` beside
  `tools/`. `REAL` (`/home/user/Politicart`) is not a path it reads: it is
  the root the published module comments name, kept so a re-sync does not
  rewrite every file.
- `css.py <dist styles.css> <out bundle.css>` and `docs.py <published
  project dir> <tree root> <stage project dir> <heights.json>`: the CSS and
  the READMEs, `.d.ts` and `preview.html` of the select parts.
- `castgen.py <template dir>`: rewrites the template's `cast.js` from
  `apps/game/src/engine/data.js`, mapping the template's eleven slots by
  position; it reproduces the published `cast.js` from the original template
  byte for byte, and leaves a rewritten one unchanged.
- `render.cjs <out dir> <Comp[:WxH]>...` and `tplshot.cjs <out dir> <WxH>
  <tile,...> [prefix]`: local captures of the cards and of the template on
  port 8411, with `DS_SYNC` (the work folder: `stage/project`, `lib/` with
  React 18.3.1, `cdn/` with the cached unpkg files) and `DS_PUBLISHED` (the
  published `project/` copy) set, Playwright on `NODE_PATH`, and `CHROMIUM`
  naming a Chrome binary where Playwright's own is not installed.
- `namescan.mjs <dir>`: the game's real-name scan over any folder. It reads
  the names and the matching from `apps/game/src/engine/looks.test.js`, the
  one list allowed to hold them, so run it over the staged files before a
  publish.

After the move into the repo, `gen.mjs` regenerated `bundle.js` and the five
select `stories.js` byte for byte, and `namescan.mjs` found nothing in
`tools/`. The recipe was first checked by regenerating the published
`bundle.js`, `bundle.css` and twelve `stories.js` from the pre-stage-3 tree
(`9d63676`): all byte-identical. Keep these facts if it is ever rebuilt:

- `bundle.js`: an entry `export * from './index.ts'` plus `PreviewRoot` from
  `.design-sync/preview-root.jsx`, `format: 'iife'`, `globalName:
  'PolitikartUI'`, `jsx: 'automatic'`, unminified, `define` of
  `process.env.NODE_ENV` and `import.meta.env: '{}'`. `react`,
  `react/jsx-runtime` resolve to a shim over `window.React` (`jsx`/`jsxs` over
  `createElement`), CSS imports load as empty modules. Strip esbuild's leading
  `"use strict"`, then add line 1 `/* @ds-bundle: {"format":4,...} */` (the
  component order is the `index.ts` export order) and the last-line
  `window.PolitikartUI=...__dsMainNs...` assignment.
- `stories.js`: per component, a preview module (passed as `stdin` with a
  `sourcefile` under `src/components/<group>/previews/`) that imports the
  stories as `S` and exports `compose(S, "<Story>")` per story. Imports of
  library components from a story resolve to `module.exports =
  window.PolitikartUI` (a `ds` namespace); fixtures are bundled. Prepend
  `"use strict"` and append the mount IIFE with the card mode from
  `config.json` (`MODE`, `PRIMARY`, `SKIP`).
- The comment paths depend on the working directory: run from six levels below
  `/` and map the copy's root to `/home/user/Politicart`, or every changed
  file gains a scratch path.
- `bundle.css` is `dist/styles.css` with the custom properties dropped from
  the `:root` token block (`:root{color-scheme:dark}` stays): `tokens.css`
  is the one source of the tokens.
- The page serves `.d.ts` and `.jsx` only as `contentType: "text/plain"`; a
  publish without it is refused.

### Traps hit

- **A story that renders a `Screen` is 0px tall in a card.** The new
  `SelectLayout` "With Stage" story is the whole select screen in a `Screen`
  (`position: fixed`). Its preview wraps that one story in a
  `position: relative; height: 720px; transform: translateZ(0)` frame, the
  same fix as the owned Screen and NoteBanner previews; regenerating it
  without the frame brings the blank cell back.
- **Wide stories are clipped in a two-column card.** `ShowcaseStage` (520px
  decorator) and `Showcase` "With Stage" (560px) overflow a grid cell, so
  `config.json` now gives both `cardMode: "column"`, with `Default` and
  `WithStage` as their first stories.
- The local check served the cards on port 8411 with `tokens.css`,
  `bundle.css`, React 18.3.1 and `bundle.js` preloaded, the way the page
  frames them. The `fonts/` 404s from `tokens.css` there are expected
  locally; `bundle.css` embeds both fonts.

## The old template screenshots are gone (2026-10-28)

The eleven `project/screenshots/*.jpg` (`cs1`, `cs2`, `01-cs3..5`, `02-cs3..5`,
`03-cs4..5`, `04-cs4`) showed real politicians' names in their pixels (the
"Not fixed" line of the section above). On the owner's call they were removed
from the Design System artifact in one publish (version 18, `null` for each
path, no `force`), which also sent:

- `assets/notes/MIGRATION-REPORT.md`: its build-notes line no longer lists the
  eleven paths, and its "11 × image" count says they were removed. It stays the
  move's record otherwise.
- `design-system.json`: only `lastChange`.

`README.md` and `assets/notes/COMPONENTS.md` never named them. A read-back
listed 249 files (260 before), none under `screenshots/`. The template has no
screenshots now; fresh captures would show the pun names, but under
SwiftShader its hall renders as a dark silhouette, so none were made here.

## To re-sync: the Politibox reveal parts (2026-10-29)

Stage 6 of the overhaul (PLAN.md, DEC-054) added to `components/economy/`,
each with a story carrying a docs description, an export with its Props
type and `economy.test.tsx` coverage; none is in the Design System artifact yet:

- `RevealStage`: `phase` gains `tease` and `next`, plus `count`/`index`
  and a counter chip (`counterProps`, `formatCounter`). The stories gain
  `Tease` and `Bundle`; the interactive one steps through six phases.
- `RevealCard` (new): the result card with a `KindGlyph` (also exported),
  caption, name, refund line, grade badge; part props `resultProps`,
  `badgeProps`, `refundProps`.
- `DropHistory` (new): the last drops as grade-coloured chips.
- `OddsTable` (new): the odds as a table with a caption, row headers and
  `sub` rows.
- `economy.css` gained the static looks (`.kr-tease`, `.kr-counter`,
  `.reveal-card`, `.drop-history`/`.drop-chip`, `.odds-table`), `fx.css`
  the keyframes `kr-tease`, `kr-sink`, `kr-chip-in` and keeps the grade
  sweep off `.drop-chip` as off `.grade-dot`; all off under reduced motion.
- `RevealStage` stories render a fixed overlay, so their preview needs
  the same `position: relative; height; transform: translateZ(0)` frame
  as the `Screen` stories (see "Traps hit" above).
