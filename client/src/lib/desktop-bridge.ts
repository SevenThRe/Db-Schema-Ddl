import type {
  CreateWorkbookFromTemplateRequest,
  CreateWorkbookFromTemplateResponse,
  DdlImportExportRequest,
  DdlImportExportResponse,
  DdlImportPreviewRequest,
  DdlImportPreviewResponse,
  DdlSettings,
  ExportZipRequest,
  GenerateDdlByReferenceRequest,
  GenerateDdlRequest,
  NameFixApplyRequest,
  NameFixApplyResponse,
  NameFixPreviewRequest,
  NameFixPreviewResponse,
  SchemaDiffAlterPreviewRequest,
  SchemaDiffAlterPreviewResponse,
  SchemaDiffConfirmRequest,
  SchemaDiffConfirmResponse,
  SchemaDiffPreviewRequest,
  SchemaDiffPreviewResponse,
  TableInfo,
  UploadedFile,
  WorkbookTemplateVariant,
} from "@shared/schema";
import { getDesktopCapabilities } from "@/lib/desktop-capabilities";

type ExportResult = {
  blob: Blob;
  fileName: string;
  successCount: number;
  skippedCount: number;
  skippedTables: string[];
};

type SheetSummary = {
  name: string;
  hasTableDefinitions: boolean;
};

type RuntimeDiagnostics = {
  runtime: "tauri";
  appDataDir: string;
  uploadsDir: string;
  dbPath: string;
  dbExists: boolean;
  uploadedFileCount: number;
  settingsRowCount: number;
};

// ──────────────────────────────────────────────
// Tauri IPC ユーティリティ
// ──────────────────────────────────────────────

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return await mod.invoke<T>(command, args);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += Array.from(chunk, (byte) => String.fromCharCode(byte)).join("");
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function sanitizeDownloadFileName(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

// バイナリコマンド結果を ExportResult に変換
async function exportBinaryCommand(
  command: string,
  args: Record<string, unknown>,
  fallbackFileName: string,
): Promise<ExportResult> {
  const result = await invoke<{
    base64: string;
    fileName?: string;
    mimeType?: string;
    successCount?: number;
    skippedCount?: number;
    skippedTables?: string[];
  }>(command, args);
  return {
    blob: base64ToBlob(result.base64, result.mimeType || "application/zip"),
    fileName: sanitizeDownloadFileName(result.fileName, fallbackFileName),
    successCount: Math.max(0, Number(result.successCount ?? 0)),
    skippedCount: Math.max(0, Number(result.skippedCount ?? 0)),
    skippedTables: Array.isArray(result.skippedTables)
      ? result.skippedTables.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0)
      : [],
  };
}

async function openExternalInTauri(url: string): Promise<boolean> {
  const mod = await import("@tauri-apps/plugin-opener");
  await mod.openUrl(url);
  return true;
}

async function openDirectoryInTauri(): Promise<string | null> {
  const mod = await import("@tauri-apps/plugin-dialog");
  const result = await mod.open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

async function openExcelFileInTauri(): Promise<string | null> {
  const mod = await import("@tauri-apps/plugin-dialog");
  const result = await mod.open({
    directory: false,
    multiple: false,
    filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
  });
  return typeof result === "string" ? result : null;
}

async function uploadFileInTauri(file: File): Promise<UploadedFile> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return await invoke<UploadedFile>("files_import_excel", {
    fileName: file.name,
    lastModified: typeof file.lastModified === "number" && file.lastModified > 0
      ? new Date(file.lastModified).toISOString()
      : null,
    bytesBase64: bytesToBase64(bytes),
  });
}

// ──────────────────────────────────────────────
// デスクトップブリッジ (Tauri 専用)
// ──────────────────────────────────────────────

