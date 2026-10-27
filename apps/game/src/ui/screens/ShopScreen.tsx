import type { ReactNode } from 'react';
import {
  Button,
  CoinCount,
  Disclaimer,
  GradeBadge,
  Heading,
  Panel,
  Row,
  Screen,
  ShopCard,
  Tabs,
} from '@kart-republique/ui';

import {
  BOX_ODDS, BOX_PRICE, CHAR_GRADE, CHAR_PRICE, COIN_DROPS, PART_CATEGORIES, PART_GRADE, PART_PRICE, REFUND, TRAIL_GRADE, TRAIL_OPTIONS,
  ownsChar, ownsPart, ownsTrail,
} from '../../engine/catalog.js';
import { CHARACTERS } from '../../engine/data.js';
import { STARTERS, unlockLevel } from '../../engine/progress.js';
import { GRADE_LABELS, optionLabel, PART_CHOICES, trailLabel } from '../kartChoices';
import { actions, ownedOf, type Grade, type ShopTab, type UiSnapshot } from '../store';
import type { Character } from '../types';

const CHARS = CHARACTERS as unknown as Character[];
const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' } as const;
const PANEL = { width: 'min(980px, 100%)', boxSizing: 'border-box', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14 } as const;
const fr = (n: number) => n.toLocaleString('fr-FR');
const pct = (x: number) => fr(Math.round(x * 1000) / 10) + ' %';

/** While a call runs every buy button waits; otherwise the card decides (an explicit `disabled: undefined` would undo its lock). */
const busy = (ui: UiSnapshot) => (ui.shop.busy ? { disabled: true } : {});

const TABS = [
  { id: 'box', label: 'Politibox', props: { id: 'shop-tab-box', 'aria-controls': 'shop-panel-box' } },
  { id: 'chars', label: 'Candidat·es', props: { id: 'shop-tab-chars', 'aria-controls': 'shop-panel-chars' } },
  { id: 'parts', label: 'Pièces', props: { id: 'shop-tab-parts', 'aria-controls': 'shop-panel-parts' } },
] as const;

/** A small drawing of a part category for its shop card, in the grade's colour. */
function PartGlyph({ category, grade }: { category: string; grade: Grade }) {
  const shapes: Record<string, ReactNode> = {
    wheels: <><circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="9" /><circle cx="32" cy="32" r="7" fill="currentColor" /></>,
    spoiler: <><rect x="6" y="16" width="52" height="9" rx="3" fill="currentColor" /><rect x="18" y="25" width="6" height="22" fill="currentColor" /><rect x="40" y="25" width="6" height="22" fill="currentColor" /></>,
    sticker: <path d="M32 6l7.6 16.4 17.9 2.1-13.2 12.3 3.6 17.7L32 45.6 16.1 54.5l3.6-17.7L6.5 24.5l17.9-2.1z" fill="currentColor" />,
    exhaust: <><circle cx="20" cy="34" r="11" fill="none" stroke="currentColor" strokeWidth="6" /><circle cx="44" cy="34" r="11" fill="none" stroke="currentColor" strokeWidth="6" /></>,
    underglow: <><rect x="8" y="20" width="48" height="14" rx="5" fill="currentColor" /><rect x="4" y="42" width="56" height="5" rx="2.5" fill="currentColor" opacity=".55" /><rect x="12" y="50" width="40" height="4" rx="2" fill="currentColor" opacity=".3" /></>,
    mast: <><rect x="16" y="6" width="5" height="52" fill="currentColor" /><path d="M21 8h30l-8 10 8 10H21z" fill="currentColor" /></>,
    nose: <path d="M6 44h34l18-16H24z" fill="currentColor" />,
    skin: <><rect x="8" y="12" width="48" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="5" /><path d="M14 46L34 18M26 46L46 18M38 46L52 26" stroke="currentColor" strokeWidth="5" /></>,
  };
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" style={{ color: `var(--grade-${grade})` }}>
      {shapes[category] ?? null}
    </svg>
  );
}

