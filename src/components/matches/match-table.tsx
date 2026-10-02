'use client';

import { Fragment, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  MatchStatusBadge,
  formatMoney,
} from '@/components/matches/match-status-badge';
import { SOURCE_LABELS } from '@/lib/data-sources-context';
import type { MatchGroup } from '@/lib/reconciliation-engine';

interface MatchTableProps {
  groups: MatchGroup[];
  emptyLabel?: string;
}

function safeDate(d: Date | null) {
  if (!d) return '—';
  try {
    return format(d, 'd MMM yyyy');
  } catch {
    return '—';
  }
}

export function MatchTable({
  groups,
  emptyLabel = 'No records match this filter.',
}: MatchTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-12 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Status</TableHead>
            <TableHead>Sources</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Variance</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => {
            const isOpen = expanded.has(g.id);
            const reference =
              g.records.find((r) => r.reference)?.reference ?? '—';
            return (
              <Fragment key={g.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggle(g.id)}
                >
                  <TableCell>
                    {isOpen ? (
                      <ChevronDownIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    <MatchStatusBadge status={g.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.sources.map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {SOURCE_LABELS[s]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(g.amount, g.records[0]?.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {g.varianceAmount > 0.01
                      ? formatMoney(g.varianceAmount)
                      : g.varianceDays
                        ? `${g.varianceDays}d`
                        : '—'}
                  </TableCell>
                  <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                    {reference}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                    {g.note}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell />
                    <TableCell colSpan={6} className="py-3">
                      <div className="flex flex-col gap-1.5">
                        {g.records.map((r) => (
                          <div
                            key={r.key}
                            className="grid grid-cols-[110px_1fr_100px_90px] items-center gap-3 rounded-md bg-background px-3 py-1.5 text-xs"
                          >
                            <Badge variant="secondary" className="w-fit">
                              {SOURCE_LABELS[r.source]}
                            </Badge>
                            <span
                              className="truncate text-muted-foreground"
                              title={r.fileName}
                            >
                              {r.fileName}
                            </span>
                            <span className="tabular-nums">
                              {safeDate(r.date)}
                            </span>
                            <span className="text-right tabular-nums font-medium">
                              {r.amount !== null
                                ? formatMoney(r.amount, r.currency)
                                : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
