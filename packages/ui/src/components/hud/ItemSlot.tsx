import {
  useImperativeHandle,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';

import { cx } from '../../cx';
import { replayClass } from './handles';

/** An item's rarity: a rare or mythic one gets a coloured rim (the Politibox grades' colours). */
export type ItemTier = 'common' | 'rare' | 'mythic';

export interface ItemSlotHandle {
  /**
   * Set what the slot holds, bypassing React. Pass `null` for both to show the
   * empty slot. `tier` tints the rim, `count` (past one) shows the uses left
   * of an item that has several.
   */
  setItem(item: { icon: string | null; label: string | null; filled?: boolean; tier?: ItemTier | null; count?: number }): void;
  /** Burst the slot once: a rare or mythic item has just landed (the jackpot). */
  flashJackpot(): void;
  /** Spin the roulette while an item is being drawn: the glyph rolls like a slot machine's reel. */
  setRolling(rolling: boolean): void;
  /** Flash the slot once: the item has just been used. */
  flashUsed(): void;
}

export interface ItemSlotProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'ref'> {
  /** The item's glyph, set at 40px. The game uses a single emoji per item. */
  icon?: ReactNode;
  /** The item's name, uppercased and muted under the glyph. */
  label?: ReactNode;
  /**
   * Whether the slot holds something: adds a gold border and glow. Kept
   * separate from `icon` so a placeholder glyph can still read as empty, which
   * is what the game's `·` does.
   */
  filled?: boolean;
  /** Whether the roulette spins (an item is being drawn). */
  rolling?: boolean;
  /** The held item's rarity: rare and mythic tint the rim. */
  tier?: ItemTier | null;
  /** The uses left of an item that has several; shown as ×N past one. */
  count?: number;
  /** Imperative handle for updates driven from the game loop. */
  ref?: Ref<ItemSlotHandle>;
}

/**
 * The held-item slot, bottom-left.
 *
 * A 92px square panel (70px on phones) with the item's glyph over its name.
 * When it holds something it gains a gold border and an 18px glow, which is
 * the HUD's one piece of "you can act now" signalling.
 *
 * The game only writes to this on pickup and use rather than every frame, but
 * the handle is here so those writes do not have to go through a React render
 * mid-race. While an item is drawn the glyph rolls (`rolling`, `setRolling`),
 * and `flashUsed()` flashes the slot when the item goes; both keyframes are
 * in `fx.css`, off under reduced motion. A rare or mythic item tints the rim
 * in its grade's colour (`tier`) and lands with a burst (`flashJackpot()`);
 * an item of several uses shows how many are left (`count`, as ×3).
 *
 * ```tsx
 * <ItemSlot icon="🚀" label="49.3 Turbo" filled />
 * <ItemSlot icon="·" label="aucun objet" />
 * ```
 */
export function ItemSlot({ icon, label, filled = false, rolling = false, tier = null, count = 1, className, ref, ...rest }: ItemSlotProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const iconNode = useRef<HTMLDivElement | null>(null);
  const labelNode = useRef<HTMLDivElement | null>(null);
  const countNode = useRef<HTMLSpanElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setItem({ icon: nextIcon, label: nextLabel, filled: nextFilled, tier: nextTier = null, count: nextCount = 1 }) {
        if (iconNode.current !== null) iconNode.current.textContent = nextIcon ?? '';
        if (labelNode.current !== null) labelNode.current.textContent = nextLabel ?? '';
        const el = root.current;
        el?.classList.toggle('has', nextFilled ?? nextIcon !== null);
        el?.classList.toggle('tier-rare', nextTier === 'rare');
        el?.classList.toggle('tier-mythic', nextTier === 'mythic');
        if (countNode.current !== null) { countNode.current.textContent = nextCount > 1 ? '×' + nextCount : ''; countNode.current.hidden = !(nextCount > 1); }
      },
      flashJackpot() {
        replayClass(root.current, 'jackpot');
      },
      setRolling(next: boolean) {
        root.current?.classList.toggle('rolling', next);
      },
      flashUsed() {
        replayClass(root.current, 'used');
      },
    }),
    [],
  );

  return (
    <div ref={root} className={cx('item', filled && 'has', rolling && 'rolling', tier === 'rare' && 'tier-rare', tier === 'mythic' && 'tier-mythic', className)} {...rest}>
      <div ref={iconNode} className="ico">
        {icon}
      </div>
      <div ref={labelNode} className="nm">
        {label}
      </div>
      <span ref={countNode} className="uses" hidden={!(count > 1)}>
        {count > 1 ? '×' + count : ''}
      </span>
    </div>
  );
}
