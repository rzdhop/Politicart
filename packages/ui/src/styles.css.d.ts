// Declaration for the one CSS import the package makes.
//
// TypeScript resolves `import './styles.css'` to `./styles.css.d.ts`, so this
// file is what makes that side-effect import legal - for this build and, once
// copied into dist/ by scripts/copy-css-types.mjs, for consumers too. It is
// scoped to this one file on purpose: a global `declare module '*.css'` shipped
// from a library would silently legalise CSS imports across a consumer's whole
// project.
export {};
