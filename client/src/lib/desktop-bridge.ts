import { api, buildUrl } from "@shared/routes";
import type {
  CreateWorkbookFromTemplateRequest,
  CreateWorkbookFromTemplateResponse,
  DdlSettings,
  ExportZipRequest,
  GenerateDdlByReferenceRequest,
  GenerateDdlRequest,
  TableInfo,
  UploadedFile,
  WorkbookTemplateVariant,
} from "@shared/schema";
import { getDesktopCapabilities } from "@/lib/desktop-capabilities";
import { parseApiErrorResponse } from "@/lib/api-error";

type RequestFailureFallback = {
  code: "REQUEST_FAILED";
  message: string;
};

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

async function throwIfFailed(res: Response, fallback: RequestFailureFallback): Promise<Response> {
  if (!res.ok) {
    throw await parseApiErrorResponse(res, fallback);
  }
  return res;
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  fallback: RequestFailureFallback,
  init?: RequestInit,
): Promise<T> {
  const response = await throwIfFailed(await fetch(input, init), fallback);
  return (await response.json()) as T;
}

function parseContentDispositionFileName(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = value.match(/filename="?([^"]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

function sanitizeDownloadFileName(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
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

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return await mod.invoke<T>(command, args);
}

function isMissingTauriCommand(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
    ? error
    : "";

  const normalized = message.toLowerCase();
  return (
    normalized.includes("command") &&
    (normalized.includes("not found") ||
      normalized.includes("unknown") ||
      normalized.includes("does not exist") ||
      normalized.includes("unhandled"))
  );
}

async function invokeWithTauriFallback<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: () => Promise<T>,
): Promise<T> {
  if (getDesktopCapabilities().runtime !== "tauri") {
    return await fallback();
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isMissingTauriCommand(error)) {
      return await fallback();
    }
    throw error;
  }
}

async function openExternalInTauri(url: string): Promise<boolean> {
  const mod = await import("@tauri-apps/plugin-opener");
  await mod.openUrl(url);
  return true;
}

async function openDirectoryInTauri(): Promise<string | null> {
  const mod = await import("@tauri-apps/plugin-dialog");
  const result = await mod.open({
    directory: true,
    multiple: false,
  });
  return typeof result === "string" ? result : null;
}

async function openExcelFileInTauri(): Promise<string | null> {
  const mod = await import("@tauri-apps/plugin-dialog");
  const result = await mod.open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Excel",
        extensions: ["xlsx", "xls"],
      },
    ],
  });
  return typeof result === "string" ? result : null;
}

async function uploadFileInTauri(file: File): Promise<UploadedFile> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const result = await invoke<UploadedFile>("files_import_excel", {
    fileName: file.name,
    lastModified: typeof file.lastModified === "number" && file.lastModified > 0
      ? new Date(file.lastModified).toISOString()
      : null,
    bytesBase64: bytesToBase64(bytes),
  });
  return api.files.upload.responses[201].parse(result);
}

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

