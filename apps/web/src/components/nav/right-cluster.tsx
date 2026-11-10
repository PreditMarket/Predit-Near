'use client';

import { BalanceMenu } from '@/components/funds/balance-menu';
import { CreateMarketButton } from './create-market-button';
import { NearAccountMenu } from './near-account-menu';

/** The nav's right side: Create market (where markets show), the money pill and the account. */
export function RightCluster() {
  return (
    <div className="ml-auto flex items-center gap-2">
      <CreateMarketButton />
      <BalanceMenu />
      <NearAccountMenu />
    </div>
  );
}
