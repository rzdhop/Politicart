import { memo } from 'react';
import {
  CenterAnnounce,
  DriftGauge,
  HudCorner,
  HudHint,
  HudLayer,
  ItemSlot,
  LapCounter,
  MinimapFrame,
  PositionReadout,
  PowerGauge,
  RaceTimer,
  SpeedReadout,
  Toast,
  WrongWay,
  type DriftGaugeHandle,
  type ItemSlotHandle,
  type PositionReadoutHandle,
  type PowerGaugeHandle,
  type SpeedReadoutHandle,
  type TextReadoutHandle,
  type ToastHandle,
  type WrongWayHandle,
} from '@kart-republique/ui';

import { attachMinimap } from '../engine/minimap.js';
import { useUi } from './store';

/**
 * The HUD's imperative handles, filled in by the readouts' refs when the HUD
 * mounts. game.js writes through these every frame; React never re-renders
 * the readouts after the first paint. A handle is null until mounted, and the
 * writer skips a frame rather than throwing if one is missing.
 */
export interface HudHandles {
  pos: PositionReadoutHandle | null;
  lap: TextReadoutHandle | null;
  time: TextReadoutHandle | null;
  item: ItemSlotHandle | null;
  power: PowerGaugeHandle | null;
  hint: TextReadoutHandle | null;
  speed: SpeedReadoutHandle | null;
  drift: DriftGaugeHandle | null;
  center: TextReadoutHandle | null;
  toast: ToastHandle | null;
  wrong: WrongWayHandle | null;
}

export const hud: HudHandles = {
  pos: null, lap: null, time: null, item: null, power: null, hint: null, speed: null, drift: null, center: null, toast: null, wrong: null,
};

/**
 * The readouts, rendered exactly once. Memoised with no props so the layer's
 * hidden toggle above never re-renders them: everything they show after the
 * first paint arrives through the handles, and a re-render would be wasted
 * work at best. The ids are the contract the E2E suite drives (DEC-009); the
 * ones on inner parts go through the library's part props (DEC-012).
 */
const Readouts = memo(function Readouts() {
  return (
    <>
      <HudCorner corner="topLeft">
        <PositionReadout id="h-pos" position={6} ref={(h) => { hud.pos = h; }} />
        <LapCounter id="h-lap" ref={(h) => { hud.lap = h; }}>TOUR 1/3</LapCounter>
        <RaceTimer id="h-time" ref={(h) => { hud.time = h; }}>0:00.00</RaceTimer>
      </HudCorner>
      <HudCorner corner="topRight">
        <MinimapFrame id="minimap" ref={(canvas) => { attachMinimap(canvas); }} />
      </HudCorner>
      <HudCorner corner="bottomLeft">
        <ItemSlot id="h-item" icon="·" label="aucun objet" ref={(h) => { hud.item = h; }} />
        <PowerGauge
          id="h-power"
          name="Pouvoir"
          charge={0}
          keyHint="F · recharge"
          nameProps={{ id: 'h-pname' }}
          fillProps={{ id: 'h-pbar' }}
          keyHintProps={{ id: 'h-pkey' }}
          ref={(h) => { hud.power = h; }}
        />
        <HudHint id="h-hint" ref={(h) => { hud.hint = h; }}>Ramassez une urne dorée pour obtenir un objet.</HudHint>
      </HudCorner>
      <HudCorner corner="bottomRight">
        <SpeedReadout value={0} valueProps={{ id: 'h-speed' }} ref={(h) => { hud.speed = h; }} />
        <DriftGauge value={0} fillProps={{ id: 'h-drift' }} ref={(h) => { hud.drift = h; }} />
      </HudCorner>
      <CenterAnnounce id="h-center" ref={(h) => { hud.center = h; }} />
      <Toast id="h-toast" ref={(h) => { hud.toast = h; }} />
      <WrongWay id="h-wrong" hidden ref={(h) => { hud.wrong = h; }}>SENS INTERDIT !</WrongWay>
    </>
  );
});

/** The HUD layer: visible while a race is live or paused, hidden on every menu. */
export function Hud() {
  const ui = useUi();
  const live = ui.state === 'countdown' || ui.state === 'race' || ui.state === 'paused';
  return (
    <HudLayer id="hud" hidden={!live}>
      <Readouts />
    </HudLayer>
  );
}