/** The Politibox: what it costs, what it may hold, and the button. */
function BoxPanel({ ui, coins, guest }: { ui: UiSnapshot; coins: number; guest: boolean }) {
  const coinShare = 1 - BOX_ODDS.char - BOX_ODDS.part;
  return (
    <div role="tabpanel" id="shop-panel-box" aria-labelledby="shop-tab-box" hidden={ui.shop.tab !== 'box'} style={{ ...COLUMN, gap: 12 }}>
      <Heading level={3} style={{ fontSize: 24 }}>La Politibox</Heading>
      <p className="box-text">
        {'Une urne dorée à ' + fr(BOX_PRICE) + ' politicoins. On y trouve un·e candidat·e ' + pct(BOX_ODDS.char)
          + ' du temps, une pièce de kart ou une traînée ' + pct(BOX_ODDS.part) + ' du temps, et le reste du temps des politicoins. '
          + 'Un doublon est remboursé selon sa rareté (de ' + fr(REFUND.rare) + ' à ' + fr(REFUND.incredible) + ' politicoins).'}
      </p>
      <table id="box-odds" className="box-odds">
        <tbody>
          <tr><th scope="row">Candidat·e</th><td>{pct(BOX_ODDS.char)}</td></tr>
          <tr><th scope="row">Pièce ou traînée</th><td>{pct(BOX_ODDS.part)}</td></tr>
          <tr><th scope="row">Politicoins</th><td>{pct(coinShare)}</td></tr>
          {(COIN_DROPS as unknown as [number, number][]).map(([amount, odds]) => (
            <tr key={amount} className="sub"><th scope="row">{fr(amount) + ' politicoins'}</th><td>{pct(odds)}</td></tr>
          ))}
        </tbody>
      </table>
      <Button id="b-open-box" disabled={guest || ui.shop.busy || coins < BOX_PRICE} onClick={() => { void actions.openBox(); }}>
        {'Ouvrir une Politibox · ' + fr(BOX_PRICE)}
      </Button>
      {!guest && coins < BOX_PRICE ? <Disclaimer>Gagnez des politicoins en course : chaque place rapporte, et la première course du jour un bonus.</Disclaimer> : null}
    </div>
  );
}

/** Every candidate: the starters owned for free, the others for sale once their level is reached. */
function CharsPanel({ ui, coins, guest }: { ui: UiSnapshot; coins: number; guest: boolean }) {
  const owned = ownedOf(ui);
  const reachable = ui.account?.profile.reachable ?? [...STARTERS];
  return (
    <div role="tabpanel" id="shop-panel-chars" aria-labelledby="shop-tab-chars" hidden={ui.shop.tab !== 'chars'} className="shop-grid">
      {CHARS.map(c => {
        const grade = CHAR_GRADE[c.id as keyof typeof CHAR_GRADE] as Grade;
        const starter = STARTERS.includes(c.id);
        const price = CHAR_PRICE[grade];
        const locked = guest ? 'Compte requis'
          : !reachable.includes(c.id) ? 'Niveau ' + unlockLevel(c.id) + ' requis'
          : coins < price ? 'Pas assez de politicoins' : undefined;
        return (
          <ShopCard
            key={c.id}
            id={'shop-char-' + c.id}
            title={c.name}
            subtitle={starter ? c.title + ' · offert·e' : c.title}
            grade={grade}
            gradeLabel={GRADE_LABELS[grade]}
            price={starter ? undefined : price}
            image={ui.thumbs[c.id]}
            owned={ownsChar(owned, c.id)}
            locked={locked}
            onBuy={() => { void actions.buyChar(c.id); }}
            buyLabel="Acheter"
            ownedLabel="Acquis"
            buyProps={{ id: 'b-buy-char-' + c.id, ...busy(ui) }}
          />
        );
      })}
    </div>
  );
}

