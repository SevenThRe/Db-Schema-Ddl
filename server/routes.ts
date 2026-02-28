import type { Express, NextFunction, Request, Response } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import archiver from "archiver";
import { once } from "events";
import { storage } from "./storage";
import { api } from "@shared/routes";
import type {
  DdlSettings,
  GenerateDdlByReferenceRequest,
  TableInfo,
} from "@shared/schema";
import { getSheetData } from "./lib/excel";
import { collectDdlGenerationWarnings, generateDDL, streamDDL, substituteFilenameSuffix } from "./lib/ddl";
import { DdlValidationError } from "./lib/ddl-validation";
import { taskManager, TaskQueueOverflowError } from "./lib/task-manager";
import { ExcelExecutorQueueOverflowError, runParseRegion, runParseWorkbookBundle } from "./lib/excel-executor";
import { z } from "zod";
import { sendApiError } from "./lib/api-error";
import {
  applyNameFixPlanById,
  getNameFixJobDetail,
  previewNameFixPlan,
  resolveNameFixDownloadTicket,
  rollbackNameFixJobById,
  startNameFixMaintenance,
} from "./lib/name-fix-service";

// アップロードディレクトリの取得と作成
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Custom storage to handle UTF-8 filenames and file deduplication
const customStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Properly decode UTF-8 filename (multer encodes as latin1)
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Store decoded name in request for later use
    (req as any).decodedFileName = decodedName;

    // Generate unique filename: hash_timestamp_originalname.ext
    const ext = path.extname(decodedName);
    const nameWithoutExt = path.basename(decodedName, ext);
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(decodedName + timestamp).digest('hex').slice(0, 8);
    const filename = `${hash}_${timestamp}_${nameWithoutExt}${ext}`;

    cb(null, filename);
  }
});

// xlsx / xls のみ受け付けるフィルター（MIMEタイプと拡張子の両方を確認）
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'application/octet-stream',                                           // 一部ブラウザでのフォールバック
]);
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);

const upload = multer({
  storage: customStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(decodedName).toLowerCase();
    if (ALLOWED_MIME_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Excel ファイル（.xlsx / .xls）のみアップロード可能です'));
    }
  },
});

const DEFAULT_PK_MARKERS = ["\u3007"];

const DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS = 40;
const DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS = 240;
const DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT = 80;
const DEFAULT_PREWARM_MAX_CONCURRENCY = 1;
const DEFAULT_PREWARM_QUEUE_MAX = 12;
const DEFAULT_PREWARM_MAX_FILE_MB = 20;

const HARD_CAP_UPLOAD_RATE_LIMIT_WINDOW_MS = 300_000;
const HARD_CAP_UPLOAD_RATE_LIMIT_MAX_REQUESTS = 500;
const HARD_CAP_PARSE_RATE_LIMIT_WINDOW_MS = 300_000;
const HARD_CAP_PARSE_RATE_LIMIT_MAX_REQUESTS = 1_000;
const HARD_CAP_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS = 300_000;
const HARD_CAP_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS = 5_000;
const HARD_CAP_GLOBAL_PROTECT_MAX_INFLIGHT = 500;
const HARD_CAP_PREWARM_MAX_CONCURRENCY = 8;
const HARD_CAP_PREWARM_QUEUE_MAX = 100;
const HARD_CAP_PREWARM_MAX_FILE_MB = 100;
const HARD_CAP_TASK_MANAGER_MAX_QUEUE_LENGTH = 1_000;
const HARD_CAP_TASK_MANAGER_STALE_PENDING_MS = 3_600_000;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return fallback;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) {
    return fallback;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

let uploadRateLimitWindowMs = parsePositiveIntEnv("UPLOAD_RATE_LIMIT_WINDOW_MS", DEFAULT_UPLOAD_RATE_LIMIT_WINDOW_MS);
let uploadRateLimitMaxRequests = parsePositiveIntEnv("UPLOAD_RATE_LIMIT_MAX_REQUESTS", DEFAULT_UPLOAD_RATE_LIMIT_MAX_REQUESTS);
let parseRateLimitWindowMs = parsePositiveIntEnv("PARSE_RATE_LIMIT_WINDOW_MS", DEFAULT_PARSE_RATE_LIMIT_WINDOW_MS);
let parseRateLimitMaxRequests = parsePositiveIntEnv("PARSE_RATE_LIMIT_MAX_REQUESTS", DEFAULT_PARSE_RATE_LIMIT_MAX_REQUESTS);
let globalProtectRateLimitWindowMs = parsePositiveIntEnv(
  "GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS",
  DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS,
);
let globalProtectRateLimitMaxRequests = parsePositiveIntEnv(
  "GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS",
  DEFAULT_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS,
);
let globalProtectMaxInFlight = parsePositiveIntEnv(
  "GLOBAL_PROTECT_MAX_INFLIGHT",
  DEFAULT_GLOBAL_PROTECT_MAX_INFLIGHT,
);
const uploadRateCounter = new Map<string, { windowStartedAt: number; count: number }>();
const parseRateCounter = new Map<string, { windowStartedAt: number; count: number }>();
const globalProtectCounter = { windowStartedAt: Date.now(), count: 0 };
let globalProtectInFlight = 0;

function resolveClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isLocalRequest(req: Request): boolean {
  const clientKey = resolveClientKey(req).replace(/^::ffff:/, "");
  return clientKey === "127.0.0.1" || clientKey === "::1";
}

function consumeRateLimitSlot(
  counterMap: Map<string, { windowStartedAt: number; count: number }>,
  key: string,
  windowMs: number,
): number {
  const now = Date.now();
  const counter = counterMap.get(key);
  if (!counter || now - counter.windowStartedAt > windowMs) {
    counterMap.set(key, { windowStartedAt: now, count: 1 });
    return 1;
  }

  counter.count += 1;
  return counter.count;
}

function consumeGlobalRateLimitSlot(windowMs: number): number {
  const now = Date.now();
  if (now - globalProtectCounter.windowStartedAt > windowMs) {
    globalProtectCounter.windowStartedAt = now;
    globalProtectCounter.count = 1;
    return 1;
  }
  globalProtectCounter.count += 1;
  return globalProtectCounter.count;
}

function sendGlobalProtectBusyError(res: Response): void {
  sendApiError(res, {
    status: 503,
    code: "REQUEST_FAILED",
    message: "Service is temporarily busy. Please retry shortly.",
    params: {
      retryAfterMs: globalProtectRateLimitWindowMs,
    },
  });
}

function uploadRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = resolveClientKey(req);
  const count = consumeRateLimitSlot(uploadRateCounter, key, uploadRateLimitWindowMs);
  if (count > uploadRateLimitMaxRequests) {
    sendApiError(res, {
      status: 429,
      code: "REQUEST_FAILED",
      message: "Too many uploads. Please retry later.",
      params: {
        retryAfterMs: uploadRateLimitWindowMs,
      },
    });
    return;
  }
  next();
}

function parseRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = resolveClientKey(req);
  const count = consumeRateLimitSlot(parseRateCounter, key, parseRateLimitWindowMs);
  if (count > parseRateLimitMaxRequests) {
    sendApiError(res, {
      status: 429,
      code: "REQUEST_FAILED",
      message: "Too many parse requests. Please retry later.",
      params: {
        retryAfterMs: parseRateLimitWindowMs,
      },
    });
    return;
  }

  next();
}

function globalProtectRateLimit(_req: Request, res: Response, next: NextFunction): void {
  const count = consumeGlobalRateLimitSlot(globalProtectRateLimitWindowMs);
  if (count > globalProtectRateLimitMaxRequests) {
    sendGlobalProtectBusyError(res);
    return;
  }
  next();
}

function globalProtectInFlightLimit(_req: Request, res: Response, next: NextFunction): void {
  if (globalProtectInFlight >= globalProtectMaxInFlight) {
    sendGlobalProtectBusyError(res);
    return;
  }

  globalProtectInFlight += 1;
  let released = false;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    globalProtectInFlight = Math.max(0, globalProtectInFlight - 1);
  };

  res.on("finish", release);
  res.on("close", release);

  next();
}

interface PrewarmQueueItem {
  filePath: string;
  fileHash: string;
  fileSize: number;
}

let prewarmEnabled = parseBoolEnv("EXCEL_PREWARM_ENABLED", true);
let prewarmMaxConcurrency = parsePositiveIntEnv("EXCEL_PREWARM_MAX_CONCURRENCY", DEFAULT_PREWARM_MAX_CONCURRENCY);
let prewarmQueueMax = parsePositiveIntEnv("EXCEL_PREWARM_QUEUE_MAX", DEFAULT_PREWARM_QUEUE_MAX);
let prewarmMaxFileMb = parsePositiveIntEnv("EXCEL_PREWARM_MAX_FILE_MB", DEFAULT_PREWARM_MAX_FILE_MB);
let prewarmMaxFileBytes = prewarmMaxFileMb * 1024 * 1024;
const prewarmQueue: PrewarmQueueItem[] = [];
const prewarmDedup = new Set<string>();
let activePrewarmCount = 0;

function applyRuntimeLimitsFromSettings(settings: DdlSettings): void {
  uploadRateLimitWindowMs = clampInt(
    settings.uploadRateLimitWindowMs,
    1_000,
    HARD_CAP_UPLOAD_RATE_LIMIT_WINDOW_MS,
  );
  uploadRateLimitMaxRequests = clampInt(
    settings.uploadRateLimitMaxRequests,
    1,
    HARD_CAP_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
  );
  parseRateLimitWindowMs = clampInt(
    settings.parseRateLimitWindowMs,
    1_000,
    HARD_CAP_PARSE_RATE_LIMIT_WINDOW_MS,
  );
  parseRateLimitMaxRequests = clampInt(
    settings.parseRateLimitMaxRequests,
    1,
    HARD_CAP_PARSE_RATE_LIMIT_MAX_REQUESTS,
  );
  globalProtectRateLimitWindowMs = clampInt(
    settings.globalProtectRateLimitWindowMs,
    1_000,
    HARD_CAP_GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS,
  );
  globalProtectRateLimitMaxRequests = clampInt(
    settings.globalProtectRateLimitMaxRequests,
    10,
    HARD_CAP_GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS,
  );
  globalProtectMaxInFlight = clampInt(
    settings.globalProtectMaxInFlight,
    1,
    HARD_CAP_GLOBAL_PROTECT_MAX_INFLIGHT,
  );
  prewarmEnabled = settings.prewarmEnabled;
  prewarmMaxConcurrency = clampInt(
    settings.prewarmMaxConcurrency,
    1,
    HARD_CAP_PREWARM_MAX_CONCURRENCY,
  );
  prewarmQueueMax = clampInt(
    settings.prewarmQueueMax,
    1,
    HARD_CAP_PREWARM_QUEUE_MAX,
  );
  prewarmMaxFileMb = clampInt(
    settings.prewarmMaxFileMb,
    1,
    HARD_CAP_PREWARM_MAX_FILE_MB,
  );
  prewarmMaxFileBytes = prewarmMaxFileMb * 1024 * 1024;

  taskManager.configureRuntimeLimits({
    maxQueueLength: clampInt(
      settings.taskManagerMaxQueueLength,
      10,
      HARD_CAP_TASK_MANAGER_MAX_QUEUE_LENGTH,
    ),
    stalePendingMs: clampInt(
      settings.taskManagerStalePendingMs,
      60_000,
      HARD_CAP_TASK_MANAGER_STALE_PENDING_MS,
    ),
  });
}

