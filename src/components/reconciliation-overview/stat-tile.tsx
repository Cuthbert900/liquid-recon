import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: string;
}

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: StatTileProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {sub}
          </div>
        )}
      </div>
      {Icon && (
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted',
            tone
          )}
        >
          <Icon className="size-5" />
        </div>
      )}
    </div>
  );
}
