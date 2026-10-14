# Assumptions

Marked UNCONFIRMED / confirmed / invalidated.

## Unconfirmed

- **A-002 -- The library class vocabulary stays the game vocabulary.**
  UNCONFIRMED. The extracted components keep the original class names (`.btn`,
  `.panel`, `.tile`, `.powerbox`, `.hud-tl`...) rather than being renamed or
  moved to CSS modules, so the CSS moves verbatim and the design agent is taught
  the real idiom. Assumed preferable to a cosmetic rename; cheap to revisit
  before the first component lands.
- **A-003 -- French copy stays in stories, not in component props defaults.**
  UNCONFIRMED. Components take text as props with no built-in i18n; the French
  strings live in the game and in the stories. Assumed right for a single-locale
  satirical game.
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
