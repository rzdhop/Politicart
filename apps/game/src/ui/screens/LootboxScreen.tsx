import {
  Button,
  CoinCount,
  Disclaimer,
  GradeBadge,
  Heading,
  Panel,
  RevealStage,
  Row,
  Screen,
  Subtitle,
} from '@politikart/ui';

import { BOX_PRICE } from '../../engine/catalog.js';
import { CHARACTERS } from '../../engine/data.js';
import { dropGrade } from '../../engine/lootbox.js';
import { GRADE_LABELS, partPhrase, trailLabel } from '../kartChoices';
import { actions, type Drop, type Grade, type UiSnapshot } from '../store';
import type { Character } from '../types';

const CHARS = CHARACTERS as unknown as Character[];
const fr = (n: number) => n.toLocaleString('fr-FR');

/** What the Politibox held, in one French line. */
export function dropText(drop: Drop): string {
  if (drop.kind === 'coins') return fr(drop.amount) + ' politicoins';
  if (drop.kind === 'char') return 'Candidat : ' + (CHARS.find(c => c.id === drop.id)?.name ?? drop.id);
  if (drop.kind === 'trail') return 'Traînée : ' + trailLabel(drop.id);
  const i = drop.id.indexOf(':');
  return 'Pièce : ' + partPhrase(drop.id.slice(0, i), drop.id.slice(i + 1));
}

/**
 * The Politibox opening (DEC-037): the 3D sequence plays on the canvas
 * (engine/lootbox.js) and this screen lies over it, transparent. A tap
 * anywhere on it hurries the opening along; the library's RevealStage flashes
 * on the burst and, once the prize is out, shows what it was, its grade, and
 * the way back.
 */
export function LootboxScreen({ ui }: { ui: UiSnapshot }) {
  const drop = ui.shop.drop;
  const grade = dropGrade(drop) as Grade;
  const coins = ui.account?.profile.coins ?? 0;
  return (
    <Screen id="s-lootbox" hidden={ui.state !== 'lootbox'} className="lootbox-screen">
      {/* A click, not a press: a finger resting on the glass skips nothing. */}
      <button id="lb-stage" type="button" className="lb-stage" aria-label="Passer" onClick={actions.skipOpening}>
        {ui.shop.phase === 'opening' ? <span className="lb-hint">Touchez pour passer</span> : null}
      </button>
      {drop ? (
        <RevealStage grade={grade} phase={ui.state === 'lootbox' ? ui.shop.phase : 'idle'}>
          <Panel className="lb-card">
            <Subtitle style={{ fontSize: 15 }}>La Politibox vous offre</Subtitle>
            <div id="box-result" className="lb-result">
              <Heading level={3} style={{ fontSize: 26 }}>{dropText(drop)}</Heading>
              {drop.kind !== 'coins' && drop.duplicate
                ? <Disclaimer id="box-refund">{'Doublon : +' + fr(drop.refund) + ' politicoins remboursés'}</Disclaimer>
                : null}
            </div>
            <GradeBadge id="box-grade" grade={grade} label={GRADE_LABELS[grade]} />
            <CoinCount value={coins} label="politicoins" format={fr} />
            <Row>
              <Button id="b-box-again" disabled={ui.shop.busy || coins < BOX_PRICE} onClick={() => { void actions.openBox(); }}>Encore une !</Button>
              <Button id="b-box-back" variant="ghost" onClick={actions.boxDone}>Retour à la boutique</Button>
            </Row>
            {ui.shop.error ? <Disclaimer id="box-error" role="status" style={{ color: '#ff8a8a' }}>{ui.shop.error}</Disclaimer> : null}
          </Panel>
        </RevealStage>
      ) : null}
    </Screen>
  );
}
