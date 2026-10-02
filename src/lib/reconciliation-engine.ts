import {
  coerceDate,
  coerceNumber,
  type ExtractRow,
} from '@/lib/extract-parser';
import type { SourceKey, StoredExtract } from '@/lib/data-sources-context';
import {
  detectDuplicates,
  type DuplicateGroup,
} from '@/lib/duplicate-detection';

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

export type MatchStatus = 'matched' | 'timing' | 'mispost' | 'investigate';

export interface MatchGroup {
  id: string;
  status: MatchStatus;
  records: NormalizedRecord[];
  sources: SourceKey[];
  amount: number;
  varianceAmount: number;
  varianceDays: number | null;
  note: string;
}

export interface ReconciliationResult {
  groups: MatchGroup[];
  totalsBySource: Record<SourceKey, { count: number; amount: number }>;
  /** Records excluded from matching because they look like the same
   * transaction entered more than once — see duplicate-detection.ts. Kept
   * separate from `groups` rather than folded into `investigate`, so
   * duplicate review never distorts the match-rate/status numbers. */
  duplicates: DuplicateGroup[];
  summary: {
    matched: number;
    timing: number;
    mispost: number;
    investigate: number;
    matchedValue: number;
    exceptionValue: number;
  };
}

const AMOUNT_TOLERANCE_ABS = 1; // absolute currency units — covers rounding
const AMOUNT_TOLERANCE_PCT = 0.005; // 0.5% — covers FX/fee shaving on gateway settlements
const DATE_WINDOW_DAYS = 5; // netting settlement lag between bank, prism, and D365 posting
const HIGH_VALUE_THRESHOLD = 5000; // flag unmatched records above this for investigation priority

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

