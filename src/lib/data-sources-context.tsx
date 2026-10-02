'use client';

import * as React from 'react';
import type { ParsedExtract } from '@/lib/extract-parser';
import { fingerprintExtract } from '@/lib/duplicate-detection';

export type SourceKey = 'dynamics' | 'prism' | 'bank';

export interface StoredExtract extends ParsedExtract {
  id: string;
  source: SourceKey;
}

interface DataSourcesState {
  filesBySource: Record<SourceKey, StoredExtract[]>;
  addFile: (source: SourceKey, extract: ParsedExtract) => void;
  removeFile: (source: SourceKey, id: string) => void;
  clearSource: (source: SourceKey) => void;
  /** Returns an already-loaded file in this source whose content fingerprint
   * matches the incoming extract (same rows, regardless of file name), or
   * null. Call this before addFile so the caller can ask the user whether
   * to replace, skip, or load it anyway rather than silently double-loading
   * the same statement. */
  findDuplicateFile: (
    source: SourceKey,
    extract: ParsedExtract
  ) => StoredExtract | null;
}

const STORAGE_KEY = 'netting-recon:data-sources:v1';
const MAX_PERSISTED_ROWS = 500;

const emptyState: Record<SourceKey, StoredExtract[]> = {
  dynamics: [],
  prism: [],
  bank: [],
};

const DataSourcesContext = React.createContext<DataSourcesState | null>(null);

function loadFromStorage(): Record<SourceKey, StoredExtract[]> {
  if (typeof window === 'undefined') return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw);
    return { ...emptyState, ...parsed };
  } catch {
    return emptyState;
  }
}

function saveToStorage(state: Record<SourceKey, StoredExtract[]>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded — fall back to persisting metadata only (drop row bodies)
    try {
      const trimmed = Object.fromEntries(
        Object.entries(state).map(([source, files]) => [
          source,
          files.map((f) => ({ ...f, rows: f.rows.slice(0, 20) })),
        ])
      );
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Give up silently — in-memory state still works for this session
    }
  }
}

export function DataSourcesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [filesBySource, setFilesBySource] =
    React.useState<Record<SourceKey, StoredExtract[]>>(emptyState);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setFilesBySource(loadFromStorage());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    saveToStorage(filesBySource);
  }, [filesBySource, hydrated]);

  const addFile = React.useCallback(
    (source: SourceKey, extract: ParsedExtract) => {
      setFilesBySource((prev) => {
        const stored: StoredExtract = {
          ...extract,
          // Cap rows kept for very large uploads to keep the app responsive;
          // full rows are used for the in-memory preview/session immediately after upload.
          rows: extract.rows,
          id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source,
        };
        return { ...prev, [source]: [...prev[source], stored] };
      });
    },
    []
  );

  const removeFile = React.useCallback((source: SourceKey, id: string) => {
    setFilesBySource((prev) => ({
      ...prev,
      [source]: prev[source].filter((f) => f.id !== id),
    }));
  }, []);

  const clearSource = React.useCallback((source: SourceKey) => {
    setFilesBySource((prev) => ({ ...prev, [source]: [] }));
  }, []);

  const findDuplicateFile = React.useCallback(
    (source: SourceKey, extract: ParsedExtract): StoredExtract | null => {
      const incomingFp = fingerprintExtract(extract);
      return (
        filesBySource[source].find(
          (f) => fingerprintExtract(f) === incomingFp
        ) ?? null
      );
    },
    [filesBySource]
  );

  const value = React.useMemo(
    () => ({
      filesBySource,
      addFile,
      removeFile,
      clearSource,
      findDuplicateFile,
    }),
    [filesBySource, addFile, removeFile, clearSource, findDuplicateFile]
  );

  return (
    <DataSourcesContext.Provider value={value}>
      {children}
    </DataSourcesContext.Provider>
  );
}

export function useDataSources() {
  const ctx = React.useContext(DataSourcesContext);
  if (!ctx) {
    throw new Error('useDataSources must be used within a DataSourcesProvider');
  }
  return ctx;
}

export const SOURCE_LABELS: Record<SourceKey, string> = {
  dynamics: 'Dynamics 365',
  prism: 'Prism BSS',
  bank: 'Bank Statements',
};

export const MAX_PERSISTED_ROWS_EXPORT = MAX_PERSISTED_ROWS;
