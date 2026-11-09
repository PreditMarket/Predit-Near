'use client';

import { CreateMarketButton } from './create-market-button';
import { NearAccountMenu } from './near-account-menu';

/** The nav's right side: Create market (where markets show) and the wallet. */
export function RightCluster() {
  return (
    <div className="ml-auto flex items-center gap-2">
      <CreateMarketButton />
      <NearAccountMenu />
    </div>
  );
}
