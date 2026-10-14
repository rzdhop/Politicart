// Place the CSS declaration next to the built stylesheet.
//
// dist/index.d.ts keeps the `import './styles.css'` side effect, which honestly
// documents that importing this package applies styling. For a consumer's
// TypeScript to accept it, the declaration has to sit beside the emitted CSS -
// tsc does not emit declarations for .d.ts inputs, so it is copied here.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const pkg = join(dirname(import.meta.dirname), '');
const from = join(pkg, 'src', 'styles.css.d.ts');
const to = join(pkg, 'dist', 'styles.css.d.ts');

if (!existsSync(join(pkg, 'dist', 'styles.css'))) {
  throw new Error('dist/styles.css is missing: the Vite build did not emit the stylesheet.');
}
copyFileSync(from, to);
