import * as XLSX from 'xlsx';

export type ExtractRow = Record<string, string | number | boolean | null>;

export interface ParsedExtract {
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  headers: string[];
  rows: ExtractRow[];
  rowCount: number;
  amountColumn: string | null;
  dateColumn: string | null;
  currencyColumn: string | null;
  idColumn: string | null;
  totalAmount: number | null;
  dateRange: { start: string; end: string } | null;
  currencies: string[];
}

const AMOUNT_HINTS = ['amount', 'value', 'net', 'total'];
const DEBIT_HINTS = ['debit', 'dr'];
const CREDIT_HINTS = ['credit', 'cr'];
const DATE_HINTS = [
  'date',
  'posted',
  'txn date',
  'transaction date',
  'value date',
];
const CURRENCY_HINTS = ['currency', 'ccy', 'curr'];
const ID_HINTS = ['zol', 'reference', 'ref', 'id', 'trans', 'narrative'];

export const NET_AMOUNT_COLUMN = 'Net Amount (Credit − Debit)';

function scoreHeader(header: string, hints: string[]): number {
  const h = header.toLowerCase().trim();
  let best = 0;
  for (const hint of hints) {
    if (h === hint) best = Math.max(best, 3);
    else if (h.includes(hint)) best = Math.max(best, 2);
  }
  return best;
}

function pickColumn(headers: string[], hints: string[]): string | null {
  let bestHeader: string | null = null;
  let bestScore = 0;
  for (const header of headers) {
    const score = scoreHeader(header, hints);
    if (score > bestScore) {
      bestScore = score;
      bestHeader = header;
    }
  }
  return bestScore > 0 ? bestHeader : null;
}

/**
 * Ledger exports (Dynamics especially) often carry several amount-shaped
 * columns side by side — e.g. "Amount in transaction currency", "Amount",
 * "Amount in reporting currency" — where only the first is in the same
 * currency as the row's Currency column; the others are FX-converted. A
 * plain best-match on AMOUNT_HINTS picks the exact-match "Amount" column,
 * which for a multi-currency ledger is silently the wrong (converted)
 * figure. Prefer a column that pairs with the row's own transaction
 * currency, and penalize columns that look like a converted/reporting
 * figure.
 */
function pickAmountColumn(headers: string[]): string | null {
  let bestHeader: string | null = null;
  let bestScore = -Infinity;
  for (const header of headers) {
    const base = scoreHeader(header, AMOUNT_HINTS);
    if (base === 0) continue;
    const h = header.toLowerCase();
    let score = base;
    if (h.includes('transaction')) score += 3;
    if (
      h.includes('reporting') ||
      h.includes('local') ||
      h.includes('functional')
    )
      score -= 3;
    if (score > bestScore) {
      bestScore = score;
      bestHeader = header;
    }
  }
  return bestHeader;
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    const n = Number(cleaned);
    return Number.isFinite(n) && cleaned !== '' ? n : null;
  }
  return null;
}

export function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    // Excel serial date
    const d = XLSX.SSF?.parse_date_code
      ? XLSX.SSF.parse_date_code(value)
      : null;
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

type Cell = string | number | boolean | Date | null;

function countNonEmpty(row: Cell[]): number {
  return row.filter(
    (c) => c !== null && c !== undefined && String(c).trim() !== ''
  ).length;
}

/**
 * Real-world extracts (bank statements especially) often prepend a metadata
 * block — account number, account name, currency — before the actual
 * transaction table starts. Naively treating row 0 as the header produces
 * garbage columns. Scan the first ~25 rows for the row that looks like a
 * header: mostly text, immediately followed by consistently dense data rows.
 */
