# Plan (draft -- awaiting human approval)

## Component inventory, derived from index.html lines 1-240

Groups are the folder layout under `packages/ui/src/components/<group>/`.
"Source" is the CSS/markup the component is extracted from.

### foundation (4)
| Component | Source | Notes |
|---|---|---|
| `Tokens` (styles only) | `:root` block, L7-21 | 15 custom properties, dark-only |
| `Screen` | `.screen` L25-28 | fixed overlay, flex column, safe-area padding |
| `Row` | `.row` L43 | flex wrap, centred |
| `Panel` | `.panel` L36 | glass card: blur, 1px line, radius 14 |

### typography (4)
| Component | Source | Notes |
|---|---|---|
| `GameTitle` | `h1` L30-33 | tricolore gradient clipped to text |
| `Subtitle` | `.sub` L34 | gold, uppercase, letterspaced |
| `Heading` | `h2,h3` L29 | display face, clamp sizes |
| `Disclaimer` | `.disclaimer` L41 | 12px muted, 60ch |

### controls (4)
| Component | Source | Notes |
|---|---|---|
| `Button` | `.btn` L37-40 | gold, hard 5px bottom shadow, press translate |
| `Button variant=ghost` | `.btn.ghost` L41 | transparent, 2px line border |
| `KeyCap` | `.controls b` L45 | mono chip on white 8% |
| `ControlsGrid` | `.controls` L44 | auto-fit minmax(150px) grid |

### brand (1)
| Component | Source | Notes |
|---|---|---|
| `Tricolore` | `.tricolore` L35 | 3 stripes, 6px, rounded |

### select (6)
| Component | Source | Notes |
|---|---|---|
| `SelectLayout` | `.select-layout` L48 | roster + showcase grid, stacks at 760px |
| `Roster` | `.roster` L49 | 4-col grid |
| `CharacterTile` | `.tile` L51-55 | square, image, name strip, `.sel` gold ring |
| `Showcase` | `.showcase` L56-59 | big name, title, quote |
| `StatBar` | `.stat` + `.bar` L60-62 | label + gold fill bar |
| `PowerBox` | `.powerbox` L63-65 | gold left border, name + description |

### tracks (2)
| Component | Source | Notes |
|---|---|---|
| `CardGrid` | `.cards` L68 | auto-fit minmax(230px) |
| `TrackCard` | `.card` L69-75 | name, canvas slot, desc, `.sel` ring |

### hud (12)
| Component | Source | Notes |
|---|---|---|
| `HudLayer` | `#hud` L78-79 | fixed, pointer-events none, tabular nums |
| `HudCorner` | `.hud-tl/-tr/-bl/-br` L80,88,90,98 | 4 safe-area-aware corners |
| `PositionReadout` | `.pos` L81-82 | clamp 44-86px gold, ordinal suffix |
| `LapCounter` | `.lap` L83 | display face 22px |
| `RaceTimer` | `.timer` L84 | mono 15px muted |
| `MinimapFrame` | `#minimap` L89 | 150px rounded canvas frame |
| `ItemSlot` | `.item` L91-94 | 92px square, icon + name, `.has` gold glow |
| `PowerGauge` | `.power` L95-97 | name, green bar, key hint, `.ready` glow |
| `HudHint` | `.hint` L97 | 12px muted, hidden under 600px |
| `SpeedReadout` | `.speed` L99 | 46px + km/h unit |
| `DriftGauge` | `.drift` L100 | 160px blue fill bar |
| `CenterAnnounce` / `Toast` / `WrongWay` | `.center`,`.toast`,`.wrong` L101-104 | countdown, event toast, red banner |

### results (1)
| Component | Source | Notes |
|---|---|---|
| `ResultsTable` | `table`,`td.r`,`td.t`,`.you` L105-110 | rank/name/time, player row highlighted |

### workshop (5)
| Component | Source | Notes |
|---|---|---|
| `AdminGrid` | `.admin` L111 | auto-fit minmax(280px) |
| `Field` | `.admin label` L114 | uppercase micro label + control |
| `TextInput` | `.admin input[type=text]` L115 | white 8% fill |
| `ColorSwatch` | `.admin input[type=color]` L116 | 44x30 bare |
| `LiveryThumb` | `.admin .livery` L118 | 64x40 cover |

### misc (1)
| Component | Source | Notes |
|---|---|---|
| `NoteBanner` | `.note` L120 | fixed bottom, 12px muted |

