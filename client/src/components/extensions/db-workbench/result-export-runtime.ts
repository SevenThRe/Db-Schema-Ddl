import type {
  BinaryCommandResult,
  DbQueryBatchResult,
  DbQueryRow,
} from "@shared/schema";
import type { ExportScope } from "./ResultExportMenu";
import { getCurrentPageRows } from "./result-grid-utils";

export type ExportRuntimeNotice = {
  title: string;
  description: string;
  variant: "default" | "success" | "destructive";
};

export type ExportRowsPayload = {
  currentPageRows?: DbQueryRow[];
  loadedRows?: DbQueryRow[];
  columns?: DbQueryBatchResult["columns"];
  maxRows?: number;
};

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function downloadBinaryResult(result: BinaryCommandResult): void {
  const bytes = base64ToBytes(result.base64);
  const blob = new Blob([bytes], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function validateExportScope(
  batch: DbQueryBatchResult,
  scope: ExportScope,
): ExportRuntimeNotice | null {
  if (scope === "full_result" && batch.pagingMode !== "offset") {
    return {
      title: "Full result unavailable",
      description: "Only single pageable SELECT-style results support full result export.",
      variant: "destructive",
    };
  }
  return null;
}

export function getPreExportNotice(
  batch: DbQueryBatchResult,
  scope: ExportScope,
): ExportRuntimeNotice | null {
  if (scope === "loaded_rows" && batch.rowWindowTruncated === true) {
    return {
      title: "Loaded rows limited",
      description: `Loaded-row export includes only the retained ${batch.rows.length.toLocaleString()} row window.`,
      variant: "default",
    };
  }
  return null;
}

export function buildExportRowsPayload(
  batch: DbQueryBatchResult,
  scope: ExportScope,
): ExportRowsPayload {
  return {
    currentPageRows: scope === "current_page" ? getCurrentPageRows(batch) : undefined,
    loadedRows: scope === "loaded_rows" ? batch.rows : undefined,
    columns: scope === "full_result" ? undefined : batch.columns,
    maxRows: scope === "full_result" ? 100_000 : undefined,
  };
}

export function fullResultExportMayBeCapped(
  result: BinaryCommandResult,
  scope: ExportScope,
): boolean {
  const isTruncatedFile = result.fileName.toLowerCase().includes("truncated");
  return scope === "full_result" && (isTruncatedFile || result.successCount >= 100_000);
}

export function buildPostExportNotice(
  result: BinaryCommandResult,
  scope: ExportScope,
): ExportRuntimeNotice {
  if (fullResultExportMayBeCapped(result, scope)) {
    return {
      title: "Export warning",
      description: "Full result export may be truncated at 100000 rows.",
      variant: "default",
    };
  }

  return {
    title: "Export complete",
    description: `${result.fileName} is ready to download.`,
    variant: "success",
  };
}

export function buildExportFailureNotice(message: string): ExportRuntimeNotice {
  const cancelled = /cancel|キャンセル/i.test(message);
  return {
    title: cancelled ? "Export cancelled" : "Export failed",
    description: message,
    variant: cancelled ? "default" : "destructive",
  };
}