function findHeaderRowIndex(aoa: Cell[][]): number {
  const maxScan = Math.min(25, aoa.length);
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < maxScan; i++) {
    const row = aoa[i] ?? [];
    const nonEmpty = countNonEmpty(row);
    if (nonEmpty < 2) continue;
    const stringish = row.filter(
      (c) => typeof c === 'string' && c.trim() !== ''
    ).length;

    let lookaheadTotal = 0;
    let lookaheadRows = 0;
    for (let j = i + 1; j < Math.min(i + 6, aoa.length); j++) {
      lookaheadTotal += countNonEmpty(aoa[j] ?? []);
      lookaheadRows++;
    }
    const avgLookahead = lookaheadRows ? lookaheadTotal / lookaheadRows : 0;
    if (avgLookahead < nonEmpty * 0.6) continue;

    const score = stringish * 2 + Math.min(avgLookahead, nonEmpty);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildRowsFromAoa(
  aoa: Cell[][],
  headerIdx: number
): { headers: string[]; rows: ExtractRow[] } {
  const headerRow = aoa[headerIdx] ?? [];
  const headers = headerRow.map((cell, i) => {
    const label =
      cell !== null && cell !== undefined ? String(cell).trim() : '';
    return label !== '' ? label : `Column ${i + 1}`;
  });
  // De-duplicate identical header labels
  const seen = new Map<string, number>();
  const dedupedHeaders = headers.map((h) => {
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h} (${count + 1})`;
  });

  const rows: ExtractRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    if (countNonEmpty(raw) === 0) continue;
    const row: ExtractRow = {};
    dedupedHeaders.forEach((h, colIdx) => {
      const value = raw[colIdx];
      row[h] =
        value instanceof Date
          ? value.toISOString()
          : ((value as string | number | boolean | null | undefined) ?? null);
    });
    rows.push(row);
  }
  return { headers: dedupedHeaders, rows };
}

export function validateRow(
  row: ExtractRow,
  amountColumn: string | null,
  dateColumn: string | null
): string[] {
  const errors: string[] = [];
  if (amountColumn && coerceNumber(row[amountColumn]) === null) {
    errors.push(`Invalid amount in column "${amountColumn}"`);
  }
  if (dateColumn && coerceDate(row[dateColumn]) === null) {
    errors.push(`Invalid date in column "${dateColumn}"`);
  }
  return errors;
}

export async function parseExtractFile(file: File): Promise<ParsedExtract> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const aoa = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  const headerIdx = findHeaderRowIndex(aoa);
  const { headers, rows } = buildRowsFromAoa(aoa, headerIdx);

  let amountColumn = pickAmountColumn(headers);
  const dateColumn = pickColumn(headers, DATE_HINTS);
  const currencyColumn = pickColumn(headers, CURRENCY_HINTS);
  const idColumn = pickColumn(headers, ID_HINTS);

  // Bank statements (and some ledger exports) split value across separate
  // Debit/Credit columns rather than one signed Amount column. Naively
  // grabbing just the Debit column (as a single "amount" pick would) silently
  // drops every credit-side transaction from totals and matching. When no
  // single amount column is found, synthesize one: net = credit − debit.
  if (!amountColumn) {
    const debitColumn = pickColumn(headers, DEBIT_HINTS);
    const creditColumn = pickColumn(headers, CREDIT_HINTS);
    if (debitColumn || creditColumn) {
      headers.push(NET_AMOUNT_COLUMN);
      for (const row of rows) {
        const debit = debitColumn ? (coerceNumber(row[debitColumn]) ?? 0) : 0;
        const credit = creditColumn
          ? (coerceNumber(row[creditColumn]) ?? 0)
          : 0;
        row[NET_AMOUNT_COLUMN] = credit - debit;
      }
      amountColumn = NET_AMOUNT_COLUMN;
    }
  }

  let totalAmount: number | null = null;
  if (amountColumn) {
    let sum = 0;
    let any = false;
    for (const row of rows) {
      const n = coerceNumber(row[amountColumn]);
      if (n !== null) {
        sum += n;
        any = true;
      }
    }
    totalAmount = any ? sum : null;
  }

  let dateRange: { start: string; end: string } | null = null;
  if (dateColumn) {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const row of rows) {
      const d = coerceDate(row[dateColumn]);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    if (min && max) {
      dateRange = { start: min.toISOString(), end: max.toISOString() };
    }
  }

  const currencies = currencyColumn
    ? Array.from(
        new Set(
          rows
            .map((r) => r[currencyColumn])
            .filter(
              (v): v is string => typeof v === 'string' && v.trim() !== ''
            )
            .map((v) => v.trim().toUpperCase())
        )
      )
    : [];

  return {
    fileName: file.name,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    headers,
    rows,
    rowCount: rows.length,
    amountColumn,
    dateColumn,
    currencyColumn,
    idColumn,
    totalAmount,
    dateRange,
    currencies,
  };
}
