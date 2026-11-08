import type { Metadata } from 'next';
import { SocialProfilePage } from '@/components/social/social-profile-page';
import { buildMetadata } from '@/lib/metadata/build-metadata';
import {
  fetchSocialFillsForPage,
  fetchSocialPnlSummaryForPage,
  fetchSocialProfileForPage,
  handleFromParam,
  profilePath,
} from '@/lib/v2/social';

type Params = { handle: string };

/**
 * `/u/@handle` (also `/u/handle`). The public profile, its first trades and
 * its PnL are rendered on the server from anonymous fetches that Next caches
 * for 30s, run side by side; generateMetadata and the page share the profile
 * request.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const handle = handleFromParam((await params).handle);
  const profile = await fetchSocialProfileForPage(handle);
  const name = profile?.displayName || `@${profile?.handle ?? handle}`;
  return buildMetadata({
    title: profile ? `${name} (@${profile.handle})` : 'Trader profile',
    description:
      profile?.bio ?? `See @${handle}'s trades and PnL on Predit.`,
    path: profilePath(profile?.handle ?? handle),
  });
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const handle = handleFromParam((await params).handle);
  const [initialProfile, initialFills, initialPnl] = await Promise.all([
    fetchSocialProfileForPage(handle),
    fetchSocialFillsForPage(handle),
    fetchSocialPnlSummaryForPage(handle),
  ]);
  return (
    <SocialProfilePage
      handle={handle}
      initialProfile={initialProfile}
      initialFills={initialProfile ? initialFills : null}
      initialPnl={initialProfile ? initialPnl : null}
    />
  );
}