**Total: ~30 exported components** (counting Button variants as one).

Responsive rules to carry over: `@media (max-width:760px)` select stacking (L66),
`@media (max-width:600px)` HUD shrink (L121), `@media (prefers-reduced-motion)`
transition kill (L122).

## Findings that shape the staging (from the DOM coupling map)

1. **60fps HUD.** `updateHUD()` (L1221-1237) runs every frame during a race and
   writes rank, lap, clock, speed, drift width+colour and the power bar; the
   minimap canvas is fully redrawn every frame. These must NOT become React
   state. Design: the HUD components accept `ref`s and the engine keeps writing
   imperatively, or a dedicated imperative HUD layer sits outside React's render
   cycle. The minimap stays a raw canvas driven engine-side.
2. **UI calls buried in physics.** `toast()` and `setHint()` are called from
   roughly 30 sites inside `useItem`, `usePower`, `updateProgress` and the hazard
   checks (L923-1173). The seam to cut: the engine emits events, it does not set
   text.
3. **Two parallel state machines.** `showScreen()` toggles `hidden` on six
   sections (L1320-1321) while `G.state` is a separate string set by hand at
   every transition. The port must collapse these into one source of truth or
   inherit a desync bug class.
4. **Off-screen Three.js thumbnails.** Roster tiles use data URLs produced by
   rendering a second hidden Three.js scene (L1346-1352). That pipeline stays
   engine-side; React receives a string, not a scene.
5. **Pause is not a stopped loop.** `resume()` (L1323) re-anchors `lastFrame`;
   RAF never stops, the loop just branches. No React effect may try to own that
   lifecycle.
6. **The engine/UI boundary already exists implicitly.** The fields read by
   `updateHUD()` are almost exactly the right frame payload:
   `{rank, lap, time, speed, driftCharge, item, powerReady, powerCd, wrongWay,
   kartPositions[]}`.

7. **Order-sensitive engine init.** `textures()` must run before any builder
   reads `TEX.*`; `buildTrack` must set `G.samples`/`G.N` before `buildFeatures`,
   `crowdZone` and `grandstand` read them. The physics step order inside
   `frame()` (updateKart -> kartCollisions -> pickupItems -> updateProjectiles ->
   updateRanks -> animated -> crossings -> crowd -> camera -> HUD -> render) is a
   strict undocumented contract. Builders also *register* into
   `G.animated/crowd/hazards/pits/ramps/pads/crossings/itemBoxes` as a side
   effect of building. None of this may be reordered.
8. **Three.js version trap.** `THREE.sRGBEncoding` (L327) was removed in
   three >= 0.152. The npm dependency is therefore pinned to `three@0.128.0` to
   match the CDN's r128 exactly. See DEC-007.
9. **`$('c')` resolves at module-eval time** (L380), so the canvas must exist
   before the engine module evaluates -- it has to become an explicit
   `init(canvas)` call, not a top-level statement, for React to mount it.
10. **Renderer and camera are shared mutable singletons** reused across the race
    scene and two preview scenes by mutating `camera.fov/aspect/position`.

## Proposed stages

Each stage is one committable, independently revertable, independently testable
change. Stage N does not begin until N-1 is green and committed.

### Part A -- the library (no risk to the game: index.html is untouched)

| # | Stage | Files | Risk | Verification | Rollback |
|---|---|---|---|---|---|
| 1 | npm workspace skeleton + `packages/ui` scaffold | root `package.json`, `.gitignore`, `packages/ui/{package.json,tsconfig.json,vite.config.ts,src/index.ts}` | Low | `npm install` clean; lib build emits `dist/`; `tsc --noEmit` passes | delete `packages/`, root pkg |
| 2 | Tokens + stylesheet moved verbatim from index.html L1-130 | `packages/ui/src/tokens.css`, `styles.css` | Low | build emits `dist/index.css`; declaration-by-declaration diff against index.html | revert files |
| 3 | foundation + typography + brand + controls (13 components) + tests | `src/components/{foundation,typography,brand,controls}` | Low | vitest render/variant tests; typecheck | revert folder |
| 4 | select + tracks (8 components) + tests | `src/components/{select,tracks}` | Low | vitest; typecheck | revert folder |
| 5 | hud + results + workshop + misc (19 components) + tests | `src/components/{hud,results,workshop,misc}` | Medium -- HUD needs an imperative ref API | vitest incl. ref-write tests; typecheck | revert folder |
| 6 | Storybook + one story per component | `packages/ui/.storybook/*`, `*.stories.tsx` | Low | `build-storybook` succeeds; story count == component count | revert folder |

