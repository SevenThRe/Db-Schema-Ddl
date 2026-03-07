import fs from "fs";
import os from "os";
import path from "path";
import { Worker } from "worker_threads";
import { createLogger } from "./logger";
import {
  EXCEL_EXECUTOR_DEFAULTS,
  EXCEL_EXECUTOR_DISABLED_TRUE_VALUES,
} from "../constants/excel-executor";
import {
  getSheetNames,
  parseSheetRegion,
  parseTableDefinitions,
  parseWorkbookBundle,
  type ParseOptions,
  type SearchIndexItem,
  type WorkbookBundle,
} from "./excel";
import type { TableInfo } from "@shared/schema";

type WorkerTaskType =
  | "listSheets"
  | "parseTableDefinitions"
  | "parseSheetRegion"
  | "buildSearchIndex"
  | "parseWorkbookBundle";

interface WorkerRequest {
  id: string;
  type: WorkerTaskType;
  payload: Record<string, unknown>;
}

interface WorkerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface QueuedTask<T = unknown> {
  id: string;
  type: WorkerTaskType;
  payload: Record<string, unknown>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  enqueuedAt: number;
}

interface InFlightTask<T = unknown> extends QueuedTask<T> {
  workerId: number;
  startedAt: number;
  timeout: NodeJS.Timeout;
}

interface WorkerSlot {
  id: number;
  worker: Worker;
  busy: boolean;
  restarting: boolean;
}

const logger = createLogger("excel-executor");

export class ExcelExecutorQueueOverflowError extends Error {
  readonly code = "EXCEL_EXECUTOR_QUEUE_OVERFLOW";

  constructor(message = "Excel executor queue is full. Please retry later.") {
    super(message);
    this.name = "ExcelExecutorQueueOverflowError";
  }
}

function mbToBytes(mb: number): number {
  return Math.max(0, Math.floor(mb * 1024 * 1024));
}

function estimateStringBytes(value?: string): number {
  if (!value) {
    return 0;
  }
  return 24 + value.length * 2;
}

function isWorkerDisabled(): boolean {
  const raw = String(process.env.EXCEL_WORKER_DISABLED ?? "").toLowerCase();
  return EXCEL_EXECUTOR_DISABLED_TRUE_VALUES.has(raw);
}

function getPoolSize(): number {
  const raw = Number(process.env.EXCEL_WORKER_POOL_SIZE ?? "");
  if (Number.isInteger(raw) && raw >= EXCEL_EXECUTOR_DEFAULTS.minWorkerPoolSize) {
    return raw;
  }
  return Math.min(
    EXCEL_EXECUTOR_DEFAULTS.maxWorkerPoolSize,
    Math.max(
      EXCEL_EXECUTOR_DEFAULTS.minWorkerPoolSize,
      (os.cpus()?.length ?? EXCEL_EXECUTOR_DEFAULTS.fallbackPoolSize) - 1,
    ),
  );
}

function getTimeoutMs(): number {
  const raw = Number(process.env.EXCEL_WORKER_TIMEOUT_MS ?? "");
  if (Number.isInteger(raw) && raw >= EXCEL_EXECUTOR_DEFAULTS.minWorkerTimeoutMs) {
    return raw;
  }
  return EXCEL_EXECUTOR_DEFAULTS.workerTimeoutMs;
}

function getCacheTtlMs(): number {
  const raw = Number(process.env.EXCEL_CACHE_TTL_MS ?? "");
  if (Number.isInteger(raw) && raw >= EXCEL_EXECUTOR_DEFAULTS.minCacheTtlMs) {
    return raw;
  }
  return EXCEL_EXECUTOR_DEFAULTS.cacheTtlMs;
}

