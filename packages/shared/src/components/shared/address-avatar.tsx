'use client';

import { useEffect, useState } from 'react';
import Avatar from 'boring-avatars';

const PALETTE = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B'];

interface AddressAvatarProps {
  address: string;
  size?: number;
  className?: string;
  shape?: 'circle' | 'square';
  /** Uploaded profile photo URL — shown instead of the generated avatar when present. */
  photoUrl?: string | null;
}

/** 8-bit pixel avatar deterministically generated from a wallet address, or
 * an uploaded photo when `photoUrl` is provided. Falls back to the
 * generated avatar if the photo fails to load (deleted file, broken URL,
 * CORS, ...) instead of showing a broken image icon. */
export function AddressAvatar({
  address,
  size = 32,
  className,
  shape = 'circle',
  photoUrl,
}: AddressAvatarProps) {
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);

  const showPhoto = !!photoUrl && !photoFailed;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'square' ? 8 : '50%',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          // X and Google profile photos refuse hotlinks that send a referrer.
          referrerPolicy="no-referrer"
          // Feeds list many authors; fetch only the ones near the viewport.
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <Avatar
          name={address}
          variant="pixel"
          size={size}
          square={shape === 'square'}
          colors={PALETTE}
        />
      )}
    </div>
  );
}
