'use client';

import { V2AccountMenu } from '@/components/v2/v2-account-menu';
import { BalanceMenu } from './balance-menu';
import { ConnectAiButton } from './connect-ai-button';
import { CreateMarketButton } from './create-market-button';

/**
 * The nav's right side: Create market (where markets show), Connect AI, the
 * money pill and the account menu.
 */
export function RightCluster() {
  return (
    <div className="ml-auto flex items-center gap-2">
      <CreateMarketButton />
      <ConnectAiButton />
      <BalanceMenu />
      <V2AccountMenu />
    </div>
  );
}