function getCacheMaxEntries(): number {
  const inElectron = process.env.ELECTRON_MODE === "true";
  const envName = inElectron
    ? "EXCEL_CACHE_MAX_ENTRIES_ELECTRON"
    : "EXCEL_CACHE_MAX_ENTRIES_SERVER";
  const defaultValue = inElectron
    ? EXCEL_EXECUTOR_DEFAULTS.electronCacheMaxEntries
    : EXCEL_EXECUTOR_DEFAULTS.serverCacheMaxEntries;
  const raw = Number(process.env[envName] ?? "");
  if (Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return defaultValue;
}

function getCacheMaxTotalBytes(): number {
  const inElectron = process.env.ELECTRON_MODE === "true";
  const envName = inElectron
    ? "EXCEL_CACHE_MAX_TOTAL_MB_ELECTRON"
    : "EXCEL_CACHE_MAX_TOTAL_MB_SERVER";
  const defaultMb = inElectron
    ? EXCEL_EXECUTOR_DEFAULTS.electronCacheMaxTotalMb
    : EXCEL_EXECUTOR_DEFAULTS.serverCacheMaxTotalMb;
  const raw = Number(process.env[envName] ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return mbToBytes(raw);
  }
  return mbToBytes(defaultMb);
}

function getCacheMaxBundleBytes(): number {
  const inElectron = process.env.ELECTRON_MODE === "true";
  const envName = inElectron
    ? "EXCEL_CACHE_MAX_BUNDLE_MB_ELECTRON"
    : "EXCEL_CACHE_MAX_BUNDLE_MB_SERVER";
  const defaultMb = inElectron
    ? EXCEL_EXECUTOR_DEFAULTS.electronCacheMaxBundleMb
    : EXCEL_EXECUTOR_DEFAULTS.serverCacheMaxBundleMb;
  const raw = Number(process.env[envName] ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return mbToBytes(raw);
  }
  return mbToBytes(defaultMb);
}

function getQueueMaxLength(): number {
  const raw = Number(process.env.EXCEL_EXECUTOR_QUEUE_MAX ?? "");
  if (Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return EXCEL_EXECUTOR_DEFAULTS.maxQueueLength;
}

function stableParseOptions(parseOptions?: ParseOptions): string {
  const normalizedPkMarkers = Array.isArray(parseOptions?.pkMarkers)
    ? [...(parseOptions?.pkMarkers ?? [])].sort()
    : [];
  const normalizedReferenceRules = Array.isArray(parseOptions?.referenceExtraction?.rules)
    ? [...parseOptions.referenceExtraction.rules]
        .map((rule) => ({
          source: String(rule.source ?? ""),
          pattern: String(rule.pattern ?? ""),
          flags: String(rule.flags ?? ""),
          codeIdGroup: Number(rule.codeIdGroup ?? 1),
          optionsGroup:
            rule.optionsGroup == null
              ? undefined
              : Number(rule.optionsGroup),
        }))
        .sort((a, b) => {
          const sourceCompare = a.source.localeCompare(b.source);
          if (sourceCompare !== 0) {
            return sourceCompare;
          }
          const patternCompare = a.pattern.localeCompare(b.pattern);
          if (patternCompare !== 0) {
            return patternCompare;
          }
          const flagsCompare = a.flags.localeCompare(b.flags);
          if (flagsCompare !== 0) {
            return flagsCompare;
          }
          if (a.codeIdGroup !== b.codeIdGroup) {
            return a.codeIdGroup - b.codeIdGroup;
          }
          return (a.optionsGroup ?? -1) - (b.optionsGroup ?? -1);
        })
    : [];
  return JSON.stringify({
    maxConsecutiveEmptyRows: parseOptions?.maxConsecutiveEmptyRows ?? 10,
    pkMarkers: normalizedPkMarkers,
    referenceExtraction: {
      enabled: parseOptions?.referenceExtraction?.enabled ?? true,
      rules: normalizedReferenceRules,
    },
  });
}

function buildBundleCacheKey(filePath: string, parseOptions?: ParseOptions, fileHash?: string): string {
  if (fileHash && fileHash.trim() !== "") {
    return `${fileHash}::${stableParseOptions(parseOptions)}`;
  }

  try {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.size}:${stat.mtimeMs}::${stableParseOptions(parseOptions)}`;
  } catch {
    return `${filePath}::${stableParseOptions(parseOptions)}`;
  }
}

function getWorkerScriptConfig(): { scriptPath: string; execArgv?: string[] } {
  const workspaceRoot = process.cwd();
  const explicitWorkerPath = String(process.env.EXCEL_WORKER_PATH ?? "").trim();
  const distRootFromEnv = String(process.env.SERVER_DIST_DIR ?? "").trim();
  const prodWorkerCandidates = [
    explicitWorkerPath,
    distRootFromEnv ? path.resolve(distRootFromEnv, "excel-worker.cjs") : "",
    path.resolve(workspaceRoot, "dist/excel-worker.cjs"),
    path.resolve(workspaceRoot, "excel-worker.cjs"),
  ].filter((candidate): candidate is string => candidate.length > 0);
  const prodWorkerPath = prodWorkerCandidates.find((candidate) => fs.existsSync(candidate));
  const devWorkerPath = path.resolve(workspaceRoot, "server/lib/excel-worker.ts");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!prodWorkerPath) {
      throw new Error(
        `Worker script missing in production. checked: ${prodWorkerCandidates.join(", ")}`,
      );
    }
    return { scriptPath: prodWorkerPath };
  }

  if (fs.existsSync(devWorkerPath)) {
    return {
      scriptPath: devWorkerPath,
      execArgv: ["--import", "tsx"],
    };
  }

  if (prodWorkerPath && fs.existsSync(prodWorkerPath)) {
    return { scriptPath: prodWorkerPath };
  }

  throw new Error("Unable to locate Excel worker script (checked dev/prod paths).");
}

function buildSearchIndexFallback(filePath: string, parseOptions?: ParseOptions): SearchIndexItem[] {
  const sheetNames = getSheetNames(filePath);
  const searchIndex: SearchIndexItem[] = [];

  sheetNames.forEach((sheetName) => {
    searchIndex.push({
      type: "sheet",
      sheetName,
      displayName: sheetName,
    });

    try {
      const tables = parseTableDefinitions(filePath, sheetName, parseOptions);
      tables.forEach((table) => {
        searchIndex.push({
          type: "table",
          sheetName,
          displayName: `${table.physicalTableName} (${table.logicalTableName})`,
          physicalTableName: table.physicalTableName,
          logicalTableName: table.logicalTableName,
        });
      });
    } catch {
      // Keep partial results for tolerant UX.
    }
  });

  return searchIndex;
}

function estimateBundleBytes(bundle: WorkbookBundle): number {
  let bytes = 1024;

  bytes += bundle.sheetSummaries.length * 64;
  for (const summary of bundle.sheetSummaries) {
    bytes += estimateStringBytes(summary.name);
  }

  for (const [sheetName, tables] of Object.entries(bundle.tablesBySheet)) {
    bytes += 96 + estimateStringBytes(sheetName);
    bytes += tables.length * 128;
    for (const table of tables) {
      bytes += 256;
      bytes += estimateStringBytes(table.logicalTableName);
      bytes += estimateStringBytes(table.physicalTableName);
      bytes += estimateStringBytes(table.excelRange);
      bytes += table.columns.length * 160;
      for (const col of table.columns) {
        bytes += estimateStringBytes(String(col.no ?? ""));
        bytes += estimateStringBytes(col.logicalName);
        bytes += estimateStringBytes(col.physicalName);
        bytes += estimateStringBytes(col.dataType);
        bytes += estimateStringBytes(col.size);
        bytes += estimateStringBytes(col.comment);
        bytes += estimateStringBytes(col.commentRaw);
        if (Array.isArray(col.codeReferences)) {
          bytes += col.codeReferences.length * 96;
          for (const ref of col.codeReferences) {
            bytes += estimateStringBytes(ref.source);
            bytes += estimateStringBytes(ref.codeId);
            bytes += estimateStringBytes(ref.raw);
            if (Array.isArray(ref.options)) {
              bytes += ref.options.length * 64;
              for (const option of ref.options) {
                bytes += estimateStringBytes(option.code);
                bytes += estimateStringBytes(option.label);
              }
            }
          }
        }
      }
    }
  }

  bytes += bundle.searchIndex.length * 96;
  for (const item of bundle.searchIndex) {
    bytes += estimateStringBytes(item.sheetName);
    bytes += estimateStringBytes(item.displayName);
    bytes += estimateStringBytes(item.physicalTableName);
    bytes += estimateStringBytes(item.logicalTableName);
  }

  return bytes;
}

interface CachedBundleEntry {
  key: string;
  bundle: WorkbookBundle;
  sizeEstimateBytes: number;
  expiresAt: number;
  lastAccessAt: number;
}

interface ExcelExecutorRuntimeConfig {
  timeoutMs: number;
  disabled: boolean;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  cacheMaxTotalBytes: number;
  cacheMaxBundleBytes: number;
  queueMaxLength: number;
  poolSize: number;
  workerConfig: { scriptPath: string; execArgv?: string[] } | null;
}

interface ExcelExecutorMetrics {
  cacheHits: number;
  cacheMisses: number;
  cacheEvictions: number;
  workerTimeouts: number;
  workerRestarts: number;
}

export interface ExcelExecutorDiagnostics {
  disabled: boolean;
  timeoutMs: number;
  queueLength: number;
  inFlightCount: number;
  workerCount: number;
  cacheEntries: number;
  cacheBytes: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  cacheMaxTotalBytes: number;
  cacheMaxBundleBytes: number;
  queueMaxLength: number;
  metrics: ExcelExecutorMetrics;
}

export interface ExcelExecutorOverrides {
  timeoutMs?: number;
  disabled?: boolean;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  cacheMaxTotalBytes?: number;
  cacheMaxBundleBytes?: number;
  queueMaxLength?: number;
  poolSize?: number;
  workerScriptPath?: string;
  workerExecArgv?: string[];
}

function resolveExecutorConfig(overrides: ExcelExecutorOverrides = {}): ExcelExecutorRuntimeConfig {
  const disabled = overrides.disabled ?? isWorkerDisabled();
  const workerScriptPath = overrides.workerScriptPath?.trim();
  const workerConfig = disabled
    ? null
    : workerScriptPath
    ? {
        scriptPath: workerScriptPath,
        execArgv: overrides.workerExecArgv,
      }
    : getWorkerScriptConfig();

  return {
    timeoutMs: overrides.timeoutMs ?? getTimeoutMs(),
    disabled,
    cacheTtlMs: overrides.cacheTtlMs ?? getCacheTtlMs(),
    cacheMaxEntries: overrides.cacheMaxEntries ?? getCacheMaxEntries(),
    cacheMaxTotalBytes: overrides.cacheMaxTotalBytes ?? getCacheMaxTotalBytes(),
    cacheMaxBundleBytes: overrides.cacheMaxBundleBytes ?? getCacheMaxBundleBytes(),
    queueMaxLength: overrides.queueMaxLength ?? getQueueMaxLength(),
    poolSize: overrides.poolSize ?? getPoolSize(),
    workerConfig,
  };
}

export class ExcelExecutor {
  private readonly timeoutMs: number;
  private readonly disabled: boolean;
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly cacheMaxTotalBytes: number;
  private readonly cacheMaxBundleBytes: number;
  private readonly queueMaxLength: number;
  private readonly metrics: ExcelExecutorMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
    workerTimeouts: 0,
    workerRestarts: 0,
  };
  private readonly queue: QueuedTask<unknown>[] = [];
  private readonly workers: WorkerSlot[] = [];
  private readonly inFlight = new Map<string, InFlightTask<unknown>>();
  private readonly bundleCache = new Map<string, CachedBundleEntry>();
  private bundleCacheBytes = 0;
  private shuttingDown = false;
  private workerConfig: { scriptPath: string; execArgv?: string[] } | null = null;

  constructor(overrides: ExcelExecutorOverrides = {}) {
    const config = resolveExecutorConfig(overrides);
    this.timeoutMs = config.timeoutMs;
    this.disabled = config.disabled;
    this.cacheTtlMs = config.cacheTtlMs;
    this.cacheMaxEntries = config.cacheMaxEntries;
    this.cacheMaxTotalBytes = config.cacheMaxTotalBytes;
    this.cacheMaxBundleBytes = config.cacheMaxBundleBytes;
    this.queueMaxLength = config.queueMaxLength;
    this.workerConfig = config.workerConfig;

    if (this.disabled) {
      logger.warn("Excel worker executor disabled via EXCEL_WORKER_DISABLED");
      return;
    }

    const poolSize = config.poolSize;
    for (let i = 0; i < poolSize; i++) {
      this.workers.push(this.createWorker(i + 1));
    }

    logger.info("Excel worker executor initialized", {
      poolSize,
      timeoutMs: this.timeoutMs,
      cacheTtlMs: this.cacheTtlMs,
      cacheMaxEntries: this.cacheMaxEntries,
      cacheMaxTotalBytes: this.cacheMaxTotalBytes,
      cacheMaxBundleBytes: this.cacheMaxBundleBytes,
      queueMaxLength: this.queueMaxLength,
      workerScript: this.workerConfig?.scriptPath ?? "disabled",
    });
  }

  private pruneExpiredCache(): void {
    const now = Date.now();
    this.bundleCache.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        this.bundleCacheBytes = Math.max(0, this.bundleCacheBytes - entry.sizeEstimateBytes);
        this.bundleCache.delete(key);
      }
    });
  }

  private removeBundleCacheKey(key: string): void {
    const existing = this.bundleCache.get(key);
    if (!existing) {
      return;
    }
    this.bundleCacheBytes = Math.max(0, this.bundleCacheBytes - existing.sizeEstimateBytes);
    this.bundleCache.delete(key);
  }

  private evictCacheIfNeeded(): void {
    if (this.bundleCache.size === 0) {
      return;
    }

    while (
      this.bundleCache.size > this.cacheMaxEntries ||
      this.bundleCacheBytes > this.cacheMaxTotalBytes
    ) {
      const lru = Array.from(this.bundleCache.values()).sort((a, b) => a.lastAccessAt - b.lastAccessAt)[0];
      if (!lru) {
        break;
      }
      this.metrics.cacheEvictions += 1;
      this.removeBundleCacheKey(lru.key);
    }
  }

  private setBundleCache(cacheKey: string, bundle: WorkbookBundle): void {
    if (this.cacheMaxEntries <= 0) {
      return;
    }

    this.pruneExpiredCache();

    const sizeEstimateBytes = estimateBundleBytes(bundle);
    if (sizeEstimateBytes > this.cacheMaxBundleBytes || sizeEstimateBytes > this.cacheMaxTotalBytes) {
      logger.warn("Skip excel bundle cache due to size budget", {
        cacheKey,
        sheetCount: bundle.stats.sheetCount,
        sizeEstimateBytes,
        cacheMaxBundleBytes: this.cacheMaxBundleBytes,
        cacheMaxTotalBytes: this.cacheMaxTotalBytes,
      });
      return;
    }

    const now = Date.now();
    this.removeBundleCacheKey(cacheKey);
    this.bundleCache.set(cacheKey, {
      key: cacheKey,
      bundle,
      sizeEstimateBytes,
      expiresAt: now + this.cacheTtlMs,
      lastAccessAt: now,
    });
    this.bundleCacheBytes += sizeEstimateBytes;
    this.evictCacheIfNeeded();
  }

  private getBundleCache(cacheKey: string): WorkbookBundle | null {
    this.pruneExpiredCache();
    const entry = this.bundleCache.get(cacheKey);
    if (!entry) {
      this.metrics.cacheMisses += 1;
      return null;
    }

    entry.lastAccessAt = Date.now();
    this.metrics.cacheHits += 1;
    const cachedBundle: WorkbookBundle = {
      ...entry.bundle,
      stats: {
        ...entry.bundle.stats,
        cacheHit: true,
      },
    };
    return cachedBundle;
  }

  private createWorker(workerId: number): WorkerSlot {
    if (!this.workerConfig) {
      throw new Error("Worker config is not initialized.");
    }

    const worker = new Worker(this.workerConfig.scriptPath, {
      execArgv: this.workerConfig.execArgv,
      env: process.env,
    });

    const slot: WorkerSlot = {
      id: workerId,
      worker,
      busy: false,
      restarting: false,
    };

    worker.on("message", (response: WorkerResponse) => {
      this.onWorkerMessage(slot, response);
    });

    worker.on("error", (error) => {
      logger.error("Excel worker error", {
        workerId: slot.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.failActiveTaskForWorker(slot, error);
      if (!this.shuttingDown && !this.disabled) {
        this.restartWorker(slot, "worker_error");
      }
    });

    worker.on("exit", (code) => {
      const shouldRespawn = code !== 0 && !this.disabled && !this.shuttingDown && !slot.restarting;
      if (this.shuttingDown) {
        logger.debug("Excel worker exited during shutdown", { workerId: slot.id, code });
      } else {
        logger.warn("Excel worker exited", { workerId: slot.id, code, shouldRespawn });
      }
      this.failActiveTaskForWorker(slot, new Error(`Worker exited unexpectedly with code ${code}`));
      slot.busy = false;
      slot.restarting = false;

      if (shouldRespawn) {
        this.replaceWorker(slot.id);
      }
    });

    return slot;
  }

  private onWorkerMessage(slot: WorkerSlot, response: WorkerResponse): void {
    const task = this.inFlight.get(response.id);
    if (!task) {
      return;
    }

    clearTimeout(task.timeout);
    this.inFlight.delete(response.id);
    slot.busy = false;

    const durationMs = Date.now() - task.startedAt;
    const queueMs = task.startedAt - task.enqueuedAt;

    if (response.ok) {
      task.resolve(response.result as unknown);
      logger.debug("Excel worker task completed", {
        workerId: slot.id,
        type: task.type,
        queueMs,
        durationMs,
      });
    } else {
      task.reject(new Error(response.error || "Unknown worker error"));
      logger.error("Excel worker task failed", {
        workerId: slot.id,
        type: task.type,
        queueMs,
        durationMs,
        error: response.error,
      });
    }

    this.dispatchQueue();
  }

  private failActiveTaskForWorker(slot: WorkerSlot, error: unknown): void {
    const activeTask = Array.from(this.inFlight.values()).find((task) => task.workerId === slot.id);
    if (!activeTask) {
      return;
    }

    clearTimeout(activeTask.timeout);
    this.inFlight.delete(activeTask.id);
    slot.busy = false;
    activeTask.reject(error instanceof Error ? error : new Error(String(error)));
    this.dispatchQueue();
  }

  private replaceWorker(workerId: number): void {
    const workerIndex = this.workers.findIndex((slot) => slot.id === workerId);
    if (workerIndex === -1) {
      return;
    }
    this.workers[workerIndex] = this.createWorker(workerId);
    this.dispatchQueue();
  }

  private restartWorker(slot: WorkerSlot, reason: string): void {
    if (slot.restarting || this.shuttingDown) {
      return;
    }
    slot.restarting = true;
    slot.busy = false;
    this.metrics.workerRestarts += 1;

    Promise.resolve(slot.worker.terminate())
      .catch((error) => {
        logger.warn("Failed to terminate worker during restart", {
          workerId: slot.id,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (!this.shuttingDown && !this.disabled) {
          this.replaceWorker(slot.id);
        } else {
          slot.restarting = false;
        }
      });
  }

  private enqueue<T>(type: WorkerTaskType, payload: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.shuttingDown) {
        reject(new Error("Excel executor is shutting down."));
        return;
      }
      if (this.queue.length >= this.queueMaxLength) {
        reject(
          new ExcelExecutorQueueOverflowError(
            `Excel executor queue limit reached (${this.queueMaxLength})`,
          ),
        );
        return;
      }
      const task: QueuedTask<T> = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 2 + EXCEL_EXECUTOR_DEFAULTS.workerTaskIdRandomLength)}`,
        type,
        payload,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      this.queue.push(task as QueuedTask<unknown>);
      this.dispatchQueue();
    });
  }

  private dispatchQueue(): void {
    if (this.disabled) {
      return;
    }

    while (this.queue.length > 0) {
      const idleWorker = this.workers.find((slot) => !slot.busy);
      if (!idleWorker) {
        return;
      }

      const task = this.queue.shift();
      if (!task) {
        return;
      }

      const request: WorkerRequest = {
        id: task.id,
        type: task.type,
        payload: task.payload,
      };

      const startedAt = Date.now();
      const timeout = setTimeout(() => {
        const inFlightTask = this.inFlight.get(task.id);
        if (!inFlightTask) {
          return;
        }
        this.inFlight.delete(task.id);
        this.metrics.workerTimeouts += 1;
        idleWorker.busy = false;
        task.reject(new Error(`Excel worker task timed out after ${this.timeoutMs}ms`));
        logger.error("Excel worker task timed out", {
          workerId: idleWorker.id,
          type: task.type,
          timeoutMs: this.timeoutMs,
        });
        this.restartWorker(idleWorker, "task_timeout");
        this.dispatchQueue();
      }, this.timeoutMs);

      this.inFlight.set(
        task.id,
        {
          ...task,
          workerId: idleWorker.id,
          startedAt,
          timeout,
        } as InFlightTask,
      );

      idleWorker.busy = true;
      idleWorker.worker.postMessage(request);
    }
  }

  private runFallbackTask<T>(type: WorkerTaskType, payload: Record<string, unknown>): Promise<T> {
    return Promise.resolve().then(() => {
      switch (type) {
        case "listSheets":
          return getSheetNames(String(payload.filePath ?? "")) as T;
        case "parseTableDefinitions":
          return parseTableDefinitions(
            String(payload.filePath ?? ""),
            String(payload.sheetName ?? ""),
            (payload.parseOptions ?? {}) as ParseOptions,
          ) as T;
        case "parseSheetRegion":
          return parseSheetRegion(
            String(payload.filePath ?? ""),
            String(payload.sheetName ?? ""),
            Number(payload.startRow),
            Number(payload.endRow),
            Number(payload.startCol),
            Number(payload.endCol),
            (payload.parseOptions ?? {}) as ParseOptions,
          ) as T;
        case "buildSearchIndex":
          return buildSearchIndexFallback(
            String(payload.filePath ?? ""),
            (payload.parseOptions ?? {}) as ParseOptions,
          ) as T;
        case "parseWorkbookBundle":
          return parseWorkbookBundle(
            String(payload.filePath ?? ""),
            (payload.parseOptions ?? {}) as ParseOptions,
          ) as T;
        default:
          throw new Error(`Unsupported fallback task type: ${type}`);
      }
    });
  }

  runListSheets(filePath: string): Promise<string[]> {
    if (this.disabled) {
      return this.runFallbackTask<string[]>("listSheets", { filePath });
    }
    return this.enqueue<string[]>("listSheets", { filePath });
  }

  async runParseWorkbookBundle(
    filePath: string,
    parseOptions?: ParseOptions,
    fileHash?: string,
  ): Promise<WorkbookBundle> {
    const cacheKey = buildBundleCacheKey(filePath, parseOptions, fileHash);
    const cached = this.getBundleCache(cacheKey);
    if (cached) {
      logger.debug("Excel bundle cache hit", {
        filePath,
        sheetCount: cached.stats.sheetCount,
        parseMode: cached.stats.parseMode,
      });
      return cached;
    }

    const payload = {
      filePath,
      parseOptions: parseOptions ?? {},
    };

    let bundle: WorkbookBundle;
    if (this.disabled) {
      bundle = await this.runFallbackTask<WorkbookBundle>("parseWorkbookBundle", payload);
    } else {
      bundle = await this.enqueue<WorkbookBundle>("parseWorkbookBundle", payload);
    }

    const normalizedBundle: WorkbookBundle = {
      ...bundle,
      stats: {
        ...bundle.stats,
        cacheHit: false,
      },
    };
    logger.info("Excel bundle parsed", {
      filePath,
      fileSize: normalizedBundle.stats.fileSize,
      sheetCount: normalizedBundle.stats.sheetCount,
      parseMode: normalizedBundle.stats.parseMode,
      totalMs: Math.round(normalizedBundle.stats.totalMs),
      xlsxReadMs: Math.round(normalizedBundle.stats.xlsxReadMs),
      sheetJsonMs: Math.round(normalizedBundle.stats.sheetJsonMs),
      extractMs: Math.round(normalizedBundle.stats.extractMs),
      fallbackSheetCount: normalizedBundle.stats.fallbackSheetCount,
      detectedFormatCounts: normalizedBundle.stats.detectedFormatCounts,
      fallbackSheetNames: normalizedBundle.stats.fallbackSheets,
    });
    const unknownFormatSheets = normalizedBundle.stats.sheetParseTraces
      .filter((trace) => trace.detectedFormat === "UNKNOWN")
      .map((trace) => ({
        sheetName: trace.sheetName,
        reasons: trace.reasons,
        strategySteps: trace.strategySteps,
      }));
    if (unknownFormatSheets.length > 0) {
      logger.info("Excel sheet format detected as UNKNOWN", {
        filePath,
        unknownFormatSheets,
      });
    }
    this.setBundleCache(cacheKey, normalizedBundle);
    return normalizedBundle;
  }

  runParseTables(filePath: string, sheetName: string, parseOptions?: ParseOptions): Promise<TableInfo[]> {
    const payload = { filePath, sheetName, parseOptions: parseOptions ?? {} };
    if (this.disabled) {
      return this.runFallbackTask<TableInfo[]>("parseTableDefinitions", payload);
    }
    return this.enqueue<TableInfo[]>("parseTableDefinitions", payload);
  }

  runParseRegion(
    filePath: string,
    sheetName: string,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    parseOptions?: ParseOptions,
  ): Promise<TableInfo[]> {
    const payload = {
      filePath,
      sheetName,
      startRow,
      endRow,
      startCol,
      endCol,
      parseOptions: parseOptions ?? {},
    };
    if (this.disabled) {
      return this.runFallbackTask<TableInfo[]>("parseSheetRegion", payload);
    }
    return this.enqueue<TableInfo[]>("parseSheetRegion", payload);
  }

  runBuildSearchIndex(filePath: string, parseOptions?: ParseOptions): Promise<SearchIndexItem[]> {
    return this.runParseWorkbookBundle(filePath, parseOptions).then((bundle) => bundle.searchIndex);
  }

  clearBundleCache(): void {
    this.bundleCache.clear();
    this.bundleCacheBytes = 0;
  }

  getDiagnostics(): ExcelExecutorDiagnostics {
    return {
      disabled: this.disabled,
      timeoutMs: this.timeoutMs,
      queueLength: this.queue.length,
      inFlightCount: this.inFlight.size,
      workerCount: this.workers.length,
      cacheEntries: this.bundleCache.size,
      cacheBytes: this.bundleCacheBytes,
      cacheTtlMs: this.cacheTtlMs,
      cacheMaxEntries: this.cacheMaxEntries,
      cacheMaxTotalBytes: this.cacheMaxTotalBytes,
      cacheMaxBundleBytes: this.cacheMaxBundleBytes,
      queueMaxLength: this.queueMaxLength,
      metrics: {
        ...this.metrics,
      },
    };
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const shutdownError = new Error("Excel executor is shutting down.");
    const closeTargets = [...this.workers];
    this.workers.length = 0;

    const queuedTasks = this.queue.splice(0, this.queue.length);
    queuedTasks.forEach((task) => {
      task.reject(shutdownError);
    });

    Array.from(this.inFlight.values()).forEach((task) => {
      clearTimeout(task.timeout);
      task.reject(shutdownError);
    });
    this.inFlight.clear();

    this.clearBundleCache();
    await Promise.all(
      closeTargets.map(async (slot) => {
        try {
          await slot.worker.terminate();
        } catch (error) {
          logger.warn("Failed to terminate excel worker", {
            workerId: slot.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }
}

let defaultExecutor: ExcelExecutor | null = null;

function getDefaultExecutor(): ExcelExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new ExcelExecutor();
  }
  return defaultExecutor;
}

export function runListSheets(filePath: string): Promise<string[]> {
  return getDefaultExecutor().runListSheets(filePath);
}

export function runParseTables(
  filePath: string,
  sheetName: string,
  parseOptions?: ParseOptions,
): Promise<TableInfo[]> {
  return getDefaultExecutor().runParseTables(filePath, sheetName, parseOptions);
}

export function runParseRegion(
  filePath: string,
  sheetName: string,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  parseOptions?: ParseOptions,
): Promise<TableInfo[]> {
  return getDefaultExecutor().runParseRegion(
    filePath,
    sheetName,
    startRow,
    endRow,
    startCol,
    endCol,
    parseOptions,
  );
}

export function runBuildSearchIndex(
  filePath: string,
  parseOptions?: ParseOptions,
): Promise<SearchIndexItem[]> {
  return getDefaultExecutor().runBuildSearchIndex(filePath, parseOptions);
}

export function runParseWorkbookBundle(
  filePath: string,
  parseOptions?: ParseOptions,
  fileHash?: string,
): Promise<WorkbookBundle> {
  return getDefaultExecutor().runParseWorkbookBundle(filePath, parseOptions, fileHash);
}

export function getExcelExecutorDiagnostics(): ExcelExecutorDiagnostics {
  return getDefaultExecutor().getDiagnostics();
}

export function clearExcelExecutorBundleCache(): void {
  getDefaultExecutor().clearBundleCache();
}

export async function shutdownExcelExecutor(): Promise<void> {
  if (!defaultExecutor) {
    return;
  }
  await defaultExecutor.shutdown();
  defaultExecutor = null;
}
