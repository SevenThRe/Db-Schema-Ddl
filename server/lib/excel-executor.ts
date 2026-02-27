import fs from "fs";
import os from "os";
import path from "path";
import { Worker } from "worker_threads";
import { createLogger } from "./logger";
import { getSheetNames, parseSheetRegion, parseTableDefinitions, type ParseOptions } from "./excel";
import type { TableInfo } from "@shared/schema";

interface SearchIndexItem {
  type: "sheet" | "table";
  sheetName: string;
  displayName: string;
  physicalTableName?: string;
  logicalTableName?: string;
}

type WorkerTaskType =
  | "listSheets"
  | "parseTableDefinitions"
  | "parseSheetRegion"
  | "buildSearchIndex";

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
}

const logger = createLogger("excel-executor");

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_FALLBACK_POOL_SIZE = 2;

function isWorkerDisabled(): boolean {
  const raw = String(process.env.EXCEL_WORKER_DISABLED ?? "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function getPoolSize(): number {
  const raw = Number(process.env.EXCEL_WORKER_POOL_SIZE ?? "");
  if (Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  return Math.min(4, Math.max(1, (os.cpus()?.length ?? DEFAULT_FALLBACK_POOL_SIZE) - 1));
}

function getTimeoutMs(): number {
  const raw = Number(process.env.EXCEL_WORKER_TIMEOUT_MS ?? "");
  if (Number.isInteger(raw) && raw >= 1000) {
    return raw;
  }
  return DEFAULT_TIMEOUT_MS;
}

function getWorkerScriptConfig(): { scriptPath: string; execArgv?: string[] } {
  const workspaceRoot = process.cwd();
  const prodWorkerPath = path.resolve(workspaceRoot, "dist/excel-worker.cjs");
  const devWorkerPath = path.resolve(workspaceRoot, "server/lib/excel-worker.ts");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!fs.existsSync(prodWorkerPath)) {
      throw new Error(`Worker script missing in production: ${prodWorkerPath}`);
    }
    return { scriptPath: prodWorkerPath };
  }

  if (fs.existsSync(devWorkerPath)) {
    return {
      scriptPath: devWorkerPath,
      execArgv: ["--import", "tsx"],
    };
  }

  if (fs.existsSync(prodWorkerPath)) {
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

class ExcelExecutor {
  private readonly timeoutMs = getTimeoutMs();
  private readonly disabled = isWorkerDisabled();
  private readonly queue: QueuedTask<any>[] = [];
  private readonly workers: WorkerSlot[] = [];
  private readonly inFlight = new Map<string, InFlightTask<any>>();
  private workerConfig: { scriptPath: string; execArgv?: string[] } | null = null;

  constructor() {
    if (this.disabled) {
      logger.warn("Excel worker executor disabled via EXCEL_WORKER_DISABLED");
      return;
    }

    this.workerConfig = getWorkerScriptConfig();
    const poolSize = getPoolSize();
    for (let i = 0; i < poolSize; i++) {
      this.workers.push(this.createWorker(i + 1));
    }

    logger.info("Excel worker executor initialized", {
      poolSize,
      timeoutMs: this.timeoutMs,
      workerScript: this.workerConfig.scriptPath,
    });
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
    });

    worker.on("exit", (code) => {
      const shouldRespawn = code !== 0 && !this.disabled;
      logger.warn("Excel worker exited", { workerId: slot.id, code, shouldRespawn });
      this.failActiveTaskForWorker(slot, new Error(`Worker exited unexpectedly with code ${code}`));
      slot.busy = false;

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

  private enqueue<T>(type: WorkerTaskType, payload: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type,
        payload,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      this.queue.push(task);
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
        this.inFlight.delete(task.id);
        idleWorker.busy = false;
        task.reject(new Error(`Excel worker task timed out after ${this.timeoutMs}ms`));
        logger.error("Excel worker task timed out", {
          workerId: idleWorker.id,
          type: task.type,
          timeoutMs: this.timeoutMs,
        });
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
    const payload = { filePath, parseOptions: parseOptions ?? {} };
    if (this.disabled) {
      return this.runFallbackTask<SearchIndexItem[]>("buildSearchIndex", payload);
    }
    return this.enqueue<SearchIndexItem[]>("buildSearchIndex", payload);
  }
}

const executor = new ExcelExecutor();

export function runListSheets(filePath: string): Promise<string[]> {
  return executor.runListSheets(filePath);
}

export function runParseTables(
  filePath: string,
  sheetName: string,
  parseOptions?: ParseOptions,
): Promise<TableInfo[]> {
  return executor.runParseTables(filePath, sheetName, parseOptions);
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
  return executor.runParseRegion(filePath, sheetName, startRow, endRow, startCol, endCol, parseOptions);
}

export function runBuildSearchIndex(
  filePath: string,
  parseOptions?: ParseOptions,
): Promise<SearchIndexItem[]> {
  return executor.runBuildSearchIndex(filePath, parseOptions);
}
