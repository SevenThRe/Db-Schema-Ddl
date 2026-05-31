import type {
  DbDataDiffDetailRequest,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewRequest,
  DbDataDiffPreviewResponse,
  DbDataApplyExecuteResponse,
  DbDataApplyPreviewResponse,
} from "@shared/schema";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import {
  buildDataDiffTableRequests,
  toDataSyncRowDiffEntry,
  type SyncTableConfigDraft,
} from "./data-sync-utils";
import { formatWorkbenchError } from "./workbench-errors";

export function resolveDataDiffPreviewTables(input: {
  syncSelectedTables: string[];
  selectedTableName: string | null;
}): string[] {
  if (input.syncSelectedTables.length > 0) {
    return input.syncSelectedTables;
  }
  return input.selectedTableName ? [input.selectedTableName] : [];
}

export function resolveDataDiffPreviewReadinessIssue(input: {
  isSyncSchemaLoading: boolean;
  syncSchemaIssueMessage: string | null;
  tables: string[];
}): string | null {
  if (input.isSyncSchemaLoading) {
    return "Wait for source/target schema metadata to finish loading before compare.";
  }
  if (input.syncSchemaIssueMessage) {
    return input.syncSchemaIssueMessage;
  }
  if (input.tables.length === 0) {
    return "Select at least one table before compare.";
  }
  return null;
}

export function formatDataDiffPreviewError(error: unknown): string {
  return formatWorkbenchError(
    error,
    "Failed to preview data diff for source -> target.",
  );
}

export function formatDataDiffDetailError(error: unknown): string {
  return formatWorkbenchError(
    error,
    "Failed to load row-level compare detail.",
  );
}

export interface DataDiffStateActions {
  setIssue: (message: string | null) => void;
  beginPreview: () => void;
  applyPreview: (preview: DbDataDiffPreviewResponse) => void;
  applyDetail: (input: {
    detail: DbDataDiffDetailResponse;
    rows: DataSyncRowDiffEntry[];
  }) => void;
  selectRow: (index: number) => void;
  clearArtifacts: () => void;
  finishPreview: () => void;
}

export function createDataDiffStateActions(input: {
  setIssue: (message: string | null) => void;
  setResultTab: () => void;
  setIsDiffPreviewing: (isPreviewing: boolean) => void;
  setDiffPreview: (preview: DbDataDiffPreviewResponse | null) => void;
  setDiffDetail: (detail: DbDataDiffDetailResponse | null) => void;
  setDiffRows: (rows: DataSyncRowDiffEntry[]) => void;
  setSelectedDiffRowIndex: (index: number) => void;
  setApplyPreview: (preview: DbDataApplyPreviewResponse | null) => void;
  setApplyExecute: (execute: DbDataApplyExecuteResponse | null) => void;
}): DataDiffStateActions {
  return {
    setIssue: input.setIssue,
    beginPreview: () => {
      input.setIsDiffPreviewing(true);
      input.setIssue(null);
      input.setResultTab();
      input.setDiffDetail(null);
      input.setDiffRows([]);
      input.setSelectedDiffRowIndex(0);
      input.setApplyPreview(null);
      input.setApplyExecute(null);
    },
    applyPreview: input.setDiffPreview,
    applyDetail: ({ detail, rows }) => {
      input.setDiffDetail(detail);
      input.setDiffRows(rows);
      input.setSelectedDiffRowIndex(0);
    },
    selectRow: input.setSelectedDiffRowIndex,
    clearArtifacts: () => {
      input.setDiffPreview(null);
      input.setDiffDetail(null);
      input.setDiffRows([]);
      input.setSelectedDiffRowIndex(0);
      input.setApplyPreview(null);
      input.setApplyExecute(null);
    },
    finishPreview: () => input.setIsDiffPreviewing(false),
  };
}

export interface RunDataDiffDetailInput {
  compareId: string | null | undefined;
  tableName: string;
  includeUnchanged: boolean;
  fetchDataDiffDetail: (
    request: DbDataDiffDetailRequest,
  ) => Promise<DbDataDiffDetailResponse>;
  applyDetail: (input: {
    detail: DbDataDiffDetailResponse;
    rows: DataSyncRowDiffEntry[];
  }) => void;
  setIssue: (message: string) => void;
}

export async function runDataDiffDetail(
  input: RunDataDiffDetailInput,
): Promise<DbDataDiffDetailResponse | null> {
  if (!input.compareId) {
    return null;
  }

  try {
    const detail = await input.fetchDataDiffDetail({
      compareId: input.compareId,
      tableName: input.tableName,
      limit: 200,
      offset: 0,
      includeUnchanged: input.includeUnchanged,
    });
    input.applyDetail({
      detail,
      rows: toDataSyncRowDiffEntry(detail),
    });
    return detail;
  } catch (error) {
    input.setIssue(formatDataDiffDetailError(error));
    return null;
  }
}

export interface RunDataDiffPreviewInput {
  isSyncSchemaLoading: boolean;
  syncSchemaIssueMessage: string | null;
  syncSelectedTables: string[];
  selectedTableName: string | null;
  syncTableConfigs: Record<string, Partial<SyncTableConfigDraft> | undefined>;
  sourceConnectionId: string;
  targetConnectionId: string;
  includeUnchanged: boolean;
  previewDataDiff: (
    request: DbDataDiffPreviewRequest,
  ) => Promise<DbDataDiffPreviewResponse>;
  loadDetail: (
    tableName: string,
    includeUnchanged: boolean,
  ) => Promise<DbDataDiffDetailResponse | null>;
  setIssue: (message: string | null) => void;
  beginPreview: () => void;
  applyPreview: (preview: DbDataDiffPreviewResponse) => void;
  finishPreview: () => void;
}

export async function runDataDiffPreview(
  input: RunDataDiffPreviewInput,
): Promise<DbDataDiffPreviewResponse | null> {
  const tables = resolveDataDiffPreviewTables({
    syncSelectedTables: input.syncSelectedTables,
    selectedTableName: input.selectedTableName,
  });
  const readinessIssue = resolveDataDiffPreviewReadinessIssue({
    isSyncSchemaLoading: input.isSyncSchemaLoading,
    syncSchemaIssueMessage: input.syncSchemaIssueMessage,
    tables,
  });
  if (readinessIssue) {
    input.setIssue(readinessIssue);
    return null;
  }

  input.beginPreview();
  try {
    const preview = await input.previewDataDiff({
      sourceConnectionId: input.sourceConnectionId,
      targetConnectionId: input.targetConnectionId,
      tables: buildDataDiffTableRequests(tables, input.syncTableConfigs),
    });
    input.applyPreview(preview);
    const firstTable = preview.tableSummaries[0]?.tableName;
    if (firstTable) {
      void input.loadDetail(firstTable, input.includeUnchanged);
    }
    return preview;
  } catch (error) {
    input.setIssue(formatDataDiffPreviewError(error));
    return null;
  } finally {
    input.finishPreview();
  }
}
