import {
  Button,
  CoinCount,
  CollectionMeter,
  type CollectionShare,
  Disclaimer,
  DropHistory,
  GradeBadge,
  Heading,
  OddsTable,
  Panel,
  Row,
  Screen,
  SelectLayout,
  ShopCard,
  ShopHero,
  Showcase,
  ShowcaseStage,
  Tabs,
  TrailStrip,
  type TrailKind,
} from '@politikart/ui';

import {
  BOX_BUNDLE, BOX_ODDS, BOX_PRICE, CHAR_GRADE, CHAR_PRICE, COIN_DROPS, PART_CATEGORIES, PART_GRADE, PART_PRICE, REFUND, TRAIL_GRADE, TRAIL_OPTIONS,
  ownsChar, ownsPart, ownsTrail,
} from '../../engine/catalog.js';
import { CHARACTERS } from '../../engine/data.js';
import { STARTERS, unlockLevel } from '../../engine/progress.js';
import { stageDrag } from '../../engine/stageinput.js';
import { historyItems } from '../drops';
import { GRADE_LABELS, optionLabel, PART_CHOICES, partPhrase, trailLabel } from '../kartChoices';
import { PartArt } from '../PartArt';
import { actions, ownedOf, type Grade, type Owned, type UiSnapshot } from '../store';
import type { Character } from '../types';

const CHARS = CHARACTERS as unknown as Character[];
const PART_GRADES = PART_GRADE as Record<string, Record<string, Grade>>;
const TRAIL_GRADES = TRAIL_GRADE as Record<string, Grade>;
const CHAR_GRADES = CHAR_GRADE as Record<string, Grade>;
const GRADE_ORDER: Grade[] = ['common', 'rare', 'mythic', 'incredible'];
const COLUMN = { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'stretch' } as const;
const fr = (n: number) => n.toLocaleString('fr-FR');
const pct = (x: number) => fr(Math.round(x * 1000) / 10) + ' %';
const STAGE_LABEL = 'Votre kart sur le podium : glissez pour le faire pivoter';

/**
 * Try a part on (actions.tryOn) and, when the podium is scrolled out of
 * view (stacked above the shelves on an upright phone), bring it back so
 * the press shows its result.
 */