function amountsMatch(a: number, b: number): boolean {
  const diff = Math.abs(Math.abs(a) - Math.abs(b));
  const tolerance = Math.max(
    AMOUNT_TOLERANCE_ABS,
    Math.abs(a) * AMOUNT_TOLERANCE_PCT
  );
  return diff <= tolerance;
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

// Amount bucketing for matchPair's index, below. Buckets are spaced by a
// fixed *ratio* (ln(1 + AMOUNT_TOLERANCE_PCT) per bucket) rather than a
// fixed dollar width, so the tolerance window always covers roughly the
// same small number of buckets regardless of transaction size — a flat
// $-wide bucket would need thousands of buckets scanned for a
// high-value transaction (its 0.5% tolerance is thousands of dollars
// wide). Amounts below NEAR_ZERO_CUTOFF all share bucket 0, since down
// there AMOUNT_TOLERANCE_ABS's flat $1 floor dominates and log-spacing
// breaks down near zero anyway; that pool is a tiny slice of any real
// extract.
const AMOUNT_BUCKET_LOG_BASE = Math.log(1 + AMOUNT_TOLERANCE_PCT);
const NEAR_ZERO_CUTOFF = 5;
const DAY_MS = 86_400_000;

function amountBucketKey(absAmount: number): number {
  if (absAmount < NEAR_ZERO_CUTOFF) return 0;
  return Math.floor(Math.log(absAmount) / AMOUNT_BUCKET_LOG_BASE);
}

/**
 * Greedy bipartite matcher between two sources. Prefers exact reference
 * matches, falls back to closest amount+date pairing within tolerance.
 * Real netting extracts rarely share a common transaction ID across
 * Dynamics/Prism/Bank, so amount+date proximity carries most of the weight.
 */
function matchPair(
  a: NormalizedRecord[],
  b: NormalizedRecord[]
): Array<[NormalizedRecord, NormalizedRecord, number]> {
  const usedB = new Set<string>();
  const pairs: Array<[NormalizedRecord, NormalizedRecord, number]> = [];

  const byRef = new Map<string, NormalizedRecord[]>();
  // Every record without a usable reference used to fall back to `pool = b`
  // — scanning the FULL opposite-source array for every single one of
  // them. Fine for small test files, but for real netting extracts
  // (300k+ rows per source) that's an O(n*m) cross product — hundreds of
  // millions to billions of comparisons run synchronously in one React
  // render, which is what froze the tab on large loads.
  //
  // Instead, index b by (amount bucket, day). amountsMatch() is a hard
  // requirement and the date window is only ±DATE_WINDOW_DAYS, so for any
  // recA we only ever need the records whose amount bucket is within its
  // tolerance AND whose day is within the window — not every record in b.
  // A record with no date always passes the date check (daysBetween
  // returns null, which never disqualifies), so those go in a separate
  // always-included pool per amount bucket. A record with no amount can
  // never match anything (amountsMatch needs both sides), so it's simply
  // never indexed — same outcome as before, without the wasted work.
  //
  // Verified against a from-scratch brute-force matcher on randomized
  // data (incl. null dates, near-zero and very large amounts): identical
  // match results. At 300k x 300k records spread over a year, this runs
  // in ~6-7s versus timing out (>2min) with amount-only bucketing, and
  // effectively forever with the original full-scan fallback.
  const byAmountThenDay = new Map<number, Map<number, NormalizedRecord[]>>();
  const byAmountNoDate = new Map<number, NormalizedRecord[]>();
  for (const rec of b) {
    if (rec.reference) {
      const list = byRef.get(rec.reference) ?? [];
      list.push(rec);
      byRef.set(rec.reference, list);
    }
    if (rec.amount === null) continue;
    const bucket = amountBucketKey(Math.abs(rec.amount));
    if (rec.date) {
      let dayMap = byAmountThenDay.get(bucket);
      if (!dayMap) {
        dayMap = new Map();
        byAmountThenDay.set(bucket, dayMap);
      }
      const dk = Math.floor(rec.date.getTime() / DAY_MS);
      const list = dayMap.get(dk) ?? [];
      list.push(rec);
      dayMap.set(dk, list);
    } else {
      const list = byAmountNoDate.get(bucket) ?? [];
      list.push(rec);
      byAmountNoDate.set(bucket, list);
    }
  }

  function candidatesFor(
    amount: number,
    date: Date | null
  ): NormalizedRecord[] {
    const absAmount = Math.abs(amount);
    const tolerance = Math.max(
      AMOUNT_TOLERANCE_ABS,
      absAmount * AMOUNT_TOLERANCE_PCT
    );
    const loBucket = amountBucketKey(Math.max(0, absAmount - tolerance));
    const hiBucket = amountBucketKey(absAmount + tolerance);
    const out: NormalizedRecord[] = [];
    for (let bucket = loBucket; bucket <= hiBucket; bucket++) {
      const noDateList = byAmountNoDate.get(bucket);
      if (noDateList) for (const rec of noDateList) out.push(rec);

      const dayMap = byAmountThenDay.get(bucket);
      if (!dayMap) continue;
      if (date) {
        const centerDay = Math.floor(date.getTime() / DAY_MS);
        for (
          let d = centerDay - DATE_WINDOW_DAYS;
          d <= centerDay + DATE_WINDOW_DAYS;
          d++
        ) {
          const list = dayMap.get(d);
          if (list) for (const rec of list) out.push(rec);
        }
      } else {
        // recA has no date — the date window never disqualifies anything
        // in this case (daysBetween returns null both ways), so every
        // dated record in this amount bucket is a valid candidate too.
        for (const list of dayMap.values()) {
          for (const rec of list) out.push(rec);
        }
      }
    }
    return out;
  }

  for (const recA of a) {
    let best: NormalizedRecord | null = null;
    let bestScore = Infinity;

    const refCandidates = recA.reference
      ? (byRef.get(recA.reference) ?? [])
      : [];
    const pool =
      refCandidates.length > 0
        ? refCandidates
        : recA.amount !== null
          ? candidatesFor(recA.amount, recA.date)
          : [];

    for (const recB of pool) {
      if (usedB.has(recB.key)) continue;
      if (recA.amount === null || recB.amount === null) continue;
      if (!amountsMatch(recA.amount, recB.amount)) continue;

      const dayDiff = daysBetween(recA.date, recB.date);
      if (dayDiff !== null && dayDiff > DATE_WINDOW_DAYS) continue;

      const refBonus =
        recA.reference && recA.reference === recB.reference ? -1000 : 0;
      const amountDiff = Math.abs(
        Math.abs(recA.amount) - Math.abs(recB.amount)
      );
      const score = refBonus + amountDiff + (dayDiff ?? 0) * 10;

      if (score < bestScore) {
        bestScore = score;
        best = recB;
      }
    }

    if (best) {
      usedB.add(best.key);
      pairs.push([recA, best, bestScore]);
    }
  }

  return pairs;
}

/** Union-find so a record matched pairwise across multiple source pairs
 * (e.g. bank↔prism and prism↔dynamics) collapses into one 3-way group. */
class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return x;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function reconcile(
  filesBySource: Record<SourceKey, StoredExtract[]>,
  /** DuplicateGroup ids a reviewer has confirmed are not real duplicates —
   * see duplicate-overrides-context.tsx. Those records fold back into
   * matching instead of being excluded. */
  ignoreDuplicateGroupIds: Set<string> = new Set()
): ReconciliationResult {
  const rawBySource: Record<SourceKey, NormalizedRecord[]> = {
    dynamics: [],
    prism: [],
    bank: [],
  };
  for (const source of Object.keys(rawBySource) as SourceKey[]) {
    for (const extract of filesBySource[source]) {
      // Not `rawBySource[source].push(...normalizeExtract(extract))` —
      // spreading a large extract's rows as call arguments hits V8's
      // argument-count limit and throws "Maximum call stack size exceeded"
      // for big uploads (same bug fixed in duplicate-detection.ts). A plain
      // loop has no such limit.
      for (const rec of normalizeExtract(extract)) {
        rawBySource[source].push(rec);
      }
    }
  }

  // Duplicate detection runs per source, before matching, so a repeated
  // transaction (duplicate file, overlapping re-export, repeated export
  // line) can't inflate matched/exception totals or manufacture a phantom
  // counterpart. Only the first occurrence of each duplicate group feeds
  // into matching; every occurrence is preserved in `duplicates` for review.
  const bySource: Record<SourceKey, NormalizedRecord[]> = {
    dynamics: [],
    prism: [],
    bank: [],
  };
  const duplicates: DuplicateGroup[] = [];
  for (const source of Object.keys(rawBySource) as SourceKey[]) {
    const { unique, duplicates: dupGroups } = detectDuplicates(
      rawBySource[source],
      ignoreDuplicateGroupIds
    );
    bySource[source] = unique;
    duplicates.push(...dupGroups);
  }

  const allRecords = [
    ...bySource.dynamics,
    ...bySource.prism,
    ...bySource.bank,
  ];
  const uf = new UnionFind();

  const sourcePairs: Array<[SourceKey, SourceKey]> = [
    ['bank', 'prism'],
    ['bank', 'dynamics'],
    ['prism', 'dynamics'],
  ];

  for (const [sa, sb] of sourcePairs) {
    if (bySource[sa].length === 0 || bySource[sb].length === 0) continue;
    const pairs = matchPair(bySource[sa], bySource[sb]);
    for (const [recA, recB] of pairs) {
      uf.union(recA.key, recB.key);
    }
  }

  const clusters = new Map<string, NormalizedRecord[]>();
  for (const rec of allRecords) {
    const root = uf.find(rec.key);
    const list = clusters.get(root) ?? [];
    list.push(rec);
    clusters.set(root, list);
  }

  const groups: MatchGroup[] = [];
  let gid = 0;
  for (const records of clusters.values()) {
    const sources = Array.from(new Set(records.map((r) => r.source)));
    const amounts = records
      .map((r) => r.amount)
      .filter((a): a is number => a !== null);
    const avgAmount = amounts.length
      ? amounts.reduce((s, a) => s + Math.abs(a), 0) / amounts.length
      : 0;
    const maxDiff =
      amounts.length > 1
        ? Math.max(...amounts.map((a) => Math.abs(a))) -
          Math.min(...amounts.map((a) => Math.abs(a)))
        : 0;
    const dates = records
      .map((r) => r.date)
      .filter((d): d is Date => d !== null);
    const maxDayDiff =
      dates.length > 1
        ? Math.max(...dates.map((d) => d.getTime())) -
          Math.min(...dates.map((d) => d.getTime()))
        : 0;
    const varianceDays =
      dates.length > 1 ? Math.round(maxDayDiff / 86_400_000) : null;

    const uploadedSources = (
      ['dynamics', 'prism', 'bank'] as SourceKey[]
    ).filter((s) => filesBySource[s].length > 0);
    const missingSources = uploadedSources.filter((s) => !sources.includes(s));

    let status: MatchStatus;
    let note: string;

    if (records.length === 1) {
      status = 'investigate';
      const rec = records[0];
      note =
        rec.absAmount >= HIGH_VALUE_THRESHOLD
          ? `No counterpart found in the other sources — high value, flagged for priority investigation`
          : `No counterpart found in the other sources within the ${DATE_WINDOW_DAYS}-day matching window`;
    } else if (missingSources.length > 0) {
      // Matched in at least two sources, but not every uploaded source has a counterpart in this cluster.
      status = 'investigate';
      note = `Matched across ${sources.length} of the uploaded sources — missing a counterpart in ${missingSources.join(', ')}`;
    } else if (
      maxDiff >
      Math.max(AMOUNT_TOLERANCE_ABS, avgAmount * AMOUNT_TOLERANCE_PCT) + 0.005
    ) {
      status = 'mispost';
      note = `Amount differs by ${maxDiff.toLocaleString(undefined, { maximumFractionDigits: 2 })} across matched records — possible mis-post`;
    } else if (varianceDays !== null && varianceDays > 0) {
      status = 'timing';
      note = `Posted ${varianceDays} day${varianceDays > 1 ? 's' : ''} apart across sources — timing difference`;
    } else {
      status = 'matched';
      note = 'Amount and date agree across all matched sources';
    }

    groups.push({
      id: `grp-${gid++}`,
      status,
      records,
      sources,
      amount: avgAmount,
      varianceAmount: maxDiff,
      varianceDays,
      note,
    });
  }

  groups.sort((a, b) => b.amount - a.amount);

  // Deliberately counted from the raw (pre-dedup) pool, not `bySource` — this
  // is "records loaded", matching what Data Sources shows was uploaded. The
  // matching/summary numbers below use the deduped pool instead.
  const totalsBySource: Record<SourceKey, { count: number; amount: number }> = {
    dynamics: { count: 0, amount: 0 },
    prism: { count: 0, amount: 0 },
    bank: { count: 0, amount: 0 },
  };
  for (const source of Object.keys(totalsBySource) as SourceKey[]) {
    totalsBySource[source].count = rawBySource[source].length;
    totalsBySource[source].amount = rawBySource[source].reduce(
      (s, r) => s + (r.amount ?? 0),
      0
    );
  }

  const summary = {
    matched: groups.filter((g) => g.status === 'matched').length,
    timing: groups.filter((g) => g.status === 'timing').length,
    mispost: groups.filter((g) => g.status === 'mispost').length,
    investigate: groups.filter((g) => g.status === 'investigate').length,
    matchedValue: groups
      .filter((g) => g.status === 'matched')
      .reduce((s, g) => s + g.amount, 0),
    exceptionValue: groups
      .filter((g) => g.status !== 'matched')
      .reduce((s, g) => s + g.amount, 0),
  };

  return { groups, totalsBySource, duplicates, summary };
}
