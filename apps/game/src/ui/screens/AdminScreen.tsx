import { useState, type ChangeEvent } from 'react';
import {
  AdPreview,
  AdminCard,
  AdminGrid,
  Button,
  ChoiceGroup,
  ColorSwatch,
  ColorsRow,
  Disclaimer,
  Field,
  FileInput,
  Heading,
  LiveryThumb,
  Panel,
  Row,
  Screen,
  TextInput,
} from '@kart-republique/ui';

import { getDraft } from '../../engine/custom.js';
import { BASE, CHARACTERS } from '../../engine/data.js';
import { builtinStyle, mergeStyle } from '../../engine/kartstyle.js';
import { hex } from '../../engine/util.js';
import { chips, parseRaceNumber, PODS, SPOILERS, STICKERS, WHEELS } from '../kartChoices';
import { readImage } from '../readImage';
import { actions, type UiSnapshot } from '../store';
import type { BaseCharacter, Character, CustomCharacter, CustomData, KartStyle } from '../types';

const PANEL = { width: 'min(980px,100%)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 } as const;
const POSTERS_LABEL = { fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18, color: 'var(--gold)' } as const;
const SUBNAME = { fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)' } as const;
const ERROR = { color: 'var(--red)', maxWidth: '70ch' } as const;

const draft = () => getDraft() as unknown as CustomData;

/** The draft's edits for one character, read-only: nothing is created by reading. */
const draftOf = (id: string): CustomCharacter => draft().chars[id] ?? {};

/** The draft's edits for one character, created on first write as the original did. */
function editsFor(id: string): CustomCharacter {
  const c = draft();
  return c.chars[id] ?? (c.chars[id] = {});
}

type TextKey = 'name' | 'title' | 'quote' | 'suit' | 'kart';
/** The kart defaults the admin sets per character; the body colour is the "Kart" swatch. */
type StyleKey = Exclude<keyof KartStyle, 'body'>;

/**
 * One character's form. The text inputs are uncontrolled and start from the
 * draft (the cast in force when the workshop opened, or the default cast after
 * a reset); every change is written straight into the draft -- the object
 * saveAdmin() sends to the server. The kart defaults are partial: only what
 * the admin touches is stored, and a player's Garage edits still win over it.
 */
function CharacterForm({ c, base }: { c: Character; base: BaseCharacter }) {
  const d = draftOf(c.id);
  const [livery, setLivery] = useState(d.livery || null);
  const [style, setStyle] = useState<KartStyle>(() => mergeStyle(builtinStyle({ kart: base.kart }), d.style) as KartStyle);
  const write = (key: TextKey) => (e: ChangeEvent<HTMLInputElement>) => { editsFor(c.id)[key] = e.currentTarget.value; };
  const writeStyle = (key: StyleKey, value: KartStyle[StyleKey] | undefined) => {
    const e = editsFor(c.id);
    const next: Partial<KartStyle> = { ...e.style };
    if (value === undefined) delete next[key]; else (next as Record<string, unknown>)[key] = value;
    e.style = next;
    setStyle(s => ({ ...s, [key]: value === undefined ? (builtinStyle({ kart: base.kart }) as KartStyle)[key] : value }));
  };
  const onLivery = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    if (!f) return;
    readImage(f, 512, url => { editsFor(c.id).livery = url; setLivery(url); });
  };
  // An empty number is "no number", the built-in default; anything not 0-99 is ignored.
  const onNumber = (e: ChangeEvent<HTMLInputElement>) => {
    const n = parseRaceNumber(e.currentTarget.value);
    if (n !== undefined) writeStyle('number', n === null ? undefined : n);
  };
  const text = (key: 'name' | 'title' | 'quote') => (d[key] || '').trim() || base[key];
  return (
    <AdminCard>
      <div className="name">
        {base.name} <span style={SUBNAME}>· {c.power.name}</span>
      </div>
      <Field label="Nom"><TextInput data-k="name" maxLength={28} id={'adm-name-' + c.id} defaultValue={text('name')} onChange={write('name')} /></Field>
      <Field label="Titre"><TextInput data-k="title" maxLength={40} id={'adm-title-' + c.id} defaultValue={text('title')} onChange={write('title')} /></Field>
      <Field label="Réplique"><TextInput data-k="quote" maxLength={64} id={'adm-quote-' + c.id} defaultValue={text('quote')} onChange={write('quote')} /></Field>
      <ColorsRow>
        <Field label="Veste"><ColorSwatch data-k="suit" id={'adm-suit-' + c.id} defaultValue={d.suit || hex(base.suit)} onChange={write('suit')} /></Field>
        <Field label="Kart"><ColorSwatch data-k="kart" id={'adm-kart-' + c.id} defaultValue={d.kart || hex(base.kart)} onChange={write('kart')} /></Field>
        <Field label="Livrée (image)"><FileInput accept="image/*" data-k="livery" id={'adm-livery-' + c.id} onChange={onLivery} /></Field>
        <LiveryThumb id={'adm-livimg-' + c.id} src={livery || undefined} />
      </ColorsRow>
      <ColorsRow>
        <Field label="Accents"><ColorSwatch id={'adm-accent-' + c.id} defaultValue={style.accent} onChange={e => writeStyle('accent', e.currentTarget.value)} /></Field>
        <Field label="Numéro (0-99)">
          <TextInput id={'adm-number-' + c.id} inputMode="numeric" pattern="[0-9]*" maxLength={2} size={4} placeholder="aucun" defaultValue={style.number ?? ''} onChange={onNumber} />
        </Field>
      </ColorsRow>
      <ChoiceGroup label="Roues" options={chips('adm-wheels-' + c.id + '-', WHEELS)} value={style.wheels} onChange={v => writeStyle('wheels', v)} />
      <ChoiceGroup label="Aileron" options={chips('adm-spoiler-' + c.id + '-', SPOILERS)} value={style.spoiler} onChange={v => writeStyle('spoiler', v)} />
      <ChoiceGroup label="Pontons latéraux" options={chips('adm-pods-' + c.id + '-', PODS)} value={style.pods ? 'on' : 'off'} onChange={v => writeStyle('pods', v === 'on')} />
      <ChoiceGroup label="Autocollant" options={chips('adm-sticker-' + c.id + '-', STICKERS)} value={style.sticker} onChange={v => writeStyle('sticker', v)} />
    </AdminCard>
  );
}

