import { useState } from "react";
import type {
  DbDataApplyExecuteResponse,
  DbDataApplyJobDetailResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffDetailResponse,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import type { DataSyncRowDiffEntry } from "./data-sync-row-diff";
import type { SyncTableConfigDraft } from "./data-sync-utils";
import {
  createEmptySchemaDiffState,
} from "./schema-diff-runtime";

export function useWorkbenchSyncWorkspaceState(initialConnectionId: string) {
  const [schemaDiffTargetConnectionId, setSchemaDiffTargetConnectionId] =
    useState(initialConnectionId);
  const [schemaDiffState, setSchemaDiffState] =
    useState(createEmptySchemaDiffState);
  const [isSchemaDiffing, setIsSchemaDiffing] = useState(false);
  const [syncSourceConnectionId, setSyncSourceConnectionId] =
    useState(initialConnectionId);
  const [syncTargetConnectionId, setSyncTargetConnectionId] =
    useState(initialConnectionId);
  const [syncSelectedTables, setSyncSelectedTables] = useState<string[]>([]);
  const [syncTableConfigs, setSyncTableConfigs] =
    useState<Record<string, SyncTableConfigDraft>>({});
  const [diffPreview, setDiffPreview] =
    useState<DbDataDiffPreviewResponse | null>(null);
  const [diffDetail, setDiffDetail] =
    useState<DbDataDiffDetailResponse | null>(null);
  const [diffRows, setDiffRows] = useState<DataSyncRowDiffEntry[]>([]);
  const [selectedDiffRowIndex, setSelectedDiffRowIndex] = useState(0);
  const [syncIncludeUnchanged, setSyncIncludeUnchanged] = useState(false);
  const [applyPreview, setApplyPreview] =
    useState<DbDataApplyPreviewResponse | null>(null);
  const [applyExecute, setApplyExecute] =
    useState<DbDataApplyExecuteResponse | null>(null);
  const [applyJobDetail, setApplyJobDetail] =
    useState<DbDataApplyJobDetailResponse | null>(null);
  const [applyProdConfirmation, setApplyProdConfirmation] = useState("");
  const [applyUnsafeDeleteConfirmed, setApplyUnsafeDeleteConfirmed] =
    useState(false);
  const [syncIssue, setSyncIssue] = useState<string | null>(null);
  const [isDiffPreviewing, setIsDiffPreviewing] = useState(false);
  const [isApplyPreviewing, setIsApplyPreviewing] = useState(false);
  const [isExecutingApply, setIsExecutingApply] = useState(false);

  return {
    applyExecute,
    applyJobDetail,
    applyPreview,
    applyProdConfirmation,
    applyUnsafeDeleteConfirmed,
    diffDetail,
    diffPreview,
    diffRows,
    isApplyPreviewing,
    isDiffPreviewing,
    isExecutingApply,
    isSchemaDiffing,
    schemaDiffState,
    schemaDiffTargetConnectionId,
    selectedDiffRowIndex,
    setApplyExecute,
    setApplyJobDetail,
    setApplyPreview,
    setApplyProdConfirmation,
    setApplyUnsafeDeleteConfirmed,
    setDiffDetail,
    setDiffPreview,
    setDiffRows,
    setIsApplyPreviewing,
    setIsDiffPreviewing,
    setIsExecutingApply,
    setIsSchemaDiffing,
    setSchemaDiffState,
    setSchemaDiffTargetConnectionId,
    setSelectedDiffRowIndex,
    setSyncIncludeUnchanged,
    setSyncIssue,
    setSyncSelectedTables,
    setSyncSourceConnectionId,
    setSyncTableConfigs,
    setSyncTargetConnectionId,
    syncIncludeUnchanged,
    syncIssue,
    syncSelectedTables,
    syncSourceConnectionId,
    syncTableConfigs,
    syncTargetConnectionId,
  };
}
