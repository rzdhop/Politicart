import { useState, type ChangeEvent } from 'react';
import {
  AdPreview,
  AdminCard,
  AdminGrid,
  Button,
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

import { getCustom } from '../../engine/custom.js';
import { BASE, CHARACTERS } from '../../engine/data.js';
import { hex } from '../../engine/util.js';
import { readImage } from '../readImage';
import { actions, type UiSnapshot } from '../store';
import type { BaseCharacter, Character, CustomCharacter, CustomData } from '../types';

const PANEL = { width: 'min(980px,100%)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 } as const;
const POSTERS_LABEL = { fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18, color: 'var(--gold)' } as const;
const SUBNAME = { fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)' } as const;

const custom = () => getCustom() as unknown as CustomData;

/** The player's edits for one character, created on first touch as the original did. */
function editsFor(id: string): CustomCharacter {
  const c = custom();
  return c.chars[id] ?? (c.chars[id] = {});
}

type TextKey = 'name' | 'title' | 'quote' | 'suit' | 'kart';

/**
 * One character's form. The inputs are uncontrolled and start from the
 * character as it currently is (edits already applied), and every change is
 * written straight into the workshop's custom object -- the same object
 * saveAdmin() persists. That is how the single-file game did it, and it
 * keeps the form's state in one place.
 */
function CharacterForm({ c, base }: { c: Character; base: BaseCharacter }) {
  const [livery, setLivery] = useState(c.livery);
  const write = (key: TextKey) => (e: ChangeEvent<HTMLInputElement>) => { editsFor(c.id)[key] = e.currentTarget.value; };
  const onLivery = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    if (!f) return;
    readImage(f, 512, url => { editsFor(c.id).livery = url; setLivery(url); });
  };
  return (
    <AdminCard>
      <div className="name">
        {base.name} <span style={SUBNAME}>· {c.power.name}</span>
      </div>
      <Field label="Nom"><TextInput data-k="name" maxLength={28} id={'adm-name-' + c.id} defaultValue={c.name} onChange={write('name')} /></Field>
      <Field label="Titre"><TextInput data-k="title" maxLength={40} id={'adm-title-' + c.id} defaultValue={c.title} onChange={write('title')} /></Field>
      <Field label="Réplique"><TextInput data-k="quote" maxLength={64} id={'adm-quote-' + c.id} defaultValue={c.quote} onChange={write('quote')} /></Field>
      <ColorsRow>
        <Field label="Veste"><ColorSwatch data-k="suit" id={'adm-suit-' + c.id} defaultValue={hex(c.look.suit)} onChange={write('suit')} /></Field>
        <Field label="Kart"><ColorSwatch data-k="kart" id={'adm-kart-' + c.id} defaultValue={hex(c.kart)} onChange={write('kart')} /></Field>
        <Field label="Livrée (image)"><FileInput accept="image/*" data-k="livery" id={'adm-livery-' + c.id} onChange={onLivery} /></Field>
        <LiveryThumb id={'adm-livimg-' + c.id} src={livery || undefined} />
      </ColorsRow>
    </AdminCard>
  );
}

function onPosters(e: ChangeEvent<HTMLInputElement>) {
  const files = [...(e.currentTarget.files || [])].slice(0, 8);
  if (!files.length) return;
  const c = custom();
  c.ads = [];
  let left = files.length;
  files.forEach((f, i) => readImage(f, 640, url => { c.ads[i] = url; if (--left === 0) actions.adsChanged(); }));
}

/** The workshop: rename and recolour the candidates, add liveries and campaign posters. */
export function AdminScreen({ ui }: { ui: UiSnapshot }) {
  const characters = CHARACTERS as unknown as Character[];
  const bases = BASE as unknown as BaseCharacter[];
  const ads = custom().ads;
  return (
    <Screen id="s-admin" hidden={ui.state !== 'admin'}>
      <Heading size="screen">Atelier</Heading>
      <Disclaimer style={{ maxWidth: '70ch' }}>
        Renommez les candidat·es, changez leurs couleurs, ajoutez une livrée (image sur le capot et l’aileron) et vos propres affiches de campagne le long des circuits. Les réglages sont gardés dans ce navigateur. Les visages restent modélisés par le jeu.
      </Disclaimer>
      {/* Keyed by formVersion so an open or a reset re-reads every character into fresh inputs. */}
      <AdminGrid id="admin-chars" key={ui.formVersion}>
        {characters.map((c, i) => <CharacterForm key={c.id} c={c} base={bases[i] ?? c} />)}
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
      <Row>
        <Button id="b-admin-reset" variant="ghost" onClick={actions.resetAdmin}>Réinitialiser</Button>
        <Button id="b-admin-save" onClick={actions.saveAdmin}>Enregistrer et revenir</Button>
      </Row>
    </Screen>
  );
}
