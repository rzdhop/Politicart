import { Button, CoinCount, Disclaimer, DropHistory, Panel, RevealCard, RevealStage, Row, Screen } from '@politikart/ui';

import { BOX_BUNDLE, BOX_PRICE } from '../../engine/catalog.js';
import { dropGrade } from '../../engine/lootbox.js';
import { dropText, GRADE_LABELS, historyItems } from '../drops';
import { actions, type Grade, type UiSnapshot } from '../store';

export { dropText };

const fr = (n: number) => n.toLocaleString('fr-FR');

/**
 * The Politibox opening (DEC-037, DEC-054): the 3D sequence plays on the
 * canvas (engine/lootbox.js) and this screen lies over it, transparent. A
 * tap anywhere on it hurries the opening along; the library's RevealStage
 * pulses on the tease, flashes on the burst and, once the prize is out,
 * shows the result card: what it was, its grade, the balance, the way to
 * another box (one or five) and back, and the account's last ten drops.
 * A bundle shows its counter at the top and plays its five reveals in turn.
 */
export function LootboxScreen({ ui }: { ui: UiSnapshot }) {
  const { drop, drops, index, phase, busy, error } = ui.shop;
  const grade = dropGrade(drop) as Grade;
  const coins = ui.account?.profile.coins ?? 0;
  const refund = drop && drop.kind !== 'coins' && drop.duplicate ? 'Doublon : +' + fr(drop.refund) + ' politicoins remboursés' : undefined;
  return (
    <Screen id="s-lootbox" hidden={ui.state !== 'lootbox'} className="lootbox-screen">
      {/* A click, not a press: a finger resting on the glass skips nothing. */}
      <button id="lb-stage" type="button" className="lb-stage" aria-label="Passer" onClick={actions.skipOpening}>
        {phase === 'opening' || phase === 'tease' ? <span className="lb-hint">Touchez pour passer</span> : null}
      </button>
      {drop ? (
        <RevealStage grade={grade} phase={ui.state === 'lootbox' ? phase : 'idle'} count={drops.length} index={index} counterProps={{ id: 'box-count' }}>
          <RevealCard
            kind={drop.kind}
            name={dropText(drop)}
            grade={grade}
            gradeLabel={GRADE_LABELS[grade]}
            caption="La Politibox vous offre"
            refund={refund}
            resultProps={{ id: 'box-result' }}
            refundProps={{ id: 'box-refund' }}
            badgeProps={{ id: 'box-grade' }}
          >
            <CoinCount value={coins} label="politicoins" format={fr} />
            <Row>
              <Button id="b-box-again" disabled={busy || coins < BOX_PRICE} onClick={() => { void actions.openBox(1); }}>Encore une !</Button>
              <Button id="b-box-five" variant="ghost" disabled={busy || coins < BOX_BUNDLE.price} onClick={() => { void actions.openBox(5); }}>
                {'Ouvrir ×5 · ' + fr(BOX_BUNDLE.price)}
              </Button>
              <Button id="b-box-back" variant="ghost" onClick={actions.boxDone}>Retour à la boutique</Button>
            </Row>
            {error ? <Disclaimer id="box-error" role="status" className="lb-error">{error}</Disclaimer> : null}
          </RevealCard>
          <Panel className="lb-history">
            <DropHistory id="box-history" title="Derniers tirages" emptyLabel="Aucun tirage pour l’instant." drops={historyItems(ui.account?.profile.stats?.recent)} />
          </Panel>
        </RevealStage>
      ) : null}
    </Screen>
  );
}
