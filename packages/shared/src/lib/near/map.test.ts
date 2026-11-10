import { describe, expect, it } from 'vitest';
import { claimRows } from './map';
import type { NearClaim, NearMarket, NearPosition } from './types';
import settled from './__fixtures__/market-finalized-yes.json';

const market = settled as unknown as NearMarket;
const none: NearPosition = { yes_shares: '0', no_shares: '0', yes_cost: '0', no_cost: '0' };
const redeem = (position: Partial<NearPosition>): NearClaim => ({
  kind: 'redeem',
  position: { ...none, ...position },
  payout: '4940000',
  at_sec: '1794300000',
});

describe('claimRows', () => {
  it('turns a redeemed winning side back into a claimed row with what was paid', () => {
    const [row, ...rest] = claimRows(market, none, redeem({ yes_shares: '5000000', yes_cost: '2991000' }));
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({ side: 'buy_yes', status: 'claimed', claimKind: 'redeem', claimAmount: '4940000', amountIn: '2991000', claimAction: null });
  });

  it('keeps a losing side cleared with the claim as lost', () => {
    const rows = claimRows(market, none, redeem({ yes_cost: '2991000', yes_shares: '1', no_cost: '1000000', no_shares: '1' }));
    expect(rows.map((r) => [r.side, r.status])).toEqual([
      ['buy_yes', 'claimed'],
      ['buy_no', 'lost'],
    ]);
  });

  it('adds nothing for a side the account still holds', () => {
    const held = { ...none, no_cost: '1000000', no_shares: '1' };
    const rows = claimRows(market, held, redeem({ yes_cost: '2991000', yes_shares: '1', no_cost: '1000000', no_shares: '1' }));
    expect(rows.map((r) => r.side)).toEqual(['buy_yes']);
  });

  it('marks a paid refund as claimed but not as a right call', () => {
    const [row] = claimRows(market, none, { ...redeem({ no_cost: '2000000', no_shares: '1' }), kind: 'refund' });
    expect(row).toMatchObject({ status: 'claimed', claimKind: 'refund', claimAmount: '2000000' });
  });
});
