# Plan -- the 3D character-select stage: hemicycle, podium, caricature pilots

Branch `feature/amazing-davinci-af7iw1`, cut from `main` after PR #12 (DEC-042). Drafted 2026-10-28 from a study of the Design System page's "Character select 3D" template (three r184, 11 entries with real names) against the game, with a throwaway r128 port measured in software GL. **Approved by the human 2026-10-28** ("go with all functions, I want the best product"). Every stage runs in its own worker agent (DEC-039); this session dispatches, merges and reviews.

## Decisions fixed by the human (2026-10-28)

| # | Topic | Decision |
|---|---|---|
| Q1 | The template's six politicians the game lacks (Philippe, Attal, Glucksmann, Ruffin, Wauquiez, Bertrand) | **Donors only**: they lend techniques and props to game candidates of the same archetype; no new candidates. |
| Q2 | The five same-person candidates | The game's identity (pun names, colours, accessories) with the template's shapes and face rig; decided case by case on stage 5's contact sheet. |
| Q3 | The "go" launch | **Yes**: on "Choisir le circuit →" the kart drives off down the aisle with confetti (~1.4 s) behind the circuit cards; the transition stays immediate; off under reduced motion. Extends DEC-042. |
| Q4 | New pilots in races | **Yes**, merged per LOD so a race stays within today + 10 %. |
| Q5 | Race colour look | Keep the race's legacy look for now; the stage alone uses ACES/sRGB (DEC-043). |
| Q6 | Phone tier | No middle tier: phones stay on "légers" by default. |
| Q7 | `examples/jsm` helpers | Not used; the merge lives in `engine/geo.js`. |
| Q8 | Admin-editable 3D look | Not now; the admin's suit and kart colours already reach the stage and its tint. |
| Q9 | Desktop button row | **Under the roster** in the left column on wide screens, as in the design; at the bottom on phones. |
| Q10 | Portrait cache across sessions | No. |
| Q11 | Copy | The game's copy throughout ("vous", "Tenue de route", its quotes and powers). No template name, title, quote or power ships. |

## Reference material (outside the repo, this session's scratch)

- The design: `ds/project/templates/character-select/` (`stage3d.js`, `characters.js`, `textures.js`, `cast.js`, `app.jsx`) and `ds/project/screenshots/` (`01-cs3`, `01-cs5`, `02-cs5`, `03-cs4`, `04-cs4`, ...).
- The r128 prototype: `agent-d/protoB/` with `agent-d/protoB/vendor/compat128.js`; measurement harness in `agent-d/scripts/`; comparison sheets `agent-d/compare-design-r184-r128.png`, `tiers-segments.png`, `tiers-portraits.png`, `phone-layouts.png`.

## Baseline (stage 0) [measured, live = main's build, software GL]

| Scene | Draw calls / frame | Triangles / frame |
|---|---|---|
| Select today, high / low | 164 / 78 | 47k / 4.9k |
| Race today (Élysée), high / low | ≈1,400 / ≈330 | ≈400k / ≈60k |

These are the "today + 10 %" references for stages 7 and 8. E2E in this container: 41 of 59 green on `main`; the 18 race-start specs time out under software WebGL on `main` too (same set), so stages are judged against that set, not against all-green.

---

## 0. Summary of the recommendation

1. **Option (a): port the design down to r128, on the shared renderer, in its own scene with its own camera and its own material profile.**
   - **[prototype]** The whole template runs unmodified on r128 through a ~60-line compat shim. Mean pixel difference against r184 is 8/255, and the renders are visually indistinguishable apart from a slightly flatter velvet and wool sheen (`compare-design-r184-r128.png`).
   - Upgrading three (b) restyles every race, the Politibox, the server's headless engine and drops WebGL1, all for a menu.
   - A second canvas (c) buys nothing that (a) does not, and costs a second context.
2. **Pilots: a new builder (`pilot.js`) using the template's techniques, driven by each game candidate's own identity.**
   - Identity means the pun name, colours (admin-editable), accessories and power-themed prop.
   - It replaces the box-built `buildDriver`. The kart stays `kart.js`, with its Garage contract, upgraded behind a `profile`.
   - Three levels of detail serve the same pilot: stage, race-high and race-low. Only 5 of the 11 template entries are the same person as a game candidate. The other 6 are used as technique donors for 6 game candidates, and the remaining 5 game candidates are authored the same way (section 3).
3. **Budget by tier, not one size.** The template's geometry is about 4x denser than it needs to be.
   - **[prototype]** At segment scale 0.5 the stage is visually identical at 29% of the triangles. At 0.25 it is still clean, and at 0.12 it reads as deliberate low-poly (`tiers-segments.png`).
   - The real costs are shader warm-up (35 to 48 programs, and the first two portraits take 15 s in software GL), the shadow map, and draw calls in the race.
4. **Eleven stages, merged in a fixed order.** Wave 0 is the dispatcher. Waves 1 and 2 are three stages each. The integration stage is serial, then two parallel stages, then the dispatcher closes. Section 6 and the table at the end have the details.

### Prototype files (all in this folder; throwaway, not for the repo)

| File | What it is |
|---|---|
| `protoA/` | the template on three r184, with the DS UI bundled from the repo's `@politikart/ui`. Instrumented copy of `stage3d.js`, with one bug fix (A.1). |
| `protoB/` + `vendor/compat128.js` | the same template on the game's three **0.128**, through the shim. `?seg=k&shadow=0&pr=n` set the tier knobs. |
| `scripts/measure.cjs`, `measure-gl.cjs`, `live.cjs`, `kart-tris.mjs`, `pt.cjs` | the measurement harness: `renderer.info`, a WebGL draw-call hook, a headless triangle count of the game's karts, and portrait timings. |
| `compare-design-r184-r128.png` | design screenshot, then r184 render, then r128 port, for three candidates at the design's 924x540 |
| `tiers-segments.png`, `tiers-portraits.png` | the stage and the roster portraits at segment scales 1, 0.5, 0.25 and 0.12 (r128 port) |
| `phone-layouts.png` | the live game today, then the template in phone portrait, then the template in landscape |
| `A-desktop-*.png`, `B-desktop-*.png`, `B-924-*.png`, `B-phone*.png`, `B-seg*.png` | the raw renders |
| `dbgA-*.png` | the template's black-stage bug, reproduced |
| `live-race-*.png` | the live race used for the baseline counts |

---

## 1. Gap analysis: design versus game

### 1.1 Element by element

