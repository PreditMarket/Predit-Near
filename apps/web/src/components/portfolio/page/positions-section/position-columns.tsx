import type { ResponsiveTableColumn } from '@/components/v2';
import { MarketCell, PayoutCell, PriceCell, TradedCell } from './position-cells';
import type { PositionView } from './use-position-view';

/** A position as a desktop row: the columns `ResponsiveTable` lays out. */
export const POSITION_COLUMNS: ResponsiveTableColumn<PositionView>[] = [
  {
    key: 'market',
    header: 'Market',
    width: 'minmax(0,1fr)',
    cell: (view) => <MarketCell view={view} />,
  },
  {
    key: 'price',
    header: 'Avg → Now',
    align: 'right',
    width: '140px',
    cell: (view) => <PriceCell view={view} />,
  },
  {
    key: 'traded',
    header: 'Traded',
    align: 'right',
    width: '120px',
    cell: (view) => <TradedCell view={view} />,
  },
  {
    key: 'payout',
    header: 'Payout if right',
    align: 'right',
    width: '110px',
    cell: (view) => <PayoutCell view={view} />,
  },
];
