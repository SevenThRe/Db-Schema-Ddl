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
import {
  ExcelExecutorQueueOverflowError,
  getExcelExecutorDiagnostics,
  runParseWorkbookBundle,
} from "./lib/excel-executor";
import { startNameFixMaintenance } from "./lib/name-fix-service";
import { taskManager } from "./lib/task-manager";
import { API_ERROR_CODES, API_RESPONSE_MESSAGES, HTTP_STATUS } from "./constants/api-response";
import {
  BYTES_PER_MB,
  ROUTE_BOOL_TRUE_VALUES,
  ROUTE_RATE_COUNTER_SWEEP,
  ROUTE_RUNTIME_CLAMP_MIN,
  ROUTE_RUNTIME_DEFAULTS,
  ROUTE_RUNTIME_HARD_CAPS,
  ROUTE_STRING_MARKERS,
  ROUTE_UPLOAD_FILE_NAMING,
  ROUTE_UPLOAD_RULES,
} from "./constants/route-runtime";
import { registerDdlRoutes } from "./routes/ddl-routes";
import { registerDbManagementRoutes } from "./routes/db-management-routes";
import { registerDiffRoutes } from "./routes/diff-routes";
import { registerExtensionRoutes } from "./routes/extensions-routes";
import { registerFileRoutes } from "./routes/files-routes";
import { registerNameFixRoutes } from "./routes/name-fix-routes";
import { registerSettingsRoutes } from "./routes/settings-routes";
import { storage } from "./storage";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "uploads";
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface DecodedFilenameRequest extends Request {
  decodedFileName?: string;
}

const customStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const decodedName = Buffer.from(
      file.originalname,
      ROUTE_UPLOAD_FILE_NAMING.originalNameEncoding,
    ).toString(ROUTE_UPLOAD_FILE_NAMING.decodedNameEncoding);
    (req as DecodedFilenameRequest).decodedFileName = decodedName;

    const ext = path.extname(decodedName);
    const nameWithoutExt = path.basename(decodedName, ext);
    const timestamp = Date.now();
    const hash = crypto
      .createHash(ROUTE_UPLOAD_FILE_NAMING.hashAlgorithm)
      .update(decodedName + timestamp)
      .digest(ROUTE_UPLOAD_FILE_NAMING.hashEncoding)
      .slice(0, ROUTE_UPLOAD_FILE_NAMING.hashLength);
    cb(null, `${hash}_${timestamp}_${nameWithoutExt}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set<string>(ROUTE_UPLOAD_RULES.allowedMimeTypes);
const ALLOWED_EXTENSIONS = new Set<string>(ROUTE_UPLOAD_RULES.allowedExtensions);

const upload = multer({
  storage: customStorage,
  limits: { fileSize: ROUTE_UPLOAD_RULES.maxFileSizeBytes },
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

const DEFAULT_PK_MARKERS = [...ROUTE_RUNTIME_DEFAULTS.pkMarkers];

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
  return ROUTE_BOOL_TRUE_VALUES.has(normalized);
}

let uploadRateLimitWindowMs = parsePositiveIntEnv("UPLOAD_RATE_LIMIT_WINDOW_MS", ROUTE_RUNTIME_DEFAULTS.uploadRateLimitWindowMs);
let uploadRateLimitMaxRequests = parsePositiveIntEnv("UPLOAD_RATE_LIMIT_MAX_REQUESTS", ROUTE_RUNTIME_DEFAULTS.uploadRateLimitMaxRequests);
let parseRateLimitWindowMs = parsePositiveIntEnv("PARSE_RATE_LIMIT_WINDOW_MS", ROUTE_RUNTIME_DEFAULTS.parseRateLimitWindowMs);
let parseRateLimitMaxRequests = parsePositiveIntEnv("PARSE_RATE_LIMIT_MAX_REQUESTS", ROUTE_RUNTIME_DEFAULTS.parseRateLimitMaxRequests);
let globalProtectRateLimitWindowMs = parsePositiveIntEnv(
  "GLOBAL_PROTECT_RATE_LIMIT_WINDOW_MS",
  ROUTE_RUNTIME_DEFAULTS.globalProtectRateLimitWindowMs,
);
let globalProtectRateLimitMaxRequests = parsePositiveIntEnv(
  "GLOBAL_PROTECT_RATE_LIMIT_MAX_REQUESTS",
  ROUTE_RUNTIME_DEFAULTS.globalProtectRateLimitMaxRequests,
);
let globalProtectMaxInFlight = parsePositiveIntEnv(
  "GLOBAL_PROTECT_MAX_INFLIGHT",
  ROUTE_RUNTIME_DEFAULTS.globalProtectMaxInFlight,
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
  return (
    clientKey === ROUTE_STRING_MARKERS.loopbackIpv4 ||
    clientKey === ROUTE_STRING_MARKERS.loopbackIpv6
  );
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
    status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    code: API_ERROR_CODES.requestFailed,
    message: API_RESPONSE_MESSAGES.serviceBusy,
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
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      code: API_ERROR_CODES.requestFailed,
      message: API_RESPONSE_MESSAGES.tooManyUploads,
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
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      code: API_ERROR_CODES.requestFailed,
      message: API_RESPONSE_MESSAGES.tooManyParses,
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

let prewarmEnabled = parseBoolEnv("EXCEL_PREWARM_ENABLED", ROUTE_RUNTIME_DEFAULTS.prewarmEnabled);
let prewarmMaxConcurrency = parsePositiveIntEnv("EXCEL_PREWARM_MAX_CONCURRENCY", ROUTE_RUNTIME_DEFAULTS.prewarmMaxConcurrency);
let prewarmQueueMax = parsePositiveIntEnv("EXCEL_PREWARM_QUEUE_MAX", ROUTE_RUNTIME_DEFAULTS.prewarmQueueMax);
let prewarmMaxFileMb = parsePositiveIntEnv("EXCEL_PREWARM_MAX_FILE_MB", ROUTE_RUNTIME_DEFAULTS.prewarmMaxFileMb);
let prewarmMaxFileBytes = prewarmMaxFileMb * BYTES_PER_MB;
const prewarmQueue: PrewarmQueueItem[] = [];
const prewarmDedup = new Set<string>();
let activePrewarmCount = 0;

function applyRuntimeLimitsFromSettings(settings: DdlSettings): void {
  uploadRateLimitWindowMs = clampInt(
    settings.uploadRateLimitWindowMs,
    ROUTE_RUNTIME_CLAMP_MIN.rateLimitWindowMs,
    ROUTE_RUNTIME_HARD_CAPS.uploadRateLimitWindowMs,
  );
  uploadRateLimitMaxRequests = clampInt(
    settings.uploadRateLimitMaxRequests,
    ROUTE_RUNTIME_CLAMP_MIN.uploadRateLimitMaxRequests,
    ROUTE_RUNTIME_HARD_CAPS.uploadRateLimitMaxRequests,
  );
  parseRateLimitWindowMs = clampInt(
    settings.parseRateLimitWindowMs,
    ROUTE_RUNTIME_CLAMP_MIN.rateLimitWindowMs,
    ROUTE_RUNTIME_HARD_CAPS.parseRateLimitWindowMs,
  );
  parseRateLimitMaxRequests = clampInt(
    settings.parseRateLimitMaxRequests,
    ROUTE_RUNTIME_CLAMP_MIN.parseRateLimitMaxRequests,
    ROUTE_RUNTIME_HARD_CAPS.parseRateLimitMaxRequests,
  );
  globalProtectRateLimitWindowMs = clampInt(
    settings.globalProtectRateLimitWindowMs,
    ROUTE_RUNTIME_CLAMP_MIN.rateLimitWindowMs,
    ROUTE_RUNTIME_HARD_CAPS.globalProtectRateLimitWindowMs,
  );
  globalProtectRateLimitMaxRequests = clampInt(
    settings.globalProtectRateLimitMaxRequests,
    ROUTE_RUNTIME_CLAMP_MIN.globalProtectRateLimitMaxRequests,
    ROUTE_RUNTIME_HARD_CAPS.globalProtectRateLimitMaxRequests,
  );
  globalProtectMaxInFlight = clampInt(
    settings.globalProtectMaxInFlight,
    ROUTE_RUNTIME_CLAMP_MIN.globalProtectMaxInFlight,
    ROUTE_RUNTIME_HARD_CAPS.globalProtectMaxInFlight,
  );
  prewarmEnabled = settings.prewarmEnabled;
  prewarmMaxConcurrency = clampInt(
    settings.prewarmMaxConcurrency,
    ROUTE_RUNTIME_CLAMP_MIN.prewarmMaxConcurrency,
    ROUTE_RUNTIME_HARD_CAPS.prewarmMaxConcurrency,
  );
  prewarmQueueMax = clampInt(
    settings.prewarmQueueMax,
    ROUTE_RUNTIME_CLAMP_MIN.prewarmQueueMax,
    ROUTE_RUNTIME_HARD_CAPS.prewarmQueueMax,
  );
  prewarmMaxFileMb = clampInt(
    settings.prewarmMaxFileMb,
    ROUTE_RUNTIME_CLAMP_MIN.prewarmMaxFileMb,
    ROUTE_RUNTIME_HARD_CAPS.prewarmMaxFileMb,
  );
  prewarmMaxFileBytes = prewarmMaxFileMb * BYTES_PER_MB;

  taskManager.configureRuntimeLimits({
    maxQueueLength: clampInt(
      settings.taskManagerMaxQueueLength,
      ROUTE_RUNTIME_CLAMP_MIN.taskManagerMaxQueueLength,
      ROUTE_RUNTIME_HARD_CAPS.taskManagerMaxQueueLength,
    ),
    stalePendingMs: clampInt(
      settings.taskManagerStalePendingMs,
      ROUTE_RUNTIME_CLAMP_MIN.taskManagerStalePendingMs,
      ROUTE_RUNTIME_HARD_CAPS.taskManagerStalePendingMs,
    ),
  });
}

setInterval(() => {
  const now = Date.now();
  const staleUploadWindowMs = uploadRateLimitWindowMs * ROUTE_RATE_COUNTER_SWEEP.staleWindowMultiplier;
  const staleParseWindowMs = parseRateLimitWindowMs * ROUTE_RATE_COUNTER_SWEEP.staleWindowMultiplier;

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
}, Math.max(ROUTE_RATE_COUNTER_SWEEP.minSweepIntervalMs, Math.min(uploadRateLimitWindowMs, parseRateLimitWindowMs)));

function sendTaskQueueBusyError(res: Response): void {
  sendApiError(res, {
    status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    code: API_ERROR_CODES.requestFailed,
    message: API_RESPONSE_MESSAGES.taskQueueBusy,
  });
}

class ReferenceRequestError extends Error {
  readonly status: number;
  readonly code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
  readonly params?: Record<string, string | number | boolean | null>;

  constructor(
    status: number,
    code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES],
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
    throw new ReferenceRequestError(
      HTTP_STATUS.NOT_FOUND,
      API_ERROR_CODES.fileNotFound,
      API_RESPONSE_MESSAGES.fileNotFound,
    );
  }

  const persistedSettings = await storage.getSettings();
  const bundle = await runParseWorkbookBundle(
    file.filePath,
    {
      maxConsecutiveEmptyRows:
        persistedSettings?.maxConsecutiveEmptyRows ?? ROUTE_RUNTIME_DEFAULTS.maxConsecutiveEmptyRows,
      pkMarkers: persistedSettings?.pkMarkers ?? DEFAULT_PK_MARKERS,
    },
    file.fileHash,
  );

  const parsedTables = bundle.tablesBySheet[request.sheetName];
  if (!parsedTables) {
    throw new ReferenceRequestError(HTTP_STATUS.BAD_REQUEST, API_ERROR_CODES.invalidRequest, "Sheet not found in file", {
      sheetName: request.sheetName,
    });
  }

  const selectedIndexes = normalizeSelectedTableIndexes(request.selectedTableIndexes);
  if (selectedIndexes.length === 0) {
    throw new ReferenceRequestError(HTTP_STATUS.BAD_REQUEST, API_ERROR_CODES.invalidRequest, "No table selected");
  }

  selectedIndexes.forEach((index) => {
    if (index < 0 || index >= parsedTables.length) {
      throw new ReferenceRequestError(HTTP_STATUS.BAD_REQUEST, API_ERROR_CODES.invalidRequest, "Selected table index out of range", {
        index,
        tableCount: parsedTables.length,
      });
    }
  });

  const selectedIndexSet = new Set(selectedIndexes);
  const overrideByIndex = new Map<number, TableInfo>();
  (request.tableOverrides ?? []).forEach((override) => {
    if (override.tableIndex < 0 || override.tableIndex >= parsedTables.length) {
      throw new ReferenceRequestError(HTTP_STATUS.BAD_REQUEST, API_ERROR_CODES.invalidRequest, "Override table index out of range", {
        index: override.tableIndex,
        tableCount: parsedTables.length,
      });
    }
    if (!selectedIndexSet.has(override.tableIndex)) {
      throw new ReferenceRequestError(
        HTTP_STATUS.BAD_REQUEST,
        API_ERROR_CODES.invalidRequest,
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
      maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? ROUTE_RUNTIME_DEFAULTS.maxConsecutiveEmptyRows,
      pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
      },
      fileHash,
    );
    console.info(
      `${ROUTE_STRING_MARKERS.prewarmLogPrefix} file=${filePath} mode=${bundle.stats.parseMode} readMode=${bundle.stats.readMode} totalMs=${Math.round(bundle.stats.totalMs)}`,
    );
  } catch (error) {
    if (isExecutorOverloadedError(error)) {
      console.warn(`${ROUTE_STRING_MARKERS.prewarmLogPrefix} executor busy for ${filePath}`);
      return;
    }
    console.warn(`${ROUTE_STRING_MARKERS.prewarmLogPrefix} failed:`, error);
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
    console.info(
      `${ROUTE_STRING_MARKERS.prewarmLogPrefix} skip large file (size=${fileSize} bytes) path=${filePath}`,
    );
    return;
  }
  if (prewarmDedup.has(fileHash)) {
    return;
  }
  if (prewarmQueue.length >= prewarmQueueMax) {
    console.warn(
      `${ROUTE_STRING_MARKERS.prewarmLogPrefix} queue overflow. drop task for ${filePath} (queueMax=${prewarmQueueMax})`,
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
          console.warn(
            `${ROUTE_STRING_MARKERS.prewarmLogPrefix} executor busy while prewarming ${task.filePath}`,
          );
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
    console.warn(
      `${ROUTE_STRING_MARKERS.settingsLogPrefix} failed to load runtime limits from storage, fallback to env defaults:`,
      error,
    );
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

  registerDiffRoutes(app, {
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
  });

  registerSettingsRoutes(app, {
    applyRuntimeLimitsFromSettings,
    canEnableExternalPathWrite: (req) => process.env.ELECTRON_MODE === "true" && isLocalRequest(req),
    getRuntimeDiagnostics: () => ({
      excelExecutor: getExcelExecutorDiagnostics(),
    }),
  });

  registerExtensionRoutes(app);
  registerDbManagementRoutes(app);

  const seedFileName = ROUTE_STRING_MARKERS.storageSeedFilename;
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