| Element | Game today (`f70b355`) | Design (template) | Gap / what to build |
|---|---|---|---|
| **Backdrop** | `scene.background` flat `#0c1230`. Nothing else. | Sky dome: a GLSL `ShaderMaterial` with a two-stop night gradient, a per-character tint glow at the horizon, 16 slow light rays and twinkling stars. A ground disc r60. A **hemicycle of 10 tiers**: wood risers, carpet treads, a gold LED torus strip per tier, and ≈430 velvet seats (cushion and back) as **two InstancedMeshes**. Fog 13 to 34. | Everything. Port the scene builder as `engine/hemicycle.js`. |
| **Podium** | `CircleGeometry(3.4)` disc and a gold `Torus`. | Turntable group: navy metallic clearcoat base (r1.75 to 1.88), a top carrying the **hemicycle floor texture** (canvas: radial gradient, gold arcs and spokes, a tricolore rim), a gold metal ring, and a tinted LED strip. Additive **light pool** on the floor and a faint additive **light cone**. | Rebuild at the game's kart scale. The game kart is about 4.1 long against the template's 2.6, so the podium radius is about 2.8 instead of 1.75. Alternatively the stage scales the kart; see 3.4. |
| **Lighting** | Hemisphere 0.9, ambient 0.2, one directional with a 1024 shadow (PCFSoft). Linear output, no tone mapping (legacy look). | Hemisphere, **key SpotLight with a 2048 PCF shadow**, top spot, **rim DirectionalLight tinted per character**, fill. **PMREM environment from a panel scene**, ACES Filmic at exposure 1.08, sRGB output, physically based light units. A rim term injected into every pilot material (`onBeforeCompile`), whose colour lerps to the character's tint. | The stage gets its own look (5.2). Per-character tint is derived from the kart colour (section 3). |
| **Characters (pilots)** | `buildDriver`: box torso, sphere head, box eyebrows and mouth, box or sphere hair per style, ~28 accessory types from boxes, cylinders and tori. [measured] ≈27k triangles per kart+driver on high and 5.3k on low, with ~89 and ~80 visible meshes. | Lathe torso with lapels, shirt V and tie; **capsule limbs**; poses `drive`/`hold`/`raise`; hand groups holding props. **Shell-built hair** in 10 styles. **Face rig**: eye white, iris and glint, lids, brows with tilt, nose scale, 5 mouth types, glasses, beard, ears, jaw. **Fabrics**: wool, corduroy and puffer albedo plus normal maps, sheen and clearcoat. Skin with sheen, hair with sheen. 10 props, some live (TikTok screen shader, siren, grill coals with point lights). Idle animation: head sway, breathing, kart buzz, exhaust flicker. [measured] **113k to 145k triangles and 93 to 136 meshes per character**, 21 to 26 materials. | A new pilot builder (section 3) with three levels of detail. |
| **Karts** | `kart.js`: three bodies (standard, tractor, cargo bike), all **Garage-styled** (body/accent colours, wheels, spoiler, pods, number, sticker, exhaust, underglow, mast, nose, skin, trail), livery images, plus contract parts (wheels front-first, sparks, ring, rotor, shield, `anim`, `trail`). | One body: an **extruded, bevelled** shape with capsule side pods, a leather seat back, a number roundel, a steering column and wheel, a chrome **tube bumper**, a tricolore spoiler, engine, exhausts with glow, **tread-textured tyres with spoked chrome rims**. Clearcoat paint. No Garage parts, no tractor or cargo bike. | Keep `kart.js` and its contracts. Add a `stage` material/detail profile that borrows the template's shapes and materials part by part (3.4). |
| **Roster portraits** | `makeThumbs`: 220 px PNG of the whole kart on the disc, one per character per detail level. [measured] 3.5 s for 16 in software GL. | 320 px JPEG **head-and-shoulders close-up** (fov 24, from front-right) on the stage background, with that character's tint. [measured] 23.7 s for 11 in software GL, dominated by shader compiles. | New portrait pass, progressive, with placeholders (5.4). |
| **UI layout** | `SelectLayout`: roster then `Showcase`. A `Row` at the bottom (`#b-back1` Retour, `#b-garage` Garage, `#b-next1` Choisir le circuit →). Lock pills on locked tiles. | `Tricolore` above the heading. Roster with a single CTA **Au départ !** and a key-cap legend (← → choisir · Entrée valider) **under the roster in the left column**. A disclaimer under that. The showcase on the right. | Adopt the Tricolore and the left-column button row with its legend on wide screens. Keep the game's three buttons and ids. |
| **Copy** | "Choisissez votre candidat·e" (vous, inclusive). Stats are Vitesse, Accélération, **Tenue de route**. The power hint reads "(touche F)" or "(bouton ★)". Pun names and the game's titles, quotes and powers. | "Choisis ton candidat" (tu). Stats are Vitesse, Accélération, **Maniabilité**. **Real names** and the template's own titles, quotes and powers, plus "Satire. Les citations sont des caricatures… Glisse sur la scène pour faire pivoter le podium." | **None of the template's copy ships.** Keep the game's copy. Add one line in the game's voice: « Glissez sur la scène pour faire pivoter le podium. » |
| **Drag to rotate** | None. Auto-rotation at 0.7 rad/s. | Window-wide pointer drag with inertia (`vel *= 0.04^dt`), auto-spin after 2.5 s idle, and mouse parallax on the camera (±0.9 / ±0.5). | A drag surface in the showcase band (DS `ShowcaseStage`, 5.6), with `touch-action: pan-y` so phones still scroll. |
| **Keyboard** | ← → step to the next drivable candidate. Enter = `#b-next1`. | ← → ±1, **↑ ↓ ±4** (one roster row), Enter = go. | Add ↑ ↓ ±4, skipping locked candidates like `stepChar`. |
| **Character swap** | Instant rebuild (`setPreview`). | The outgoing pilot shrinks and spins out in 0.2 s. The incoming one pops in with ease-back and a −1.2 rad twist, and the turntable gets a +2.2 spin impulse. | Port it. With `prefers-reduced-motion`, cut instead. |
| **"Go" launch** | None. `#b-next1` transitions to `tracks`. | The kart accelerates towards the camera (z = 9·t²) for 1.3 s, wheels spin up, exhausts flare, **confetti burst**, then the kart reappears. | Port it, retimed and redirected (5.7). The template version flies the kart through the camera; design screenshots `02-cs4`, `03-cs4` and `04-cs4` are such frames. |
| **Transitions** | Title, then select (portraits rendered first, synchronously). Select, then tracks, then countdown (race scene built). | None between screens. | 5.7. |
| **Phone portrait** | [measured, live] The showcase sits above the roster and the kart is fitted into the band above the name (`frameKart`). Good. | [prototype] **No phone design.** The model renders behind the name, quote and stats (`phone-layouts.png`). | Keep the game's band framing and add the backdrop behind the whole canvas (5.3). |
| **Phone landscape** | Band framing in the right column. | The model fits, but the copy is cut off and needs a scroll. | A short-landscape rule in `SelectLayout` (5.6). |
| **Garage** | Shares the turntable. `#g-showcase` frame. | Not designed. | Share the stage, with a kart-focused camera preset (5.5). |

### 1.2 Defects found in the template (do not port them)

- **A.1 Negative first `dt` blanks the stage.** **[measured]**
  - `tick` computes `dt = Math.min((now - last)/1000, .05)` with no lower bound.
  - `last` is taken *after* the synchronous 20 s+ portrait pass, and the first rAF timestamp predates it, so dt ≈ −23 s.
  - `Math.pow(.02, dt)` then extrapolates the tint lerp to 1e66. The rim uniform, `rimL`, `stripMat` and `poolMat` go NaN, and every rim-lit material renders black (or white once tone-mapped).
  - This is exactly the design's own `02-cs3.jpg` (empty stage) and `cs1`/`cs2` (white podium and pilot). Reproduced in `dbgA-noshadow.png`; the light colour read back as `[7.5e65, 4.1e66, −4.9e66]`.
  - The fix is `Math.max(0, …)`. The game's `frame()` already clamps, but its clock starts before `makeThumbs` too, so the stage must clamp independently.
- **A.2 Framing heuristic.** `frame.d` is computed from `#showcase` alone, so at 16:10 the pilot covers the name (`A-desktop-0.png`). The game's new `frameKart` (fitting a bounding box into the band) is better; reuse it.
- **A.3 Everything is built up front.** All 11 characters are built at load (≈1.3M triangles, 1,177 geometries), plus 11 portraits synchronously, blocking the main thread for 20 s+ in software GL.
- **A.4 Point lights inside props.** The phone screen, grill and siren carry point lights, so the scene's light count changes on every swap. **[measured]** The program count grew from 18 to 30 to 33 as characters were shown: each new light configuration recompiles the visible materials. Use emissive materials and an additive glow sprite, or one permanent point light that is repositioned and recoloured.
- **A.5 `preserveDrawingBuffer: true`.** It costs bandwidth on tilers (mobile GPUs) and is not needed; read the portrait in the same task as its render.
- **A.6 Swap overlap.** The outgoing and incoming pilots overlap, and two heads show in launch frames (`02-cs4.jpg`). Hide the outgoing pilot as soon as the launch starts.
- **A.7 Extravagant segment counts.** The head is a 128×96 sphere (24.6k triangles), hair shells are 96×48, wheels 64 segments. See section 4.

---

## 2. Three.js version

### 2.1 Every r184 feature the template uses, and r128

Checked against `node_modules/three/build/three.module.js` (0.128.0), not from memory, then exercised by the r128 port.

