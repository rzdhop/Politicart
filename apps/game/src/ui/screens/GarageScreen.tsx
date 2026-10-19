import type { ChangeEvent } from 'react';
import {
  AdminGrid,
  Button,
  ChoiceGroup,
  ColorSwatch,
  ColorsRow,
  Disclaimer,
  Field,
  Heading,
  Panel,
  Row,
  Screen,
  SelectLayout,
  Showcase,
  TextInput,
} from '@kart-republique/ui';

import { CHARACTERS } from '../../engine/data.js';
import { myStyle } from '../../engine/garage.js';
import { actions, type UiSnapshot } from '../store';
import type { Character } from '../types';

/** A full kart style, as kartstyle.js defines it. */
interface KartStyle {
  body: string;
  accent: string;
  wheels: string;
  spoiler: string;
  pods: boolean;
  number: number | null;
  sticker: string;
}

const WHEELS = [['classic', 'Classiques'], ['chrome', 'Chromées'], ['offroad', 'Tout-terrain'], ['gold', 'Dorées']] as const;
const SPOILERS = [['none', 'Aucun'], ['standard', 'Standard'], ['wing', 'Grand aileron']] as const;
const STICKERS = [['none', 'Aucun'], ['tricolore', 'Tricolore'], ['rosette', 'Cocarde'], ['etoile', 'Étoile'], ['marianne', 'Marianne']] as const;
const PODS = [['on', 'Oui'], ['off', 'Non']] as const;

/** ChoiceGroup options from [value, label] pairs, each chip's id being the prefix plus its value. */
const chips = <V extends string>(idPrefix: string, pairs: readonly (readonly [V, string])[]) =>
  pairs.map(([value, label]) => ({ value, label, id: idPrefix + value }));

/** One column: the workshop's input styling, without its card grid. */
const ONE_COLUMN = { gridTemplateColumns: '1fr', width: '100%' } as const;
/**
 * The form is taller than the roster, so on a short window the screen must
 * scroll rather than squeeze the layout under the button row: the layout keeps
 * its height, and `safe center` falls back to the top when it overflows.
 */
const SCREEN = { justifyContent: 'safe center' } as const;
const LAYOUT = { flex: '0 0 auto' } as const;
const PANEL = { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 } as const;

function onNumber(e: ChangeEvent<HTMLInputElement>) {
  const raw = e.currentTarget.value.trim();
  if (raw === '') actions.setGarage('number', null);
  else if (/^\d{1,2}$/.test(raw)) actions.setGarage('number', Number(raw));
}

/**
 * The Garage: the player styles their own kart. Every change applies at once
 * and shows on the turntable; whatever the player leaves alone stays the
 * chosen candidate's default, so the same edits follow them to any candidate.
 */
export function GarageScreen({ ui }: { ui: UiSnapshot }) {
  const characters = CHARACTERS as unknown as Character[];
  const chosen = characters[ui.charIdx] ?? characters[0]!;
  const style = myStyle(chosen) as KartStyle;
  return (
    <Screen id="s-garage" hidden={ui.state !== 'garage'} style={SCREEN}>
      <Heading size="screen">Garage</Heading>
      <SelectLayout style={LAYOUT}>
        <Panel style={PANEL} key={ui.garageVersion}>
          <AdminGrid style={ONE_COLUMN}><ColorsRow>
            <Field label="Carrosserie"><ColorSwatch id="g-body" value={style.body} onChange={e => actions.setGarage('body', e.currentTarget.value)} /></Field>
            <Field label="Accents"><ColorSwatch id="g-accent" value={style.accent} onChange={e => actions.setGarage('accent', e.currentTarget.value)} /></Field>
            <Field label="Numéro (0-99)">
              <TextInput id="g-number" inputMode="numeric" pattern="[0-9]*" maxLength={2} size={4} placeholder="aucun" defaultValue={style.number ?? ''} onChange={onNumber} />
            </Field>
          </ColorsRow></AdminGrid>
          <ChoiceGroup label="Roues" options={chips('g-wheels-', WHEELS)} value={style.wheels} onChange={v => actions.setGarage('wheels', v)} />
          <ChoiceGroup label="Aileron" options={chips('g-spoiler-', SPOILERS)} value={style.spoiler} onChange={v => actions.setGarage('spoiler', v)} />
          <ChoiceGroup label="Pontons latéraux" options={chips('g-pods-', PODS)} value={style.pods ? 'on' : 'off'} onChange={v => actions.setGarage('pods', v === 'on')} />
          <ChoiceGroup label="Autocollant" options={chips('g-sticker-', STICKERS)} value={style.sticker} onChange={v => actions.setGarage('sticker', v)} />
          <Disclaimer>
            Ce que vous ne changez pas reste le réglage du candidat ou de la candidate. Vos choix suivent n’importe quel candidat et sont gardés dans ce navigateur. Les roues et l’aileron ne changent que le kart classique.
          </Disclaimer>
        </Panel>
        <Showcase id="g-showcase" name={chosen.name} title="Votre kart" quote="" />
      </SelectLayout>
      <Row>
        <Button id="b-garage-reset" variant="ghost" onClick={actions.resetGarage}>Par défaut</Button>
        <Button id="b-garage-back" onClick={actions.toSelect}>Retour au casting</Button>
      </Row>
    </Screen>
  );
}
