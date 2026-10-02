'use client';

import * as React from 'react';
import { format } from 'date-fns';
import {
  FileSpreadsheetIcon,
  Trash2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  BuildingIcon,
  CopyIcon,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UploadDropzone } from '@/components/data-sources/upload-dropzone';
import { parseExtractFile, type ParsedExtract } from '@/lib/extract-parser';
import {
  useDataSources,
  type SourceKey,
  type StoredExtract,
} from '@/lib/data-sources-context';
import { cn } from '@/lib/utils';

type DuplicateDecision = 'replace' | 'skip' | 'add';

interface DuplicatePrompt {
  parsed: ParsedExtract;
  existing: StoredExtract;
  resolve: (decision: DuplicateDecision) => void;
}

interface SourceCardProps {
  source: SourceKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourceCard({
  source,
  title,
  description,
  icon,
}: SourceCardProps) {
  const { filesBySource, addFile, removeFile, findDuplicateFile } =
    useDataSources();
  const files = filesBySource[source];
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] =
    React.useState<DuplicatePrompt | null>(null);

  function confirmDuplicate(parsed: ParsedExtract, existing: StoredExtract) {
    return new Promise<DuplicateDecision>((resolve) => {
      setDuplicatePrompt({ parsed, existing, resolve });
    });
  }

  const totalRows = files.reduce((sum, f) => sum + f.rowCount, 0);
  const totalAmount = files.reduce((sum, f) => sum + (f.totalAmount ?? 0), 0);
  const hasAmounts = files.some((f) => f.totalAmount !== null);
  const currencies = Array.from(new Set(files.flatMap((f) => f.currencies)));
  const preview = files.find((f) => f.id === previewId) ?? files[0] ?? null;

  async function handleFiles(incoming: File[]) {
    setError(null);
    setIsBusy(true);
    try {
      for (const file of incoming) {
        const parsed = await parseExtractFile(file);
        const existing = findDuplicateFile(source, parsed);
        if (existing) {
          const decision = await confirmDuplicate(parsed, existing);
          if (decision === 'skip') continue;
          if (decision === 'replace') removeFile(source, existing.id);
        }
        addFile(source, parsed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse that file");
    } finally {
      setIsBusy(false);
    }
  }

  function resolveDuplicate(decision: DuplicateDecision) {
    duplicatePrompt?.resolve(decision);
    setDuplicatePrompt(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {files.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2Icon className="size-3" />
            {files.length} file{files.length > 1 ? 's' : ''}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <UploadDropzone onFiles={handleFiles} isBusy={isBusy} />

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircleIcon className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {files.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-center">
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {totalRows.toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground">Records</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {hasAmounts
                    ? totalAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })
                    : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Total value
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {currencies.length > 0 ? currencies.join(', ') : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Currency
                </div>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-border rounded-lg border">
              {files.map((f) => (
                <div
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewId(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPreviewId(f.id);
                    }
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50',
                    preview?.id === f.id && 'bg-muted/60'
                  )}
                >
                  <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{f.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.rowCount.toLocaleString()} rows ·{' '}
                      {formatBytes(f.sizeBytes)}
                      {f.dateRange &&
                        ` · ${format(new Date(f.dateRange.start), 'd MMM')}–${format(
                          new Date(f.dateRange.end),
                          'd MMM yyyy'
                        )}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(source, f.id);
                      if (previewId === f.id) setPreviewId(null);
                    }}
                    aria-label={`Remove ${f.fileName}`}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {preview && (
              <div className="overflow-hidden rounded-lg border">
                <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Preview — {preview.fileName}
                </div>
                <div className="max-h-48 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.headers.slice(0, 6).map((h) => (
                          <TableHead
                            key={h}
                            className="whitespace-nowrap text-xs"
                          >
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 8).map((row, i) => (
                        <TableRow key={i}>
                          {preview.headers.slice(0, 6).map((h) => (
                            <TableCell
                              key={h}
                              className="whitespace-nowrap text-xs"
                            >
                              {row[h] === null || row[h] === undefined
                                ? ''
                                : String(row[h])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}

        {files.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BuildingIcon className="size-3.5" />
            No extracts uploaded yet — this source will be empty in Matches
            until you add one.
          </div>
        )}
      </CardContent>

      <Dialog
        open={!!duplicatePrompt}
        onOpenChange={(open) => !open && resolveDuplicate('skip')}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CopyIcon className="size-4 text-muted-foreground" />
              <DialogTitle>
                This looks like a file you already loaded
              </DialogTitle>
            </div>
            <DialogDescription>
              {duplicatePrompt && (
                <>
                  <span className="font-medium text-foreground">
                    {duplicatePrompt.parsed.fileName}
                  </span>{' '}
                  has the same{' '}
                  {duplicatePrompt.parsed.rowCount.toLocaleString()} rows as the
                  already-loaded{' '}
                  <span className="font-medium text-foreground">
                    {duplicatePrompt.existing.fileName}
                  </span>
                  . Loading it again would double-count every transaction in it.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolveDuplicate('skip')}
            >
              Skip this file
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolveDuplicate('replace')}
            >
              Replace the existing one
            </Button>
            <Button size="sm" onClick={() => resolveDuplicate('add')}>
              Load anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