| Template use | In r128? | Port |
|---|---|---|
| `WebGLRenderer({antialias, powerPreference})` | yes | — |
| `preserveDrawingBuffer` | yes | drop it (A.5) |
| `ACESFilmicToneMapping`, `toneMappingExposure` | yes, same fitted curve (`exposure/0.6`) | **But tone mapping is baked into a program at first compile.** r128's `needsProgramChange` checks `outputEncoding`, the env map, fog, instancing and light state, but **not** `toneMapping` (or `physicallyCorrectLights`). See 2.2. |
| sRGB output: `outputColorSpace` (r152+); colour management on by default (r152+) | `outputEncoding = sRGBEncoding`; **no ColorManagement** | The stage's material factory converts every authored hex with `Color.convertSRGBToLinear()`. The prototype shim patched `setHex`/`setStyle` globally, which is not acceptable in the game. |
| `texture.colorSpace = SRGBColorSpace / NoColorSpace` | no; it is `texture.encoding = sRGBEncoding / LinearEncoding` | rename at the call sites (≈8) |
| Physically based light units (default since r155; legacy removed r165) | `renderer.physicallyCorrectLights = true` exists | Set it for the stage pass only. The template's intensities then match: legacy mode multiplies direct light by π. Like tone mapping, it is a compile-time define, hence 2.2. |
| `PMREMGenerator.fromScene(scene, sigma)` | yes (`fromScene(scene, sigma, near, far)`) | — |
| `scene.environment` | yes (r124+) | — |
| `scene.environmentIntensity` (r163+) | **no** | set `material.envMapIntensity = 0.75` in the stage's material factory |
| `MeshPhysicalMaterial` clearcoat, clearcoatRoughness | yes | — |
| `sheen` (float), `sheenColor`, `sheenRoughness` (r137+) | **partly**: `sheen` is a `Color` (null to disable), no roughness, and it **replaces** the GGX specular lobe instead of layering on it | `sheen = sheenColor × sheen`; drop `sheenRoughness`. Effect: velvet, wool and skin lose their specular highlight and read flatter. **[prototype]** visible only on close inspection (seat backs, jacket). Optional fallback: only fabrics get sheen; skin and hair get the rim term plus roughness. |
| `CapsuleGeometry` (r139+) | **no** | 8-line lathe of two arcs, exactly as three implements it (in the shim) |
| `LatheGeometry`, `ExtrudeGeometry` (`depth`, bevels), `TubeGeometry`, `CatmullRomCurve3`, `ShapeGeometry`, `RingGeometry`, `TorusGeometry(arc)`, partial `Sphere`/`Cylinder` | yes, same signatures | — |
| `InstancedMesh`, `setMatrixAt`, **`setColorAt`** | yes (`instanceColor`) | call `setColorAt` before the first render (the template does) |
| SpotLight with `castShadow`, `shadow.mapSize`/`bias`/**`normalBias`**, `PCFShadowMap` | yes | Keep the game's PCFSoft: `shadowMap.type` is renderer-global. |
| `setViewOffset` | yes | Not needed; reuse `frameKart`'s off-centre frustum. |
| `onBeforeCompile` replacing `#include <opaque_fragment>` (r154+) | the hook yes; the chunk **no** | replace `gl_FragColor = vec4( outgoingLight, diffuseColor.a );` |
| `customProgramCacheKey` | yes | — |
| Sky `ShaderMaterial` with `#include <tonemapping_fragment>` and **`<colorspace_fragment>`** (r152+) | `tonemapping_fragment` yes; the other is `<encodings_fragment>` | rename |
| `CanvasTexture`, `anisotropy`, `RepeatWrapping` | yes | — |
| `MathUtils.clamp/degToRad` | yes | — |
| `material.toneMapped`, `transparent`, `AdditiveBlending`, `depthWrite`, `DoubleSide` | yes | — |
| `renderer.compile(scene, camera)` (for warm-up) | yes | Use it during the title screen (5.4). |
| `BufferGeometryUtils.mergeBufferGeometries` | in `examples/jsm` only | The game avoids `examples/jsm` (DEC-007 spirit, PLAN stage 3a). Write a 40-line `mergeByMaterial` in a new `engine/geo.js` (owner question Q7). |
| ES module import map with OrbitControls, OBJExporter, GLTFExporter | importable | Unused by the stage (the exporters are design-tool leftovers). Do not import them. |

**[prototype] result.** With the shim (`vendor/compat128.js`) and three one-line edits (two chunk renames and the env intensity), the unmodified template renders on r128 with no errors. Mean absolute pixel difference against r184 is **8.2 to 8.4 / 255**, most of it confetti positions and the sheen lobe (`compare-design-r184-r128.png`).

### 2.2 The one real r128 constraint: per-scene renderer state

- **The problem.** The race keeps the legacy look: linear output, no tone mapping, legacy lights. Changing that would restyle every circuit; it is owner question Q5. The stage needs ACES, sRGB and physical lights.
- **What r128 does.** `toneMapping` and `physicallyCorrectLights` are baked into a material's program at its first compile and **never re-checked** (verified in `setProgram`). `outputEncoding` is re-checked and forces a recompile.
- **Consequence.** A material shared by both scenes would keep whichever look compiled first, or recompile on every switch. Today `kart.js` takes its colours from the shared `mat()` cache in `primitives.js`, which the race uses too.
- **Rule (DEC-043).** The stage never renders a material the race renders.
  - `buildKart(def, style, { profile })` takes a profile. `'race'` (default) keeps `mat()` exactly as today. `'stage'` draws its materials from `stagelook.js`'s own cache: `MeshPhysicalMaterial`, colours converted to linear, `envMapIntensity` set, rim injected.
  - The stage pass is wrapped in `withLook(renderer, STAGE_LOOK, () => renderer.render(stageScene, stageCamera))`. It sets `toneMapping`, `toneMappingExposure`, `outputEncoding` and `physicallyCorrectLights`, and restores them afterwards. `lootbox.js` and `race.js` never see them.
  - The stage also gets **its own `PerspectiveCamera`**. That ends the "shared mutable camera" hazard that `render.js` documents for this scene, at no cost.

### 2.3 The three options compared

| | (a) Port to r128 (recommended) | (b) Upgrade the game to r184 | (c) Second renderer and canvas for select |
|---|---|---|---|
| **What changes** | New stage modules. `kart.js` gains a profile. `preview.js` becomes the stage facade. | `three` in `apps/game` **and `apps/server`** (the headless engine imports it). Every look. | A second `<canvas>` and `WebGLRenderer` (r128, or r184 as a second copy of three). |
| **Code that breaks** | none outside the stage | `sRGBEncoding` (1 site: `imgTex`), `outputEncoding` | none |
| **Looks that change** | none outside the stage | **All of them.** Colour management converts every hex the game ever authored (≈300 `mat(0x…)` calls, track palettes, kerbs, skies, fog). Physical lights need every light ×π retuned (11 lights in `track.js`, `preview.js`, `lootbox.js`). sRGB output changes contrast. That means 5 circuits, the karts, trails, the Politibox and the minimap textures, judged by eye. | none |
| **Platform** | unchanged | **WebGL1 dropped in r163**, so older phones (iOS < 15, some Android WebViews) lose the whole game | Two contexts. iOS Safari caps the count and loses them under memory pressure. |
| **Bundle** | +0 deps, +≈40 KB of source [estimate] | three r184 module+core ≈ 1.25 MB unminified vs 1.2 MB, about the same | with r184 inside: **+≈680 KB min / +≈170 KB gz** [estimate] |
| **Server** | untouched (the stage is browser-only; the pilot's race LOD must stay headless-safe) | three upgrade on the authoritative server; headless tests rerun | untouched |
| **Lootbox** | untouched | retune | untouched |
| **Garage, kart styles** | `kart.js` profile, one builder for both looks | one builder | With r184 inside, `kart.js` imports `three` statically, so building the same kart for both versions means parameterising THREE everywhere (`primitives`, `kart`, `trail`). Not realistic. With r128 inside, nothing is gained over (a). |
| **Memory** | stage textures and geometry stay resident (≈10 to 30 MB, section 4) | same | doubles uploads of shared textures; a second drawing buffer (≈8 to 16 MB at dpr 2) |
| **Risk** | low: [prototype] proves fidelity | **high**: a "restyle everything" task, which DEC-007 called its own task | medium: context loss and stacking issues on phones; two render loops |
| **Size** | the plan below (≈11 stages) | an additional 3 to 5 stages of retune before any stage work, plus a WebGL1 decision | the same as (a), plus canvas plumbing |

**Recommendation: (a).** Keep DEC-007, and record DEC-043 (stage look isolation, 2.2). Revisit (b) as its own task only if the owner wants the race restyled with the stage's look (Q5). The stage modules are written to be r184-ready: no deprecated APIs beyond the `encoding` names, which are isolated in `stagelook.js`.

---

## 3. Characters

### 3.1 Template entries to game candidates

Only **5 of the 11** template entries are the same person as a game candidate. Six are politicians the game does not have. Those six are used as **technique and prop donors** for six game candidates of the same archetype, which leaves five game candidates authored from scratch with the same toolkit. Nothing of the template's names, titles, quotes or powers ships. Props follow the **game's** power and accessory list, never the template's.

| Template entry | Game candidate (id) | Pun name | Relation | What carries over (shape techniques) | What stays the game's |
|---|---|---|---|---|---|
| `lepen` | `bernadette` | Marine Le Stylo | **same person** | bob hair (cap, bob and fringe shells), smile, `drive` pose, face proportions | pink suit `0xe85d9a`, blonde `0xc9a227`, pearls and sunglasses. Prop: **a kitten on the dashboard** (power *Lâcher de chatons*), not the border barrier. |
| `bardella` | `kevin` | Jordan Mortadella | **same person** | slick hair with quiff, smirk, heavy lids, `hold` pose, **the animated phone-screen shader** | black jacket, cyan shirt `0x00c2cb`. Selfie stick and ring light (*Vol d'audience*). |
| `melenchon` | `lulu` | Jean-Luc Mélèche | **same person** | `shout` mouth, `raise` pose, the lathe megaphone with rim and grip, wider face | purple suit `0x7b2cbf`, red scarf. Hair is **the game's `wild`, dark**: the template's grey swept hair is a likeness change, owner question Q2. |
| `darmanin` | `martine` | Gérald Darmalin | **same person** | stern brow (0.09), flat mouth, `drive` pose, the **gyrophare on the kart** (fits *Contrôle d'identité*) | navy `0x1b2a49`. Kepi (the game's) instead of the riot helmet. Whistle, sunglasses. |
| `lemaire` | `gaspard` | Bruno Le Maigre | **same person** | receding hair, smirk, lids, `hold` pose, book-style hand prop technique | grey suit, glasses, blue tie. Prop: **calculator** (*Coup de rabot*, "pas budgété"), not the novel. |
| `philippe` | `hubert` | Gérard L'Archiduc | donor (elder statesman) | `tall` scale, heavy lids (1.15), beard, moustache and sideburn shells used as **white sideburns**, the lathe **hourglass** (fits "Je roule depuis 1974") | white hair, monocle, red bow tie, pocket square |
| `attal` | `victor` | Emmanuel Macaron | donor (young leader) | `raise` pose with the raised index, `grin` with teeth | slick hair (the game's), navy suit, blue tie, phone |
| `glucksmann` | `aymeric` | Michel Bananier | donor (European) | tousled-lock hair technique adapted to the blond `slick`; `hold` pose with a lathe cup, turned into a briefcase hold | EU badge, yellow tie, briefcase (*Directive européenne*) |
| `ruffin` | `gege` | Philippe Martini | donor (worker, terroir) | **corduroy fabric**, the brushed-steel **thermos** (picket line), curly-lock technique under the cap | red `0xc1121f`, cap, moustache, hi-vis vest (a new `hivis` fabric) |
| `wauquiez` | `patrick` | José Bovin | donor (rural) | **puffer fabric** for a quilted gilet, the **tractor-mirror** prop (the game's `patrick` drives the tractor), mèche technique | straw hat, overalls, moustache, straw |
| `bertrand` | `maurice` | Jean Lassalle-des-Fêtes | donor (province, rond-point) | glasses rig, **the barbecue on the kart** with coals and merguez (fits *Rond-point surprise*, the village fête) | tricolore sash, rosette, beige suit, belly |

**The other five game candidates** get the same treatment from the same toolkit, with no template entry behind them:

| Game candidate | Pun name | New builders needed (stage 5) |
|---|---|---|
| `capucine` | Sandrine Ruisseau | bike-helmet shell (vented, the police-helmet technique), backpack, green ripstop fabric; rides the **cargo bike** |
| `odile` | Eva Joly-Jumper | bun (sphere and shell), **judge's robe** (new `satin` fabric) with white rabat, glasses rig |
| `lucie` | Nathalie Artichaut | ponytail (capsule chain), badge, fleece fabric |
| `jeanmi` | Éric Zemmoule | big quiff (the slick quiff scaled), open collar, chrome microphone with a foam head |
| `thierry` | Manuel Valse | weathervane on the head (gold metal, it already turns), rosettes, lavender wool |

### 3.2 Replace or upgrade?

**Decision:** the pilot **builder** is replaced; the pilot **identity** is the game's. From the player's side, every candidate is the same candidate, much better made.

- `kart.js buildDriver` is box-built. Upgrading it in place would mean rewriting every line anyway, and the template's code is organised the right way: materials from a look, `buildKart`/`buildFace`/`buildHair`/`buildProp`, and named meshes.
- The new `engine/pilot.js` follows that organisation. It reads a **look spec** per candidate from a new `engine/looks.js`, keyed by id and never by name, so pun names and admin renames are irrelevant to it.
  ```js
  LOOK3D.bernadette = { hair: 'bob', fabric: 'wool', face: { nose: [1,1,1], brow: .02, mouth: 'smile', lid: 0 }, pose: 'drive', props: ['pearls', 'sunglasses', 'kitten'], tint: null }
  ```
- Colours come from the existing `def.look` (`skin`, `suit`, `shirt`, `hairColor`, `tie`). The admin's `suit` and `kart` edits (DEC-027) therefore reach the stage unchanged.
- **Tint** (rim light, sky glow, LED strips) is derived from `def.kart`: hue kept, lightness at least 0.55, saturation at least 0.6. `LOOK3D[id].tint` can override it, which the dark karts `odile` (`0x2b2b2b`) and `martine` need (fall back to gold). Admin kart recolours then retint the stage automatically.
- The look spec is **code data, not part of the roster document**. The server's roster validation (DEC-027) and its 10 MB limit are untouched (Q8).

### 3.3 One pilot, three levels of detail (DEC-044)

`buildPilot(def, lod)`, with `lod` one of `'stage' | 'race-high' | 'race-low'`, plus `'headless'` (below).

| LOD | Used by | Segments | Materials | Draw calls | Triangles (budget) |
|---|---|---|---|---|---|
| `stage` (desktop high) | select, garage, portraits, Politibox reveal (optional) | ×0.5 of the template | Physical + sheen + clearcoat, fabric normal maps, rim | ≈20 to 26 (one per material; meshes are merged **by material** after build, except the head group and the hand-prop group, which animate) | **≤ 40k** [prototype: 36k avg, 41k max at ×0.5] |
| `stage` on "légers" | the same, low tier | ×0.25 | Standard, maps without normal maps, rim | ≈20 | ≤ 12k [prototype: 9.8k avg] |
| `race-high` | race, "détaillés" | ×0.25 for the face, ×0.12 for everything else | **one `MeshStandardMaterial` with vertex colours** for all untextured parts, plus one for the jacket fabric map | **2 to 3** (body, head; +1 if a prop is animated) | **≤ 6k** [estimate from the ×0.12/×0.25 counts] |
| `race-low` | race, "légers" | ×0.12, flat-shaded | vertex colours, one material | **1 to 2** | **≤ 2.5k** [prototype: 3.0k avg at ×0.12 before culling the hidden inner shells] |
| `headless` | the game server (DEC-014) | — | — | 0 | an empty `Group` with the same `userData` (physics only moves `driver.position`) |

- **Why the race needs merging.** **[measured, live]** A race today draws **≈1,400 calls / 400k triangles** on high and **≈330 / 60k** on low. Of that, ≈89 visible meshes per kart × 6 karts, × 2 with the shadow pass. A template-like pilot unmerged would add ~95 meshes per kart, roughly **doubling** the draw calls. Merged with vertex colours it adds 2 to 3 per kart. That is a net **reduction**: today's `buildDriver` itself costs about 35 to 55 meshes per kart (counted from its source). [estimate]
- **The faces still read at race distance.** Eyes and brows are kept as merged geometry and the mouth is baked into vertex colours. A face texture (a 64 px "decal" painted from the face rig) is an option for race-low if geometry eyes shimmer (risk R4).
- **Same models, at speed, on phones.** The same look spec and builder produce all three, so the candidate seen on the podium is the one that races. Physics' driver contract (`u.driver.position.y` bob, `lootbox` hiding `driver`) is kept by returning the pilot as `userData.driver`.

### 3.4 Karts, the Garage and multiplayer

- **`kart.js` keeps every contract.** The Garage fields and their option lists (`kartstyle.js`), wheel order (front pair first, physics steers 0 and 1), `userData` keys (`kart.test.js` pins 10), the three bodies, liveries and stickers.
- **The `stage` profile** swaps materials (clearcoat paint, chrome, gold, the tread texture on tyres, leather seat) and, on the standard body only, borrows the template's shapes where they map to a Garage option:
  - bevelled extruded body hull instead of stacked boxes (the body skin texture still maps on it);
  - capsule side pods (`pods`);
  - tube bumper (`nose: stock`);
  - spoked chrome rims (`wheels: chrome`);
  - a tricolore wing (`spoiler: wing` plus `sticker: tricolore`);
  - a number roundel when `style.number` is set.

  Tractor and cargo bike keep their silhouettes with stage materials.
- **Scale.** The game kart is ≈4.1 long and the template's ≈2.6, and the template pilot (torso radius 0.345, head 0.42) is in template units. The pilot is built in template units and scaled ×1.45 into the game seat, so physics, shields (r 2.3) and rings (r 2.1) are untouched. The podium is sized to the game kart (top radius ≈ 2.8).
- **Multiplayer.** No wire change. The pilot depends only on `charId` and the roster document; the kart only on the style that already rides the lobby view, the race grid, `netrace` and `kartJoin` (DEC-036). Ownership filtering (DEC-035) is untouched. The stage only ever shows the local player's kart; a future 3D kart in the lobby would reuse `buildKart(…, { profile: 'stage' })`.

---

## 4. Performance budget

### 4.1 What was measured

| Scene | Draw calls / frame | Triangles / frame | Other |
|---|---|---|---|
| **Live select today, high** [measured, GL hook] | 164 | 46,826 | 16 thumbnails in 3.5 s (software GL) |
| **Live select today, low** [measured] | 78 | 4,850 | 3.5 s |
| **Live race today, high**, countdown, Élysée [measured] | ≈1,350 to 1,445 | ≈390k to 413k | — |
| **Live race today, low** [measured] | ≈325 to 340 | ≈60k | — |
| Game kart + driver (headless count) [measured] | — | high 26.8k avg (22.7k to 40.8k); low 5.3k (4.8k to 6.9k) | 104 meshes, 89 visible (high) |
| **Template on r184**, 1440×900 [measured] | 228 (`renderer.info` reports 134: shadow pass not counted) | 323,810 | 48 programs; 1,177 geometries; 27 texture images ≈ 21.7 MB with mips [estimate from image sizes]; 1 shadow map 2048 (r128 packs depth in RGBA8, so the target is 2048² × 4 B ≈ 16.8 MB plus its depth buffer) |
| Template on r128 (the port) [prototype] | 228 | 323,810 | 35 programs |
| ×0.5 segments [prototype] | 228 | 93,714 | — |
| ×0.5, no shadow [prototype] | 134 | 57,773 | — |
| ×0.25, no shadow [prototype] | 134 | ≈26k | — |
| ×0.12, no shadow [prototype] | 134 | 17,360 | — |
| Per character, ×1 / ×0.5 / ×0.25 / ×0.12 [prototype] | 93 to 136 meshes | 120k / 36k / 9.8k / 3.0k avg | 21 to 26 materials |
| Static stage (backdrop + podium + confetti), ×1 / ×0.5 / ×0.12 [prototype] | 41 meshes (seats are 2 instanced draws) | 47.8k / 22.1k / 14.4k | — |
| Portraits, 11, ×0.5 [prototype, per-portrait timing] | — | — | **#1: 9.6 s (18 programs compiled), #2: 5.9 s (30)**, then 0.5 to 1.4 s each; `toDataURL` 3 to 12 ms. Compile-bound, not triangle-bound: 23 s at every segment scale. |
| Build time of 11 characters (browser, r128) [prototype] | — | — | 660 to 870 ms, ≈70 ms per character |

### 4.2 Budgets per tier

Today's "détaillés"/"légers" toggle stays the only switch; phones start on "légers" (`isCoarsePointer`). A third value is not added (Q6), but "détaillés" on a coarse pointer applies the phone caps automatically.

| Budget | Desktop "détaillés" | Phone on "détaillés" (coarse pointer) | "légers" (low-poly, phones' default) |
|---|---|---|---|
| Draw calls, stage frame incl. shadow | **≤ 160** (pilot merged by material ≈ 26 + kart ≈ 60 + static ≈ 41, ×shadow for casters) | ≤ 130 | **≤ 80** |
| Triangles, stage frame incl. shadow | ≤ 130k | ≤ 80k | ≤ 30k |
| Shadow maps | 1 SpotLight, 2048, PCFSoft | 1, 1024 | **none**: the kart's existing blob disc, plus a baked contact shadow on the podium texture |
| Pixel ratio | ≤ 2 (today's rule) | ≤ 1.5 (today's rule) | ≤ 1.5 |
| Programs compiled for the stage | ≤ 40 | ≤ 40 | ≤ 20 (Standard materials) |
| Stage texture memory | ≤ 24 MB (512 fabrics + normals, 1024 floor) | ≤ 12 MB (256 fabrics) | ≤ 5 MB (256 albedo only, 512 floor) |
| Shadow target memory | ≈17 MB | ≈4 MB | 0 |
| Environment | PMREM from the panel scene (once) | same | same (cheap after generation), `envMapIntensity` 0.5 |
| Portraits | 16 × 256² JPEG, progressive (5.4) | 16 × 192² | 16 × 192² |
| Race pilot | `race-high` ≤ 6k triangles, ≤ 3 draws | same | `race-low` ≤ 2.5k, ≤ 2 |
| Race frame | **≤ today + 10%** (≤ ≈1,550 calls / 450k triangles) | — | **≤ today + 10%** (≤ ≈365 / 66k) |

### 4.3 What degrades on "légers"

- **Geometry.** Pilot segments ×0.25 (the stage) and kart `seg()` 10 as today.
- **Materials.** `MeshStandardMaterial` instead of Physical: no clearcoat, no sheen. Fabrics keep their albedo maps but lose normal maps, and the rim term stays (cheap).
- **No real-time shadows.** Blob shadow only.
- **Backdrop.** 6 tiers instead of 10, about 260 seats. LED strips become a single merged line mesh. Sky dome at 32×16 without the ray term; stars kept.
- **No light cone.** It is a large additive overdraw surface, which is fill-rate on phones. The pool is kept.
- **Confetti.** 80 instead of 240, and no burst on swaps, only on "go".
- **Idle animation.** Head sway and kart buzz are kept; the exhaust flicker is dropped.
- **Parallax.** None: there is no mouse on a phone anyway.

### 4.4 Cost of the off-screen portraits

- **Why.** In the prototype they cost 23 s in software GL, dominated by shader compiles for the first two. On a mid-range phone GPU, 35 programs is an estimated 1 to 4 s of compile [estimate], which would freeze "Jouer" if done synchronously as `makeThumbs` does today.
- **Plan (5.4).**
  - Warm up with `renderer.compile(stageScene, stageCamera)` during the title screen's idle time, after first paint.
  - Keep a fixed light rig (A.4), so swaps never recompile.
  - Render **one portrait per frame** after the stage's first frame, each from a tiny 256² portrait target (`WebGLRenderTarget` + `readRenderTargetPixels` into a 2D canvas), never by resizing the main canvas as today.
  - Hand tiles a **placeholder** until theirs is ready.
  - Cache per (roster version, tier, stage version) in memory for the session. Persistent caching is not worth its invalidation (Q10).

---

## 5. Integration

### 5.1 Modules

| Module | Status | Role |
|---|---|---|
| `engine/stagelook.js` | new | `STAGE_LOOK` (ACES 1.08, sRGB, physical lights), `withLook()`, the stage material factory (`phys()`, `std()` by tier, linear colours, `envMapIntensity`, `rim()` for r128), `tintOf(def)` |
| `engine/fabric.js` | new | the procedural textures (wool, corduroy, puffer, satin, hi-vis, fleece, skin, hair, tread, stripes, number roundel, hemicycle floor), **through `primitives.canvasTexture`**, so they are blank and safe headless; sized by tier |
| `engine/geo.js` | new | `capsule()`, `mergeByMaterial(group, keep)`, `bakeVertexColours()` |
| `engine/looks.js` | new | `LOOK3D` per id (16), validated by test (every id, known hair, fabric, props) |
| `engine/pilot.js` | new | `buildPilot(def, lod)`, hair, face, poses, props |
| `engine/hemicycle.js` | new | `buildStageScene(tier)` → `{ scene, turntable, setTint(c), update(dt, t), burst(), dispose() }` |
| `engine/preview.js` | rewritten as the **stage facade** | The same exports (`setPreview`, `hasPreview`, `showsTurntable`, `setPreviewFrame`, `renderPreview`, `makeThumbs`, `frameKart`), so `store.ts` and `game.js` barely change. Adds `stageDrag()`, `launch()`, `stageInfo()`. |
| `engine/kart.js` | extended | `buildKart(def, style, { profile = 'race', pilot = true })`; `buildDriver` replaced by `buildPilot` (stage 7 for the stage, stage 8 for the race) |
| `engine/render.js` | small | export `getRenderer` unchanged; `withLook` lives in `stagelook.js` |

### 5.2 Shared renderer and camera

- **One renderer, one canvas `#c`.** E2E "keeps the canvas filling the viewport" is unchanged.
- **The stage has its own camera.** `aimTurntable(stageCamera, frame, W, H)` from the baseline is reused with the new podium box. The off-centre frustum already draws the whole canvas, so the hemicycle backdrop fills the window behind the UI as in the design while the podium lands in the band.
- **Stage passes run inside `withLook`** (2.2).
- **The Politibox keeps its own scene and look.** Its reveal can opt into `buildKart(…, { profile: 'stage' })` later (stage 10 follow-up, not in scope).

### 5.3 State machine and render loop (`game.js`)

- **No new machine states.** `showsTurntable(state)` stays `select | garage`, plus a **1.4 s launch tail into `tracks`** (5.7) if the owner accepts it (Q3). `frame()` calls `renderPreview(dt)` for those states as today.
- **The stage clock clamps `dt` to `[0, 0.05]`** (A.1).
- **Lifecycle.**
  - The stage scene is built lazily on the first `play()`. The roster pilots are built **one at a time**: only the selected candidate and the one being portrayed exist, not all 16 (A.3).
  - The scene is kept resident while racing. Resident memory is ≈20 to 45 MB on high and ≈6 MB on low (4.2). Re-entering select costs nothing, and programs stay cached.
  - On "légers" the stage's textures are disposed at `countdown` and re-baked on return (≈100 ms [estimate]).
- **The keyboard** (`game.js` keydown): select ↑ ↓ → `actions.stepChar(±4)` (a new `step` argument). Garage: none (form inputs).

### 5.4 Portraits and the roster (`store.ts`, `SelectScreen.tsx`)

- **`makeThumbs()` stops being synchronous.** It returns at once with placeholder URLs, one per id: a cheap 2D-canvas tile in the candidate's kart colour with their initials, so `#roster .tile img` is 16 at once (DEC-009 contract kept). It then schedules the real portraits, one per frame.
- **The UI learns of each portrait** through a `thumbs` patch, batched every 4 portraits.
- **The tile** gets `data-portrait="ready"` when final, which the E2E and visual checks can wait on.
- **The shop's candidate cards use the same thumbs.**
- **Portrait camera.** The template's head-and-shoulders framing (fov 24, from front-right), with the candidate's tint, on the stage background.

### 5.5 Garage: share the stage

**Yes.** The Garage already shares the turntable and `#g-showcase` band.

- **Camera preset.** It takes a "kart" preset: a lower, wider camera, the podium a little larger, and the pilot kept (the pilot is part of the look).
- **Rotation.** Drag-to-rotate matters most here, to see exhausts, mast, trail and nose. Auto-spin after idle.
- **Updates.** Garage edits call `setPreview` as today, rebuilding the **kart only**: the pilot is kept (`setPreview(i, { keepPilot: true })`).
- **Trails** are shown on the stage in the Garage (A-032 says "the 3D trail in races and on the turntable"): `trail.update` with a fake forward speed while spinning.

### 5.6 React screens and design-system components (`packages/ui`, synced to the Design System page)

| Component | Change | Why |
|---|---|---|
| **`ShowcaseStage`** (new, `select` group) | An empty, flexible element placed first in a `Showcase`: `flex: 1`, `min-height: 140px`, `pointer-events: auto`, `touch-action: pan-y`, `cursor: grab`, `role="img"`, `aria-label` passed in (« Le podium : glissez pour le faire pivoter »). No game id inside (DEC-012). The game gives it `id="showcase-stage"` / `id="g-showcase-stage"`. | Replaces the `.big`-relative `showcaseBand()` heuristic with an element whose rect **is** the band, and gives the drag a hit target. `Showcase` is `pointer-events: none` and must stay so. |
| **`Showcase`** | Optional `stage?: ReactNode` slot rendered before `.big`. Documented. | Composition without the game reaching into the DOM. |
| **`CharacterTile`** | Optional `pending?: boolean`: a shimmer over the image (CSS only, off under `prefers-reduced-motion`). | Progressive portraits. |
| **`SelectLayout`** | A rule for short landscape (`max-height: 520px and orientation: landscape`): two columns kept, the showcase `position: sticky; top: 0` and limited to `100dvh`, the roster scrolling beside it. | Phone landscape (`phone-layouts.png`, right). |
| **`Roster`** | Optional `footer?: ReactNode` for the button row and `KeyCap` legend in the left column (design layout). | Design layout on desktop. |
| `Tricolore`, `KeyCap`, `Disclaimer` | used as is | — |

- **Sync and tests.** Stories and tests for each (`select.test.tsx`, `coverage.test.ts`, `dist-contract.test.ts`), then a `/design-sync` so the Design System page shows the real parts. The template's `KartRepubliqueUI` global is stale: the bundle is now `PolitikartUI`.
- **`SelectScreen.tsx`**:
  - `<Tricolore/>` over the heading;
  - `<Showcase stage={<ShowcaseStage id="showcase-stage" …/>}>`;
  - on wide screens the `Row` moves into `Roster footer` with « ← → ↑ ↓ choisir · Entrée valider » (hidden in touch mode);
  - the one new disclaimer line;
  - placeholders and `pending`.
- **`GarageScreen.tsx`**: `<Showcase stage={<ShowcaseStage id="g-showcase-stage"/>}>`.

### 5.7 Transitions

- **title → select.**
  - The stage scene is built behind a fade. The backdrop appears first, then the pilot pops in (ease-back).
  - Portraits fill in over the following ≈16 frames.
  - The warm-up `compile()` ran on the title screen.
- **Swap.** The template animation: 0.2 s out, a pop in, a turntable impulse. The outgoing pilot is hidden at once if a launch starts (A.6).
- **select → tracks ("go" launch, recommended form).**
  - `#b-next1` transitions to `tracks` **immediately** (E2E and DEC-037's "never wait on an animation" hold).
  - The stage keeps drawing for 1.4 s behind the circuit cards: the kart **drives off down the aisle and out of frame** (not into the camera), wheels spinning up, exhausts flaring, a confetti burst; then it fades to `--bg`, and the baseline's `clearCanvas` takes over.
  - Under `prefers-reduced-motion`, no launch.
  - If the owner rejects drawing behind `tracks` (Q3), the launch is dropped.
- **tracks → countdown.** The race scene is built as today; the stage is not rendered.
- **results → select / title → select.** The stage is resident: an instant, warm return.

### 5.8 E2E impact (ids are the contract)

| Spec | Impact |
|---|---|
| `game.spec.ts` roster (16 tiles, 16 `img`, first `.sel`, `#showcase .big`, 3 `.stat`, `.powerbox`) | Kept by the placeholders. Add: every tile reaches `data-portrait="ready"` within 60 s (software GL). |
| `game.spec.ts` "changes the showcase…" | unchanged |
| `game.spec.ts` "keeps the canvas filling the viewport" | unchanged (one canvas) |
| `mobile.spec.ts` long press on a tile | unchanged. Add: a vertical swipe over `#showcase-stage` scrolls the screen (`touch-action: pan-y`) and a horizontal one changes the yaw. |
| `garage.spec.ts`, `shop.spec.ts`, `admin.spec.ts` | unchanged (ids kept); the shop's cards use the progressive thumbs |
| `App.test.tsx CONTRACT_IDS` | `+ showcase-stage, g-showcase-stage` |
| `window.__kr` | `+ stage(): { charId, yaw, ready, info: { calls, triangles, programs }, bbox: { x, y, w, h } }` (read-only, like `karts()`) |
| New `e2e/stage.spec.ts` | drag rotates; ↑ ↓ ±4; model bbox does not intersect `.big`, `.title`, `.quote`, `.stats` or `.powerbox` at 1440×900, 924×540, 390×844 and 844×390; `info.calls`/`triangles` within the tier budget (4.2), both tiers |
| New `e2e/visual/select.visual.ts` (not gating; an artifact for review) | screenshots at those 4 viewports for `bernadette`, `kevin`, `gege`, `patrick`, `capucine`, plus a contact sheet beside the design's `01-cs3`, `01-cs5` and `02-cs5` |

---

## 6. Staging

### 6.1 Working rules

The DEC-039 pattern applies:

- one worker agent per stage, in its own git worktree, with **disjoint files**;
- each worker runs Tier 1;
- the dispatcher merges in the listed order and reruns Tier 1 plus the full E2E on the tip after each merge (Playwright's fixed ports mean one E2E at a time).

The shared contracts (section 5.1's signatures, LOD names, budgets, `LOOK3D` schema) are written into `PLAN.md` by stage 0, so parallel workers code against them.

### Stage 0: Baseline and decisions (dispatcher)

- **Files:** `.claude/PLAN.md` ← this plan; `DECISIONS.md` gets DEC-043, DEC-044 and DEC-045; `ASSUMPTIONS.md` (tints, scale ×1.45, the launch direction); `CHECKPOINT.md`.
- **Decisions:**
  - DEC-043: stage look isolation on the shared r128 renderer; DEC-007 kept.
  - DEC-044: one pilot, LODs, built from `LOOK3D` by id.
  - DEC-045: progressive portraits with placeholders.
- **Baseline capture.** Screenshots of select and garage at 4 viewports, both tiers. Live-equivalent GL-hook counts on the local build: select, and a 10 s race on Élysée, both tiers. These are the "today + 10%" references.
- **Check:** Tier 1 + E2E green on `f70b355`, numbers logged.
- **Size:** S.

### Wave 1 (parallel): 1 ∥ 2 ∥ 3

**Stage 1: Stage look, fabrics, geometry helpers.**

- **Files:** `engine/stagelook.js`, `engine/fabric.js`, `engine/geo.js` and their tests.
- **Acceptance.**
  - Unit: the factory caches by key and never returns a `primitives.mat()` instance. Colours are converted to linear. `withLook` restores all four renderer fields, even when the callback throws. Textures are deterministic (same seed, same pixels) and blank headless. `capsule()` triangle count matches three's formula. `mergeByMaterial` preserves the triangle count and the material set, and keeps the excluded groups.
  - Visual: a material swatch sheet (wool, corduroy, puffer, velvet, skin, hair, paint, chrome) rendered on r128 through `withLook`, beside crops of `01-cs3`/`02-cs5`.
- **Size:** M (≈500 lines + tests).

**Stage 2: Look specs for the 16 candidates.**

- **Files:** `engine/looks.js`, `engine/looks.test.js`.
- **Content:** section 3.1's table, filled in for every candidate.
- **Acceptance:** every `CHARACTERS` id has an entry; hair, fabric, pose and props are from the known vocabularies (exported lists that stage 5 must implement); no entry carries a name or any copy; the test fails if a real-name string from the template's `cast.js` appears anywhere in `apps/` or `packages/`.
- **Size:** M (mostly content judgement; Opus).

**Stage 3: Design-system parts.**

- **Files:** `packages/ui/src/components/select/*` (`ShowcaseStage` new; `Showcase`, `CharacterTile`, `SelectLayout`, `Roster` extended), styles, stories, `select.test.tsx`, `dist-contract.test.ts`.
- **Acceptance:** Tier 1 (ui) + build; stories render; the short-landscape rule verified in a Storybook screenshot at 844×390; `pending` off under reduced motion; no game ids in the library.
- **Size:** S-M.

Merge order: 1, 2, 3.

### Wave 2 (parallel): 4 ∥ 5 ∥ 6 (each depends only on stage 1; 5 also on 2)

**Stage 4: Hemicycle stage scene.**

- **Files:** `engine/hemicycle.js` + test.
- **Content:** sky, ground, 10/6 tiers, instanced seats, LED strips, podium sized for the game kart, pool, cone, fixed light rig (no light added per pilot), confetti, `setTint`, `burst`, `dispose`, both tiers.
- **Acceptance.**
  - Unit (headless): draw-object counts per tier; `dispose()` frees every geometry and texture.
  - Visual: scene-only render at 924×540 beside `01-cs3` (tier rhythm, gold strips, tricolore rim, floor arcs).
  - Measured static budget: high ≤ 45 draws / ≤ 25k triangles; low ≤ 30 / ≤ 10k.
- **Size:** M.

**Stage 5: Pilot builder.**

- **Files:** `engine/pilot.js`, `engine/props.js` + tests.
- **Content:**
  - the template's builders ported: torso, limbs, poses, face rig, 10 hair styles;
  - the game's 13 hair styles: slick, cap, sides, bike helmet, white, bob, hoodie, bun, straw hat, ponytail, side parting, quiff, kepi, wild;
  - the game's ~28 accessories and the new power props (kitten, hourglass, thermos, gyrophare, barbecue, tractor mirror, calculator, microphone);
  - the four LODs; the merging; `headless` returning an empty group.
- **Acceptance.**
  - Unit: per-LOD triangle and draw budgets for all 16 (3.3); the same `userData` keys at every LOD; `headless` builds in < 1 ms.
  - Visual: a contact sheet of 16 pilots × {stage, race-high, race-low}, for the owner. The five same-person candidates sit beside the matching template portrait in `tiers-portraits.png`.
- **Size:** **L** (≈1,000 lines; Opus).

**Stage 6: Kart stage profile.**

- **Files:** `engine/kart.js`, `kart.test.js`.
- **Content:** `profile` option; stage materials; the template's shapes on the standard body per Garage option (3.4); tractor and cargo with stage materials; `pilot: false` option. The race profile stays byte-for-byte the same look.
- **Acceptance.**
  - Unit: `kart.test.js` 10-key pin unchanged; wheel order; every Garage option builds under both profiles; race-profile materials are `mat()` instances; stage-profile ones never are.
  - Measured: stage kart ≤ 60 draws.
  - Visual: the standard, tractor and cargo bodies with 4 Garage presets under `withLook`.
- **Size:** M.

Merge order: 4, 5, 6.

### Wave 3 (serial)

**Stage 7: Stage integration on select and garage.**

- **Files:** `engine/preview.js` (the stage facade), `preview.test.js`, `game.js` (keys, clock), `ui/store.ts` (`makeThumbs` progressive, `stepChar(±4)`, `keepPilot`), `ui/screens/SelectScreen.tsx`, `GarageScreen.tsx`, `game.css`, `App.test.tsx`, `e2e/game.spec.ts`, `e2e/mobile.spec.ts`, new `e2e/stage.spec.ts`, `e2e/visual/select.visual.ts`, `window.__kr.stage`.
- **Content:**
  - `kart.js` stage profile wired to `buildPilot(def, 'stage')`;
  - drag with inertia on `ShowcaseStage`; idle spin; parallax (no parallax on coarse pointers);
  - swap animation; tints; portraits with placeholders; warm-up compile on the title screen.
- **Acceptance.**
  - Full E2E green, plus `stage.spec.ts` (non-overlap at 4 viewports, budgets, drag, keys).
  - Visual sheet vs `01-cs3`/`01-cs5`/`02-cs5`, reviewed.
  - Phone portrait and landscape screenshots.
  - Every tile `ready` in under 60 s in software GL. First stage frame on "Jouer" in under 1 s after the title has been idle for 2 s, in software GL [to measure].
- **Size:** **L** (Opus).

### Wave 4 (parallel): 8 ∥ 9

**Stage 8: Pilots in the race.**

- **Files:** `engine/kart.js` (race profile → `buildPilot(def, poly === 'high' ? 'race-high' : 'race-low')`, headless → `'headless'`), `engine/physics.js` (only if the driver bob needs a pivot), `engine/lootbox.js` (`driver` hidden as today), `headless.test.js`, `gameplay.test.js`, server `race.test.js` (build time).
- **Acceptance.**
  - Headless 30 s races on all 5 circuits pass.
  - Server: building 6 karts headless ≤ 5 ms [to measure].
  - Measured race frame within today + 10% on both tiers (stage 0's reference).
  - Phone race screenshot on "légers", reviewed.
  - E2E multiplayer green (karts' style unchanged).
- **Size:** M.

**Stage 9: Launch, transitions, reduced motion.**

- **Files:** `engine/preview.js` launch tail, `ui/store.ts` `toTracks`, `game.js` frame branch for the 1.4 s tail.
- **Acceptance:**
  - `#s-tracks` visible ≤ 100 ms after the `#b-next1` click (E2E timing assert).
  - Launch frames never put the camera inside the kart (bbox check in the last frame).
  - `prefers-reduced-motion` (Playwright `reducedMotion: 'reduce'`) shows no launch and no confetti.
  - The canvas is `--bg` after 1.5 s on tracks.
- **Size:** S-M.

Merge order: 8, 9. Stage 9 touches `preview.js`, `store.ts` and `game.js`; stage 8 touches `kart.js`, `physics.js`, `lootbox.js` and tests: disjoint.

### Stage 10: Docs, design-sync, close (dispatcher)

- **Files:** `README.md`, `.claude/VISION.md`, `CHECKPOINT.md` (R-25 stage, R-26 portraits), `PLAN.md` done, `claude-action.log`; `/design-sync` for `ShowcaseStage`, `CharacterTile pending`, `SelectLayout`, `Roster footer` (and the still-pending economy re-sync).
- **Checks:** final Tier 1 + full E2E; secret scan; real-name scan (stage 2's test); push.
- **Size:** S.

### 6.2 Effort [estimate]

Wave 1 ≈ 1 day of agent time, wave 2 ≈ 1.5 days (stage 5 dominates), stage 7 ≈ 1 day, wave 4 ≈ 0.5 day. Add one owner review gate after stage 5's contact sheet: the likeness and caricature calls are the owner's.

---

## 7. Risks and open questions

### 7.1 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Shader warm-up on phones.** 20 to 40 programs; the first stage frame could hitch for seconds. | Fixed light rig (A.4); `compile()` on the title screen; Standard materials on "légers" (≤ 20 programs); progressive portraits. Measure on a real phone at stage 7; the owner's device check is part of acceptance. |
| R2 | **Look divergence.** The stage is ACES/sRGB and the race is legacy linear, so the same kart is richer on the podium than on the track. | Accepted for this task (Q5). The stage-profile colours are authored so the hue matches the race's. A later "race look" task can adopt `withLook` per scene once all race materials are profile-built. |
| R3 | **Memory on iOS.** A resident stage plus a race scene plus the shadow target. | Budgets in 4.2: no shadow map and disposed textures on "légers"; a context-loss handler re-bakes the stage. |
| R4 | **Race readability.** Geometry eyes shimmer at distance on low dpr. | Race-low bakes the face to vertex colours or a 64 px decal; judged on the phone race screenshot (stage 8). |
| R5 | **Likeness.** The template's hair, glasses and faces evoke real people more closely than the game's boxes. Combined with pun names this is sharper satire, and closer to identifiable caricature. | Owner decides per candidate (Q2); powers, lines and the title-screen parody notice stay as DEC-023 requires. |
| R6 | **Server cost.** `race.js makeKart` builds karts headless on the authoritative server. | The `headless` LOD builds no geometry (stage 8 asserts the build time). |
| R7 | **E2E in software GL.** Heavier stage frames slow every spec that passes through select. | Placeholders keep the contract instant. E2E tests the real tier (no webdriver special case); the budgets keep the frame small, and only the specs that need final portraits wait on `data-portrait`. |
| R8 | **Seven extra fabric textures** inflate the GPU footprint if every pilot bakes its own. | `fabric.js` caches by (kind, size); pilots share textures; only colour differs. |

### 7.2 Questions for the owner

Each question changes the plan; each has a recommended answer.

| # | Question | Recommended answer |
|---|---|---|
| Q1 | The template has six politicians the game does not (Philippe, Attal, Glucksmann, Ruffin, Wauquiez, Bertrand). Add them as new candidates under pun names (16 → 22: server `CHAR_IDS`, grades, prices, unlock order, roster validation, stats)? | **No, not in this task.** Use them as technique and prop donors (3.1). New candidates are an economy task of their own. |
| Q2 | For the five same-person candidates, adopt the template's likeness cues (Mélèche's grey swept hair, Le Stylo's navy outfit, Darmalin's riot helmet), or keep the game's own identity (colours, accessories, kepi) with the template's shapes and face rig? | **Keep the game's identity.** Take the hair shapes and face proportions only where the game's look already agrees. Decide case by case on stage 5's contact sheet. |
| Q3 | The "go" launch: play it when "Choisir le circuit →" is pressed, with the stage drawing 1.4 s behind the circuit cards? That extends DEC-042's "turntable only on select and garage". | **Yes**, driving off down the aisle (not into the camera), immediate transition, off under reduced motion. Otherwise drop the launch and keep confetti on selection only. |
| Q4 | Use the new pilots in races too (LOD), or on the stage only? | **In races too.** What you pick is what you race, and the merged LOD lowers race draw calls. |
| Q5 | Keep the race's current colour look (linear, no tone mapping) while the stage uses ACES/sRGB? | **Yes for now**; a race restyle is its own task, and the natural moment to revisit a three upgrade (option b). |
| Q6 | Phones default to "légers". Should the stage on phones get a middle tier (×0.5, 1024 shadow) by default when the GPU allows? | **No.** Keep the binary setting and phones on "légers": the ×0.25 stage tier looks close to the design ([prototype] `tiers-segments.png`). Revisit after real-phone frame times. |
| Q7 | May the stage import `three/examples/jsm/utils/BufferGeometryUtils.js` (r128 ships it), or keep to the "no examples/jsm" line? | **Keep the line**; a 40-line merge in `engine/geo.js` is enough and has no version coupling. |
| Q8 | Should the admin's Workshop edit the new look (hair style and colour, fabric, tint, prop) per candidate, stored in the roster document? | **Not now.** Code data; the admin's suit and kart colours already reach the stage and the tint. A Workshop "Apparence 3D" section later would need roster validation changes (DEC-027). |
| Q9 | Desktop layout: move the button row and the key-cap legend into the left column under the roster, as in the design, or keep the centred row at the bottom? | **Move it on wide screens** (design), keep it at the bottom on phones. |
| Q10 | Persist the portraits between sessions (IndexedDB, keyed by roster version and tier) to skip re-rendering on every visit? | **No.** Progressive rendering in session is fast enough after warm-up, and persistent caches go stale with admin edits. Revisit if real-phone portraits take > 2 s in total. |
| Q11 | The template's stat label "Maniabilité" vs the game's "Tenue de route", and its "tu" vs the game's "vous". | **Keep the game's copy** throughout, which the brief already requires. |

---

## Summary: stages

| Stage | Wave | Title | Owns (files) | Depends on | Size | Key acceptance |
|---|---|---|---|---|---|---|
| 0 | 0 | Baseline and decisions | `.claude/*` | — | S | Tier 1 + E2E green on `f70b355`; select and race GL counts recorded per tier |
| 1 | 1 | Stage look, fabrics, geometry helpers | `stagelook.js`, `fabric.js`, `geo.js` | 0 | M | `withLook` restores state; no shared materials; swatch sheet vs design |
| 2 | 1 | Look specs ×16 | `looks.js` | 0 | M | every id covered; real-name scan passes |
| 3 | 1 | Design-system parts | `packages/ui/src/components/select/*` | 0 | S-M | ui Tier 1 + build; landscape story screenshot |
| 4 | 2 | Hemicycle stage scene | `hemicycle.js` | 1 | M | ≤ 45 draws / 25k triangles high; screenshot vs `01-cs3` |
| 5 | 2 | Pilot builder (4 LODs) | `pilot.js`, `props.js` | 1, 2 | **L** | per-LOD budgets for all 16; contact sheet (owner gate) |
| 6 | 2 | Kart stage profile | `kart.js` | 1 | M | contract pins unchanged; Garage options under both profiles |
| 7 | 3 | Stage integration on select and garage | `preview.js`, `game.js`, `store.ts`, `SelectScreen.tsx`, `GarageScreen.tsx`, `game.css`, e2e | 3–6 | **L** | full E2E; non-overlap at 4 viewports; budgets; visual sheet; portraits ready < 60 s in software GL |
| 8 | 4 | Pilots in the race | `kart.js` race path, `physics.js`, `lootbox.js`, headless tests | 7 | M | race ≤ today + 10%; headless 5 circuits; server build ≤ 5 ms |
| 9 | 4 | Launch, transitions, reduced motion | `preview.js` tail, `store.ts`, `game.js` | 7 | S-M | tracks ≤ 100 ms after click; no camera-in-kart; reduced motion honoured |
| 10 | 5 | Docs, design-sync, close | docs, `/design-sync` | all | S | final Tier 1 + E2E; real-name and secret scans; push |

**Merge order:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.

## Summary: questions for the owner

| # | Question | Recommended answer |
|---|---|---|
| Q1 | Add the six template politicians as new candidates? | No; use them as donors. |
| Q2 | Template likeness or the game's identity for the 5 same-person candidates? | The game's identity with the template's shapes; decide on the contact sheet. |
| Q3 | "Go" launch drawn 1.4 s behind the circuit cards? | Yes, driving down the aisle; off under reduced motion. |
| Q4 | New pilots in races too? | Yes (LOD, merged). |
| Q5 | Keep the race's legacy colour look? | Yes for now. |
| Q6 | A middle tier by default on phones? | No; "légers" stays the phone default. |
| Q7 | Allow `examples/jsm` `BufferGeometryUtils`? | No; own 40-line merge. |
| Q8 | Admin-editable 3D look? | Not now. |
| Q9 | Button row and legend in the left column on desktop? | Yes on wide screens. |
| Q10 | Persist portraits across sessions? | No. |
| Q11 | Template copy ("tu", "Maniabilité")? | Keep the game's copy. |
