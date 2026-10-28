import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  CAST,
  placeholderPortrait,
  PORTRAIT,
  SHOP_ITEMS,
  StagePreview,
  STAT_LABELS,
} from '../../stories/fixtures';
import { Tricolore } from '../brand/Tricolore';
import { Button } from '../controls/Button';
import { ControlsGrid } from '../controls/ControlsGrid';
import { KeyCap } from '../controls/KeyCap';
import { Row } from '../foundation/Row';
import { Screen } from '../foundation/Screen';
import { Disclaimer } from '../typography/Disclaimer';
import { Heading } from '../typography/Heading';
import { CharacterTile } from './CharacterTile';
import { PowerBox } from './PowerBox';
import { Roster } from './Roster';
import { SelectLayout } from './SelectLayout';
import { Showcase } from './Showcase';
import { ShowcaseStage } from './ShowcaseStage';
import { StatBar } from './StatBar';
import { StatGrid } from './StatGrid';

const meta = {
  title: 'Select/SelectLayout',
  component: SelectLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The two-column character-select frame: roster left, showcase right. Below 760px it collapses to one column and the showcase moves above the roster, so the player can see who they have chosen without scrolling. Expects its two children in roster-then-showcase order — the reordering is done in CSS. A phone held sideways (`max-height: 520px`, landscape) keeps two columns and pins the showcase (`position: sticky; top: 0`, at most `100dvh`) while the roster scrolls beside it.',
      },
    },
  },
} satisfies Meta<typeof SelectLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const chosen = CAST[0]!;

export const Default: Story = {
  args: {
    style: { padding: 24 },
    children: (
      <>
        <Roster>
          {Array.from({ length: 11 }, (_, i) => {
            const c = CAST[i % CAST.length]!;
            return <CharacterTile key={i} name={c.name} image={PORTRAIT} selected={i === 0} />;
          })}
        </Roster>
        <Showcase name={chosen.name} title={chosen.title} quote={chosen.quote}>
          <StatGrid>
            {STAT_LABELS.map(([k, label]) => (
              <StatBar key={k} label={label} value={chosen.stats[k]} />
            ))}
          </StatGrid>
          <PowerBox name={`Pouvoir : ${chosen.power.name}`} hint="(touche F)">
            {chosen.power.desc}
          </PowerBox>
        </Showcase>
      </>
    ),
  },
};

/** Six fictional candidates' names, cycled over the sixteen tiles. */
const NAMES = [
  ...CAST.map((c) => c.name),
  ...SHOP_ITEMS.map((i) => i.title).filter((n) => !CAST.some((c) => c.name === n)),
];

/** Kart colours for the placeholder portraits. */
const COLOURS = ['#2f55c7', '#e63946', '#3a9d5d', '#f2c14e', '#7b4bd6', '#1a2a5e'];

/**
 * The 3D character-select screen, every part in place: the tricolore and
 * heading; sixteen tiles, the first six with their final portraits and the
 * rest still pending under the sweep; the button row, keyboard legend and
 * podium line in the roster's footer; and the showcase with its stage band
 * above the name, where the game draws the podium (a still stand-in here).
 *
 * View it at a short landscape size (844 x 390) to see the showcase stay
 * pinned while the roster scrolls beside it.
 */
export const WithStage: Story = {
  args: { children: null },
  render: () => (
    <Screen style={{ justifyContent: 'flex-start' }}>
      <Tricolore />
      <Heading size="screen">Choisissez votre candidat·e</Heading>
      <SelectLayout>
        <Roster
          footer={
            <>
              <Row>
                <Button variant="ghost">Retour</Button>
                <Button variant="ghost">Garage</Button>
                <Button>Choisir le circuit →</Button>
              </Row>
              <ControlsGrid>
                <div>
                  <KeyCap>←</KeyCap> <KeyCap>→</KeyCap> <KeyCap>↑</KeyCap> <KeyCap>↓</KeyCap>{' '}
                  choisir · <KeyCap>Entrée</KeyCap> valider
                </div>
              </ControlsGrid>
              <Disclaimer>Glissez sur la scène pour faire pivoter le podium.</Disclaimer>
            </>
          }
        >
          {Array.from({ length: 16 }, (_, i) => {
            const name = NAMES[i % NAMES.length]!;
            const done = i < 6;
            return (
              <CharacterTile
                key={i}
                name={name}
                image={done ? PORTRAIT : placeholderPortrait(name, COLOURS[i % COLOURS.length]!)}
                pending={!done}
                selected={i === 0}
              />
            );
          })}
        </Roster>
        <Showcase
          name={chosen.name}
          title={chosen.title}
          quote={chosen.quote}
          stage={
            <ShowcaseStage aria-label="Le podium : glissez pour le faire pivoter">
              <StagePreview />
            </ShowcaseStage>
          }
        >
          <StatGrid>
            {STAT_LABELS.map(([k, label]) => (
              <StatBar key={k} label={label} value={chosen.stats[k]} />
            ))}
          </StatGrid>
          <PowerBox name={`Pouvoir : ${chosen.power.name}`} hint="(touche F)">
            {chosen.power.desc}
          </PowerBox>
        </Showcase>
      </SelectLayout>
    </Screen>
  ),
};