function tryIt(category: string, value: string) {
  actions.tryOn(category, value);
  // Pinned beside the shelves (a computer, a phone held sideways) the podium is already in view; stacked above them, it is brought back.
  const stage = typeof document === 'undefined' ? null : document.getElementById('shop-showcase');
  if (!stage?.getBoundingClientRect) return;
  const r = stage.getBoundingClientRect();
  if (r.bottom < 120 || r.top > window.innerHeight * 0.5) stage.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

/** While a call runs every buy button waits; otherwise the card decides (an explicit `disabled: undefined` would undo its lock). */
const busy = (ui: UiSnapshot) => (ui.shop.busy ? { disabled: true } : {});

const TABS = [
  { id: 'box', label: 'Politibox', props: { id: 'shop-tab-box', 'aria-controls': 'shop-panel-box' } },
  { id: 'chars', label: 'Candidat·es', props: { id: 'shop-tab-chars', 'aria-controls': 'shop-panel-chars' } },
  { id: 'parts', label: 'Pièces & traînées', props: { id: 'shop-tab-parts', 'aria-controls': 'shop-panel-parts' } },
] as const;

/** The Politibox odds as the library's table rows: the kinds, then the coin tiers under their line. */
const ODDS_ROWS = [
  { key: 'char', label: 'Candidat·e', odds: BOX_ODDS.char },
  { key: 'part', label: 'Pièce ou traînée', odds: BOX_ODDS.part },
  { key: 'coins', label: 'Politicoins', odds: 1 - BOX_ODDS.char - BOX_ODDS.part },
  ...(COIN_DROPS as unknown as [number, number][]).map(([amount, odds]) => ({ key: 'coins-' + amount, label: fr(amount) + ' politicoins', odds, sub: true })),
];
const ODDS_CAPTION = 'Une urne dorée à ' + fr(BOX_PRICE) + ' politicoins, ou cinq pour ' + fr(BOX_BUNDLE.price) + '. On y trouve un·e candidat·e ' + pct(BOX_ODDS.char)
  + ' du temps, une pièce de kart ou une traînée ' + pct(BOX_ODDS.part) + ' du temps, et le reste du temps des politicoins. '
  + 'Un doublon est remboursé selon sa rareté (de ' + fr(REFUND.rare) + ' à ' + fr(REFUND.incredible) + ' politicoins).';
const JACKPOT = Math.max(...(COIN_DROPS as unknown as [number, number][]).map(([a]) => a));
const BUNDLE_SAVING = Math.round((1 - BOX_BUNDLE.price / (BOX_PRICE * BOX_BUNDLE.count)) * 100);

/** Every part option above the commons, as [category, value]. */
const SELLABLE_PARTS = (PART_CATEGORIES as readonly string[]).flatMap(cat =>
  PART_CHOICES[cat as keyof typeof PART_CHOICES].options.map(([v]) => v as string).filter(v => PART_GRADES[cat]![v] !== 'common').map(v => [cat, v] as const));
const TRAILS = (TRAIL_OPTIONS as readonly string[]).filter(t => t !== 'none');

/**
 * The account's collection (DEC-073): every candidate, every part above the
 * commons and every trail, owned or not, counted by grade.
 */
export function collectionOf(owned: Owned | null) {
  const count = new Map<Grade, { have: number; total: number }>(GRADE_ORDER.map(g => [g, { have: 0, total: 0 }]));
  const add = (grade: Grade, have: boolean) => { const c = count.get(grade)!; c.total++; if (have) c.have++; };
  for (const c of CHARS) add(CHAR_GRADES[c.id] ?? 'common', ownsChar(owned, c.id));
  for (const [cat, v] of SELLABLE_PARTS) add(PART_GRADES[cat]![v]!, ownsPart(owned, cat, v));
  for (const t of TRAILS) add(TRAIL_GRADES[t]!, ownsTrail(owned, t));
  const shares: CollectionShare[] = GRADE_ORDER.map(g => ({ grade: g, ...count.get(g)!, label: GRADE_LABELS[g] + ' : ' + count.get(g)!.have + ' sur ' + count.get(g)!.total }));
  return { have: shares.reduce((n, s) => n + s.have, 0), total: shares.reduce((n, s) => n + s.total, 0), shares };
}

/** Something the account could buy now or soon: a candidate it may buy, or a part. */
export interface Offer { kind: 'char' | 'part'; id: string; category?: string; value?: string; grade: Grade; price: number; name: string }

/** Every offer the account does not own and is allowed to buy, the cheapest first. */
export function offersFor(ui: UiSnapshot): Offer[] {
  const owned = ownedOf(ui);
  const reachable = ui.account?.profile.reachable ?? [...STARTERS];
  const list: Offer[] = [];
  for (const c of CHARS) {
    if (STARTERS.includes(c.id) || ownsChar(owned, c.id) || !reachable.includes(c.id)) continue;
    const grade = CHAR_GRADES[c.id] ?? 'common';
    list.push({ kind: 'char', id: c.id, grade, price: CHAR_PRICE[grade], name: c.name });
  }
  for (const [cat, v] of SELLABLE_PARTS) {
    if (ownsPart(owned, cat, v)) continue;
    const grade = PART_GRADES[cat]![v]!;
    list.push({ kind: 'part', id: cat + '-' + v, category: cat, value: v, grade, price: PART_PRICE[grade], name: partPhrase(cat, v) });
  }
  return list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

/**
 * The shop's shop window: what the balance buys right now, the dearest
 * first (up to four), or, when nothing is in reach, the next goal and how
 * far the balance is from it.
 */
export function picksFor(ui: UiSnapshot) {
  const coins = ui.account?.profile.coins ?? 0;
  const offers = offersFor(ui);
  const now = offers.filter(o => o.price <= coins).reverse().slice(0, 4);
  return { now, next: now.length ? null : offers[0] ?? null };
}

/** The candidate's portrait or a part's art for an offer's card. */
function offerImage(ui: UiSnapshot, o: Offer) {
  return o.kind === 'char' ? ui.thumbs[o.id] : <PartArt category={o.category!} value={o.value!} grade={o.grade} />;
}

/** The Politibox tab: the hero banner, the shop window, the odds and the last drops. */
function BoxPanel({ ui, coins, guest }: { ui: UiSnapshot; coins: number; guest: boolean }) {
  const picks = guest ? { now: [], next: null } : picksFor(ui);
  const tryOn = ui.tryOn;
  return (
    <div role="tabpanel" id="shop-panel-box" aria-labelledby="shop-tab-box" hidden={ui.shop.tab !== 'box'} style={COLUMN}>
      <ShopHero
        id="shop-hero"
        title="La Politibox"
        tagline="Un·e candidat·e, une pièce rare ou une traînée introuvable ailleurs : tout peut sortir de l’urne dorée."
        perks={[
          { label: 'Candidat·e', value: pct(BOX_ODDS.char) },
          { label: 'Pièce ou traînée', value: pct(BOX_ODDS.part) },
          { label: 'politicoins au jackpot', value: fr(JACKPOT) },
          { label: 'le lot de ' + BOX_BUNDLE.count, value: '−' + BUNDLE_SAVING + ' %' },
        ]}
        flag="Traînées exclusives"
      >
        <Button id="b-open-box" disabled={guest || ui.shop.busy || coins < BOX_PRICE} onClick={() => { void actions.openBox(1); }}>
          {'Ouvrir une Politibox · ' + fr(BOX_PRICE)}
        </Button>
        <Button id="b-open-box-five" variant="ghost" disabled={guest || ui.shop.busy || coins < BOX_BUNDLE.price} onClick={() => { void actions.openBox(5); }}>
          {'Ouvrir ×' + BOX_BUNDLE.count + ' · ' + fr(BOX_BUNDLE.price)}
        </Button>
      </ShopHero>
      {!guest && coins < BOX_PRICE ? <Disclaimer>Gagnez des politicoins en course : chaque place rapporte, les pièces sur la route aussi, et la première course du jour un bonus.</Disclaimer> : null}
      {picks.now.length ? (
        <section id="shop-picks" className="shop-cat">
          <Heading level={3} style={{ fontSize: 22, textAlign: 'left' }}>À votre portée</Heading>
          <div className="shop-grid">
            {picks.now.map(o => (
              <ShopCard
                priceFormat={fr}
                key={o.kind + o.id}
                id={'shop-pick-' + o.id}
                title={o.name}
                subtitle={o.kind === 'char' ? 'Candidat·e' : PART_CHOICES[o.category as keyof typeof PART_CHOICES].label}
                grade={o.grade}
                gradeLabel={GRADE_LABELS[o.grade]}
                price={o.price}
                image={offerImage(ui, o)}
                spotlight="À votre portée"
                onBuy={() => { void (o.kind === 'char' ? actions.buyChar(o.id) : actions.buyPart(o.category!, o.value!)); }}
                buyLabel="Acheter"
                buyProps={{ id: 'b-pick-' + o.id, ...busy(ui) }}
                {...(o.kind === 'part' ? {
                  onTry: () => tryIt(o.category!, o.value!),
                  tryLabel: 'Essayer',
                  trying: tryOn?.category === o.category && tryOn?.value === o.value,
                  tryProps: { id: 'b-pick-try-' + o.id },
                } : {})}
              />
            ))}
          </div>
        </section>
      ) : picks.next ? (
        <section id="shop-next" className="shop-cat shop-next">
          <Heading level={3} style={{ fontSize: 22, textAlign: 'left' }}>Prochain objectif</Heading>
          <div className="shop-next-row">
            <div className="shop-next-art">{typeof offerImage(ui, picks.next) === 'string' ? <img alt="" src={offerImage(ui, picks.next) as string} /> : offerImage(ui, picks.next)}</div>
            <div className="shop-next-body">
              <div className="shop-next-name">{picks.next.name} <GradeBadge grade={picks.next.grade} label={GRADE_LABELS[picks.next.grade]} size="sm" /></div>
              <CollectionMeter id="shop-next-meter" label="Votre cagnotte" have={coins} total={picks.next.price} figure={'encore ' + fr(picks.next.price - coins) + ' politicoins'} />
              {picks.next.kind === 'part' ? <Button variant="ghost" id="b-next-try" onClick={() => tryIt(picks.next!.category!, picks.next!.value!)}>Essayer sur mon kart</Button> : null}
            </div>
          </div>
        </section>
      ) : null}
      <details className="shop-odds">
        <summary>Toutes les chances de la Politibox</summary>
        <OddsTable id="box-odds" caption={ODDS_CAPTION} rows={ODDS_ROWS} format={pct} />
      </details>
      {guest ? null : (
        <DropHistory id="shop-history" title="Derniers tirages" emptyLabel="Aucun tirage pour l’instant." drops={historyItems(ui.account?.profile.stats?.recent)} />
      )}
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
        const grade = CHAR_GRADES[c.id] ?? 'common';
        const starter = STARTERS.includes(c.id);
        const price = CHAR_PRICE[grade];
        const mine = ownsChar(owned, c.id);
        const locked = guest ? 'Compte requis'
          : !reachable.includes(c.id) ? 'Niveau ' + unlockLevel(c.id) + ' requis'
          : coins < price ? 'Pas assez de politicoins' : undefined;
        return (
          <ShopCard
            priceFormat={fr}
            key={c.id}
            id={'shop-char-' + c.id}
            title={c.name}
            subtitle={starter ? c.title + ' · offert·e' : c.title}
            grade={grade}
            gradeLabel={GRADE_LABELS[grade]}
            price={starter ? undefined : price}
            image={ui.thumbs[c.id]}
            owned={mine}
            locked={locked}
            spotlight={!mine && !locked && !guest ? 'À votre portée' : undefined}
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

/** Every part option above the commons, by category, and the trails (the Politibox's alone): each can be tried on, and an owned one equipped. */
function PartsPanel({ ui, coins, guest }: { ui: UiSnapshot; coins: number; guest: boolean }) {
  const owned = ownedOf(ui);
  const tryOn = ui.tryOn;
  return (
    <div role="tabpanel" id="shop-panel-parts" aria-labelledby="shop-tab-parts" hidden={ui.shop.tab !== 'parts'} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Disclaimer className="shop-try-hint">Touchez « Essayer » : la pièce se monte sur votre kart, sur le podium. Rien n’est acheté tant que vous ne validez pas.</Disclaimer>
      {PART_CATEGORIES.map(cat => {
        const choice = PART_CHOICES[cat as keyof typeof PART_CHOICES];
        const options = choice.options.map(([v]) => v as string).filter(v => PART_GRADES[cat]![v] !== 'common');
        return (
          <section key={cat} id={'shop-cat-' + cat} className="shop-cat">
            <Heading level={3} style={{ fontSize: 20, textAlign: 'left' }}>{choice.label}</Heading>
            <div className="shop-grid">
              {options.map(v => {
                const grade = PART_GRADES[cat]![v]!;
                const price = PART_PRICE[grade];
                const mine = ownsPart(owned, cat, v);
                const locked = guest ? 'Compte requis' : coins < price ? 'Pas assez de politicoins' : undefined;
                return (
                  <ShopCard
                    priceFormat={fr}
                    key={v}
                    id={'shop-part-' + cat + '-' + v}
                    title={optionLabel(cat, v)}
                    subtitle={choice.label}
                    grade={grade}
                    gradeLabel={GRADE_LABELS[grade]}
                    price={price}
                    image={<PartArt category={cat} value={v} grade={grade} />}
                    owned={mine}
                    locked={locked}
                    spotlight={!mine && !locked ? 'À votre portée' : undefined}
                    onBuy={() => { void actions.buyPart(cat, v); }}
                    buyLabel="Acheter"
                    ownedLabel="Acquis"
                    buyProps={{ id: 'b-buy-part-' + cat + '-' + v, ...busy(ui) }}
                    onTry={mine && !guest ? () => actions.equip(cat, v) : () => tryIt(cat, v)}
                    tryLabel={mine && !guest ? 'Équiper' : 'Essayer'}
                    trying={tryOn?.category === cat && tryOn?.value === v}
                    tryProps={{ id: (mine && !guest ? 'b-equip-part-' : 'b-try-part-') + cat + '-' + v }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {/* The trails are the Politibox's alone (DEC-036): a card each with its preview streaming behind a kart, no price, the reason on the button. */}
      <section id="shop-trails" className="shop-cat">
        <Heading level={3} style={{ fontSize: 20, textAlign: 'left' }}>Traînées · exclusivités Politibox</Heading>
        <div className="shop-grid">
          {TRAILS.map(t => {
            const grade = TRAIL_GRADES[t]!;
            const mine = ownsTrail(owned, t);
            return (
              <ShopCard
                priceFormat={fr}
                key={t}
                id={'shop-trail-' + t}
                title={trailLabel(t)}
                subtitle="Traînée"
                grade={grade}
                gradeLabel={GRADE_LABELS[grade]}
                image={<TrailStrip trail={t as TrailKind} label={trailLabel(t)} />}
                owned={mine}
                locked="Politibox uniquement"
                ownedLabel="Acquise"
                buyProps={{ id: 'b-trail-' + t }}
                onTry={mine && !guest ? () => actions.equip('trail', t) : () => tryIt('trail', t)}
                tryLabel={mine && !guest ? 'Équiper' : 'Essayer'}
                trying={tryOn?.category === 'trail' && tryOn?.value === t}
                tryProps={{ id: (mine && !guest ? 'b-equip-trail-' : 'b-try-trail-') + t }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * The fitting room beside the shelves (DEC-073): the player's kart on the
 * podium, wearing what they tried on, with what it is, its grade and the
 * way to own it -- buy it, win it in a Politibox (a trail), or equip it if
 * it is already theirs -- and the way to take it off.
 */
function FittingRoom({ ui, coins, guest }: { ui: UiSnapshot; coins: number; guest: boolean }) {
  const t = ui.tryOn;
  if (!t) {
    return (
      <div className="fitting" id="shop-fitting-idle">
        <Disclaimer>Essayez une pièce ou une traînée : elle se monte ici, sur votre kart, avant tout achat.</Disclaimer>
      </div>
    );
  }
  const owned = ownedOf(ui);
  const trail = t.category === 'trail';
  const grade = trail ? TRAIL_GRADES[t.value] ?? 'common' : PART_GRADES[t.category]?.[t.value] ?? 'common';
  const price = trail ? null : PART_PRICE[grade];
  const mine = trail ? ownsTrail(owned, t.value) : ownsPart(owned, t.category, t.value);
  const name = trail ? 'Traînée ' + trailLabel(t.value).toLowerCase() : partPhrase(t.category, t.value);
  return (
    <div className="fitting" id="shop-fitting">
      <div className="fitting-head">
        <span className="fitting-label">Essayage</span>
        <GradeBadge grade={grade} label={GRADE_LABELS[grade]} size="sm" />
      </div>
      <div className="fitting-name" id="shop-fitting-name">{name}</div>
      <Row className="fitting-actions">
        {mine && !guest ? (
          <Button id="b-fit-equip" onClick={() => actions.equip(t.category, t.value)}>Équiper</Button>
        ) : trail ? (
          <Button id="b-fit-box" onClick={() => actions.shopTab('box')}>Tenter la Politibox</Button>
        ) : (
          <Button id="b-fit-buy" disabled={guest || ui.shop.busy || coins < (price ?? 0)} onClick={() => { void actions.buyPart(t.category, t.value); }}>
            {guest ? 'Compte requis' : coins < (price ?? 0) ? 'Encore ' + fr((price ?? 0) - coins) + ' politicoins' : 'Acheter · ' + fr(price ?? 0)}
          </Button>
        )}
        <Button id="b-fit-off" variant="ghost" onClick={actions.takeOff}>Retirer</Button>
      </Row>
    </div>
  );
}

/**
 * The Boutique (DEC-037, DEC-073): the balance and the collection's
 * progress over the shelves -- the Politibox and its shop window, the
 * candidates, the parts and trails -- beside a fitting room where the
 * player's kart wears whatever they try on, on the podium. Rendered only
 * where a game server runs the economy; a guest sees it all with every buy
 * button disabled. Prices are the catalogue's, shown here and charged by
 * the server, which never takes one from the page.
 */
export function ShopScreen({ ui }: { ui: UiSnapshot }) {
  const guest = !ui.account;
  const coins = ui.account?.profile.coins ?? 0;
  const owned = ownedOf(ui);
  const coll = collectionOf(owned);
  const chosen = CHARS[ui.charIdx] ?? CHARS[0]!;
  return (
    <Screen id="s-shop" hidden={ui.state !== 'shop'} className={ui.noteHidden ? undefined : 'noted'}>
      <div className="shop-top">
        <Heading size="screen">Boutique</Heading>
        <CoinCount value={coins} label="politicoins" size="lg" format={fr} valueProps={{ id: 'coins' }} />
        {guest ? null : <CollectionMeter id="shop-collection" label="Collection" have={coll.have} total={coll.total} shares={coll.shares} figure={coll.have + ' / ' + coll.total} />}
      </div>
      {guest ? <Disclaimer id="shop-guest" style={{ color: 'var(--gold)' }}>Créez un compte pour gagner des politicoins.</Disclaimer> : null}
      <Disclaimer id="shop-error" role="status" hidden={!ui.shop.error} style={{ color: '#ff8a8a' }}>{ui.shop.error ?? ''}</Disclaimer>
      <Disclaimer id="shop-notice" role="status" hidden={!ui.shop.notice} style={{ color: 'var(--gold)' }}>{ui.shop.notice ?? ''}</Disclaimer>
      <SelectLayout className="shop-layout">
        <div className="shop-main">
          <Tabs tabs={TABS} active={ui.shop.tab} onChange={tab => actions.shopTab(tab)} />
          <Panel className="shop-shelves">
            <BoxPanel ui={ui} coins={coins} guest={guest} />
            <CharsPanel ui={ui} coins={coins} guest={guest} />
            <PartsPanel ui={ui} coins={coins} guest={guest} />
          </Panel>
        </div>
        <Showcase
          id="shop-showcase"
          name={chosen.name}
          title={ui.tryOn ? 'Cabine d’essayage' : 'Votre kart'}
          quote=""
          stage={<ShowcaseStage id="shop-stage" aria-label={STAGE_LABEL} {...stageDrag()} />}
        >
          <FittingRoom ui={ui} coins={coins} guest={guest} />
        </Showcase>
      </SelectLayout>
      <Row>
        <Button id="b-shop-back" variant="ghost" onClick={actions.closeShop}>Retour</Button>
        <Button id="b-shop-garage" variant="ghost" onClick={() => actions.openGarage('shop')}>Mon Garage</Button>
      </Row>
    </Screen>
  );
}
