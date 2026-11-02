import type { Meta, StoryObj } from '@storybook/react-vite';

import { KeyCap } from '../controls/KeyCap';
import { CoinCount } from '../economy/CoinCount';
import { Screen } from '../foundation/Screen';
import { ShowcaseStage } from '../select/ShowcaseStage';
import { Disclaimer } from '../typography/Disclaimer';
import { StagePreview } from '../../stories/fixtures';
import { HeroButton } from './HeroButton';
import { MenuCard } from './MenuCard';
import { MenuGlyph } from './MenuGlyph';
import { SettingsChip } from './SettingsChip';
import { Tagline } from './Tagline';
import { TitleLayout } from './TitleLayout';
import { TitleLogo } from './TitleLogo';

const fr = (n: number) => n.toLocaleString('fr-FR');

const meta = {
  title: 'Menu/TitleLayout',
  component: TitleLayout,
  decorators: [(Story) => <Screen style={{ position: 'relative', minHeight: 760 }}><Story /></Screen>],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The title screen’s composition over the live 3D scene. Wide (from 900px, and a phone held sideways): the brand and the calls to action in a left column over a night scrim, the stage band (where the scene frames the player’s kart) filling the right column, the settings strip across the top right, the fine print under everything. Upright on a phone: one column — strip, brand, stage band, calls to action, fine print — inside the 16px gutters. The slots arrive in a staggered rise; nothing moves under `prefers-reduced-motion`.',
      },
    },
  },
  args: {
    corner: (
      <div className="settings-strip" role="group" aria-label="Réglages">
        <SettingsChip icon={<MenuGlyph name="graphics" />} active><span className="chip-key">Graphismes : </span>détaillés (ombres)</SettingsChip>
        <SettingsChip icon={<MenuGlyph name="sound" />} active>Son : activé</SettingsChip>
        <SettingsChip compact icon={<MenuGlyph name="help" />}>Commandes</SettingsChip>
      </div>
    ),
    brand: (
      <>
        <TitleLogo title="POLITIKART" subtitle="Grand Prix de l’Hémicycle" />
        <Tagline lines={['Trois tours, cinq adversaires, aucune cohabitation.']} />
      </>
    ),
    stage: <ShowcaseStage aria-label="Votre kart sur le podium"><StagePreview /></ShowcaseStage>,
    stageCaption: <>Au volant : <b>Emmanuel Macaron</b></>,
    actions: (
      <>
        <HeroButton icon={<MenuGlyph name="play" />} hint={<>ou appuyez sur <KeyCap>Entrée</KeyCap></>}>Jouer</HeroButton>
        <div className="menu-cards">
          <MenuCard icon={<MenuGlyph name="multi" />} label="Multijoueur" sub="Bleu contre Rouge" />
          <MenuCard tone="gold" icon={<MenuGlyph name="shop" />} label="Boutique" sub={<CoinCount size="sm" value={1250} format={fr} />} />
          <MenuCard tone="red" icon={<MenuGlyph name="account" />} label="Compte" sub="Marianne · niv. 4" badge="✉ 1" badgeLabel="1 demande d’ami" />
        </div>
      </>
    ),
    footer: <Disclaimer>Parodie : les candidat·es sont des caricatures, à un jeu de mots près, de personnalités politiques bien réelles.</Disclaimer>,
  },
} satisfies Meta<typeof TitleLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A static build with no game server: Jouer alone, no stage band. */
export const Minimal: Story = {
  args: { stage: undefined, stageCaption: undefined, actions: <HeroButton icon={<MenuGlyph name="play" />}>Jouer</HeroButton> },
};
