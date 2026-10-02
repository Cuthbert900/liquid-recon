import { Card, CardContent } from '@/components/ui/card';
import { formatMoney } from '@/components/matches/match-status-badge';
import type { ReconciliationResult } from '@/lib/reconciliation-engine';
import {
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  SearchIcon,
} from 'lucide-react';

interface MatchSummaryProps {
  result: ReconciliationResult;
}

export function MatchSummary({ result }: MatchSummaryProps) {
  const { summary, totalsBySource } = result;
  const totalRecords =
    totalsBySource.dynamics.count +
    totalsBySource.prism.count +
    totalsBySource.bank.count;

  const cards = [
    {
      label: 'Matched',
      value: summary.matched,
      sub: formatMoney(summary.matchedValue),
      icon: CheckCircle2Icon,
      tone: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Timing differences',
      value: summary.timing,
      sub: 'posted on different dates',
      icon: ClockIcon,
      tone: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Mis-posts',
      value: summary.mispost,
      sub: 'amount variance across sources',
      icon: AlertTriangleIcon,
      tone: 'text-destructive',
    },
    {
      label: 'Investigate',
      value: summary.investigate,
      sub: formatMoney(summary.exceptionValue) + ' exposed',
      icon: SearchIcon,
      tone: 'text-destructive',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {c.value.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">{c.sub}</div>
            </div>
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted ${c.tone}`}
            >
              <c.icon className="size-5" />
            </div>
          </CardContent>
        </Card>
      ))}
      {totalRecords === 0 && (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No extracts uploaded yet — go to Data Sources and upload Dynamics,
            Prism, or Bank extracts to see reconciliation results here.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
