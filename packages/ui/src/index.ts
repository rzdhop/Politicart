// @kart-republique/ui -- the Kart Republique design system.
//
// The game's visual language, extracted from the single-file original, as React
// components. Components are added group by group in the stages that follow;
// this entry point re-exports every public component and type.

// The stylesheet is imported here so that the library build collects every
// rule into a single dist/index.css, and so that a consumer gets the whole look
// from one `import '@kart-republique/ui/styles.css'`.
import './styles.css';

export { cx } from './cx';

// Foundation: the layout primitives every screen is built from.
export { Bar, type BarProps } from './components/foundation/Bar';
export { Panel, type PanelProps } from './components/foundation/Panel';
export { Row, type RowProps } from './components/foundation/Row';
export { Screen, type ScreenProps } from './components/foundation/Screen';

// Typography.
export { Disclaimer, type DisclaimerProps } from './components/typography/Disclaimer';
export { GameTitle, type GameTitleProps } from './components/typography/GameTitle';
export {
  Heading,
  type HeadingProps,
  type HeadingSize,
} from './components/typography/Heading';
export { Subtitle, type SubtitleProps } from './components/typography/Subtitle';

// Brand.
export { Tricolore, type TricoloreProps } from './components/brand/Tricolore';

// Controls.
export { Button, type ButtonProps, type ButtonVariant } from './components/controls/Button';
export {
  ControlsGrid,
  type ControlsGridProps,
} from './components/controls/ControlsGrid';
export { KeyCap, type KeyCapProps } from './components/controls/KeyCap';

// Character select.
export {
  CharacterTile,
  type CharacterTileProps,
} from './components/select/CharacterTile';
export { PowerBox, type PowerBoxProps } from './components/select/PowerBox';
export { Roster, type RosterProps } from './components/select/Roster';
export {
  SelectLayout,
  type SelectLayoutProps,
} from './components/select/SelectLayout';
export { Showcase, type ShowcaseProps } from './components/select/Showcase';
export { StatBar, type StatBarProps } from './components/select/StatBar';
export { StatGrid, type StatGridProps } from './components/select/StatGrid';

// Track select.
export { CardGrid, type CardGridProps } from './components/tracks/CardGrid';
export { TrackCard, type TrackCardProps } from './components/tracks/TrackCard';

/** Package version, exported so a consumer can confirm which build it loaded. */
export const version = '0.1.0';