export const desktopBridge = {
  getCapabilities() {
    return getDesktopCapabilities();
  },

  async getRuntimeDiagnostics(): Promise<RuntimeDiagnostics | null> {
    if (getDesktopCapabilities().runtime !== "tauri") return null;
    return await invoke<RuntimeDiagnostics>("core_get_runtime_diagnostics");
  },

  async getAppVersion(): Promise<string> {
    if (getDesktopCapabilities().runtime === "tauri") {
      return await invoke<string>("core_get_app_version");
    }
    return __APP_VERSION__;
  },

  async openExternal(url: string): Promise<boolean> {
    if (getDesktopCapabilities().runtime === "tauri") {
      return await openExternalInTauri(url);
    }
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    return Boolean(openedWindow);
  },

  async selectDirectory(): Promise<string | null> {
    if (getDesktopCapabilities().runtime === "tauri") {
      return await openDirectoryInTauri();
    }
    return null;
  },

  async selectExcelFile(): Promise<string | null> {
    if (getDesktopCapabilities().runtime === "tauri") {
      return await openExcelFileInTauri();
    }
    return null;
  },

  files: {
    async list(): Promise<UploadedFile[]> {
      return await invoke<UploadedFile[]>("files_list");
    },

    async listTemplates(): Promise<WorkbookTemplateVariant[]> {
      return await invoke<WorkbookTemplateVariant[]>("files_list_templates");
    },

    async upload(file: File): Promise<UploadedFile> {
      return await uploadFileInTauri(file);
    },

    async createFromTemplate(
      request: CreateWorkbookFromTemplateRequest,
    ): Promise<CreateWorkbookFromTemplateResponse> {
      return await invoke<CreateWorkbookFromTemplateResponse>("files_create_from_template", { request });
    },

    async remove(fileId: number): Promise<{ message: string; fileCleanupWarning: string | null }> {
      return await invoke("files_remove", { fileId });
    },

    async getSheets(fileId: number): Promise<SheetSummary[]> {
      return await invoke<SheetSummary[]>("files_get_sheets", { fileId });
    },

    async getSearchIndex(fileId: number): Promise<Array<{ type: "sheet" | "table"; sheetName: string; displayName: string; physicalTableName?: string; logicalTableName?: string }>> {
      return await invoke("files_get_search_index", { fileId });
    },

    async getTableInfo(fileId: number, sheetName: string): Promise<TableInfo[]> {
      return await invoke<TableInfo[]>("files_get_table_info", { fileId, sheetName });
    },

    async getSheetData(fileId: number, sheetName: string): Promise<unknown[][]> {
      return await invoke<unknown[][]>("files_get_sheet_data", { fileId, sheetName });
    },

    async parseRegion(params: {
      fileId: number;
      sheetName: string;
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    }): Promise<TableInfo[]> {
      return await invoke<TableInfo[]>("files_parse_region", params);
    },
  },

  ddl: {
    async generate(request: GenerateDdlRequest): Promise<{ ddl: string; warnings?: never[] }> {
      return await invoke<{ ddl: string; warnings?: never[] }>("ddl_generate", { request });
    },

    async generateByReference(request: GenerateDdlByReferenceRequest): Promise<{ ddl: string; warnings?: never[] }> {
      return await invoke<{ ddl: string; warnings?: never[] }>("ddl_generate_by_reference", { request });
    },

    async exportZip(request: ExportZipRequest): Promise<ExportResult> {
      return await exportBinaryCommand("ddl_export_zip", { request }, "ddl-export.zip");
    },

    async exportZipByReference(
      request: GenerateDdlByReferenceRequest & { tolerantMode?: boolean; includeErrorReport?: boolean },
    ): Promise<ExportResult> {
      return await exportBinaryCommand("ddl_export_zip_by_reference", { request }, "ddl-export.zip");
    },

    async importPreview(request: DdlImportPreviewRequest): Promise<DdlImportPreviewResponse> {
      return await invoke<DdlImportPreviewResponse>("ddl_import_preview", { request });
    },

    async exportWorkbook(request: DdlImportExportRequest): Promise<DdlImportExportResponse> {
      return await invoke<DdlImportExportResponse>("ddl_import_export_workbook", { request });
    },
  },

  settings: {
    async get(): Promise<DdlSettings> {
      return await invoke<DdlSettings>("settings_get");
    },

    async update(settings: DdlSettings): Promise<DdlSettings> {
      return await invoke<DdlSettings>("settings_update", { settings });
    },
  },

  // 物理名修正
  nameFix: {
    async preview(request: NameFixPreviewRequest): Promise<NameFixPreviewResponse> {
      return await invoke<NameFixPreviewResponse>("name_fix_preview", { request });
    },

    async apply(request: NameFixApplyRequest): Promise<NameFixApplyResponse> {
      return await invoke<NameFixApplyResponse>("name_fix_apply", { request });
    },
  },

  // スキーマ差分
  diff: {
    async preview(request: SchemaDiffPreviewRequest): Promise<SchemaDiffPreviewResponse> {
      return await invoke<SchemaDiffPreviewResponse>("diff_preview", { request });
    },

    async confirm(request: SchemaDiffConfirmRequest): Promise<SchemaDiffConfirmResponse> {
      return await invoke<SchemaDiffConfirmResponse>("diff_confirm", { request });
    },

    async alterPreview(request: SchemaDiffAlterPreviewRequest): Promise<SchemaDiffAlterPreviewResponse> {
      return await invoke<SchemaDiffAlterPreviewResponse>("diff_alter_preview", { request });
    },
  },
};
