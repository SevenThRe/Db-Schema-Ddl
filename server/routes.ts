import type { Express, NextFunction, Request, Response } from "express";
import type { Server } from "http";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import path from "path";
import type {
  DdlSettings,
  GenerateDdlByReferenceRequest,
  TableInfo,
} from "@shared/schema";
import { sendApiError } from "./lib/api-error";
import { ExcelExecutorQueueOverflowError, runParseWorkbookBundle } from "./lib/excel-executor";
import { startNameFixMaintenance } from "./lib/name-fix-service";
import { taskManager } from "./lib/task-manager";
import { registerDdlRoutes } from "./routes/ddl-routes";
import { registerFileRoutes } from "./routes/files-routes";
import { registerNameFixRoutes } from "./routes/name-fix-routes";
import { registerSettingsRoutes } from "./routes/settings-routes";
import { storage } from "./storage";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "uploads";
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const customStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, "latin1").toString("utf8");
    (req as any).decodedFileName = decodedName;

    const ext = path.extname(decodedName);
    const nameWithoutExt = path.basename(decodedName, ext);
    const timestamp = Date.now();
    const hash = crypto.createHash("md5").update(decodedName + timestamp).digest("hex").slice(0, 8);
    cb(null, `${hash}_${timestamp}_${nameWithoutExt}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);

const upload = multer({
  storage: customStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const ext = path.extname(decodedName).toLowerCase();
    if (ALLOWED_MIME_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Excel files (.xlsx / .xls) only"));
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
  uploadRateLimitWindowMs = clampInt(settings.uploadRateLimitWindowMs, 1_000, HARD_CAP_UPLOAD_RATE_LIMIT_WINDOW_MS);
  uploadRateLimitMaxRequests = clampInt(settings.uploadRateLimitMaxRequests, 1, HARD_CAP_UPLOAD_RATE_LIMIT_MAX_REQUESTS);
  parseRateLimitWindowMs = clampInt(settings.parseRateLimitWindowMs, 1_000, HARD_CAP_PARSE_RATE_LIMIT_WINDOW_MS);
  parseRateLimitMaxRequests = clampInt(settings.parseRateLimitMaxRequests, 1, HARD_CAP_PARSE_RATE_LIMIT_MAX_REQUESTS);
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
  globalProtectMaxInFlight = clampInt(settings.globalProtectMaxInFlight, 1, HARD_CAP_GLOBAL_PROTECT_MAX_INFLIGHT);
  prewarmEnabled = settings.prewarmEnabled;
  prewarmMaxConcurrency = clampInt(settings.prewarmMaxConcurrency, 1, HARD_CAP_PREWARM_MAX_CONCURRENCY);
  prewarmQueueMax = clampInt(settings.prewarmQueueMax, 1, HARD_CAP_PREWARM_QUEUE_MAX);
  prewarmMaxFileMb = clampInt(settings.prewarmMaxFileMb, 1, HARD_CAP_PREWARM_MAX_FILE_MB);
  prewarmMaxFileBytes = prewarmMaxFileMb * 1024 * 1024;

  taskManager.configureRuntimeLimits({
    maxQueueLength: clampInt(settings.taskManagerMaxQueueLength, 10, HARD_CAP_TASK_MANAGER_MAX_QUEUE_LENGTH),
    stalePendingMs: clampInt(settings.taskManagerStalePendingMs, 60_000, HARD_CAP_TASK_MANAGER_STALE_PENDING_MS),
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
    console.warn(`[parse-prewarm] queue overflow. drop task for ${filePath} (queueMax=${prewarmQueueMax})`);
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  try {
    const persistedSettings = await storage.getSettings();
    applyRuntimeLimitsFromSettings(persistedSettings);
  } catch (error) {
    console.warn("[settings] failed to load runtime limits from storage, fallback to env defaults:", error);
  }

  startNameFixMaintenance();

  registerFileRoutes(app, {
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    uploadRateLimit,
    upload,
    uploadsDir: UPLOADS_DIR,
    defaultPkMarkers: DEFAULT_PK_MARKERS,
    isExecutorOverloadedError,
    maybeSchedulePrewarm,
    sendTaskQueueBusyError,
  });

  registerNameFixRoutes(app, {
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
  });

  registerDdlRoutes(app, {
    resolveTablesByReference,
    handleReferenceRequestError: (err, res) => {
      if (!(err instanceof ReferenceRequestError)) {
        return false;
      }
      sendApiError(res, {
        status: err.status,
        code: err.code,
        message: err.message,
        params: err.params,
      });
      return true;
    },
  });

  registerSettingsRoutes(app, {
    applyRuntimeLimitsFromSettings,
    canEnableExternalPathWrite: (req) => process.env.ELECTRON_MODE === "true" && isLocalRequest(req),
  });

  const seedFileName = "\u0033\u0030.\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9\u5b9a\u7fa9\u66f8-\u7d66\u4e0e_ISI_20260209_1770863427874.xlsx";
  const attachedFile = process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, seedFileName)
    : path.join("attached_assets", seedFileName);
  if (fs.existsSync(attachedFile)) {
    const existing = await storage.getUploadedFiles();
    if (existing.length === 0) {
      const fileBuffer = fs.readFileSync(attachedFile);
      const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      await storage.createUploadedFile({
        filePath: attachedFile,
        originalName: seedFileName,
        fileHash,
        fileSize: fileBuffer.length,
      });
    }
  }

  return httpServer;
}