/** Every part option above the commons, by category, and the trails (the Politibox's alone). */
function PartsPanel({ ui, coins, guest }: { ui: UiSnapshot; coins: number; guest: boolean }) {
  const owned = ownedOf(ui);
  const grades = PART_GRADE as Record<string, Record<string, Grade>>;
  return (
    <div role="tabpanel" id="shop-panel-parts" aria-labelledby="shop-tab-parts" hidden={ui.shop.tab !== 'parts'} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {PART_CATEGORIES.map(cat => {
        const choice = PART_CHOICES[cat as keyof typeof PART_CHOICES];
        const options = choice.options.map(([v]) => v as string).filter(v => grades[cat]![v] !== 'common');
        return (
          <section key={cat} id={'shop-cat-' + cat} className="shop-cat">
            <Heading level={3} style={{ fontSize: 20, textAlign: 'left' }}>{choice.label}</Heading>
            <div className="shop-grid">
              {options.map(v => {
                const grade = grades[cat]![v]!;
                const price = PART_PRICE[grade];
                return (
                  <ShopCard
                    key={v}
                    id={'shop-part-' + cat + '-' + v}
                    title={optionLabel(cat, v)}
                    subtitle={choice.label}
                    grade={grade}
                    gradeLabel={GRADE_LABELS[grade]}
                    price={price}
                    image={<PartGlyph category={cat} grade={grade} />}
                    owned={ownsPart(owned, cat, v)}
                    locked={guest ? 'Compte requis' : coins < price ? 'Pas assez de politicoins' : undefined}
                    onBuy={() => { void actions.buyPart(cat, v); }}
                    buyLabel="Acheter"
                    ownedLabel="Acquis"
                    buyProps={{ id: 'b-buy-part-' + cat + '-' + v, ...busy(ui) }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      <section id="shop-trails" className="shop-cat">
        <Heading level={3} style={{ fontSize: 20, textAlign: 'left' }}>Traînées</Heading>
        <ul className="shop-trails">
          {TRAIL_OPTIONS.filter(t => t !== 'none').map(t => {
            const grade = TRAIL_GRADE[t as keyof typeof TRAIL_GRADE] as Grade;
            const mine = ownsTrail(owned, t);
            return (
              <li key={t} id={'shop-trail-' + t} className={mine ? 'owned' : undefined}>
                <GradeBadge grade={grade} label={GRADE_LABELS[grade]} size="sm" />
                <span className="name">{trailLabel(t)}</span>
                <span className="trail-note">{mine ? '✓ Acquise' : 'Politibox uniquement'}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/**
 * The Boutique (DEC-037): the politicoin balance, then three tabs -- the
 * Politibox, the candidates, the kart parts. Rendered only where a game
 * server runs the economy; a guest sees it all with every button disabled.
 * Prices are the catalogue's, shown here and charged by the server, which
 * never takes one from the page.
 */
export function ShopScreen({ ui }: { ui: UiSnapshot }) {
  const guest = !ui.account;
  const coins = ui.account?.profile.coins ?? 0;
  return (
    <Screen id="s-shop" hidden={ui.state !== 'shop'} className={ui.noteHidden ? undefined : 'noted'}>
      <div className="shop-top">
        <Heading size="screen">Boutique</Heading>
        <CoinCount value={coins} label="politicoins" format={fr} valueProps={{ id: 'coins' }} />
      </div>
      {guest ? <Disclaimer id="shop-guest" style={{ color: 'var(--gold)' }}>Créez un compte pour gagner des politicoins.</Disclaimer> : null}
      <Disclaimer id="shop-error" role="status" hidden={!ui.shop.error} style={{ color: '#ff8a8a' }}>{ui.shop.error ?? ''}</Disclaimer>
      <Disclaimer id="shop-notice" role="status" hidden={!ui.shop.notice} style={{ color: 'var(--gold)' }}>{ui.shop.notice ?? ''}</Disclaimer>
      <Tabs tabs={TABS} active={ui.shop.tab} onChange={(t: ShopTab) => actions.shopTab(t)} />
      <Panel style={PANEL}>
        <BoxPanel ui={ui} coins={coins} guest={guest} />
        <CharsPanel ui={ui} coins={coins} guest={guest} />
        <PartsPanel ui={ui} coins={coins} guest={guest} />
      </Panel>
      <Row>
        <Button id="b-shop-back" variant="ghost" onClick={actions.closeShop}>Retour</Button>
      </Row>
    </Screen>
  );
}
