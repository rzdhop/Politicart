import { useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react';

import { Button, Disclaimer, Panel } from '@politikar/ui';

import { CHARACTERS, ITEMS } from '../engine/data.js';
import { GOD_HAZARDS, GOD_POWERS, MAX_LAPS } from '../engine/godcmd.js';
import { isNetRace } from '../engine/netrace.js';
import { G } from '../engine/state.js';
import { actions, isAdmin, type GodCmd, type UiSnapshot } from './store';
import type { Character } from './types';

/** One kart the console can aim at. */
export interface GodKart { slot: number; label: string }
type Target = number | 'all';

const CHARS = CHARACTERS as unknown as (Character & { power: { id: string } })[];
const ITEM_LIST = Object.entries(ITEMS as Record<string, { name: string; icon: string }>);
const POWER_NAMES: Record<string, string> = Object.fromEntries(CHARS.map(c => [c.power.id, c.power.name]));
const HAZARD_NAMES: Record<string, string> = { barricade: 'Barricade', fakebox: 'Fausse urne', lisier: 'Lisier', lacrymo: 'Lacrymogène', rondpoint: 'Rond-point', chatons: 'Chatons' };

const GROUP = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' } as const;
const SMALL = { fontSize: 12, padding: '4px 8px', minHeight: 0 } as const;
const TITLE = { fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 14, marginTop: 4 } as const;
const SELECT = { fontSize: 12, padding: 2, maxWidth: 150 } as const;

/**
 * The buttons that change a race at will (DEC-031): pick a kart (or every
 * one), then stun it, freeze it, slow it, boost it, give it any item, fire
 * its power or make it cast any power, drop a hazard in front of it, send it
 * to the front or the back, swap it with you, add or take a lap, make it a
 * god; and for the race, the number of laps and the end.
 *
 * Shared by the HUD (the admin racing) and the dashboard (the admin
 * watching). Every control blurs itself once used, so the keyboard that
 * drives the kart never presses a console button by accident.
 */
export function GodConsole({ karts, self, send, reply, idPrefix = 'god' }: { karts: GodKart[]; self: number | null; send: (cmd: GodCmd) => void; reply: string | null; idPrefix?: string }) {
  const [target, setTarget] = useState<Target>('all');
  const [item, setItem] = useState(ITEM_LIST[0]![0]);
  const [power, setPower] = useState(GOD_POWERS[0]!);
  const [hazard, setHazard] = useState(GOD_HAZARDS[0]!);
  const single = typeof target === 'number';
  const act = (cmd: GodCmd) => (e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); send(cmd); };
  const pick = (set: (v: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => { set(e.currentTarget.value); e.currentTarget.blur(); };
  const id = (s: string) => idPrefix + '-' + s;
  const btn = (key: string, label: ReactNode, cmd: GodCmd, enabled = true) => (
    <Button id={id(key)} variant="ghost" style={SMALL} disabled={!enabled} onClick={act(cmd)}>{label}</Button>
  );
  return (
    <div id={id('console')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={TITLE}>Cible</div>
      <div style={GROUP} id={id('targets')}>
        <Button id={id('target-all')} variant={target === 'all' ? 'primary' : 'ghost'} style={SMALL} aria-pressed={target === 'all'} onClick={e => { e.currentTarget.blur(); setTarget('all'); }}>Tous</Button>
        {karts.map(k => (
          <Button key={k.slot} id={id('target-' + k.slot)} variant={target === k.slot ? 'primary' : 'ghost'} style={SMALL} aria-pressed={target === k.slot} onClick={e => { e.currentTarget.blur(); setTarget(k.slot); }}>
            {k.label + (k.slot === self ? ' (vous)' : '')}
          </Button>
        ))}
      </div>
      <div style={TITLE}>Châtiments et bienfaits</div>
      <div style={GROUP}>
        {btn('stun', 'Foudroyer', { cmd: 'stun', target, dur: 2 })}
        {btn('freeze', 'Figer 6 s', { cmd: 'stun', target, dur: 6 })}
        {btn('slow', 'Ralentir', { cmd: 'slow', target })}
        {btn('boost', 'Booster', { cmd: 'boost', target })}
        {btn('fire', 'Son pouvoir', { cmd: 'fire', target })}
      </div>
      <div style={GROUP}>
        <select id={id('item-pick')} style={SELECT} value={item} onChange={pick(setItem)}>
          {ITEM_LIST.map(([k, v]) => <option key={k} value={k}>{v.icon + ' ' + v.name}</option>)}
        </select>
        {btn('give', 'Donner', { cmd: 'give', target, item })}
      </div>
      <div style={GROUP}>
        <select id={id('power-pick')} style={SELECT} value={power} onChange={pick(setPower)}>
          {GOD_POWERS.map(p => <option key={p} value={p}>{POWER_NAMES[p] ?? p}</option>)}
        </select>
        {btn('cast', 'Lui faire lancer', { cmd: 'cast', target, power }, single)}
      </div>
      <div style={GROUP}>
        <select id={id('hazard-pick')} style={SELECT} value={hazard} onChange={pick(setHazard)}>
          {GOD_HAZARDS.map(h => <option key={h} value={h}>{HAZARD_NAMES[h] ?? h}</option>)}
        </select>
        {btn('hazard', 'Poser devant', { cmd: 'hazard', target, type: hazard })}
      </div>
      <div style={TITLE}>Place et tours</div>
      <div style={GROUP}>
        {btn('front', 'En tête', { cmd: 'front', target }, single)}
        {btn('back', 'En queue', { cmd: 'back', target }, single)}
        {self !== null && btn('swap', 'Échanger avec moi', { cmd: 'swap', target, with: self }, single && target !== self)}
        {btn('lap-plus', '+1 tour', { cmd: 'lap', target, delta: 1 }, single)}
        {btn('lap-minus', '−1 tour', { cmd: 'lap', target, delta: -1 }, single)}
        {btn('god-on', 'Faire dieu', { cmd: 'god', target, on: true }, single)}
        {btn('god-off', 'Rendre mortel·le', { cmd: 'god', target, on: false }, single)}
      </div>
      <div style={TITLE}>La course</div>
      <div style={GROUP}>
        <span style={{ fontSize: 12 }}>Tours :</span>
        {Array.from({ length: MAX_LAPS }, (_, i) => i + 1).map(n => btn('laps-' + n, String(n), { cmd: 'laps', laps: n }))}
        {btn('finish', 'Terminer la course', { cmd: 'finish' })}
      </div>
      <Disclaimer id={id('reply')} role="status" style={{ minHeight: '1.2em', fontSize: 12, color: 'var(--gold)' }}>{reply ?? ''}</Disclaimer>
    </div>
  );
}

/** The karts of the race on screen, as the console lists them: the server's grid in a team race, the engine's field in solo. */
/** What the console reads of the engine's shared state (plain JS, so typed here). */
type Field = { karts: { def: { name: string }; isAI: boolean; god?: boolean }[]; player: unknown; netRoster?: { name: string; isAI: boolean; god?: boolean }[] };
const field = () => G as unknown as Field;

function raceKarts(): GodKart[] {
  const grid = field().netRoster;
  return field().karts.map((k, slot) => {
    const g = isNetRace() ? grid?.[slot] : undefined;
    const name = g?.isAI === false ? g.name : k.def.name;
    return { slot, label: name + (k.isAI ? ' (IA)' : '') + (k.god ? ' ⚡' : '') };
  });
}

/**
 * The god console over the race, for the admin only: a button in the HUD
 * (or the G key) opens it. Read when it renders, so it lists the karts that
 * joined since it last opened.
 */
export function GodPanel({ ui }: { ui: UiSnapshot }) {
  if (!isAdmin(ui)) return null;
  const self = (field().karts as unknown[]).indexOf(field().player);
  const reply = isNetRace() ? (ui.net.error ?? ui.net.notice) : ui.godReply;
  return (
    <div style={{ position: 'absolute', top: 120, right: 12, zIndex: 20, pointerEvents: 'auto', maxWidth: 'min(420px, calc(100vw - 24px))' }}>
      <Button id="b-god-console" variant={ui.godConsole ? 'primary' : 'ghost'} style={SMALL} aria-pressed={ui.godConsole} onClick={e => { e.currentTarget.blur(); actions.toggleGodConsole(); }}>
        {ui.godConsole ? '⚡ Fermer la console (G)' : '⚡ Console divine (G)'}
      </Button>
      {ui.godConsole && (
        <Panel id="god-panel" style={{ marginTop: 6, padding: 10, maxHeight: '65vh', overflowY: 'auto', textAlign: 'left' }}>
          <GodConsole karts={raceKarts()} self={self >= 0 ? self : null} send={actions.godCommand} reply={reply} />
        </Panel>
      )}
    </div>
  );
}
