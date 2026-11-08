'use client';

export interface AdvanceStat {
  label: string;
  /** Formatted value (e.g. "+$38.12"). */
  value: string;
  /** Small sub-line beneath the value. */
  sub: string;
  tone: 'win' | 'lose';
}

export interface AdvanceRow {
  label: string;
  value: string;
}

interface AdvancePanelProps {
  /** Two hero stat tiles side-by-side. */
  stats: [AdvanceStat, AdvanceStat];
  meterLabel: string;
  meterValue: string;
  /** Marker position as an integer 0..100 (percent along the track). */
  markerPct: number;
  markerLabel: string;
  /** Impact string shown in the foot of the meter, e.g. "+0.4%". */
  impactText: string;
  rows: AdvanceRow[];
}

/** Slide-in advance panel — hero tiles, gradient price-track meter, compact
 * 2-col fee/min-received rail. All values match the mockup exactly. */
export function AdvancePanel({
  stats,
  meterLabel,
  meterValue,
  markerPct,
  markerLabel,
  impactText,
  rows,
}: AdvancePanelProps) {
  const clampedPct = Math.max(0, Math.min(100, markerPct));
  return (
    <div
      className="flex flex-col gap-[12px] rounded-[12px] border border-white/[0.06] p-[12px] font-mono"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(102,237,244,0.03), transparent 60%)',
        backgroundColor: '#12151a',
        animation: 'trade-card-slide 0.18s ease',
      }}
    >
      {/* Hero tiles */}
      <div className="grid grid-cols-2 gap-[8px]">
        {stats.map((s) => (
          <StatTile key={s.label} stat={s} />
        ))}
      </div>

      {/* Price-track meter */}
      <div className="rounded-[10px] border border-white/[0.06] bg-card px-[12px] py-[10px]">
        <div className="mb-[8px] flex items-baseline justify-between">
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">
            {meterLabel}
          </span>
          <span className="font-mono text-[15px] font-extrabold text-primary">
            {meterValue}
          </span>
        </div>
        <div className="relative my-[6px] h-[4px] rounded-[2px] bg-white/[0.06]">
          <div
            className="absolute inset-y-0 left-0 rounded-[2px] opacity-60"
            style={{
              width: `${clampedPct}%`,
              backgroundImage:
                'linear-gradient(90deg, #f87171, #f5b93a, #4ade80)',
            }}
          />
          <div
            className="absolute -top-[6px] h-[16px] w-[2px] -translate-x-[1px] bg-primary shadow-[0_0_8px_#66edf4]"
            style={{ left: `${clampedPct}%` }}
          >
            <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-primary px-[6px] py-[1px] font-mono text-[9px] font-extrabold text-background">
              {markerLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-[9.5px] font-semibold text-faint">
          <span>0¢</span>
          <span className="font-extrabold text-warning">{impactText}</span>
          <span>100¢</span>
        </div>
      </div>

      {/* Compact detail rail */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-y-[4px] gap-x-[16px] border-t border-dashed border-white/[0.06] pt-[4px]">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between text-[11px]"
            >
              <span className="text-faint">{r.label}</span>
              <span className="font-bold text-foreground">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes trade-card-slide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

function StatTile({ stat }: { stat: AdvanceStat }) {
  const winBorder = 'border-success/[0.28]';
  const loseBorder = 'border-danger/[0.28]';
  // Value gets a subtle box glow (text-shadow via CSS custom prop for
  // arbitrary color — Tailwind's drop-shadow util doesn't accept rgba easily).
  const isWin = stat.tone === 'win';
  const valueStyle = isWin
    ? { color: '#4ade80', textShadow: '0 0 20px rgba(34,209,126,0.25)' }
    : { color: '#f87171', textShadow: '0 0 20px rgba(255,87,87,0.2)' };
  // Radial glow overlay — currentColor + 5% opacity, top-left, tile-shaped.
  const glowStyle: React.CSSProperties = {
    background: `radial-gradient(circle at top left, ${isWin ? '#4ade80' : '#f87171'} 0%, transparent 50%)`,
    opacity: 0.05,
    pointerEvents: 'none',
  };
  return (
    <div
      className={`relative flex flex-col gap-[2px] overflow-hidden rounded-[10px] border px-[12px] py-[10px] ${
        isWin ? winBorder : loseBorder
      }`}
    >
      <div className="absolute inset-0" style={glowStyle} />
      <span className="relative font-mono text-[9.5px] font-bold uppercase tracking-[0.07em] text-faint">
        {stat.label}
      </span>
      <span
        className="relative font-mono text-[20px] font-extrabold leading-[1.1] tracking-[-0.01em]"
        style={valueStyle}
      >
        {stat.value}
      </span>
      <span className="relative font-mono text-[9.5px] font-semibold text-faint">
        {stat.sub}
      </span>
    </div>
  );
}
