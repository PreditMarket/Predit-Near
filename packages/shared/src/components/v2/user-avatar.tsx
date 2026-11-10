'use client';

import { AddressAvatar } from '@/components/shared/address-avatar';
import { cn } from '@/components/ui/utils';

export interface UserAvatarProps {
  /** Seeds the generated avatar shown when there is no (loadable) photo. */
  address: string;
  /** Profile photo (the X avatar, for feed authors). Falls back on load error. */
  photoUrl?: string | null;
  /** Accessible name; the avatar is decorative without it. */
  name?: string | null;
  size?: number;
  /** `square` is `rounded-md`. */
  shape?: 'square' | 'circle';
  className?: string;
}

/**
 * The one avatar for an account: its photo when there is one, otherwise the
 * pixel avatar generated from its address. Replaces `V2Avatar` and direct
 * `AddressAvatar` use.
 */
export function UserAvatar({
  address,
  photoUrl,
  name,
  size = 32,
  shape = 'square',
  className,
}: UserAvatarProps) {
  return (
    <span
      className="inline-flex shrink-0"
      {...(name ? { role: 'img', 'aria-label': name, title: name } : { 'aria-hidden': true })}
    >
      <AddressAvatar
        address={address}
        photoUrl={photoUrl}
        size={size}
        shape={shape}
        // AddressAvatar rounds a square by 8px inline; the v2 look is rounded-md.
        className={cn(shape === 'square' && '!rounded-md', className)}
      />
    </span>
  );
}
