import { useImperativeHandle, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { cx } from '../../cx';

/** A connection's measures, in milliseconds: the round trip (null until the first pong) and the render delay. */
export interface Latency {
  rtt: number | null;
  delay: number;
}

/** How a round trip reads: `good` under GOOD_MS, `fair` under FAIR_MS, `poor` past it, `unknown` before the first measure. */
export type LatencyQuality = 'good' | 'fair' | 'poor' | 'unknown';

export const GOOD_MS = 90;
export const FAIR_MS = 170;

/** The quality of a round trip (see `LatencyQuality`). */
export function latencyQuality(rtt: number | null | undefined): LatencyQuality {
  if (rtt === null || rtt === undefined || !Number.isFinite(rtt)) return 'unknown';
  return rtt < GOOD_MS ? 'good' : rtt < FAIR_MS ? 'fair' : 'poor';
}

/** The default text: "ping 48 ms · delay 100 ms", "…" before the first measure. */
export const formatLatency = ({ rtt, delay }: Latency) => `ping ${rtt ?? '…'} ms · delay ${delay} ms`;

export interface LatencyReadoutHandle {
  /** Show these measures, or hide the readout (null: no connection, solo play). Writes only what changed. */
  setLatency(latency: Latency | null): void;
}

export interface LatencyReadoutProps extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** The measures to show; null or omitted hides the readout. */
  latency?: Latency | null;
  /** How the measures are written. The game passes French. */
  format?: (latency: Latency) => string;
  /** Imperative handle, driven from the game loop. */
  ref?: Ref<LatencyReadoutHandle>;
}

/**
 * A team race's connection: the round trip to the server and how far
 * behind the other karts are drawn, in the clock's quiet monospace, after
 * a dot coloured by the round trip -- green under 90 ms, gold under 170,
 * red past it, grey before the first measure. Hidden (the `hidden`
 * attribute) when there is no connection to show, as in solo play.
 *
 * The measures move every second, so the game drives it through the
 * handle, which writes the text and the quality only when they change.
 *
 * ```tsx
 * const net = useRef<LatencyReadoutHandle>(null);
 * <LatencyReadout ref={net} format={l => `ping ${l.rtt ?? '…'} ms · délai ${l.delay} ms`} />
 * net.current?.setLatency(payload.net ?? null);
 * ```
 */
export function LatencyReadout({ latency = null, format = formatLatency, className, ref, ...rest }: LatencyReadoutProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const fmt = useRef(format);
  fmt.current = format;

  useImperativeHandle(
    ref,
    () => ({
      setLatency(next: Latency | null) {
        const el = root.current;
        if (el === null) return;
        const text = next ? fmt.current(next) : '';
        const quality = next ? latencyQuality(next.rtt) : 'unknown';
        if (el.textContent !== text) el.textContent = text;
        if (el.dataset.quality !== quality) el.dataset.quality = quality;
        if (el.hidden !== !next) el.hidden = !next;
      },
    }),
    [],
  );

  return (
    <div
      ref={root}
      className={cx('latency', className)}
      data-quality={latency ? latencyQuality(latency.rtt) : 'unknown'}
      hidden={!latency}
      {...rest}
    >
      {latency ? format(latency) : ''}
    </div>
  );
}
