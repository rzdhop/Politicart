import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '../../cx';
import { Button } from '../controls/Button';

/** Someone who can be invited: an online friend not in the room yet. */
export interface Invitee {
  id: string;
  name: string;
}

export interface InviteRowProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Who can be invited. */
  friends: readonly Invitee[];
  /** Called with the friend's id. */
  onInvite: (id: string) => void;
  /** A caption before the buttons. */
  label?: ReactNode;
  /** A button's text. Defaults to "Invite <name>". */
  inviteLabel?: (name: string) => ReactNode;
  /** A button's id, for a consumer that must address it. */
  buttonId?: (id: string) => string;
  /** What shows when nobody can be invited. */
  empty?: ReactNode;
}

/**
 * Invite friends into the room: one ghost button per online friend who is
 * not in it yet, after an optional caption; a muted line instead when there
 * is nobody to invite. Wraps on a narrow screen.
 *
 * ```tsx
 * <InviteRow id="lobby-invite" label="Inviter" friends={online} onInvite={invite}
 *   inviteLabel={n => 'Inviter ' + n} buttonId={id => 'b-mp-invite-' + id}
 *   empty="Aucun·e ami·e en ligne." />
 * ```
 */
export function InviteRow({
  friends,
  onInvite,
  label,
  inviteLabel = (name) => `Invite ${name}`,
  buttonId,
  empty,
  className,
  ...rest
}: InviteRowProps) {
  return (
    <div className={cx('invite-row', className)} {...rest}>
      {label === undefined ? null : <span className="ir-label">{label}</span>}
      {friends.length
        ? friends.map((f) => (
            <Button key={f.id} id={buttonId?.(f.id)} variant="ghost" onClick={() => onInvite(f.id)}>
              {inviteLabel(f.name)}
            </Button>
          ))
        : empty === undefined ? null : <span className="ir-empty">{empty}</span>}
    </div>
  );
}
