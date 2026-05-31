import type {
  DbConnectionConfig,
  DbGridDeleteRowDraft,
  DbGridEditPatchCell,
  DbGridInsertedRowDraft,
  DbObjectInspectionResponse,
  QueryExecutionResponse,
} from "@shared/schema";
import {
  buildPendingDeleteRowSummaries,
  buildPendingEditRowSummaries,
  buildPendingInsertedRowSummaries,
} from "./grid-edit-summary";
import { getActiveBatch } from "./result-workspace-runner";

export interface BuildWorkbenchRenderContextInput {
  connection: DbConnectionConfig;
  results: QueryExecutionResponse | null | undefined;
  activeBatchIndex: number;
  pendingEditCells: Record<string, DbGridEditPatchCell>;
  pendingDeleteRows: Record<string, DbGridDeleteRowDraft>;
  pendingInsertedRows: Record<string, DbGridInsertedRowDraft>;
  pendingSnippetName: string;
  savedSnippets: Array<{ name: string }>;
  objectInspection: DbObjectInspectionResponse | null | undefined;
}

export function buildWorkbenchRenderContext(
  input: BuildWorkbenchRenderContextInput,
) {
  const activeBatch = getActiveBatch({
    results: input.results ?? null,
    activeBatchIndex: input.activeBatchIndex,
  }) ?? null;
  const pendingEditRows = buildPendingEditRowSummaries(
    input.pendingEditCells,
  );
  const pendingDeletedRows = buildPendingDeleteRowSummaries(
    input.pendingDeleteRows,
  );
  const pendingInsertedRowSummaries = buildPendingInsertedRowSummaries(
    input.pendingInsertedRows,
  );
  const normalizedSnippetName = input.pendingSnippetName.trim().toLowerCase();
  const driverLabel =
    input.connection.driver === "postgres" ? "PostgreSQL" : "MySQL";

  return {
    activeBatch,
    pendingEditCount: Object.keys(input.pendingEditCells).length,
    pendingDeleteCount: Object.keys(input.pendingDeleteRows).length,
    pendingInsertedCount: Object.values(input.pendingInsertedRows).filter(
      (row) => Object.keys(row.values).length > 0,
    ).length,
    pendingEditRows,
    pendingDeletedRows,
    pendingInsertedRowSummaries,
    willOverwriteSnippet:
      normalizedSnippetName.length > 0 &&
      input.savedSnippets.some(
        (snippet) =>
          snippet.name.trim().toLowerCase() === normalizedSnippetName,
      ),
    inspectedObjectKind: input.objectInspection?.objectKind ?? null,
    inspectedObjectName: input.objectInspection?.objectName ?? null,
    inspectedObjectSignature: input.objectInspection?.signature ?? null,
    inspectedParentObjectName:
      input.objectInspection?.parentObjectName ?? null,
    driverLabel,
    workbenchContextLabel: `${driverLabel}://${input.connection.host}:${input.connection.port}/${input.connection.database}`,
  };
}

export type WorkbenchRenderContext = ReturnType<typeof buildWorkbenchRenderContext>;
