'use client';

import { Building2Icon, LandmarkIcon, WalletCardsIcon } from 'lucide-react';
import { SourceCard } from '@/components/data-sources/source-card';
import { useDataSources } from '@/lib/data-sources-context';
import { Card, CardContent } from '@/components/ui/card';

export function DataSourcesPageClient() {
  const { filesBySource } = useDataSources();
  const totalFiles =
    filesBySource.dynamics.length +
    filesBySource.prism.length +
    filesBySource.bank.length;
  const totalRows = [
    ...filesBySource.dynamics,
    ...filesBySource.prism,
    ...filesBySource.bank,
  ].reduce((sum, f) => sum + f.rowCount, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <div className="text-sm font-medium">Demo extracts</div>
            <p className="text-sm text-muted-foreground">
              Upload CSV/XLSX extracts from Dynamics 365, Prism, and the bank to
              demo reconciliation while live system access is being provisioned.
              Files are parsed locally in your browser.
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-xl font-semibold tabular-nums">
                {totalFiles}
              </div>
              <div className="text-xs text-muted-foreground">Files loaded</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">
                {totalRows.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Total records</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SourceCard
          source="dynamics"
          title="Dynamics 365"
          description="Netting GL extracts"
          icon={<Building2Icon className="size-4" />}
        />
        <SourceCard
          source="prism"
          title="Prism BSS"
          description="Billing & revenue extracts"
          icon={<WalletCardsIcon className="size-4" />}
        />
        <SourceCard
          source="bank"
          title="Bank Statements"
          description="CABS, CBZ, NMB, Stanbic & more"
          icon={<LandmarkIcon className="size-4" />}
        />
      </div>
    </div>
  );
}
