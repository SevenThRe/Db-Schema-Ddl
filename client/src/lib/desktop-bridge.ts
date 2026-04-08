import type {
  BinaryCommandResult,
  BuiltinExtensionManifest,
  DbConnectionConfig,
  DbSchemaSnapshot,
  DbSchemaDiffResult,
  CreateWorkbookFromTemplateRequest,
  CreateWorkbookFromTemplateResponse,
  DdlImportExportRequest,
  DdlImportExportResponse,
  DdlImportPreviewRequest,
  DdlImportPreviewResponse,
  DdlSettings,
  EnumGenPreviewResponse,
  EnumGenRequest,
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
  QueryExecutionRequest,
  QueryExecutionResponse,
  ExplainRequest,
  DbExplainPlan,
  DangerousSqlPreview,
  ExportRowsRequest,
  FetchMoreRequest,
  DbQueryBatchResult,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbGridCommitRequest,
  DbGridCommitResponse,
} from "@shared/schema";
import { getDesktopCapabilities } from "@/lib/desktop-capabilities";

type ExportResult = {
  blob: Blob;
  fileName: string;
  successCount: number;
  skippedCount: number;
  skippedTables: string[];
};

type SaveBinaryFileOptions = {
  bytes: Uint8Array;
  defaultFileName: string;
  defaultDirectory?: string | null;
  filters?: Array<{ name: string; extensions: string[] }>;
  revealAfterSave?: boolean;
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

type ProcessMetrics = {
  pid: number;
  memoryBytes: number;
  virtualMemoryBytes: number;
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

function buildDefaultSavePath(directory: string | null | undefined, fileName: string): string {
  const safeFileName = sanitizeDownloadFileName(fileName, "download.bin");
  const normalizedDirectory = String(directory ?? "").trim();
  if (!normalizedDirectory) {
    return safeFileName;
  }
  const separator = normalizedDirectory.includes("\\") ? "\\" : "/";
  const base = normalizedDirectory.replace(/[\\/]+$/, "");
  return `${base}${separator}${safeFileName}`;
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

async function saveBinaryFileInTauri(options: SaveBinaryFileOptions): Promise<string | null> {
  const dialog = await import("@tauri-apps/plugin-dialog");
  const targetPath = await dialog.save({
    defaultPath: buildDefaultSavePath(options.defaultDirectory, options.defaultFileName),
    filters: options.filters,
  });
  if (typeof targetPath !== "string" || !targetPath.trim()) {
    return null;
  }

  await invoke("core_write_binary_file", {
    path: targetPath,
    bytesBase64: bytesToBase64(options.bytes),
  });

  if (options.revealAfterSave) {
    const opener = await import("@tauri-apps/plugin-opener");
    await opener.revealItemInDir(targetPath);
  }

  return targetPath;
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

  async getProcessMetrics(): Promise<ProcessMetrics | null> {
    if (getDesktopCapabilities().runtime !== "tauri") return null;
    return await invoke<ProcessMetrics>("core_get_process_metrics");
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

  async saveBinaryFile(options: SaveBinaryFileOptions): Promise<string | null> {
    if (getDesktopCapabilities().runtime !== "tauri") {
      return null;
    }
    return await saveBinaryFileInTauri(options);
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

  // DB 接続管理
  db: {
    async listConnections(): Promise<DbConnectionConfig[]> {
      return await invoke<DbConnectionConfig[]>("db_conn_list");
    },
    async saveConnection(config: DbConnectionConfig): Promise<DbConnectionConfig> {
      return await invoke<DbConnectionConfig>("db_conn_save", { config });
    },
    async deleteConnection(id: string): Promise<void> {
      await invoke<void>("db_conn_delete", { id });
    },
    async testConnection(config: DbConnectionConfig): Promise<string> {
      return await invoke<string>("db_conn_test", { config });
    },
    async introspect(connectionId: string): Promise<DbSchemaSnapshot> {
      return await invoke<DbSchemaSnapshot>("db_introspect", { connectionId });
    },
    async listSchemas(connectionId: string): Promise<string[]> {
      return await invoke<string[]>("db_list_schemas", { connectionId });
    },
    async diff(sourceConnectionId: string, targetConnectionId: string): Promise<DbSchemaDiffResult> {
      return await invoke<DbSchemaDiffResult>("db_diff", { sourceConnectionId, targetConnectionId });
    },

    // クエリ実行・取消・エクスポート — Phase 1 DB 工作台
    async executeQuery(request: QueryExecutionRequest): Promise<QueryExecutionResponse> {
      return await invoke<QueryExecutionResponse>("db_query_execute", { request });
    },
    async explainQuery(request: ExplainRequest): Promise<DbExplainPlan> {
      return await invoke<DbExplainPlan>("db_query_explain", { request });
    },
    async cancelQuery(requestId: string): Promise<void> {
      await invoke<void>("db_query_cancel", { requestId });
    },
    async previewDangerousSql(connectionId: string, sql: string): Promise<DangerousSqlPreview> {
      return await invoke<DangerousSqlPreview>("db_preview_dangerous_sql", {
        request: { connectionId, sql },
      });
    },
    async exportRows(request: ExportRowsRequest): Promise<BinaryCommandResult> {
      return await invoke<BinaryCommandResult>("db_export_rows", { request });
    },
    async fetchMore(request: FetchMoreRequest): Promise<DbQueryBatchResult> {
      return await invoke<DbQueryBatchResult>("db_query_fetch_more", { request });
    },
    async prepareGridCommit(
      request: DbGridPrepareCommitRequest,
    ): Promise<DbGridPrepareCommitResponse> {
      return await invoke<DbGridPrepareCommitResponse>("db_grid_prepare_commit", { request });
    },
    async commitGridEdits(
      request: DbGridCommitRequest,
    ): Promise<DbGridCommitResponse> {
      return await invoke<DbGridCommitResponse>("db_grid_commit", { request });
    },
  },

  // 自動更新
  updater: {
    /** 更新の有無を確認する */
    async check(): Promise<{
      available: boolean;
      version?: string;
      body?: string;
      canAutoInstall?: boolean;
      releaseUrl?: string;
    }> {
      return await invoke<{
        available: boolean;
        version?: string;
        body?: string;
        canAutoInstall?: boolean;
        releaseUrl?: string;
      }>("update_check");
    },

    /** 更新をダウンロードしてインストールする (アプリが再起動される) */
    async downloadAndInstall(): Promise<void> {
      await invoke<void>("update_download_and_install");
    },
  },

  // 内蔵拡張機能
  extensions: {
    /** 内蔵拡張の一覧を取得する */
    async listBuiltin(): Promise<BuiltinExtensionManifest[]> {
      return await invoke<BuiltinExtensionManifest[]>("ext_list_builtin");
    },

    /** 列挙型生成のプレビューを取得する */
    async enumGenPreview(request: EnumGenRequest): Promise<EnumGenPreviewResponse> {
      return await invoke<EnumGenPreviewResponse>("enum_gen_preview", { request });
    },

    /** 列挙型コードを生成してバイナリとして返す */
    async enumGenExport(request: EnumGenRequest): Promise<BinaryCommandResult> {
      return await invoke<BinaryCommandResult>("enum_gen_export", { request });
    },
  },
};
