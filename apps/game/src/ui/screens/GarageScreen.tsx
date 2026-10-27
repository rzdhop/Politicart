import type { ChangeEvent } from 'react';
import {
  AdminGrid,
  Button,
  ChoiceGroup,
  type ChoiceOption,
  ColorSwatch,
  ColorsRow,
  Disclaimer,
  Field,
  GradeBadge,
  Heading,
  Panel,
  Row,
  Screen,
  SelectLayout,
  Showcase,
  TextInput,
} from '@kart-republique/ui';

import { ownsPart, ownsTrail, PART_GRADE, TRAIL_GRADE } from '../../engine/catalog.js';
import { CHARACTERS } from '../../engine/data.js';
import { myStyle } from '../../engine/garage.js';
import { chips, GRADE_LABELS, parseRaceNumber, PART_CHOICES, PODS, TRAILS, type PartCategory } from '../kartChoices';
import { actions, ownedOf, type Grade, type Owned, type UiSnapshot } from '../store';
import type { Character, KartStyle } from '../types';

/** One column: the workshop's input styling, without its card grid. */
const ONE_COLUMN = { gridTemplateColumns: '1fr', width: '100%' } as const;
/**
 * The form is taller than the roster, so on a short window the screen must
 * scroll rather than squeeze the layout under the button row: the layout keeps
 * its height (the screen's safe centring then starts it at the top).
 */
const LAYOUT = { flex: '0 0 auto' } as const;

const PANEL = { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 } as const;
const NOTE = { marginTop: -6 } as const;

const GRADES = PART_GRADE as Record<string, Record<string, Grade>>;
const TRAIL_GRADES = TRAIL_GRADE as Record<string, Grade>;

/** The Garage's groups in display order: the catalogue's categories, their French captions as the Garage names them. */
const GROUPS: readonly [PartCategory, string][] = [
  ['wheels', 'Roues'], ['spoiler', 'Aileron'], ['sticker', 'Autocollant'],
  ['exhaust', 'Échappement'], ['underglow', 'Néons'], ['mast', 'Mât'], ['nose', 'Nez'], ['skin', 'Carrosserie'],
];

function onNumber(e: ChangeEvent<HTMLInputElement>) {
  const n = parseRaceNumber(e.currentTarget.value);
  if (n !== undefined) actions.setGarage('number', n);
}

/**
 * The lock of an option the player does not own (DEC-035): the chip is
 * disabled and carries the option's grade as a badge, and a tap on the badge
 * opens the Boutique -- on the parts for a part, on the Politibox for a
 * trail, since trails come from nowhere else. Returned empty when the player
 * owns the option, and for every option without an economy (`owned` null).
 */
function lock(owned: Owned | null, id: string, grade: Grade, mine: boolean, tab: 'parts' | 'box'): Pick<ChoiceOption<string>, 'disabled' | 'badge'> {
  if (owned === null || mine) return {};
  return {
    disabled: true,
    badge: (
      <span id={id} role="button" tabIndex={0} onClick={() => actions.shopFromGarage(tab)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actions.shopFromGarage(tab); } }}>
        <GradeBadge grade={grade} label={GRADE_LABELS[grade]} size="sm" />
      </span>
    ),
  };
}

/** The chips of part `category`, each locked unless the player owns it. */
function partChips(owned: Owned | null, category: PartCategory): ChoiceOption<string>[] {
  return chips('g-' + category + '-', PART_CHOICES[category].options).map(o => ({
    ...o, ...lock(owned, 'g-buy-' + category + '-' + o.value, GRADES[category]![o.value]!, ownsPart(owned, category, o.value), 'parts'),
  }));
}

/** The trail chips, each locked unless the player won it in a Politibox. */
function trailChips(owned: Owned | null): ChoiceOption<string>[] {
  return chips('g-trail-', TRAILS).map(o => ({
    ...o, ...lock(owned, 'g-buy-trail-' + o.value, TRAIL_GRADES[o.value]!, ownsTrail(owned, o.value), 'box'),
  }));
}

/**
 * The Garage: the player styles their own kart. Every change applies at once
 * and shows on the turntable; whatever the player leaves alone stays the
 * chosen candidate's default, so the same edits follow them to any candidate.
 * Where a game server runs the economy, an option the player does not own is
 * locked behind its grade badge, which leads to the Boutique; the pressed chip
 * is read from myStyle(), which already drops unowned edits, so a stale edit
 * from the static build shows as the candidate's default here as in a race.
 */
export function GarageScreen({ ui }: { ui: UiSnapshot }) {
  const characters = CHARACTERS as unknown as Character[];
  const chosen = characters[ui.charIdx] ?? characters[0]!;
  const style = myStyle(chosen) as KartStyle;
  const owned = ownedOf(ui);
  return (
    <Screen id="s-garage" hidden={ui.state !== 'garage'} className={ui.noteHidden ? undefined : 'noted'}>
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
          {GROUPS.slice(0, 2).map(([cat, label]) => (
            <ChoiceGroup key={cat} label={label} options={partChips(owned, cat)} value={style[cat]} onChange={v => actions.setGarage(cat, v)} />
          ))}
          <ChoiceGroup label="Pontons latéraux" options={chips('g-pods-', PODS)} value={style.pods ? 'on' : 'off'} onChange={v => actions.setGarage('pods', v === 'on')} />
          {GROUPS.slice(2).map(([cat, label]) => (
            <ChoiceGroup key={cat} label={label} options={partChips(owned, cat)} value={style[cat]} onChange={v => actions.setGarage(cat, v)} />
          ))}
          <ChoiceGroup label="Traînée" options={trailChips(owned)} value={style.trail} onChange={v => actions.setGarage('trail', v)} />
          <Disclaimer id="g-trail-note" style={NOTE}>Les traînées se gagnent dans la Politibox.</Disclaimer>
          <Disclaimer>
            Ce que vous ne changez pas reste le réglage du candidat ou de la candidate. Vos choix suivent n’importe quel candidat et sont gardés dans ce navigateur. Les roues, l’aileron et le nez ne changent que le kart classique ; l’échappement, les néons, le mât, la carrosserie et la traînée s’appliquent aussi au tracteur et au vélo-cargo.
            {owned === null ? '' : ' Une pièce grisée s’achète à la Boutique : touchez son badge.'}
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
