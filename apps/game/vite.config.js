import { defineConfig } from 'vite';

// The game, as a Vite app.
//
// Before this it was a single HTML file with an inline script and Three.js from
// a CDN, which needed no build at all. The build step is the accepted cost of
// the React port (see .claude/DECISIONS.md DEC-003); stage 14 adds the GitHub
// Actions workflow that publishes the output.
export default defineConfig({
  // Relative asset paths, so the same build works both from the preview server
  // at / and from GitHub Pages under /Politicart/.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Three.js r128 is a large single dependency; the default 500 kB warning
    // would fire on every build and teach us to ignore it.
    chunkSizeWarningLimit: 1200,
  },
  // Both servers are pinned to 127.0.0.1 with strictPort. Vite otherwise binds
  // to `localhost`, which resolves to ::1 on this machine, so anything waiting
  // on 127.0.0.1 -- the Playwright suite, for one -- is refused. strictPort
  // makes a port clash fail loudly instead of silently moving the server
  // somewhere the tests are not looking.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  // Engine unit tests. Node environment on purpose: the modules under test
  // (the event queue, the input seam) have no DOM, and keeping them that way
  // is the point.
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
