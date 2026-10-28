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
  ChoiceGroup,
  type ChoiceGroupProps,
  type ChoiceOption,
} from './components/controls/ChoiceGroup';
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

// HUD. The live readouts also expose imperative handles -- see handles.ts for
// why, and read that before driving the HUD from a game loop.
export {
  type TextReadoutHandle,
} from './components/hud/handles';
export {
  CenterAnnounce,
  type CenterAnnounceProps,
} from './components/hud/CenterAnnounce';
export {
  DriftGauge,
  type DriftGaugeHandle,
  type DriftGaugeProps,
} from './components/hud/DriftGauge';
export {
  HudCorner,
  type HudCornerPosition,
  type HudCornerProps,
} from './components/hud/HudCorner';
export { HudHint, type HudHintProps } from './components/hud/HudHint';
export { HudLayer, type HudLayerProps } from './components/hud/HudLayer';
export {
  ItemSlot,
  type ItemSlotHandle,
  type ItemSlotProps,
} from './components/hud/ItemSlot';
export { LapCounter, type LapCounterProps } from './components/hud/LapCounter';
export {
  MinimapFrame,
  type MinimapFrameProps,
} from './components/hud/MinimapFrame';
export {
  PositionReadout,
  type PositionReadoutHandle,
  type PositionReadoutProps,
} from './components/hud/PositionReadout';
export {
  PowerGauge,
  type PowerGaugeHandle,
  type PowerGaugeProps,
} from './components/hud/PowerGauge';
export { RaceTimer, type RaceTimerProps } from './components/hud/RaceTimer';
export {
  SpeedReadout,
  type SpeedReadoutHandle,
  type SpeedReadoutProps,
} from './components/hud/SpeedReadout';
export { Toast, type ToastHandle, type ToastProps } from './components/hud/Toast';
export {
  WrongWay,
  type WrongWayHandle,
  type WrongWayProps,
} from './components/hud/WrongWay';

// Results.
export {
  ResultsTable,
  type ResultsRow,
  type ResultsTableProps,
} from './components/results/ResultsTable';

// Workshop (admin). Every one of these except AdPreview must be rendered
// inside an AdminGrid -- the stylesheet scopes them to `.admin`.
export { AdPreview, type AdPreviewProps } from './components/workshop/AdPreview';
export { AdminCard, type AdminCardProps } from './components/workshop/AdminCard';
export { AdminGrid, type AdminGridProps } from './components/workshop/AdminGrid';
export {
  ColorSwatch,
  type ColorSwatchProps,
} from './components/workshop/ColorSwatch';
export { ColorsRow, type ColorsRowProps } from './components/workshop/ColorsRow';
export { Field, type FieldProps } from './components/workshop/Field';
export { FileInput, type FileInputProps } from './components/workshop/FileInput';
export {
  LiveryThumb,
  type LiveryThumbProps,
} from './components/workshop/LiveryThumb';
export { TextInput, type TextInputProps } from './components/workshop/TextInput';

// Misc.
export { NoteBanner, type NoteBannerProps } from './components/misc/NoteBanner';

// Economy: grades, politicoins, the shop and the Politibox reveal. The grade
// motion is fx.css, keyed on the `grade-<g>` classes these set.
export { CoinCount, type CoinCountProps } from './components/economy/CoinCount';
export {
  GRADES,
  type Grade,
  GradeBadge,
  type GradeBadgeProps,
} from './components/economy/GradeBadge';
export {
  KartCard,
  type KartCardProps,
  type KartPart,
  type KartTrail,
} from './components/economy/KartCard';
export {
  RevealStage,
  type RevealPhase,
  type RevealStageProps,
} from './components/economy/RevealStage';
export { ShopCard, type ShopCardProps } from './components/economy/ShopCard';
export { type Tab, Tabs, type TabsProps } from './components/economy/Tabs';

/** Package version, exported so a consumer can confirm which build it loaded. */
export const version = '0.1.0';
