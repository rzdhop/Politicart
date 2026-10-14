# design-sync notes

Findings a future sync needs and the converter cannot infer. Written as they
were discovered; kept in the repo on purpose.

## Repo shape

- The design system is `packages/ui` (`@kart-republique/ui`), an npm workspace.
  The repo root holds `package-lock.json`, so the install step is `npm ci`.
- The library is extracted from the game at `index.html`, whose single `<style>`
  block was the only definition of the look before this work. See
  `.claude/DECISIONS.md` DEC-001..008 for why the extraction exists at all.

## Fonts -- OPEN, needs handling before the sync

The look depends on two Google Fonts, loaded by the game with a `<link>` in
`index.html`:

    Lilita One   -> var(--font-display)
    Nunito 500/700/900 -> var(--font-body)

The package ships **no font files** and no `@import` for them: the tokens name
the families and fall back to `Arial Black`/`Impact` and `Segoe UI`/`system-ui`.
That is fine inside the game (the `<link>` is there) but a design rendered from
the uploaded bundle would fall back to the system stack and look wrong.

Before stage 15, either self-host both families under the package and have
`styles.css` reach them, or confirm the design runtime can load Google Fonts.
Do not let the sync ship a bundle whose type silently degrades.

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
