'use client';

import { useFundsDialog } from '@/store/funds-dialog.store';
import { DepositDialog } from './deposit-dialog';
import { WithdrawDialog } from './withdraw-dialog';

/** The money dialogs, mounted once and opened through `useFundsDialog().open(...)`. */
export function FundsDialogHost() {
  const shown = useFundsDialog((s) => s.shown);
  const close = useFundsDialog((s) => s.close);
  const onOpenChange = (open: boolean) => !open && close();
  return (
    <>
      {shown === 'deposit' && <DepositDialog open onOpenChange={onOpenChange} />}
      {shown === 'withdraw' && <WithdrawDialog open onOpenChange={onOpenChange} />}
    </>
  );
}