setInterval(() => {
  const now = Date.now();
  const staleUploadWindowMs = uploadRateLimitWindowMs * 2;
  const staleParseWindowMs = parseRateLimitWindowMs * 2;

  uploadRateCounter.forEach((counter, key) => {
    if (now - counter.windowStartedAt > staleUploadWindowMs) {
      uploadRateCounter.delete(key);
    }
  });

  parseRateCounter.forEach((counter, key) => {
    if (now - counter.windowStartedAt > staleParseWindowMs) {
      parseRateCounter.delete(key);
    }
  });
}, Math.max(10_000, Math.min(uploadRateLimitWindowMs, parseRateLimitWindowMs)));

function sendTaskQueueBusyError(res: Response): void {
  sendApiError(res, {
    status: 503,
    code: "REQUEST_FAILED",
    message: "Task queue is busy. Please retry shortly.",
  });
}

class ReferenceRequestError extends Error {
  readonly status: number;
  readonly code: "INVALID_REQUEST" | "FILE_NOT_FOUND" | "REQUEST_FAILED";
  readonly params?: Record<string, string | number | boolean | null>;

  constructor(
    status: number,
    code: "INVALID_REQUEST" | "FILE_NOT_FOUND" | "REQUEST_FAILED",
    message: string,
    params?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = "ReferenceRequestError";
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

function normalizeSelectedTableIndexes(indexes: number[]): number[] {
  const deduped: number[] = [];
  const seen = new Set<number>();
  indexes.forEach((index) => {
    if (!seen.has(index)) {
      seen.add(index);
      deduped.push(index);
    }
  });
  return deduped;
}

async function resolveTablesByReference(
  request: Pick<
    GenerateDdlByReferenceRequest,
    "fileId" | "sheetName" | "selectedTableIndexes" | "tableOverrides"
  >,
): Promise<{ tables: TableInfo[]; persistedSettings: DdlSettings }> {
  const file = await storage.getUploadedFile(request.fileId);
  if (!file) {
    throw new ReferenceRequestError(404, "FILE_NOT_FOUND", "File not found");
  }

  const persistedSettings = await storage.getSettings();
  const bundle = await runParseWorkbookBundle(
    file.filePath,
    {
      maxConsecutiveEmptyRows: persistedSettings?.maxConsecutiveEmptyRows ?? 10,
      pkMarkers: persistedSettings?.pkMarkers ?? DEFAULT_PK_MARKERS,
    },
    file.fileHash,
  );

  const parsedTables = bundle.tablesBySheet[request.sheetName];
  if (!parsedTables) {
    throw new ReferenceRequestError(400, "INVALID_REQUEST", "Sheet not found in file", {
      sheetName: request.sheetName,
    });
  }

  const selectedIndexes = normalizeSelectedTableIndexes(request.selectedTableIndexes);
  if (selectedIndexes.length === 0) {
    throw new ReferenceRequestError(400, "INVALID_REQUEST", "No table selected");
  }

  selectedIndexes.forEach((index) => {
    if (index < 0 || index >= parsedTables.length) {
      throw new ReferenceRequestError(400, "INVALID_REQUEST", "Selected table index out of range", {
        index,
        tableCount: parsedTables.length,
      });
    }
  });

  const selectedIndexSet = new Set(selectedIndexes);
  const overrideByIndex = new Map<number, TableInfo>();
  (request.tableOverrides ?? []).forEach((override) => {
    if (override.tableIndex < 0 || override.tableIndex >= parsedTables.length) {
      throw new ReferenceRequestError(400, "INVALID_REQUEST", "Override table index out of range", {
        index: override.tableIndex,
        tableCount: parsedTables.length,
      });
    }
    if (!selectedIndexSet.has(override.tableIndex)) {
      throw new ReferenceRequestError(
        400,
        "INVALID_REQUEST",
        "Override table index must exist in selectedTableIndexes",
        { index: override.tableIndex },
      );
    }
    overrideByIndex.set(override.tableIndex, override.table);
  });

  const tables = selectedIndexes.map((index) => overrideByIndex.get(index) ?? parsedTables[index]);
  return { tables, persistedSettings };
}

async function prewarmWorkbookBundle(filePath: string, fileHash: string): Promise<void> {
  try {
    const settings = await storage.getSettings();
    const bundle = await runParseWorkbookBundle(
      filePath,
      {
        maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
        pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
      },
      fileHash,
    );
    console.info(
      `[parse-prewarm] file=${filePath} mode=${bundle.stats.parseMode} readMode=${bundle.stats.readMode} totalMs=${Math.round(bundle.stats.totalMs)}`,
    );
  } catch (error) {
    if (isExecutorOverloadedError(error)) {
      console.warn(`[parse-prewarm] executor busy for ${filePath}`);
      return;
    }
    console.warn("[parse-prewarm] failed:", error);
  }
}

function isExecutorOverloadedError(error: unknown): boolean {
  return error instanceof ExcelExecutorQueueOverflowError;
}

function maybeSchedulePrewarm(filePath: string, fileHash: string, fileSize: number): void {
  if (!prewarmEnabled) {
    return;
  }
  if (!fileHash || fileHash.trim() === "") {
    return;
  }
  if (fileSize > prewarmMaxFileBytes) {
    console.info(`[parse-prewarm] skip large file (size=${fileSize} bytes) path=${filePath}`);
    return;
  }
  if (prewarmDedup.has(fileHash)) {
    return;
  }
  if (prewarmQueue.length >= prewarmQueueMax) {
    console.warn(
      `[parse-prewarm] queue overflow. drop task for ${filePath} (queueMax=${prewarmQueueMax})`,
    );
    return;
  }

  prewarmDedup.add(fileHash);
  prewarmQueue.push({ filePath, fileHash, fileSize });
  drainPrewarmQueue();
}

function drainPrewarmQueue(): void {
  while (activePrewarmCount < prewarmMaxConcurrency && prewarmQueue.length > 0) {
    const task = prewarmQueue.shift();
    if (!task) {
      return;
    }

    activePrewarmCount += 1;
    void prewarmWorkbookBundle(task.filePath, task.fileHash)
      .catch((error) => {
        if (isExecutorOverloadedError(error)) {
          console.warn(`[parse-prewarm] executor busy while prewarming ${task.filePath}`);
        }
      })
      .finally(() => {
        activePrewarmCount = Math.max(0, activePrewarmCount - 1);
        prewarmDedup.delete(task.fileHash);
        drainPrewarmQueue();
      });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  try {
    const persistedSettings = await storage.getSettings();
    applyRuntimeLimitsFromSettings(persistedSettings);
  } catch (error) {
    console.warn("[settings] failed to load runtime limits from storage, fallback to env defaults:", error);
  }

  startNameFixMaintenance();

  app.get(api.files.list.path, async (req, res) => {
    const files = await storage.getUploadedFiles();
    res.json(files);
  });

  app.post(
    api.files.upload.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    uploadRateLimit,
    upload.single('file'),
    async (req, res) => {
    if (!req.file) {
      return sendApiError(res, {
        status: 400,
        code: "NO_FILE_UPLOADED",
        message: "No file uploaded",
      });
    }

    // Use the decoded filename we stored in multer config
    const decodedName = (req as any).decodedFileName || req.file.originalname;
    const filePath = req.file.path;

    // Create a temporary file entry without hash (will be updated later)
    const tempFile = await storage.createUploadedFile({
      filePath,
      originalName: decodedName,
      fileHash: 'processing',
      fileSize: 0,
    });

    let task;
    try {
      // Create a background task to process the file
      task = taskManager.createTask('hash', filePath, {
        onComplete: async (result) => {
          try {
            const { fileHash, fileSize } = result;

            // Check if a file with the same hash already exists
            const existingFile = await storage.findFileByHash(fileHash);

            if (existingFile && existingFile.id !== tempFile.id) {
              // File already exists, remove the newly uploaded duplicate
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
              await storage.deleteUploadedFile(tempFile.id);
              return;
            }

            // ハッシュ計算完了後、ファイルレコードを実際の値で更新する
            await storage.updateUploadedFile(tempFile.id, { fileHash, fileSize });

            // Upload warm-up: enqueue workbook prewarm in controlled background queue
            maybeSchedulePrewarm(filePath, fileHash, fileSize);
          } catch (error) {
            console.error('Failed to finalize uploaded file:', error);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            await storage.deleteUploadedFile(tempFile.id);
          }
        },
        onError: async (error) => {
          console.error('Failed to process file:', error);
          // Clean up the file and database entry
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          await storage.deleteUploadedFile(tempFile.id);
        }
      });
    } catch (error) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        await storage.deleteUploadedFile(tempFile.id);
      } catch (cleanupError) {
        console.warn("Failed to rollback upload after task scheduling failure:", cleanupError);
      }

      if (error instanceof TaskQueueOverflowError) {
        sendTaskQueueBusyError(res);
        return;
      }
      return sendApiError(res, {
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to schedule upload processing task",
      });
    }

    // Return immediately with the file and task ID
    res.status(201).json({
      ...tempFile,
      taskId: task.id,
      processing: true,
    });
  });

  // Delete file
  app.delete('/api/files/:id', async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }
    try {
      let fileCleanupWarning: string | null = null;

      // Best effort: remove uploaded file from disk first.
      // Even if cleanup fails (e.g. file lock), still delete DB record to avoid stale entries.
      if (file.filePath.startsWith(UPLOADS_DIR) && fs.existsSync(file.filePath)) {
        try {
          fs.unlinkSync(file.filePath);
        } catch (cleanupError) {
          fileCleanupWarning = (cleanupError as Error).message;
          console.warn(`[file-delete] failed to remove physical file "${file.filePath}": ${fileCleanupWarning}`);
        }
      }

      await storage.deleteUploadedFile(id);
      res.json({
        message: 'File deleted',
        fileCleanupWarning,
      });
    } catch (err) {
      return sendApiError(res, {
        status: 500,
        code: "FILE_DELETE_FAILED",
        message: "Failed to delete file",
      });
    }
    },
  );

  // Get raw sheet data (2D array) for spreadsheet viewer
  app.get('/api/files/:id/sheets/:sheetName/data', async (req, res) => {
    const id = Number(req.params.id);
    const sheetName = decodeURIComponent(req.params.sheetName);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }
    try {
      const data = getSheetData(file.filePath, sheetName);
      res.json(data);
    } catch (err) {
      return sendApiError(res, {
        status: 400,
        code: "READ_SHEET_FAILED",
        message: `Failed to read sheet: ${(err as Error).message}`,
        params: {
          sheetName,
        },
      });
    }
  });

  // Parse a selected region of a sheet
  app.post(
    '/api/files/:id/parse-region',
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }
    try {
      const { sheetName, startRow, endRow, startCol, endCol } = req.body;
      const settings = await storage.getSettings();
      const tables = await runParseRegion(file.filePath, sheetName, startRow, endRow, startCol, endCol, {
        maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
        pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
      });
      res.json(tables);
    } catch (err) {
      if (isExecutorOverloadedError(err)) {
        return sendApiError(res, {
          status: 503,
          code: "REQUEST_FAILED",
          message: "Excel parser is busy. Please retry shortly.",
        });
      }
      return sendApiError(res, {
        status: 400,
        code: "PARSE_REGION_FAILED",
        message: `Failed to parse region: ${(err as Error).message}`,
      });
    }
    },
  );

  app.get(
    api.files.getSheets.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }

    try {
      // Get settings for parse options
      const settings = await storage.getSettings();

      // Always use background task to avoid blocking
      const task = taskManager.createTask('parse_sheets', file.filePath, {
        fileHash: file.fileHash,
        dedupeKey: `parse_sheets:${file.id}`,
        parseOptions: {
          maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
          pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
        },
        onComplete: (result) => {
          // Task completed, frontend will poll for results
        },
        onError: (error) => {
          console.error('Failed to parse sheets:', error);
        }
      });

      // Return task ID for polling
      res.json({
        taskId: task.id,
        processing: true,
      });
    } catch (err) {
      if (err instanceof TaskQueueOverflowError) {
        sendTaskQueueBusyError(res);
        return;
      }
      return sendApiError(res, {
        status: 500,
        code: "READ_EXCEL_FAILED",
        message: "Failed to read Excel file",
      });
    }
    },
  );

  app.get(
    api.files.getTableInfo.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
    const id = Number(req.params.id);
    const rawSheetName = req.params.sheetName;
    const sheetName = Array.isArray(rawSheetName) ? rawSheetName[0] : rawSheetName;
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }

    try {
      if (!sheetName) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: "Sheet name is required",
        });
      }

      // Get settings for parse options
      const settings = await storage.getSettings();

      // Use background task to avoid blocking
      const task = taskManager.createTask('parse_table', file.filePath, {
        fileHash: file.fileHash,
        sheetName,
        dedupeKey: `parse_table:${file.id}:${sheetName}`,
        parseOptions: {
          maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
          pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
        },
        onComplete: (result) => {
          // Task completed, frontend will poll for results
        },
        onError: (error) => {
          console.error('Failed to parse table:', error);
        }
      });

      // Return task ID for polling
      res.json({
        taskId: task.id,
        processing: true,
      });
    } catch (err) {
      if (err instanceof TaskQueueOverflowError) {
        sendTaskQueueBusyError(res);
        return;
      }
      return sendApiError(res, {
        status: 400,
        code: "PARSE_SHEET_FAILED",
        message: `Failed to parse sheet: ${(err as Error).message}`,
        params: {
          sheetName: sheetName ?? null,
        },
      });
    }
    },
  );

  // Get task status
  app.get(api.tasks.get.path, async (req, res) => {
    const id = req.params.id;
    const task = taskManager.getTask(id);
    if (!task) {
      return sendApiError(res, {
        status: 404,
        code: "TASK_NOT_FOUND",
        message: "Task not found",
      });
    }
    res.json({
      id: task.id,
      taskType: task.type,
      status: task.status,
      progress: task.progress,
      error: task.error,
      result: task.result,
      createdAt: task.createdAt,
      updatedAt: new Date(),
    });
  });

  // Get search index for a file
  app.get(
    api.files.getSearchIndex.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }

    try {
      const settings = await storage.getSettings();
      const bundle = await runParseWorkbookBundle(file.filePath, {
        maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
        pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
      }, file.fileHash);
      res.setHeader('X-Parse-Mode', bundle.stats.parseMode);
      res.json(bundle.searchIndex);
    } catch (err) {
      if (isExecutorOverloadedError(err)) {
        return sendApiError(res, {
          status: 503,
          code: "REQUEST_FAILED",
          message: "Excel parser is busy. Please retry shortly.",
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "SEARCH_INDEX_FAILED",
        message: "Failed to generate search index",
      });
    }
    },
  );

  app.post(
    api.nameFix.preview.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.nameFix.preview.input.parse(req.body);
        const response = await previewNameFixPlan(request);
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: 400,
            code: "INVALID_REQUEST",
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes("file not found")) {
          return sendApiError(res, {
            status: 404,
            code: "FILE_NOT_FOUND",
            message,
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "REQUEST_FAILED",
          message,
        });
      }
    },
  );

  app.post(
    api.nameFix.apply.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.nameFix.apply.input.parse(req.body);
        const response = await applyNameFixPlanById(request);
        res.setHeader("X-NameFix-JobId", response.jobId);
        res.setHeader("X-NameFix-PlanHash", response.planHash);
        res.setHeader("X-NameFix-Changed-Tables", String(response.summary.changedTableCount));
        res.setHeader("X-NameFix-Changed-Columns", String(response.summary.changedColumnCount));
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: 400,
            code: "INVALID_REQUEST",
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes("not found")) {
          return sendApiError(res, {
            status: 404,
            code: "TASK_NOT_FOUND",
            message,
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "REQUEST_FAILED",
          message,
        });
      }
    },
  );

  app.post(
    api.nameFix.rollback.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.nameFix.rollback.input.parse(req.body);
        const response = await rollbackNameFixJobById(request);
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: 400,
            code: "INVALID_REQUEST",
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes("not found")) {
          return sendApiError(res, {
            status: 404,
            code: "TASK_NOT_FOUND",
            message,
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "REQUEST_FAILED",
          message,
        });
      }
    },
  );

  app.get(api.nameFix.getJob.path, async (req, res) => {
    try {
      const jobId = req.params.id;
      const detail = await getNameFixJobDetail(jobId);
      res.json(detail);
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("not found")) {
        return sendApiError(res, {
          status: 404,
          code: "TASK_NOT_FOUND",
          message,
        });
      }
      return sendApiError(res, {
        status: 400,
        code: "REQUEST_FAILED",
        message,
      });
    }
  });

  app.get(api.nameFix.download.path, async (req, res) => {
    try {
      const token = String(req.params.token ?? "").trim();
      if (!token) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: "Download token is required.",
        });
      }
      const ticket = await resolveNameFixDownloadTicket(token);
      res.download(ticket.outputPath, ticket.downloadFilename);
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("not found") || message.toLowerCase().includes("expired")) {
        return sendApiError(res, {
          status: 404,
          code: "FILE_NOT_FOUND",
          message,
        });
      }
      return sendApiError(res, {
        status: 400,
        code: "REQUEST_FAILED",
        message,
      });
    }
  });

  app.post(
    api.ddl.generate.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    async (req, res) => {
    const streamQuery = String(req.query.stream ?? "").toLowerCase();
    const streamResponse = streamQuery === "1" || streamQuery === "true";
    try {
      const request = api.ddl.generate.input.parse(req.body);
      const hasRequestSettings = req.body && typeof req.body === "object" && req.body.settings != null;

      // 兼容直接调用 /api/generate-ddl 且未传 settings 的场景：
      // 优先使用持久化设置，而不是仅使用代码内置默认值
      const effectiveRequest = hasRequestSettings
        ? request
        : {
            ...request,
            settings: await storage.getSettings(),
          };

      if (streamResponse) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        await streamDDL(effectiveRequest, async (chunk) => {
          const accepted = res.write(chunk);
          if (!accepted) {
            await once(res, "drain");
          }
        });
        res.end();
        return;
      }

      const ddl = generateDDL(effectiveRequest);
      const warnings = collectDdlGenerationWarnings(effectiveRequest);
      res.json({ ddl, warnings });
    } catch (err) {
      if (streamResponse && res.headersSent) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        console.error("[ddl-stream] stream failed after headers sent:", streamError);
        if (!res.destroyed) {
          res.destroy(streamError);
        }
        return;
      }
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "DDL_GENERATE_FAILED",
        message: "Failed to generate DDL",
      });
    }
    },
  );

  app.post(
    api.ddl.generateByReference.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
    const streamQuery = String(req.query.stream ?? "").toLowerCase();
    const streamResponse = streamQuery === "1" || streamQuery === "true";
    try {
      const request = api.ddl.generateByReference.input.parse(req.body);
      const { tables, persistedSettings } = await resolveTablesByReference(request);
      const effectiveRequest = {
        tables,
        dialect: request.dialect,
        settings: request.settings ?? persistedSettings,
      };

      if (streamResponse) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        await streamDDL(effectiveRequest, async (chunk) => {
          const accepted = res.write(chunk);
          if (!accepted) {
            await once(res, "drain");
          }
        });
        res.end();
        return;
      }

      const ddl = generateDDL(effectiveRequest);
      const warnings = collectDdlGenerationWarnings(effectiveRequest);
      res.json({ ddl, warnings });
    } catch (err) {
      if (streamResponse && res.headersSent) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        console.error("[ddl-stream-by-reference] stream failed after headers sent:", streamError);
        if (!res.destroyed) {
          res.destroy(streamError);
        }
        return;
      }
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (err instanceof ReferenceRequestError) {
        return sendApiError(res, {
          status: err.status,
          code: err.code,
          message: err.message,
          params: err.params,
        });
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "DDL_GENERATE_FAILED",
        message: "Failed to generate DDL",
      });
    }
    },
  );

  app.post(
    api.ddl.exportZipByReference.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
    try {
      const request = api.ddl.exportZipByReference.input.parse(req.body);
      const { tables, persistedSettings } = await resolveTablesByReference(request);
      const effectiveSettings = request.settings ?? persistedSettings;
      const { dialect, tolerantMode, includeErrorReport } = request;
      const prefix = effectiveSettings?.exportFilenamePrefix || "Crt_";
      const suffixTemplate = effectiveSettings?.exportFilenameSuffix || "";
      const authorName = effectiveSettings?.authorName || "ISI";
      const zipEntries: Array<{ filename: string; content: string }> = [];
      const tolerantErrors: Array<{
        tableLogicalName: string;
        tablePhysicalName: string;
        message: string;
        issues?: unknown[];
      }> = [];

      for (const table of tables) {
        try {
          const singleTableDdl = generateDDL({
            tables: [table],
            dialect,
            settings: effectiveSettings,
          });
          const suffix = substituteFilenameSuffix(suffixTemplate, table, authorName);
          const filename = `${prefix}${table.physicalTableName}${suffix}.sql`;
          zipEntries.push({
            filename,
            content: singleTableDdl,
          });
        } catch (error) {
          if (!tolerantMode) {
            throw error;
          }

          if (error instanceof DdlValidationError) {
            tolerantErrors.push({
              tableLogicalName: table.logicalTableName,
              tablePhysicalName: table.physicalTableName,
              message: error.message,
              issues: error.issues,
            });
          } else {
            tolerantErrors.push({
              tableLogicalName: table.logicalTableName,
              tablePhysicalName: table.physicalTableName,
              message: `Unexpected error: ${(error as Error).message}`,
            });
          }
        }
      }

      if (zipEntries.length === 0) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: tolerantMode
            ? "No DDL files could be generated. All selected tables failed validation."
            : "Failed to generate ZIP",
          issues: tolerantErrors.flatMap((item) => (Array.isArray(item.issues) ? item.issues : [])),
          params: {
            selectedTableCount: tables.length,
            successCount: 0,
            skippedCount: tolerantErrors.length,
            tolerantMode,
          },
        });
      }

      const successfulTableCount = zipEntries.length;
      const skippedTableNames = Array.from(
        new Set(
          tolerantErrors
            .map((item) => item.tablePhysicalName)
            .filter((name): name is string => Boolean(name && name.trim())),
        ),
      );

      if (tolerantMode && includeErrorReport && tolerantErrors.length > 0) {
        const generatedAt = new Date().toISOString();
        const reportLines: string[] = [
          "DDL export completed with tolerated errors.",
          `generatedAt: ${generatedAt}`,
          `selectedTableCount: ${tables.length}`,
          `successCount: ${zipEntries.length}`,
          `skippedCount: ${tolerantErrors.length}`,
          "",
        ];
        tolerantErrors.forEach((item, index) => {
          reportLines.push(`## ${index + 1}. ${item.tablePhysicalName} (${item.tableLogicalName})`);
          reportLines.push(item.message);
          if (Array.isArray(item.issues) && item.issues.length > 0) {
            reportLines.push(JSON.stringify(item.issues, null, 2));
          }
          reportLines.push("");
        });
        zipEntries.push({
          filename: "__export_errors.txt",
          content: reportLines.join("\n"),
        });
      }

      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="ddl_${dialect}_${Date.now()}.zip"`);
      res.setHeader("X-Zip-Export-Success-Count", String(successfulTableCount));
      res.setHeader("X-Zip-Export-Skipped-Count", String(tolerantErrors.length));
      res.setHeader("X-Zip-Partial-Export", tolerantErrors.length > 0 ? "1" : "0");
      if (skippedTableNames.length > 0) {
        res.setHeader("X-Zip-Export-Skipped-Tables", encodeURIComponent(JSON.stringify(skippedTableNames)));
      }

      archive.pipe(res);

      for (const entry of zipEntries) {
        archive.append(entry.content, { name: entry.filename });
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          archive.off("error", onError);
          archive.off("end", onEnd);
          res.off("close", onClose);
        };
        const settleResolve = () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        };
        const settleReject = (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };
        const onError = (error: unknown) => {
          settleReject(error);
        };
        const onEnd = () => {
          settleResolve();
        };
        const onClose = () => {
          if (!res.writableEnded) {
            archive.abort();
            settleReject(new Error("Client disconnected during ZIP export"));
          }
        };

        archive.once("error", onError);
        archive.once("end", onEnd);
        res.once("close", onClose);

        Promise.resolve(archive.finalize()).catch(onError);
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (err instanceof ReferenceRequestError) {
        return sendApiError(res, {
          status: err.status,
          code: err.code,
          message: err.message,
          params: err.params,
        });
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      console.error("ZIP export by reference error:", err);
      if (!res.headersSent) {
        return sendApiError(res, {
          status: 500,
          code: "ZIP_GENERATE_FAILED",
          message: "Failed to generate ZIP",
        });
      }
      if (!res.destroyed) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        res.destroy(streamError);
      }
    }
    },
  );

  app.post(
    api.ddl.exportZip.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    async (req, res) => {
    try {
      const request = api.ddl.exportZip.input.parse(req.body);
      const hasRequestSettings = req.body && typeof req.body === "object" && req.body.settings != null;
      const effectiveSettings = hasRequestSettings ? request.settings : await storage.getSettings();
      const { tables, dialect, tolerantMode, includeErrorReport } = request;
      const prefix = effectiveSettings?.exportFilenamePrefix || "Crt_";
      const suffixTemplate = effectiveSettings?.exportFilenameSuffix || "";
      const authorName = effectiveSettings?.authorName || "ISI";
      const zipEntries: Array<{ filename: string; content: string }> = [];
      const tolerantErrors: Array<{
        tableLogicalName: string;
        tablePhysicalName: string;
        message: string;
        issues?: unknown[];
      }> = [];

      // Build all zip entries before opening the response stream to avoid write-after-end
      // when a table fails validation.
      for (const table of tables) {
        try {
          const singleTableDdl = generateDDL({
            tables: [table],
            dialect,
            settings: effectiveSettings
          });
          const suffix = substituteFilenameSuffix(suffixTemplate, table, authorName);
          const filename = `${prefix}${table.physicalTableName}${suffix}.sql`;
          zipEntries.push({
            filename,
            content: singleTableDdl,
          });
        } catch (error) {
          if (!tolerantMode) {
            throw error;
          }

          if (error instanceof DdlValidationError) {
            tolerantErrors.push({
              tableLogicalName: table.logicalTableName,
              tablePhysicalName: table.physicalTableName,
              message: error.message,
              issues: error.issues,
            });
          } else {
            tolerantErrors.push({
              tableLogicalName: table.logicalTableName,
              tablePhysicalName: table.physicalTableName,
              message: `Unexpected error: ${(error as Error).message}`,
            });
          }
        }
      }

      if (zipEntries.length === 0) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: tolerantMode
            ? "No DDL files could be generated. All selected tables failed validation."
            : "Failed to generate ZIP",
          issues: tolerantErrors.flatMap((item) => Array.isArray(item.issues) ? item.issues : []),
          params: {
            selectedTableCount: tables.length,
            successCount: 0,
            skippedCount: tolerantErrors.length,
            tolerantMode,
          },
        });
      }

      const successfulTableCount = zipEntries.length;
      const skippedTableNames = Array.from(
        new Set(
          tolerantErrors
            .map((item) => item.tablePhysicalName)
            .filter((name): name is string => Boolean(name && name.trim())),
        ),
      );

      if (tolerantMode && includeErrorReport && tolerantErrors.length > 0) {
        const generatedAt = new Date().toISOString();
        const reportLines: string[] = [
          "DDL export completed with tolerated errors.",
          `generatedAt: ${generatedAt}`,
          `selectedTableCount: ${tables.length}`,
          `successCount: ${zipEntries.length}`,
          `skippedCount: ${tolerantErrors.length}`,
          "",
        ];
        tolerantErrors.forEach((item, index) => {
          reportLines.push(`## ${index + 1}. ${item.tablePhysicalName} (${item.tableLogicalName})`);
          reportLines.push(item.message);
          if (Array.isArray(item.issues) && item.issues.length > 0) {
            reportLines.push(JSON.stringify(item.issues, null, 2));
          }
          reportLines.push("");
        });
        zipEntries.push({
          filename: "__export_errors.txt",
          content: reportLines.join("\n"),
        });
      }

      // Create a zip archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Set response headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="ddl_${dialect}_${Date.now()}.zip"`);
      res.setHeader("X-Zip-Export-Success-Count", String(successfulTableCount));
      res.setHeader("X-Zip-Export-Skipped-Count", String(tolerantErrors.length));
      res.setHeader("X-Zip-Partial-Export", tolerantErrors.length > 0 ? "1" : "0");
      if (skippedTableNames.length > 0) {
        res.setHeader("X-Zip-Export-Skipped-Tables", encodeURIComponent(JSON.stringify(skippedTableNames)));
      }

      // Pipe archive to response
      archive.pipe(res);

      // Add prepared DDL entries to ZIP
      for (const entry of zipEntries) {
        archive.append(entry.content, { name: entry.filename });
      }

      // Finalize the archive and surface asynchronous stream errors to this handler.
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          archive.off('error', onError);
          archive.off('end', onEnd);
          res.off('close', onClose);
        };
        const settleResolve = () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        };
        const settleReject = (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };
        const onError = (error: unknown) => {
          settleReject(error);
        };
        const onEnd = () => {
          settleResolve();
        };
        const onClose = () => {
          if (!res.writableEnded) {
            archive.abort();
            settleReject(new Error("Client disconnected during ZIP export"));
          }
        };

        archive.once('error', onError);
        archive.once('end', onEnd);
        res.once('close', onClose);

        Promise.resolve(archive.finalize()).catch(onError);
      });

    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      console.error('ZIP export error:', err);
      if (!res.headersSent) {
        return sendApiError(res, {
          status: 500,
          code: "ZIP_GENERATE_FAILED",
          message: "Failed to generate ZIP",
        });
      }
      if (!res.destroyed) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        res.destroy(streamError);
      }
    }
    },
  );

  // Settings routes
  app.get(api.settings.get.path, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (err) {
      return sendApiError(res, {
        status: 500,
        code: "SETTINGS_GET_FAILED",
        message: "Failed to get settings",
      });
    }
  });

  app.put(api.settings.update.path, async (req, res) => {
    try {
      const settings = api.settings.update.input.parse(req.body);
      if (settings.allowExternalPathWrite) {
        const allowForCurrentRequest = process.env.ELECTRON_MODE === "true" && isLocalRequest(req);
        if (!allowForCurrentRequest) {
          return sendApiError(res, {
            status: 403,
            code: "REQUEST_FAILED",
            message: "allowExternalPathWrite can only be enabled in local Electron mode.",
          });
        }
      }
      const updated = await storage.updateSettings(settings);
      applyRuntimeLimitsFromSettings(updated);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "SETTINGS_UPDATE_FAILED",
        message: "Failed to update settings",
      });
    }
  });

  // サンプルファイルの初期登録（Electron環境では RESOURCES_PATH から取得）
  const attachedFile = process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, '30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx')
    : 'attached_assets/30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx';
  if (fs.existsSync(attachedFile)) {
    const existing = await storage.getUploadedFiles();
    if (existing.length === 0) {
      // Calculate hash for the seed file
      const fileBuffer = fs.readFileSync(attachedFile);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      await storage.createUploadedFile({
        filePath: attachedFile,
        originalName: '30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx',
        fileHash,
        fileSize: fileBuffer.length,
      });
    }
  }

  return httpServer;
}
