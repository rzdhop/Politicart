# Assumptions

Marked UNCONFIRMED / confirmed / invalidated.

## Unconfirmed

- **A-001 -- Node v26.10.0 is acceptable to the toolchain.** UNCONFIRMED.
  The machine has Node v26.10.0 and npm 11.13.0 only. Vite and Storybook are
  expected to support it, but Node 26 is new enough that a dev dependency may
  refuse to install. To be confirmed by the first clean install; if it fails,
  the fallback is pinning a supported Node via `.nvmrc` and saying so.
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

- **A-004 -- GitHub Pages serving strategy.** CONFIRMED 2026-10-14 as a GitHub
  Actions workflow building on push to `main`. Recorded as DEC-008. Note the
  repository's Pages source must be switched to "GitHub Actions" by hand once.

## Invalidated

_(none yet)_
