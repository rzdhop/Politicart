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
- **A-007 -- The workflow's test step is sufficient as the deploy gate.**
  UNCONFIRMED. The workflow runs the design-system build, typecheck and the
  unit suites, but not the Playwright suite (three minutes, needs a browser
  install). The E2E net stays a local gate after every stage. To be revisited
  if a regression ever reaches `main` that the unit suites did not catch.

- **A-008 -- Placement points are 10/8/6/4/2/1.** UNCONFIRMED. The human
  chose "summed placement points"; this scale is a six-kart cut of the usual
  kart-racing tables. Only human karts score; AI karts take places but no
  team points.
- **A-009 -- AI karts are neutral.** UNCONFIRMED. AI fills the grid to six
  and belongs to no team, so items and powers treat it as a foe of everyone.
- **A-010 -- Two teams, Bleu and Rouge.** UNCONFIRMED. Named for the
  palette's Marianne blue and republican red. Teams may be uneven.

- **A-012 -- The player's kart style is one set of partial overrides, not
  one per character.** UNCONFIRMED (implemented that way, stages 4 and 8). Read from "default for all if not
  edited": the fields a player changes apply to whichever character they
  pick, and the rest falls back to that character's admin-set default.
- **A-013 -- The Pages build has no Workshop and no login.** UNCONFIRMED.
  It has no backend to authenticate against; it ships the default cast. The
  Garage works there.
- **A-014 -- Campaign posters are admin-only too.** UNCONFIRMED. "edit
  character etc." is read as the whole Workshop.
- **A-015 -- Existing per-browser `kr-custom` edits are not migrated.**
  UNCONFIRMED. The server roster becomes the only source of cast edits.
- **A-016 -- The packages/ui story fixtures keep the old fictional names.**
  UNCONFIRMED. They are library examples; renaming them is a follow-up.

## Confirmed

- **Admin lock is server-held, kart style is synced, pun-name list
  approved.** Confirmed by the human 2026-10-19 (see PLAN.md).

- **A-006 -- Node 26 is available to `actions/setup-node` on ubuntu-latest.**
  CONFIRMED 2026-10-15 by the first run of `.github/workflows/pages.yml` on
  `main` (run 38699287498: build, typecheck, both unit suites, game build and
  deploy all green; the published bundle hash matches the local build).

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

- **A-011 -- Remote players' workshop edits are not shown.** INVALIDATED
  2026-10-19. The cast now comes from the server's roster, the same for
  everyone (stages 6-7), and each player's kart style is synced in team races
  (stage 8).
