import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What the published package promises a consumer.
 *
 * These assertions are about the build output rather than the source, so they
 * skip when `dist/` is absent (a plain `vitest` run on a clean checkout). After
 * `npm run build` they must hold: the game app in `apps/game` is the first
 * consumer, and the design-sync converter reads these same files.
 */

const dist = join(import.meta.dirname, '..', 'dist');
const built = existsSync(join(dist, 'index.d.ts'));

describe.skipIf(!built)('published package contract', () => {
  it('emits both module formats, their types and the stylesheet', () => {
    for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'styles.css']) {
      expect(existsSync(join(dist, file)), `dist/${file} is missing`).toBe(true);
    }
  });

  it('ships the declaration that makes its own CSS import resolvable', () => {
    // Without this, a consumer's `import '@kart-republique/ui'` fails to
    // typecheck on the package's internal side-effect import.
    const types = readFileSync(join(dist, 'index.d.ts'), 'utf8');
    expect(types).toContain("import './styles.css'");
    expect(existsSync(join(dist, 'styles.css.d.ts'))).toBe(true);
  });

  it('does not legalise CSS imports globally for consumers', () => {
    // A wildcard module declaration shipped from a library would apply to the
    // consumer's whole project, not just this package. Strip comments before
    // checking, so the note explaining this choice is not mistaken for it.
    const declaration = readFileSync(join(dist, 'styles.css.d.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(declaration).not.toMatch(/declare\s+module/);
  });

  it('keeps React out of the bundle', () => {
    const esm = readFileSync(join(dist, 'index.js'), 'utf8');
    // React is a peer dependency: bundling it would risk two copies in the
    // consuming app and break hooks.
    expect(esm).toMatch(/from\s*"react/);
    expect(esm).not.toContain('createRoot');
  });

  it('emits one declaration file per component', () => {
    for (const path of [
      'components/foundation/Screen.d.ts',
      'components/foundation/Panel.d.ts',
      'components/foundation/Row.d.ts',
      'components/foundation/Bar.d.ts',
      'components/typography/GameTitle.d.ts',
      'components/typography/Subtitle.d.ts',
      'components/typography/Heading.d.ts',
      'components/typography/Disclaimer.d.ts',
      'components/brand/Tricolore.d.ts',
      'components/controls/Button.d.ts',
      'components/controls/ControlsGrid.d.ts',
      'components/controls/KeyCap.d.ts',
    ]) {
      expect(existsSync(join(dist, path)), `dist/${path} is missing`).toBe(true);
    }
  });

  it('names every component prop type <Component>Props', () => {
    // The design-sync converter reads `<Name>Props` as the API contract it
    // codes against, so the naming is a contract and not a style choice.
    const types = readFileSync(join(dist, 'index.d.ts'), 'utf8');
    for (const name of [
      'ScreenProps',
      'PanelProps',
      'RowProps',
      'BarProps',
      'GameTitleProps',
      'SubtitleProps',
      'HeadingProps',
      'DisclaimerProps',
      'TricoloreProps',
      'ButtonProps',
      'ControlsGridProps',
      'KeyCapProps',
    ]) {
      expect(types, `${name} is not exported`).toContain(name);
    }
  });

  it('carries the game stylesheet, tokens included', () => {
    const css = readFileSync(join(dist, 'styles.css'), 'utf8');
    expect(css).toContain('--gold:#f2c14e');
    expect(css).toContain('.btn');
    expect(css).toContain('.hud');
    // And no ID selectors: those cannot ship from a component library.
    expect(css).not.toMatch(/#[a-z-]+\{/);
  });
});
