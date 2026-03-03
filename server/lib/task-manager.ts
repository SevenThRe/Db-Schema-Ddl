import * as fs from 'fs/promises';
import crypto from 'crypto';
import { type ParseOptions } from './excel';
import { runParseWorkbookBundle } from './excel-executor';
import { TASK_RUNTIME_DEFAULTS } from '../constants/task-runtime';

function parsePositiveIntOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export interface Task {
  id: string;
  type: 'hash' | 'parse_sheets' | 'parse_table';
  filePath: string;
  fileHash?: string;
  sheetName?: string;
  dedupeKey?: string;
  parseOptions?: ParseOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  onProgress?: (progress: number) => void;
  onComplete?: (result: unknown) => void | Promise<void>;
  onError?: (error: string) => void | Promise<void>;
}

export class TaskQueueOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskQueueOverflowError';
  }
}

class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private maxWorkers = TASK_RUNTIME_DEFAULTS.maxWorkers;
  private maxQueueLength = parsePositiveIntOrDefault(
    process.env.TASK_MANAGER_MAX_QUEUE_LENGTH,
    TASK_RUNTIME_DEFAULTS.maxQueueLength,
  );
  private stalePendingMs = parsePositiveIntOrDefault(
    process.env.TASK_MANAGER_STALE_PENDING_MS,
    TASK_RUNTIME_DEFAULTS.stalePendingMs,
  );
  private activeWorkers = 0;
  private queue: Task[] = [];
  private inFlightTaskByDedupeKey: Map<string, string> = new Map();

  createTask(
    type: Task['type'],
    filePath: string,
    options?: {
      fileHash?: string;
      sheetName?: string;
      dedupeKey?: string;
      parseOptions?: ParseOptions;
      onProgress?: (progress: number) => void;
      onComplete?: (result: unknown) => void | Promise<void>;
      onError?: (error: string) => void | Promise<void>;
    }
  ): Task {
    const dedupeKey = options?.dedupeKey?.trim();
    if (dedupeKey) {
      const existingTask = this.getInFlightTaskByDedupeKey(dedupeKey);
      if (existingTask) {
        return existingTask;
      }
    }

    if (this.queue.length + this.activeWorkers >= this.maxQueueLength) {
      throw new TaskQueueOverflowError(
        `Task queue overflow: pending=${this.queue.length}, active=${this.activeWorkers}, limit=${this.maxQueueLength}`,
      );
    }

    const task: Task = {
      id: `${type}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 2 + TASK_RUNTIME_DEFAULTS.dedupeIdRandomLength)}`,
      type,
      filePath,
      fileHash: options?.fileHash,
      sheetName: options?.sheetName,
      dedupeKey,
      parseOptions: options?.parseOptions,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      onProgress: options?.onProgress,
      onComplete: options?.onComplete,
      onError: options?.onError,
    };

    this.tasks.set(task.id, task);
    if (dedupeKey) {
      this.inFlightTaskByDedupeKey.set(dedupeKey, task.id);
    }
    this.queue.push(task);
    this.processQueue();

    return task;
  }

  configureRuntimeLimits(options: {
    maxQueueLength?: number;
    stalePendingMs?: number;
  }): void {
    if (typeof options.maxQueueLength === 'number' && Number.isFinite(options.maxQueueLength)) {
      this.maxQueueLength = clampInt(
        options.maxQueueLength,
        TASK_RUNTIME_DEFAULTS.queueLengthMin,
        TASK_RUNTIME_DEFAULTS.queueLengthMax,
      );
    }
    if (typeof options.stalePendingMs === 'number' && Number.isFinite(options.stalePendingMs)) {
      this.stalePendingMs = clampInt(
        options.stalePendingMs,
        TASK_RUNTIME_DEFAULTS.stalePendingMinMs,
        TASK_RUNTIME_DEFAULTS.stalePendingMaxMs,
      );
    }
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  private getInFlightTaskByDedupeKey(dedupeKey: string): Task | undefined {
    const taskId = this.inFlightTaskByDedupeKey.get(dedupeKey);
    if (!taskId) {
      return undefined;
    }

    const task = this.tasks.get(taskId);
    if (!task) {
      this.inFlightTaskByDedupeKey.delete(dedupeKey);
      return undefined;
    }

    if (task.status === 'pending' || task.status === 'processing') {
      return task;
    }

    this.inFlightTaskByDedupeKey.delete(dedupeKey);
    return undefined;
  }

  private releaseInFlightDedupe(task: Task): void {
    if (!task.dedupeKey) {
      return;
    }
    const linkedTaskId = this.inFlightTaskByDedupeKey.get(task.dedupeKey);
    if (linkedTaskId === task.id) {
      this.inFlightTaskByDedupeKey.delete(task.dedupeKey);
    }
  }

  private deleteTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }
    this.tasks.delete(id);
    this.queue = this.queue.filter((queuedTask) => queuedTask.id !== id);
    this.releaseInFlightDedupe(task);
  }

  private async invokeOnComplete(task: Task): Promise<void> {
    if (!task.onComplete) {
      return;
    }
    try {
      await Promise.resolve(task.onComplete(task.result));
    } catch (callbackError) {
      console.error(`[task-manager] onComplete callback failed for task ${task.id}:`, callbackError);
      throw callbackError;
    }
  }

  private async invokeOnError(task: Task): Promise<void> {
    if (!task.onError || !task.error) {
      return;
    }
    try {
      await Promise.resolve(task.onError(task.error));
    } catch (callbackError) {
      console.error(`[task-manager] onError callback failed for task ${task.id}:`, callbackError);
    }
  }

  private notifyOnError(task: Task): void {
    if (!task.onError || !task.error) {
      return;
    }
    void Promise.resolve(task.onError(task.error)).catch((callbackError) => {
      console.error(`[task-manager] onError callback failed for task ${task.id}:`, callbackError);
    });
  }

  private async processQueue() {
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeWorkers++;
    task.status = 'processing';

    try {
      await this.executeTask(task);
    } catch (error) {
      task.status = 'failed';
      task.error = task.error ?? (error as Error).message;
    } finally {
      this.activeWorkers--;
      this.releaseInFlightDedupe(task);
      this.processQueue();
    }
  }

  private async executeTask(task: Task): Promise<void> {
    try {
      switch (task.type) {
        case 'hash': {
          task.progress = TASK_RUNTIME_DEFAULTS.hashTaskProgressReadStarted;
          if (task.onProgress) task.onProgress(task.progress);

          // Read file asynchronously in chunks to avoid blocking
          const fileBuffer = await fs.readFile(task.filePath);

          task.progress = TASK_RUNTIME_DEFAULTS.hashTaskProgressReadCompleted;
          if (task.onProgress) task.onProgress(task.progress);

          // Calculate hash asynchronously
          const fileHash = await new Promise<string>((resolve) => {
            setImmediate(() => {
              const hash = crypto
                .createHash(TASK_RUNTIME_DEFAULTS.hashAlgorithm)
                .update(fileBuffer)
                .digest('hex');
              resolve(hash);
            });
          });

          const fileSize = fileBuffer.length;

          task.progress = TASK_RUNTIME_DEFAULTS.taskProgressCompleted;
          task.result = { fileHash, fileSize };
          task.status = 'completed';
          if (task.onProgress) task.onProgress(task.progress);
          await this.invokeOnComplete(task);
          break;
        }

        case 'parse_sheets': {
          task.progress = TASK_RUNTIME_DEFAULTS.parseTaskProgressStarted;
          if (task.onProgress) task.onProgress(task.progress);

          const bundle = await runParseWorkbookBundle(task.filePath, task.parseOptions, task.fileHash);

          task.progress = TASK_RUNTIME_DEFAULTS.parseTaskProgressReady;
          if (task.onProgress) task.onProgress(task.progress);

          const sheetsWithInfo = bundle.sheetSummaries;
          task.progress = TASK_RUNTIME_DEFAULTS.parseTaskProgressNearComplete;
          if (task.onProgress) task.onProgress(task.progress);

          task.progress = TASK_RUNTIME_DEFAULTS.taskProgressCompleted;
          task.result = sheetsWithInfo;
          task.status = 'completed';
          if (task.onProgress) task.onProgress(task.progress);
          await this.invokeOnComplete(task);
          break;
        }

        case 'parse_table': {
          if (!task.sheetName) {
            throw new Error('Sheet name is required for parse_table task');
          }

          task.progress = TASK_RUNTIME_DEFAULTS.parseTaskProgressStarted;
          if (task.onProgress) task.onProgress(task.progress);

          const bundle = await runParseWorkbookBundle(task.filePath, task.parseOptions, task.fileHash);
          const tables = bundle.tablesBySheet[task.sheetName!] ?? [];

          task.progress = TASK_RUNTIME_DEFAULTS.taskProgressCompleted;
          task.result = tables;
          task.status = 'completed';
          if (task.onProgress) task.onProgress(task.progress);
          await this.invokeOnComplete(task);
          break;
        }

        default:
          throw new Error(`Unknown task type: ${String(task.type)}`);
      }
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      await this.invokeOnError(task);
      throw error;
    }
  }

  clearCompletedTasks(olderThan: number = TASK_RUNTIME_DEFAULTS.cleanupCompletedTaskOlderThanMs) {
    const now = Date.now();
    const stalePendingBefore = now - this.stalePendingMs;

    this.queue = this.queue.filter((task) => {
      if (task.status === 'pending' && task.createdAt.getTime() < stalePendingBefore) {
        task.status = 'failed';
        task.error = 'Task expired before execution';
        this.notifyOnError(task);
        this.deleteTask(task.id);
        return false;
      }
      return true;
    });

    for (const [id, task] of Array.from(this.tasks.entries())) {
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        now - task.createdAt.getTime() > olderThan
      ) {
        this.deleteTask(id);
      } else if (task.status === 'pending' && task.createdAt.getTime() < stalePendingBefore) {
        this.deleteTask(id);
      }
    }
  }
}

export const taskManager = new TaskManager();

// Clean up old tasks every 5 minutes
setInterval(() => {
  taskManager.clearCompletedTasks(TASK_RUNTIME_DEFAULTS.cleanupIntervalMs);
}, TASK_RUNTIME_DEFAULTS.cleanupIntervalMs);
