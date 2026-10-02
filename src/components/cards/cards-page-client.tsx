'use client';

import { useMemo } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useReconciliation } from '@/lib/reconciliation-context';
import { MatchTable } from '@/components/matches/match-table';
import { formatMoney } from '@/components/matches/match-status-badge';

export function CardsPageClient() {
  const result = useReconciliation();

  const exceptions = useMemo(
    () => result.groups.filter((g) => g.status !== 'matched'),
    [result.groups]
  );
  const highValue = useMemo(
    () =>
      exceptions
        .filter((g) => g.status === 'investigate' && g.amount >= 5000)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [exceptions]
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangleIcon className="size-4 text-destructive" />
            Exceptions
          </CardTitle>
          <CardDescription>
            Every unmatched, timing, or amount-variance record surfaced by the
            reconciliation engine — {exceptions.length.toLocaleString()} item
            {exceptions.length === 1 ? '' : 's'} totalling{' '}
            {formatMoney(result.summary.exceptionValue)} to review.
          </CardDescription>
        </CardHeader>
        {highValue.length > 0 && (
          <CardContent className="flex flex-col gap-2 border-t pt-4">
            <div className="text-xs font-medium text-muted-foreground">
              Priority — high value, no counterpart found
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {highValue.map((g) => (
                <div
                  key={g.id}
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                >
                  <div className="text-sm font-semibold tabular-nums">
                    {formatMoney(g.amount, g.records[0]?.currency)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {g.records[0]?.fileName}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <MatchTable
        groups={exceptions}
        emptyLabel="No exceptions — everything uploaded so far reconciles cleanly."
      />
    </div>
  );
}
