import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import crypto from 'crypto';
import { getSheetNames, parseTableDefinitions } from './excel';

export interface Task {
  id: string;
  type: 'hash' | 'parse_sheets' | 'parse_table';
  filePath: string;
  sheetName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  onProgress?: (progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private maxWorkers = 4;
  private activeWorkers = 0;
  private queue: Task[] = [];

  createTask(
    type: Task['type'],
    filePath: string,
    options?: {
      sheetName?: string;
      onProgress?: (progress: number) => void;
      onComplete?: (result: any) => void;
      onError?: (error: string) => void;
    }
  ): Task {
    const task: Task = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      filePath,
      sheetName: options?.sheetName,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      onProgress: options?.onProgress,
      onComplete: options?.onComplete,
      onError: options?.onError,
    };

    this.tasks.set(task.id, task);
    this.queue.push(task);
    this.processQueue();

    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
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
      task.error = (error as Error).message;
      if (task.onError) task.onError(task.error);
    } finally {
      this.activeWorkers--;
      this.processQueue();
    }
  }

  private async executeTask(task: Task): Promise<void> {
    try {
      switch (task.type) {
        case 'hash': {
          task.progress = 10;
          if (task.onProgress) task.onProgress(task.progress);

          // Read file asynchronously in chunks to avoid blocking
          const fileBuffer = await fs.readFile(task.filePath);

          task.progress = 50;
          if (task.onProgress) task.onProgress(task.progress);

          // Calculate hash asynchronously
          const fileHash = await new Promise<string>((resolve) => {
            setImmediate(() => {
              const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
              resolve(hash);
            });
          });

          const fileSize = fileBuffer.length;

          task.progress = 100;
          task.result = { fileHash, fileSize };
          task.status = 'completed';
          if (task.onProgress) task.onProgress(task.progress);
          if (task.onComplete) task.onComplete(task.result);
          break;
        }

        case 'parse_sheets': {
          task.progress = 10;
          if (task.onProgress) task.onProgress(task.progress);

          // Get sheet names
          const sheetNames = await new Promise<string[]>((resolve) => {
            setImmediate(() => {
              const names = getSheetNames(task.filePath);
              resolve(names);
            });
          });

          task.progress = 30;
          if (task.onProgress) task.onProgress(task.progress);

          // Process sheets in chunks to allow event loop to breathe
          const sheetsWithInfo = [];
          const progressPerSheet = 70 / sheetNames.length;

          for (let i = 0; i < sheetNames.length; i++) {
            const name = sheetNames[i];

            // Process each sheet asynchronously
            const hasTableDefinitions = await new Promise<boolean>((resolve) => {
              setImmediate(() => {
                try {
                  const tables = parseTableDefinitions(task.filePath, name);
                  resolve(tables.length > 0);
                } catch (err) {
                  resolve(false);
                }
              });
            });

            sheetsWithInfo.push({ name, hasTableDefinitions });

            // Update progress
            task.progress = 30 + Math.round((i + 1) * progressPerSheet);
            if (task.onProgress) task.onProgress(task.progress);
          }

          task.progress = 100;
          task.result = sheetsWithInfo;
          task.status = 'completed';
          if (task.onProgress) task.onProgress(task.progress);
          if (task.onComplete) task.onComplete(task.result);
          break;
        }

        case 'parse_table': {
          if (!task.sheetName) {
            throw new Error('Sheet name is required for parse_table task');
          }

          task.progress = 10;
          if (task.onProgress) task.onProgress(task.progress);

          // Parse table asynchronously
          const tables = await new Promise((resolve) => {
            setImmediate(() => {
              const result = parseTableDefinitions(task.filePath, task.sheetName!);
              resolve(result);
            });
          });

          task.progress = 100;
          task.result = tables;
          task.status = 'completed';
          if (task.onProgress) task.onProgress(task.progress);
          if (task.onComplete) task.onComplete(task.result);
          break;
        }

        default:
          throw new Error(`Unknown task type: ${(task as any).type}`);
      }
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      if (task.onError) task.onError(task.error);
      throw error;
    }
  }

  clearCompletedTasks(olderThan: number = 60000) {
    const now = Date.now();
    for (const [id, task] of this.tasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'failed') &&
        now - task.createdAt.getTime() > olderThan
      ) {
        this.tasks.delete(id);
      }
    }
  }
}

export const taskManager = new TaskManager();

// Clean up old tasks every 5 minutes
setInterval(() => {
  taskManager.clearCompletedTasks(5 * 60 * 1000);
}, 5 * 60 * 1000);
