import type {
  DbDataApplyExecuteResponse,
  DbDataApplyPreviewResponse,
} from "@shared/schema";
import type {
  DataSyncRowDiffEntry,
  DataSyncSuggestedAction,
} from "./data-sync-row-diff";
import type { SyncTableConfigDraft } from "./data-sync-utils";

type Updater<T> = (updater: (previous: T) => T) => void;

export interface DataSyncDraftActions {
  updateSelectedTables: Updater<string[]>;
  updateTableConfigs: Updater<Record<string, SyncTableConfigDraft>>;
  updateRows: Updater<DataSyncRowDiffEntry[]>;
  setIncludeUnchanged: (includeUnchanged: boolean) => void;
  clearApplyArtifacts: () => void;
}

export function createDataSyncDraftActions(input: {
  updateSelectedTables: Updater<string[]>;
  updateTableConfigs: Updater<Record<string, SyncTableConfigDraft>>;
  updateRows: Updater<DataSyncRowDiffEntry[]>;
  setIncludeUnchanged: (includeUnchanged: boolean) => void;
  setApplyPreview: (preview: DbDataApplyPreviewResponse | null) => void;
  setApplyExecute: (execute: DbDataApplyExecuteResponse | null) => void;
}): DataSyncDraftActions {
  return {
    updateSelectedTables: input.updateSelectedTables,
    updateTableConfigs: input.updateTableConfigs,
    updateRows: input.updateRows,
    setIncludeUnchanged: input.setIncludeUnchanged,
    clearApplyArtifacts: () => {
      input.setApplyPreview(null);
      input.setApplyExecute(null);
    },
  };
}

export function runSyncTableConfigChange(
  actions: Pick<DataSyncDraftActions, "updateTableConfigs">,
  tableName: string,
  field: keyof SyncTableConfigDraft,
  value: string,
): void {
  actions.updateTableConfigs((current) => ({
    ...current,
    [tableName]: {
      keyColumnsText: current[tableName]?.keyColumnsText ?? "",
      compareColumnsText: current[tableName]?.compareColumnsText ?? "",
      whereClause: current[tableName]?.whereClause ?? "",
      [field]: value,
    },
  }));
}

export function runToggleSyncTable(
  actions: Pick<DataSyncDraftActions, "updateSelectedTables">,
  tableName: string,
): void {
  actions.updateSelectedTables((current) => {
    if (current.includes(tableName)) {
      const next = current.filter((name) => name !== tableName);
      return next.length > 0 ? next : [tableName];
    }
    return [...current, tableName];
  });
}

export function runChangeSyncRowAction(
  actions: Pick<DataSyncDraftActions, "updateRows" | "clearApplyArtifacts">,
  rowIndex: number,
  nextAction: DataSyncSuggestedAction,
): void {
  actions.updateRows((current) =>
    current.map((row, index) =>
      index === rowIndex ? { ...row, suggestedAction: nextAction } : row,
    ),
  );
  actions.clearApplyArtifacts();
}

export interface ToggleIncludeUnchangedRowsInput {
  actions: Pick<DataSyncDraftActions, "setIncludeUnchanged">;
  nextIncludeUnchanged: boolean;
  currentDetailTableName?: string | null;
  loadDetail: (
    tableName: string,
    includeUnchanged: boolean,
  ) => Promise<unknown>;
}

export function runToggleIncludeUnchangedRows(
  input: ToggleIncludeUnchangedRowsInput,
): void {
  input.actions.setIncludeUnchanged(input.nextIncludeUnchanged);
  if (input.currentDetailTableName) {
    void input.loadDetail(
      input.currentDetailTableName,
      input.nextIncludeUnchanged,
    );
  }
}
