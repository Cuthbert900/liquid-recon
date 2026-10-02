import {
  coerceDate,
  coerceNumber,
  type ExtractRow,
} from '@/lib/extract-parser';
import type { SourceKey, StoredExtract } from '@/lib/data-sources-context';

/**
 * A single transaction, normalized out of whichever source file it came
 * from so the matching engine can compare apples to apples regardless of
 * whether it originated in Dynamics, Prism, or a bank statement.
 */
export interface NormalizedRecord {
  key: string;
  source: SourceKey;
  fileId: string;
  fileName: string;
  rowIndex: number;
  date: Date | null;
  amount: number | null;
  absAmount: number;
  currency: string | null;
  reference: string;
  raw: ExtractRow;
}

function normalizeReference(raw: ExtractRow, idColumn: string | null): string {
  if (!idColumn) return '';
  const v = raw[idColumn];
  return v === null || v === undefined ? '' : String(v).trim().toLowerCase();
}

export function normalizeExtract(extract: StoredExtract): NormalizedRecord[] {
  const { amountColumn, dateColumn, currencyColumn, idColumn } = extract;
  const out: NormalizedRecord[] = [];
  extract.rows.forEach((row, i) => {
    const amount = amountColumn ? coerceNumber(row[amountColumn]) : null;
    const date = dateColumn ? coerceDate(row[dateColumn]) : null;
    const currency = currencyColumn
      ? row[currencyColumn]
        ? String(row[currencyColumn]).trim().toUpperCase()
        : null
      : null;
    out.push({
      key: `${extract.id}:${i}`,
      source: extract.source,
      fileId: extract.id,
      fileName: extract.fileName,
      rowIndex: i,
      date,
      amount,
      absAmount: amount !== null ? Math.abs(amount) : 0,
      currency,
      reference: normalizeReference(row, idColumn),
      raw: row,
    });
  });
  return out;
}