### Part B -- the safety net (built BEFORE the game is touched)

| # | Stage | Files | Risk | Verification | Rollback |
|---|---|---|---|---|---|
| 7 | Playwright E2E suite against the CURRENT single-file game | `e2e/*`, root devDeps | Low | every spec green against today's index.html | revert folder |

Stage 7 is what converts R-01..R-09 from UNVERIFIED to covered. It is the
regression net for everything in Part C, and it is written against the *existing*
game so that any later failure is unambiguously caused by the port.

### Part C -- the port (each stage re-runs the stage-7 suite)

| # | Stage | Files | Risk | Verification | Regression items at risk |
|---|---|---|---|---|---|
| 8 | Vite app shell: the `<script>` block becomes one bundled module, `three@0.128.0` imported instead of the CDN global, original DOM markup and every listener preserved verbatim | `apps/game/*`, `index.html` | **HIGH** | stage-7 E2E green + manual pass | R-01..R-15 |
| 9 | Engine split 1: audio, then data, then scene/mesh builders into modules (the low-risk extraction order), still driving the original DOM | `apps/game/src/engine/{audio,data,scene}` | Medium | stage-7 E2E green | R-10..R-14 |
| 10 | Engine split 2: physics, items, powers, AI into modules; inline `toast()`/`sfx()` calls replaced by an event queue the engine emits | `apps/game/src/engine/{physics,items,ai}` | High | stage-7 E2E green + engine unit tests on the event queue | R-02, R-10..R-14 |
| 11 | Seam: engine publishes a frame payload (`rank, lap, time, speed, driftCharge, item, powerReady, powerCd, wrongWay, kartPositions[]`) and performs zero DOM writes; `G.state` and `showScreen` collapse into one state machine | `apps/game/src/engine/*` | High | stage-7 E2E green + state-machine unit tests | R-01..R-05 |
| 12 | React UI layer: all six screens composed from `@kart-republique/ui` | `apps/game/src/ui/*` | High | stage-7 E2E green + component tests | R-01, R-03..R-07 |
| 13 | HUD on the imperative path (refs, not state) + minimap canvas handed to the engine | `apps/game/src/ui/Hud.tsx` | High | stage-7 E2E green + manual 60fps check | R-02, R-08 |

### Part D -- close

| # | Stage | Files | Risk | Verification |
|---|---|---|---|---|
| 14 | GitHub Pages build output + README rewrite (resolves A-004) | `.github/workflows/pages.yml` or `docs/`, `README.md` | Medium | Pages serves a playable build (R-15) |
| 15 | `/design-sync` run against `packages/ui` | `.design-sync/*` | Low | converter validates clean; every preview verified against Storybook |

**Riskiest stage: 8.** It moves 1200 lines of working Three.js out of the single
file. It is deliberately scoped to change *packaging only* -- same DOM, same
listeners, same globals, same init order -- so a failure there is a build
problem, not a gameplay problem. Stages 9-13 then change one layer at a time on
top of a build already proven by the stage-7 suite.

## Rejected alternatives

**A -- one big port (stages 8-13 merged).** Fewer commits, but no revertable
midpoint: a HUD regression and a packaging regression would be
indistinguishable, and the whole port would roll back together. Rejected for
violating the smallest-reversible-step rule.

**B -- build the library to a cleaner API instead of extracting the CSS
verbatim.** Tidier result, but it would no longer be what already exists: the
game port would become a redesign, and every preview would need grading against
a look nobody approved. Rejected.

**C -- upgrade `three` to current while we are in there.** Tempting, since r128
is from 2021. Rejected: `sRGBEncoding` and likely more would need fixing, and an
upgrade is its own task with its own changelog review and test pass -- never a
side effect of another task.

**D -- port the game but skip the E2E suite (old stage order).** This was my own
first draft. Rejected after the exploration reports: the regression contract is
100% unverified today, so stages 8-13 would be rewiring a working game with no
net at all.

## DECISIONS.md check

This plan implements DEC-001..DEC-006 and conflicts with none. Stage 14 is the
mitigation for the accepted loss recorded in DEC-003. Stage 1 follows DEC-006.
Stage 8 adds DEC-007 (pin three@0.128.0).
