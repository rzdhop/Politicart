# Kart République

*Grand Prix de l'Hémicycle* — a satirical 3D kart racer in the browser, starring a cast of fictional French politicians.

Keyboard only. Three laps, five AI opponents, no cohabitation.

## Play

Open `index.html` in any modern browser. No build step, no install: the whole game is in that single file. The only external dependency is Three.js r128, loaded from cdnjs.

To host it, enable GitHub Pages on the `main` branch (root) and the game is served at `https://<user>.github.io/Politicart/`.

## Controls

| Key | Action |
| --- | --- |
| ↑ / Z / W | Accelerate |
| ↓ / S | Brake, reverse |
| ← → / Q D / A D | Steer |
| Space | Drift (release for mini-turbo); in the air, do a trick |
| Ctrl / E | Use item |
| F / Shift | Special power |
| Esc | Pause |
| M | Mute |

## Content

- **11 fictional candidates**, each with stats (speed, acceleration, handling, weight) and a signature satirical power: Grand débat, Grève générale, Rond-point surprise, Zone à faibles émissions, Amendement de dernière minute, Mégaphone, Éléments de langage, Vol d'audience, Mise en examen, Épandage, Temps de parole.
- **14 items** from golden ballot boxes, weighted by race position: 49.3 Turbo, Grève surprise, Dossier Mediapart, Motion de censure, Immunité parlementaire, Sondage truqué, Hélico présidentiel, Remaniement, Plan de relance, BRAV-M, Nuage lacrymogène, Casserolade, Dissolution, Niche fiscale.
- **3 circuits**: L'Élysée (Faubourg Saint-Honoré), Palais Bourbon (quais de Seine), Versailles (jardins du Congrès) — with ramps and tricks, pits, dash panels, chicanes and crossing traffic.
- **Workshop (admin)**: rename candidates, change colours, upload kart liveries and campaign posters. Settings are stored in the browser's `localStorage`.
- Graphics toggle (detailed with shadows / light low-poly), synthesized sound and music via WebAudio.

All characters, parties and scandals are fictional. Any resemblance to existing figures is purely electoral.

## Code map

Everything lives in `index.html`:

| Section | What it holds |
| --- | --- |
| `<style>` | Theme tokens, menus, HUD, workshop |
| `CHARACTERS` | The cast: stats, power, look |
| `ITEMS`, `ITEM_ODDS` | Items and rank-weighted odds |
| `TRACKS` | Spline control points and `features` (ramps, pits, pads, chicanes, crossings) |
| `buildDriver`, `buildKart` | Procedural 3D characters and karts |
| `buildElysee`, `buildBourbon`, `buildVersailles` | Track decor |
| `updateKart` | Physics: acceleration, drift, jumps, walls, pits |
| `aiInput` | AI driving with rubber-banding |
| `useItem`, `usePower` | Items and special powers |
| Workshop, HUD, audio, main loop | End of the script |
