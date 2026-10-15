# Assumptions

Marked UNCONFIRMED / confirmed / invalidated.

## Unconfirmed

- **A-005 -- Nunito's woff2 subsets are a variable font.** UNCONFIRMED.
  `packages/ui/src/styles/fonts.css` declares Nunito once per subset with
  `font-weight: 400 900`, on the evidence that Google serves the identical file
  for weights 500, 700 and 900 -- which a static font could not do without
  synthetic emboldening. Collapsing it this way cut `dist/styles.css` from
  328 kB to 127 kB. To be confirmed by eye once Storybook previews exist
  (stage 6): body text at 500 and a bold label at 700/900 must show real
  weight contrast. If they do not, revert to one face per weight and accept
  the larger stylesheet.
- **A-002 -- The library class vocabulary stays the game vocabulary.**
  UNCONFIRMED. The extracted components keep the original class names (`.btn`,
  `.panel`, `.tile`, `.powerbox`, `.hud-tl`...) rather than being renamed or
  moved to CSS modules, so the CSS moves verbatim and the design agent is taught
  the real idiom. Assumed preferable to a cosmetic rename; cheap to revisit
  before the first component lands.
- **A-003 -- French copy stays in stories, not in component defaults.**
  UNCONFIRMED. Components take text as props with no built-in i18n; the French
  strings live in the game and in the stories. Held through stages 3-5:
  `LapCounter`, `RaceTimer` and `CenterAnnounce` take free text rather than
  lap/time numbers, and `ResultsTable` renders no header row unless given one,
  precisely so no French wording is baked into the library.
- **A-006 -- Node 26 is available to `actions/setup-node` on ubuntu-latest.**
  UNCONFIRMED. `.github/workflows/pages.yml` asks for `node-version: 26` to
  match the toolchain proven locally (A-001). If the runner cannot resolve it
  the build job fails at setup; the fallback is `node-version: 24`, on which
  nothing in the lockfile is known to differ. Confirmed by the first green run
  of the workflow on `main`.
- **A-007 -- The workflow's test step is sufficient as the deploy gate.**
  UNCONFIRMED. The workflow runs the design-system build, typecheck and the
  unit suites, but not the Playwright suite (three minutes, needs a browser
  install). The E2E net stays a local gate after every stage. To be revisited
  if a regression ever reaches `main` that the unit suites did not catch.

## Confirmed

- **A-001 -- Node v26.10.0 is acceptable to the toolchain.** CONFIRMED
  2026-10-14 for the stage-1 dependency set: React 19.3.1, Vite 8.3.4,
  TypeScript 7.0.2, Vitest 5.0.4 all install and run clean on Node v26.10.0
  (95 packages, 0 vulnerabilities). Storybook 10.6.2 (stage 6) and Playwright
  1.64.1 (stage 7) are not yet proven on this Node; if either refuses, the
  fallback remains pinning Node via `.nvmrc`.
- **A-004 -- GitHub Pages serving strategy.** CONFIRMED 2026-10-14 as a GitHub
  Actions workflow building on push to `main`. Recorded as DEC-008. Note the
  repository's Pages source must be switched to "GitHub Actions" by hand once.

## Invalidated

_(none yet)_
