// Side-effect CSS imports carry no values; this tells TypeScript they are a
// legitimate module shape rather than a missing file. The library ships one
// such import (src/index.ts -> styles.css), which the Vite build turns into
// dist/index.css.
declare module '*.css';
