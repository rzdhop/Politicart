// @kart-republique/ui -- the Kart Republique design system.
//
// The game's visual language, extracted from the single-file original, as React
// components. Components are added group by group in the stages that follow;
// this entry point re-exports every public component and type.

// The stylesheet is imported here so that the library build collects every
// rule into a single dist/index.css, and so that a consumer gets the whole look
// from one `import '@kart-republique/ui/styles.css'`.
import './styles.css';

/** Package version, exported so a consumer can confirm which build it loaded. */
export const version = '0.1.0';
