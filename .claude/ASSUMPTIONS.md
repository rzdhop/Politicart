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
- **A-011 -- Remote players' workshop edits are not shown.** UNCONFIRMED.
  Each client draws every character with its own local customisations, so a
  player's renamed character or livery is seen only by that player.

- **A-012 -- Experience curve.** UNCONFIRMED. A race pays 70 (win) down to
  20 (last), 10 unfinished, +20 for a team win; level 2 costs 120 XP and
  each level 40 more. About three races to level 2, about ninety to unlock
  the whole cast at level 13. Tunable in `engine/progress.js` alone.
- **A-013 -- Unlock order.** UNCONFIRMED. Starters Victor, Gégé, Maurice,
  Capucine (the first four of the cast); then Lucie, Patrick, Bernadette,
  Kevin, Odile, Lulu, Hubert, Gaspard, Jean-Mi, Martine, Aymeric, Thierry --
  roughly simplest powers first, Thierry (who copies others) last.
- **A-014 -- "Only one BRAV-M is sent instead of one" meant two bikes.**
  UNCONFIRMED. Read against the item's own description ("Deux motos"):
  with a single kart ahead only one bike used to leave. Now always two.
- **A-015 -- Tracks x2, road x1.67.** UNCONFIRMED. "x2 length" taken as the
  circuits drawn at scale 3 (was 1.5); "x1.5 or x2 width" as 30 m (was 18),
  of which the right-hand 3.6 m is the bike lane.

- **A-016 -- The player's kart style is one set of partial overrides, not
  one per character.** UNCONFIRMED. Read from "default for all if not
  edited": the fields a player changes apply to whichever candidate they
  pick, and the rest falls back to that candidate's admin-set default.
  (Was A-012 on `feat/multiplayer`.)
- **A-017 -- Campaign posters are admin-only too.** UNCONFIRMED. "edit
  character etc." is read as the whole Workshop. (Was A-014.)
- **A-018 -- Old per-browser `kr-custom` edits are not migrated.**
  UNCONFIRMED. The server roster becomes the only source of cast edits.
  (Was A-015.)
- **A-019 -- The packages/ui story fixtures keep the old fictional names.**
  UNCONFIRMED. They are library examples; renaming them is a follow-up.
  (Was A-016.)

- **A-020 -- Thirteen powers already match their politician.** UNCONFIRMED.
  Judged by the agent (DEC-028): only capucine, bernadette and patrick were
  replaced. The human may want others retuned (Lassalle's roundabout and
  Zemmour's fake news were the closest calls and were kept).
- **A-021 -- "Only the powers that affect the user" means what landed.**
  UNCONFIRMED. Read as DEC-029: a projectile is announced to its target when
  it hits, not when it is thrown; a field-wide effect is announced to every
  driver it changes, since it does change them. If the human meant distance
  too, field-wide messages would need a range.
- **A-022 -- A god joining mid-race waits for the next start.** UNCONFIRMED.
  Spectating the running race would need the networked client to follow a
  kart that is not its own; deferred. The god is seated in the room at once.
- **A-023 -- Creative mode is: no cooldown, endless items, untouchable.**
  UNCONFIRMED. Minecraft's reading of "creative"; the god still drives and
  cannot spawn arbitrary hazards or teleport.

## Confirmed

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

_(none yet)_
