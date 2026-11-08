'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/v2';
import { Skeleton } from '@/components/ui/skeleton';
import { EditProfileDialog } from '@/components/social/edit-profile-dialog';
import { ProfileHeader } from '@/components/social/profile-header';
import { v2AccountLabel } from '@/lib/v2/account-label';
import { getMySocialProfile, socialKeys } from '@/lib/v2/social';
import { walletPerChain } from '@/lib/v2/wallets';
import { useV2AuthStore } from '@/store/v2-auth-store';

/**
 * Who this portfolio belongs to, drawn exactly as the owner's `/u/@handle`
 * header (Edit profile opens the same dialog here). Without a public profile
 * yet, the account's name and a link to set one up.
 */
export function PortfolioIdentity() {
  const status = useV2AuthStore((s) => s.status);
  const v2User = useV2AuthStore((s) => s.user);
  const userId = status === 'authenticated' ? (v2User?.id ?? null) : null;
  const [editing, setEditing] = useState(false);

  // Same cache entry as the nav's "My profile" and `/u`.
  const mine = useQuery({
    queryKey: socialKeys.mine(userId),
    queryFn: getMySocialProfile,
    enabled: !!userId,
    staleTime: 60_000,
  });
  const social = mine.data?.profile ?? null;

  if (social) {
    return (
      <div data-testid="portfolio-identity">
        <ProfileHeader
          profile={social}
          viewerId={userId}
          ready
          onEdit={() => setEditing(true)}
        />
        <EditProfileDialog
          open={editing}
          onOpenChange={setEditing}
          profile={social}
          viewerId={userId}
        />
      </div>
    );
  }

  const wallet =
    walletPerChain(v2User?.wallets ?? []).find((w) => w.chain === 'SOL')?.address ?? '';
  const ready = status !== 'loading' && !!v2User && !mine.isLoading;

  return (
    <section
      data-testid="portfolio-identity"
      className="flex items-start gap-4 min-w-0 pt-6 pb-6"
    >
      {ready ? (
        <UserAvatar
          address={wallet || v2User.id}
          photoUrl={v2User.avatarUrl ?? null}
          size={64}
        />
      ) : (
        <Skeleton className="size-16 shrink-0 rounded-full" />
      )}
      <div className="min-w-0 flex flex-col gap-1.5">
        {ready ? (
          <>
            <h1 className="font-mono text-[18px] font-semibold tracking-[-0.005em] truncate max-w-[24ch]">
              {v2AccountLabel(v2User, wallet)}
            </h1>
            {mine.data && (
              <Link
                href="/u"
                className="font-mono text-[12px] text-muted-foreground hover:text-foreground w-fit"
              >
                Set up your public profile →
              </Link>
            )}
          </>
        ) : (
          <>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-24" />
          </>
        )}
      </div>
    </section>
  );
}
