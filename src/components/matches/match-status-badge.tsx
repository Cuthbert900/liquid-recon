import {
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  SearchIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MatchStatus } from '@/lib/reconciliation-engine';

export const STATUS_META: Record<
  MatchStatus,
  {
    label: string;
    icon: typeof CheckCircle2Icon;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  matched: { label: 'Matched', icon: CheckCircle2Icon, variant: 'secondary' },
  timing: { label: 'Timing difference', icon: ClockIcon, variant: 'outline' },
  mispost: {
    label: 'Mis-post',
    icon: AlertTriangleIcon,
    variant: 'destructive',
  },
  investigate: {
    label: 'Investigate',
    icon: SearchIcon,
    variant: 'destructive',
  },
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  );
}

export function formatMoney(amount: number, currency?: string | null) {
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}
