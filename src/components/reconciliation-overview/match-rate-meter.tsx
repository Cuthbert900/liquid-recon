'use client';

interface MatchRateMeterProps {
  matched: number;
  total: number;
}

export function MatchRateMeter({ matched, total }: MatchRateMeterProps) {
  const rate = total > 0 ? matched / total : 0;
  const pct = Math.round(rate * 100);

  // Fill carries severity: healthy match rate reads good, a low one reads
  // critical — same status ramp used everywhere else, never a bespoke hue.
  const fillColor =
    rate >= 0.8
      ? 'var(--status-good)'
      : rate >= 0.5
        ? 'var(--status-warning)'
        : 'var(--status-critical)';

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Match rate</span>
        <span className="text-lg font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: fillColor }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {matched.toLocaleString()} of {total.toLocaleString()} reconciliation
        groups matched cleanly
      </div>
    </div>
  );
}