function onPosters(e: ChangeEvent<HTMLInputElement>) {
  const files = [...(e.currentTarget.files || [])].slice(0, 8);
  if (!files.length) return;
  const c = draft();
  c.ads = [];
  let left = files.length;
  files.forEach((f, i) => readImage(f, 640, url => { c.ads[i] = url; if (--left === 0) actions.adsChanged(); }));
}

/**
 * The workshop: the admin renames and recolours the candidates, sets their
 * kart defaults, adds liveries and campaign posters. Rendered only for an
 * admin session on the game server; saving sends the cast to the server, and
 * every player gets it.
 */
export function AdminScreen({ ui }: { ui: UiSnapshot }) {
  const characters = CHARACTERS as unknown as Character[];
  const bases = BASE as unknown as BaseCharacter[];
  const ads = draft().ads;
  return (
    <Screen id="s-admin" hidden={ui.state !== 'admin'}>
      <Heading size="screen">Atelier</Heading>
      <Disclaimer style={{ maxWidth: '70ch' }}>
        Renommez les candidat·es, changez leurs couleurs et leur kart par défaut, ajoutez une livrée (image sur le capot et l’aileron) et vos propres affiches de campagne le long des circuits. Les réglages sont gardés sur le serveur du jeu et vus par tous les joueurs ; chacun peut encore changer son propre kart au Garage. « Réinitialiser » remet la distribution d’origine dans ce formulaire : rien ne change pour les joueurs avant « Enregistrer ». Les visages restent modélisés par le jeu.
      </Disclaimer>
      {/* Keyed by formVersion so an open or a reset re-reads every character into fresh inputs. */}
      <AdminGrid id="admin-chars" key={ui.formVersion}>
        {characters.map((c, i) => <CharacterForm key={c.id} c={c} base={bases[i]!} />)}
      </AdminGrid>
      <Panel style={PANEL}>
        <b style={POSTERS_LABEL}>Affiches de campagne (jusqu’à 8 images, remplacent les panneaux)</b>
        <FileInput id="ad-files" accept="image/*" multiple onChange={onPosters} />
        <AdPreview id="ad-preview" className="row" style={{ justifyContent: 'flex-start' }} key={ui.adsVersion}>
          {ads.length
            ? ads.map((u, i) => <img key={i} alt="" src={u} />)
            : <span className="disclaimer">Aucune affiche personnalisée : les panneaux du jeu sont utilisés.</span>}
        </AdPreview>
      </Panel>
      <Disclaimer id="admin-error" role="alert" hidden={!ui.adminError} style={ERROR}>{ui.adminError ?? ''}</Disclaimer>
      <Row>
        <Button id="b-admin-reset" variant="ghost" onClick={actions.resetAdmin} disabled={ui.adminBusy}>Réinitialiser</Button>
        <Button id="b-admin-save" onClick={() => { void actions.saveAdmin(); }} disabled={ui.adminBusy}>Enregistrer et revenir</Button>
      </Row>
    </Screen>
  );
}
