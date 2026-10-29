import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The game, as a Vite app.
//
// Before this it was a single HTML file with an inline script and Three.js from
// a CDN, which needed no build at all. The build step is the accepted cost of
// the React port (see .claude/DECISIONS.md DEC-003); stage 14 adds the GitHub
// Actions workflow that publishes the output.
//
// The output is split into chunks (DEC-055) so a returning player downloads
// only what changed and a first visit paints the title before the heavy
// engine is parsed:
//   three          Three.js r128, the largest and the most stable dependency
//   react          React and ReactDOM
//   engine-race    the engine the game needs from the first frame: the race,
//                  the karts and their pilots (kart.js builds the race pilot
//                  from pilot.js, so the pilot modules sit here, not with the
//                  stage), the state, the network, the accounts
//   engine-stage   the select stage alone (preview.js and the hemicycle),
//                  loaded on demand through engine/stagegate.js; its drag
//                  input (stageinput.js) stays with the engine, the screens
//                  bind it before the stage is loaded
//   engine-box     the Politibox opening (lootbox.js), loaded on demand
//                  through engine/boxgate.js
//   screens-admin  the Workshop, the dashboard and the god console, which
//                  only the admin's session renders (React.lazy in ui/App.tsx)
// Everything else (the UI, the design system, game.js) is the entry chunk.
// The engine's foundation (state.js, primitives.js, util.js...) stays with the
// race rather than the entry so no two static chunks import each other: a
// chunk cycle would evaluate a module before the bindings its top-level code
// reads exist.
//
// Vite 8 bundles with rolldown, whose Rollup-style `manualChunks` also sweeps a
// captured module's dependencies into its group (Three.js ended up in the
// Politibox chunk), so the groups are written in rolldown's own
// `codeSplitting` form with that recursion off. No two static chunks import
// each other (checked by listing each chunk's imports), so the plain ESM
// evaluation order is enough and `strictExecutionOrder`, which would wrap
// every module in a lazy initialiser, is left off.
const codeSplitting = {
  includeDependenciesRecursively: false,
  groups: [
    { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 10 },
    { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
    { name: 'engine-stage', test: /[\\/]src[\\/]engine[\\/](preview|hemicycle)\.js$/, priority: 5 },
    { name: 'engine-box', test: /[\\/]src[\\/]engine[\\/]lootbox\.js$/, priority: 5 },
    { name: 'screens-admin', test: /[\\/]src[\\/]ui[\\/](screens[\\/]AdminScreen|screens[\\/]DashboardScreen|GodConsole)\.tsx$/, priority: 5 },
    { name: 'engine-race', test: /[\\/]src[\\/]engine[\\/]/, priority: 1 },
  ],
};

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the same build works both from the preview server
  // at / and from GitHub Pages under /Politicart/.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The maps are written but never referenced from the chunks: a browser
    // only fetches one when the developer tools ask for it.
    sourcemap: 'hidden',
    // Three.js r128 is a large single dependency; the default 500 kB warning
    // would fire on every build and teach us to ignore it.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: { output: { codeSplitting } },
  },
  // Both servers are pinned to 127.0.0.1 with strictPort. Vite otherwise binds
  // to `localhost`, which resolves to ::1 on this machine, so anything waiting
  // on 127.0.0.1 -- the Playwright suite, for one -- is refused. strictPort
  // makes a port clash fail loudly instead of silently moving the server
  // somewhere the tests are not looking.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  // Unit tests. Node environment by default, on purpose: the engine modules
  // under test have no DOM and keeping them that way is the point. The UI
  // tests opt into jsdom per file with a `@vitest-environment jsdom` docblock.
  test: { environment: 'node', include: ['src/**/*.test.{js,ts,tsx}'] },
});
