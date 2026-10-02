import { describe, it, expect } from 'vitest';
import { matchPair } from './matching';
import type { NormalizedRecord } from './normalization';

describe('matchPair', () => {
  const baseRecord: Omit<
    NormalizedRecord,
    'key' | 'amount' | 'date' | 'reference'
  > = {
    source: 'bank',
    fileId: 'file-1',
    fileName: 'test.csv',
    rowIndex: 0,
    absAmount: 0,
    currency: 'USD',
    raw: {},
  };

  it('should match records with the same reference', () => {
    const a: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'a1',
        amount: 100,
        date: new Date('2023-01-15'),
        reference: 'ref-1',
      },
    ];
    const b: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'b1',
        amount: 100,
        date: new Date('2023-01-15'),
        reference: 'ref-1',
      },
      {
        ...baseRecord,
        key: 'b2',
        amount: 200,
        date: new Date('2023-01-15'),
        reference: 'ref-2',
      },
    ];
    const pairs = matchPair(a, b);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0].key).toBe('a1');
    expect(pairs[0][1].key).toBe('b1');
  });

  it('should match records with similar amounts and dates', () => {
    const a: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'a1',
        amount: 100.1,
        date: new Date('2023-01-15'),
        reference: '',
      },
    ];
    const b: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'b1',
        amount: 100.2,
        date: new Date('2023-01-16'),
        reference: '',
      },
      {
        ...baseRecord,
        key: 'b2',
        amount: 200,
        date: new Date('2023-01-15'),
        reference: '',
      },
    ];
    const pairs = matchPair(a, b);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0].key).toBe('a1');
    expect(pairs[0][1].key).toBe('b1');
  });

  it('should not match records outside the date window', () => {
    const a: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'a1',
        amount: 100,
        date: new Date('2023-01-15'),
        reference: '',
      },
    ];
    const b: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'b1',
        amount: 100,
        date: new Date('2023-01-25'),
        reference: '',
      },
    ];
    const pairs = matchPair(a, b);
    expect(pairs).toHaveLength(0);
  });

  it('should not match records with different amounts outside the tolerance', () => {
    const a: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'a1',
        amount: 100,
        date: new Date('2023-01-15'),
        reference: '',
      },
    ];
    const b: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'b1',
        amount: 110,
        date: new Date('2023-01-15'),
        reference: '',
      },
    ];
    const pairs = matchPair(a, b);
    expect(pairs).toHaveLength(0);
  });

  it('should handle multiple matches and pick the best score', () => {
    const a: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'a1',
        amount: 100,
        date: new Date('2023-01-15'),
        reference: '',
      },
    ];
    const b: NormalizedRecord[] = [
      {
        ...baseRecord,
        key: 'b1',
        amount: 100.1,
        date: new Date('2023-01-16'),
        reference: '',
      }, // Good match
      {
        ...baseRecord,
        key: 'b2',
        amount: 100.0,
        date: new Date('2023-01-15'),
        reference: '',
      }, // Better match
    ];
    const pairs = matchPair(a, b);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][1].key).toBe('b2');
  });
});
