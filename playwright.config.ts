import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite for Kart République.
 *
 * This is the regression net for the React port. It is written against the
 * game as it exists today, before the port begins, so that any failure during
 * the port is unambiguously caused by the port rather than by a test written
 * after the fact.
 *
 * Two rules keep it useful across the port:
 *
 * 1. Specs drive the game through the DOM and the keyboard only -- element ids,
 *    visible text, key presses -- never through internal functions. The one
 *    exception is marked and explained in the spec file.
 * 2. The game's element ids are therefore a contract. The React port must keep
 *    rendering the same ids, or this suite stops testing the game and starts
 *    testing the port's choice of markup.
 */
export default defineConfig({
  testDir: './e2e',
  // The game is a WebGL animation loop: a stale expectation can take a moment
  // to settle, but nothing here should ever need more than this.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // A flaky pass is a finding, not a pass: retries would hide a port
  // regression that only shows up sometimes.
  retries: 0,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use the full Chromium build in its new headless mode, rather than
        // the separate chrome-headless-shell binary. Two reasons: it is the
        // browser `playwright install chromium` already provides, so there is
        // nothing further to download, and its WebGL support is the same one a
        // real player gets -- which matters for a game that is nothing but a
        // WebGL canvas.
        channel: 'chromium',
        launchOptions: {
          args: [
            // Three.js needs a WebGL context. Headless Chrome will not fall
            // back to its software rasteriser for WebGL without this, so the
            // game would fail to render at all.
            '--enable-unsafe-swiftshader',
            // The game synthesises its audio through WebAudio on first input.
            // Without this the context stays suspended and the mute toggle
            // cannot be exercised.
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: {
    // The suite runs against a production build, not the dev server. The port
    // changes how the game is packaged, so a bug that only appears once Vite
    // has bundled and minified it is exactly the kind this net should catch.
    command: 'npm run build -w @kart-republique/game && npm run preview -w @kart-republique/game',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
