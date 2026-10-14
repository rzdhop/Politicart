# design-sync notes

Findings a future sync needs and the converter cannot infer. Written as they
were discovered; kept in the repo on purpose.

## Repo shape

- The design system is `packages/ui` (`@kart-republique/ui`), an npm workspace.
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
