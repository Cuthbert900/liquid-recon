import {
  coerceDate,
  coerceNumber,
  type ExtractRow,
} from '@/lib/extract-parser';
import type { SourceKey, StoredExtract } from '@/lib/data-sources-context';

/**
 * Represents a single transaction record that has been normalized from its
 * original source format. This allows the matching engine to compare records
 * from different sources (e.g., Dynamics, Prism, bank statements) in a
 * consistent way.
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

/**
 * Extracts and normalizes the reference string from a raw extract row.
 * @param raw The raw extract row.
 * @param idColumn The name of the column containing the reference ID.
 * @returns A normalized reference string (trimmed and lowercased), or an empty string if not available.
 */
function normalizeReference(raw: ExtractRow, idColumn: string | null): string {
  if (!idColumn) return '';
  const v = raw[idColumn];
  return v === null || v === undefined ? '' : String(v).trim().toLowerCase();
}

/**
 * Normalizes an entire extract of records from a stored file.
 * @param extract The stored extract containing the rows to be normalized.
 * @returns An array of normalized records.
 */
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
