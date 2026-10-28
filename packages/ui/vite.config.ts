import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Library build: one ES bundle plus one CJS bundle, with all component CSS
// collected into a single dist/styles.css. React stays external so the
// consuming app (and the design-sync bundle) supplies exactly one copy of it.
//
// Note on fonts: library mode always inlines assets referenced from CSS, since
// a library's stylesheet cannot know the consumer's base path. assetsInlineLimit
// has no effect here, so the four woff2 subsets are embedded in styles.css.
// That is the outcome this system wants anyway -- see src/styles/fonts.css.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'PolitikartUI',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      cssFileName: 'styles',
    },
    sourcemap: true,
    // Pin the CSS target. Left to its default, the minifier modernises the
    // game's `@media (max-width:600px)` into range syntax -- `(width<=600px)`
    // -- which older browsers do not understand, so the HUD would silently
    // stop shrinking on them. The game's own CSS makes no such demand, and the
    // port must not quietly raise the baseline.
    cssTarget: ['chrome100', 'edge100', 'firefox100', 'safari15'],
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
