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
      'components/select/SelectLayout.d.ts',
      'components/select/Roster.d.ts',
      'components/select/CharacterTile.d.ts',
      'components/select/Showcase.d.ts',
      'components/select/StatGrid.d.ts',
      'components/select/StatBar.d.ts',
      'components/select/PowerBox.d.ts',
      'components/tracks/CardGrid.d.ts',
      'components/tracks/TrackCard.d.ts',
      'components/hud/HudLayer.d.ts',
      'components/hud/HudCorner.d.ts',
      'components/hud/PositionReadout.d.ts',
      'components/hud/LapCounter.d.ts',
      'components/hud/RaceTimer.d.ts',
      'components/hud/MinimapFrame.d.ts',
      'components/hud/ItemSlot.d.ts',
      'components/hud/PowerGauge.d.ts',
      'components/hud/HudHint.d.ts',
      'components/hud/SpeedReadout.d.ts',
      'components/hud/DriftGauge.d.ts',
      'components/hud/CenterAnnounce.d.ts',
      'components/hud/Toast.d.ts',
      'components/hud/WrongWay.d.ts',
      'components/results/ResultsTable.d.ts',
      'components/workshop/AdminGrid.d.ts',
      'components/workshop/AdminCard.d.ts',
      'components/workshop/Field.d.ts',
      'components/workshop/TextInput.d.ts',
      'components/workshop/ColorSwatch.d.ts',
      'components/workshop/FileInput.d.ts',
      'components/workshop/ColorsRow.d.ts',
      'components/workshop/LiveryThumb.d.ts',
      'components/workshop/AdPreview.d.ts',
      'components/misc/NoteBanner.d.ts',
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
      'SelectLayoutProps',
      'RosterProps',
      'CharacterTileProps',
      'ShowcaseProps',
      'StatGridProps',
      'StatBarProps',
      'PowerBoxProps',
      'CardGridProps',
      'TrackCardProps',
      'HudLayerProps',
      'HudCornerProps',
      'PositionReadoutProps',
      'LapCounterProps',
      'RaceTimerProps',
      'MinimapFrameProps',
      'ItemSlotProps',
      'PowerGaugeProps',
      'HudHintProps',
      'SpeedReadoutProps',
      'DriftGaugeProps',
      'CenterAnnounceProps',
      'ToastProps',
      'WrongWayProps',
      'ResultsTableProps',
      'AdminGridProps',
      'AdminCardProps',
      'FieldProps',
      'TextInputProps',
      'ColorSwatchProps',
      'FileInputProps',
      'ColorsRowProps',
      'LiveryThumbProps',
      'AdPreviewProps',
      'NoteBannerProps',
    ]) {
      expect(types, `${name} is not exported`).toContain(name);
    }
  });

  it('exports an imperative handle for every live HUD readout', () => {
    // Stage 13 drives these from the frame loop; without the handles the HUD
    // would have to go through React state at 60fps.
    const types = readFileSync(join(dist, 'index.d.ts'), 'utf8');
    for (const name of [
      'TextReadoutHandle',
      'PositionReadoutHandle',
      'SpeedReadoutHandle',
      'DriftGaugeHandle',
      'PowerGaugeHandle',
      'ItemSlotHandle',
      'ToastHandle',
      'WrongWayHandle',
    ]) {
      expect(types, `${name} is not exported`).toContain(name);
    }
  });

  it('embeds the two self-hosted families as real woff2 data', () => {
    // Library mode inlines CSS assets, so the fonts travel inside styles.css.
    // Decode them: a truncated or wrongly-encoded payload would still look
    // like a plausible data URI but render nothing.
    const css = readFileSync(join(dist, 'styles.css'), 'utf8');
    const payloads = [...css.matchAll(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)].map(
      (m) => m[1] as string,
    );
    expect(payloads).toHaveLength(4);
    for (const payload of payloads) {
      const bytes = Buffer.from(payload, 'base64');
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    }
    // One face per family-subset pair: no font embedded more than once.
    expect(new Set(payloads).size).toBe(4);
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
