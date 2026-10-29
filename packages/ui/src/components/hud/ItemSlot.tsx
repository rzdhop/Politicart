import {
  useImperativeHandle,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';

import { cx } from '../../cx';
import { replayClass } from './handles';

export interface ItemSlotHandle {
  /**
   * Set what the slot holds, bypassing React. Pass `null` for both to show the
   * empty slot.
   */
  setItem(item: { icon: string | null; label: string | null; filled?: boolean }): void;
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
 * in `fx.css`, off under reduced motion.
 *
 * ```tsx
 * <ItemSlot icon="🚀" label="49.3 Turbo" filled />
 * <ItemSlot icon="·" label="aucun objet" />
 * ```
 */
export function ItemSlot({ icon, label, filled = false, rolling = false, className, ref, ...rest }: ItemSlotProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const iconNode = useRef<HTMLDivElement | null>(null);
  const labelNode = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setItem({ icon: nextIcon, label: nextLabel, filled: nextFilled }) {
        if (iconNode.current !== null) iconNode.current.textContent = nextIcon ?? '';
        if (labelNode.current !== null) labelNode.current.textContent = nextLabel ?? '';
        root.current?.classList.toggle('has', nextFilled ?? nextIcon !== null);
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
    <div ref={root} className={cx('item', filled && 'has', rolling && 'rolling', className)} {...rest}>
      <div ref={iconNode} className="ico">
        {icon}
      </div>
      <div ref={labelNode} className="nm">
        {label}
      </div>
    </div>
  );
}
