import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Money, PnlValue, ResponsiveTable, SegmentedTabs, SplitBar, StatTile } from './index';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('v2 primitives', () => {
  it('Money and PnlValue format and colour', () => {
    expect(html(<Money value="1234.5" />)).toContain('$1,234.50');
    const down = html(<PnlValue value={-12.3} pct={-4.8} />);
    expect(down).toContain('-$12.30');
    expect(down).toContain('(-4.80%)');
    expect(down).toContain('text-danger');
    expect(html(<PnlValue value={5} />)).toContain('text-success');
    expect(html(<PnlValue value={null} pct={3} />)).toMatch(/text-muted-foreground">—</);
  });

  it('StatTile swaps the value for a skeleton while loading', () => {
    expect(html(<StatTile label="Win rate" value="62%" sub="12 trades" />)).toContain('12 trades');
    const loading = html(<StatTile label="Win rate" value="62%" sub="12 trades" loading />);
    expect(loading).toContain('data-slot="skeleton"');
    expect(loading).not.toContain('62%');
    expect(loading).not.toContain('12 trades');
  });

  it('SegmentedTabs marks the active tab and shows counts', () => {
    const out = html(
      <SegmentedTabs
        value="b"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'All', count: 3 },
          { value: 'b', label: 'Open', count: null },
        ]}
      />,
    );
    expect(out).toContain('·3');
    expect(out).toMatch(/aria-selected="true"[^>]*>Open/);
  });

  it('ResponsiveTable renders rows, cards, skeletons and the empty state', () => {
    const columns = [
      { key: 'n', header: 'N', cell: (r: { id: string; n: number }) => `n${r.n}`, width: '120px' },
    ];
    const rows = html(
      <ResponsiveTable
        rows={[{ id: '1', n: 7 }]}
        columns={columns}
        getRowKey={(r) => r.id}
        renderCard={(r) => <b>card{r.n}</b>}
      />,
    );
    expect(rows).toContain('n7');
    expect(rows).toContain('card7');
    expect(rows).toContain('grid-template-columns:120px');

    const loading = html(
      <ResponsiveTable rows={[]} columns={columns} getRowKey={(r) => r.id} renderCard={() => null} loading skeletonRows={2} />,
    );
    expect(loading.match(/data-slot="skeleton"/g)).toHaveLength(4);

    const empty = html(
      <ResponsiveTable rows={[]} columns={columns} getRowKey={(r) => r.id} renderCard={() => null} empty="No trades yet." />,
    );
    expect(empty).toContain('No trades yet.');
  });

  it('SplitBar grows segments in proportion and drops empty ones', () => {
    const out = html(
      <SplitBar
        parts={[
          { value: 3, className: 'bg-success' },
          { value: 0, className: 'bg-muted' },
          { value: 1, className: 'bg-danger' },
        ]}
      />,
    );
    expect(out.match(/flex-grow:/g)).toHaveLength(2);
    expect(out).toContain('flex-grow:3');
    expect(out).not.toContain('width:');
  });
});