function readNumberHeader(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readStringArrayHeader(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

export const desktopBridge = {
  getCapabilities() {
    return getDesktopCapabilities();
  },

  async getRuntimeDiagnostics(): Promise<RuntimeDiagnostics | null> {
    if (getDesktopCapabilities().runtime !== "tauri") {
      return null;
    }

    return await invokeWithTauriFallback("core_get_runtime_diagnostics", undefined, async () => null);
  },

  async getAppVersion(): Promise<string> {
    const runtime = getDesktopCapabilities().runtime;
    if (runtime === "tauri") {
      return await invokeWithTauriFallback("core_get_app_version", undefined, async () => __APP_VERSION__);
    }
    if (runtime === "electron" && window.electronAPI?.getAppVersion) {
      return await window.electronAPI.getAppVersion();
    }
    return __APP_VERSION__;
  },

  async openExternal(url: string): Promise<boolean> {
    const runtime = getDesktopCapabilities().runtime;
    if (runtime === "tauri") {
      return await openExternalInTauri(url);
    }
    if (runtime === "electron" && window.electronAPI?.openExternal) {
      return await window.electronAPI.openExternal(url);
    }
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    return Boolean(openedWindow);
  },

  async selectDirectory(): Promise<string | null> {
    const runtime = getDesktopCapabilities().runtime;
    if (runtime === "tauri") {
      return await openDirectoryInTauri();
    }
    if (runtime === "electron" && window.electronAPI?.selectDirectory) {
      return await window.electronAPI.selectDirectory();
    }
    return null;
  },

  async selectExcelFile(): Promise<string | null> {
    const runtime = getDesktopCapabilities().runtime;
    if (runtime === "tauri") {
      return await openExcelFileInTauri();
    }
    if (runtime === "electron" && window.electronAPI?.selectExcelFile) {
      return await window.electronAPI.selectExcelFile();
    }
    return null;
  },

  files: {
    async list(): Promise<UploadedFile[]> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_list", undefined, async () => {
          const data = await fetchJson(api.files.list.path, {
            code: "REQUEST_FAILED",
            message: "Failed to fetch files",
          });
          return api.files.list.responses[200].parse(data);
        });
      }
      const data = await fetchJson(api.files.list.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch files",
      });
      return api.files.list.responses[200].parse(data);
    },

    async listTemplates(): Promise<WorkbookTemplateVariant[]> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_list_templates", undefined, async () => {
          const data = await fetchJson(api.files.listTemplates.path, {
            code: "REQUEST_FAILED",
            message: "Failed to fetch workbook templates",
          });
          return api.files.listTemplates.responses[200].parse(data) as WorkbookTemplateVariant[];
        });
      }
      const data = await fetchJson(api.files.listTemplates.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch workbook templates",
      });
      return api.files.listTemplates.responses[200].parse(data) as WorkbookTemplateVariant[];
    },

    async upload(file: File): Promise<UploadedFile> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await uploadFileInTauri(file);
      }

      const formData = new FormData();
      formData.append("file", file);
      if (typeof file.lastModified === "number" && file.lastModified > 0) {
        formData.append("sourceModifiedAt", String(file.lastModified));
      }
      const result = await fetchJson<UploadedFile>(
        api.files.upload.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to upload file",
        },
        {
          method: api.files.upload.method,
          body: formData,
        },
      );
      return api.files.upload.responses[201].parse(result);
    },

    async createFromTemplate(request: CreateWorkbookFromTemplateRequest): Promise<CreateWorkbookFromTemplateResponse> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_create_from_template", { request }, async () => {
          const data = await fetchJson(api.files.createFromTemplate.path, {
            code: "REQUEST_FAILED",
            message: "Failed to create workbook from template",
          }, {
            method: api.files.createFromTemplate.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });

          return api.files.createFromTemplate.responses[201].parse(data) as CreateWorkbookFromTemplateResponse;
        });
      }
      const data = await fetchJson(api.files.createFromTemplate.path, {
        code: "REQUEST_FAILED",
        message: "Failed to create workbook from template",
      }, {
        method: api.files.createFromTemplate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      return api.files.createFromTemplate.responses[201].parse(data) as CreateWorkbookFromTemplateResponse;
    },

    async remove(fileId: number): Promise<{ message: string; fileCleanupWarning: string | null }> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_remove", { fileId }, async () =>
          await fetchJson(buildUrl(api.files.remove.path, { id: fileId }), {
            code: "REQUEST_FAILED",
            message: "Failed to delete file",
          }, { method: api.files.remove.method }),
        );
      }
      return await fetchJson(buildUrl(api.files.remove.path, { id: fileId }), {
        code: "REQUEST_FAILED",
        message: "Failed to delete file",
      }, { method: api.files.remove.method });
    },

    async getSheets(fileId: number): Promise<SheetSummary[]> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_get_sheets", { fileId }, async () => {
          const data = await fetchJson(buildUrl(api.files.getSheets.path, { id: fileId }), {
            code: "REQUEST_FAILED",
            message: "Failed to fetch sheets",
          });
          return api.files.getSheets.responses[200].parse(data);
        });
      }
      const data = await fetchJson(buildUrl(api.files.getSheets.path, { id: fileId }), {
        code: "REQUEST_FAILED",
        message: "Failed to fetch sheets",
      });
      return api.files.getSheets.responses[200].parse(data);
    },

    async getSearchIndex(fileId: number) {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_get_search_index", { fileId }, async () => {
          const data = await fetchJson(buildUrl(api.files.getSearchIndex.path, { id: fileId }), {
            code: "REQUEST_FAILED",
            message: "Failed to fetch search index",
          });
          return api.files.getSearchIndex.responses[200].parse(data);
        });
      }
      const data = await fetchJson(buildUrl(api.files.getSearchIndex.path, { id: fileId }), {
        code: "REQUEST_FAILED",
        message: "Failed to fetch search index",
      });
      return api.files.getSearchIndex.responses[200].parse(data);
    },

    async getTableInfo(fileId: number, sheetName: string): Promise<TableInfo[]> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_get_table_info", { fileId, sheetName }, async () => {
          const data = await fetchJson(buildUrl(api.files.getTableInfo.path, { id: fileId, sheetName }), {
            code: "REQUEST_FAILED",
            message: "Failed to fetch table info",
          });
          return api.files.getTableInfo.responses[200].parse(data);
        });
      }
      const data = await fetchJson(buildUrl(api.files.getTableInfo.path, { id: fileId, sheetName }), {
        code: "REQUEST_FAILED",
        message: "Failed to fetch table info",
      });
      return api.files.getTableInfo.responses[200].parse(data);
    },

    async getSheetData(fileId: number, sheetName: string): Promise<unknown[][]> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_get_sheet_data", { fileId, sheetName }, async () =>
          await fetchJson<unknown[][]>(
            buildUrl(api.files.getSheetData.path, { id: fileId, sheetName }),
            {
              code: "REQUEST_FAILED",
              message: "Failed to fetch sheet data",
            },
          ),
        );
      }
      return await fetchJson<unknown[][]>(
        buildUrl(api.files.getSheetData.path, { id: fileId, sheetName }),
        {
          code: "REQUEST_FAILED",
          message: "Failed to fetch sheet data",
        },
      );
    },

    async parseRegion(params: {
      fileId: number;
      sheetName: string;
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    }): Promise<TableInfo[]> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("files_parse_region", params, async () =>
          await fetchJson<TableInfo[]>(
            buildUrl(api.files.parseRegion.path, { id: params.fileId }),
            {
              code: "REQUEST_FAILED",
              message: "Failed to parse region",
            },
            {
              method: api.files.parseRegion.method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sheetName: params.sheetName,
                startRow: params.startRow,
                endRow: params.endRow,
                startCol: params.startCol,
                endCol: params.endCol,
              }),
            },
          ),
        );
      }
      return await fetchJson<TableInfo[]>(
        buildUrl(api.files.parseRegion.path, { id: params.fileId }),
        {
          code: "REQUEST_FAILED",
          message: "Failed to parse region",
        },
        {
          method: api.files.parseRegion.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetName: params.sheetName,
            startRow: params.startRow,
            endRow: params.endRow,
            startCol: params.startCol,
            endCol: params.endCol,
          }),
        },
      );
    },
  },

  ddl: {
    async generate(request: GenerateDdlRequest) {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("ddl_generate", { request }, async () => {
          const response = await fetchJson(api.ddl.generate.path, {
            code: "REQUEST_FAILED",
            message: "Failed to generate DDL",
          }, {
            method: api.ddl.generate.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          return api.ddl.generate.responses[200].parse(response);
        });
      }
      const response = await fetchJson(api.ddl.generate.path, {
        code: "REQUEST_FAILED",
        message: "Failed to generate DDL",
      }, {
        method: api.ddl.generate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.ddl.generate.responses[200].parse(response);
    },

    async generateByReference(request: GenerateDdlByReferenceRequest) {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("ddl_generate_by_reference", { request }, async () => {
          const response = await fetchJson(api.ddl.generateByReference.path, {
            code: "REQUEST_FAILED",
            message: "Failed to generate DDL",
          }, {
            method: api.ddl.generateByReference.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          return api.ddl.generateByReference.responses[200].parse(response);
        });
      }
      const response = await fetchJson(api.ddl.generateByReference.path, {
        code: "REQUEST_FAILED",
        message: "Failed to generate DDL",
      }, {
        method: api.ddl.generateByReference.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return api.ddl.generateByReference.responses[200].parse(response);
    },

    async exportZip(request: ExportZipRequest): Promise<ExportResult> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("ddl_export_zip", { request }, async () => {
          const response = await throwIfFailed(
            await fetch(api.ddl.exportZip.path, {
              method: api.ddl.exportZip.method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
            }),
            {
              code: "REQUEST_FAILED",
              message: "Failed to export DDL ZIP",
            },
          );
          return {
            blob: await response.blob(),
            fileName: sanitizeDownloadFileName(
              parseContentDispositionFileName(response.headers.get("Content-Disposition")),
              "ddl-export.zip",
            ),
            successCount: readNumberHeader(response.headers.get("X-Zip-Export-Success-Count"), request.tables.length),
            skippedCount: readNumberHeader(response.headers.get("X-Zip-Export-Skipped-Count"), 0),
            skippedTables: readStringArrayHeader(response.headers.get("X-Zip-Export-Skipped-Tables")),
          };
        });
      }
      const response = await throwIfFailed(
        await fetch(api.ddl.exportZip.path, {
          method: api.ddl.exportZip.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }),
        {
          code: "REQUEST_FAILED",
          message: "Failed to export DDL ZIP",
        },
      );
      return {
        blob: await response.blob(),
        fileName: sanitizeDownloadFileName(
          parseContentDispositionFileName(response.headers.get("Content-Disposition")),
          "ddl-export.zip",
        ),
        successCount: readNumberHeader(response.headers.get("X-Zip-Export-Success-Count"), request.tables.length),
        skippedCount: readNumberHeader(response.headers.get("X-Zip-Export-Skipped-Count"), 0),
        skippedTables: readStringArrayHeader(response.headers.get("X-Zip-Export-Skipped-Tables")),
      };
    },

    async exportZipByReference(request: GenerateDdlByReferenceRequest & { tolerantMode?: boolean; includeErrorReport?: boolean }): Promise<ExportResult> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("ddl_export_zip_by_reference", { request }, async () => {
          const response = await throwIfFailed(
            await fetch(api.ddl.exportZipByReference.path, {
              method: api.ddl.exportZipByReference.method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
            }),
            {
              code: "REQUEST_FAILED",
              message: "Failed to export DDL ZIP",
            },
          );
          return {
            blob: await response.blob(),
            fileName: sanitizeDownloadFileName(
              parseContentDispositionFileName(response.headers.get("Content-Disposition")),
              "ddl-export.zip",
            ),
            successCount: readNumberHeader(response.headers.get("X-Zip-Export-Success-Count"), request.selectedTableIndexes.length),
            skippedCount: readNumberHeader(response.headers.get("X-Zip-Export-Skipped-Count"), 0),
            skippedTables: readStringArrayHeader(response.headers.get("X-Zip-Export-Skipped-Tables")),
          };
        });
      }
      const response = await throwIfFailed(
        await fetch(api.ddl.exportZipByReference.path, {
          method: api.ddl.exportZipByReference.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }),
        {
          code: "REQUEST_FAILED",
          message: "Failed to export DDL ZIP",
        },
      );
      return {
        blob: await response.blob(),
        fileName: sanitizeDownloadFileName(
          parseContentDispositionFileName(response.headers.get("Content-Disposition")),
          "ddl-export.zip",
        ),
        successCount: readNumberHeader(response.headers.get("X-Zip-Export-Success-Count"), request.selectedTableIndexes.length),
        skippedCount: readNumberHeader(response.headers.get("X-Zip-Export-Skipped-Count"), 0),
        skippedTables: readStringArrayHeader(response.headers.get("X-Zip-Export-Skipped-Tables")),
      };
    },
  },

  settings: {
    async get(): Promise<DdlSettings> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("settings_get", undefined, async () => {
          const data = await fetchJson(api.settings.get.path, {
            code: "REQUEST_FAILED",
            message: "Failed to fetch settings",
          });
          return api.settings.get.responses[200].parse(data);
        });
      }
      const data = await fetchJson(api.settings.get.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch settings",
      });
      return api.settings.get.responses[200].parse(data);
    },

    async update(settings: DdlSettings): Promise<DdlSettings> {
      const runtime = getDesktopCapabilities().runtime;
      if (runtime === "tauri") {
        return await invokeWithTauriFallback("settings_update", { settings }, async () => {
          const data = await fetchJson(api.settings.update.path, {
            code: "REQUEST_FAILED",
            message: "Failed to update settings",
          }, {
            method: api.settings.update.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          });
          return api.settings.update.responses[200].parse(data);
        });
      }
      const data = await fetchJson(api.settings.update.path, {
        code: "REQUEST_FAILED",
        message: "Failed to update settings",
      }, {
        method: api.settings.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      return api.settings.update.responses[200].parse(data);
    },
  },
};
