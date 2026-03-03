import { APP_DEFAULTS } from "@shared/config";

export const TASK_RUNTIME_DEFAULTS = {
  maxWorkers: 4,
  maxQueueLength: APP_DEFAULTS.taskManager.maxQueueLength,
  stalePendingMs: APP_DEFAULTS.taskManager.stalePendingMs,
  cleanupCompletedTaskOlderThanMs: 60_000,
  cleanupIntervalMs: 5 * 60 * 1000,
  hashTaskProgressReadStarted: 10,
  hashTaskProgressReadCompleted: 50,
  parseTaskProgressStarted: 10,
  parseTaskProgressReady: 30,
  parseTaskProgressNearComplete: 90,
  taskProgressCompleted: 100,
  queueLengthMin: 10,
  queueLengthMax: 1_000,
  stalePendingMinMs: 60_000,
  stalePendingMaxMs: 3_600_000,
  dedupeIdRandomLength: 9,
  hashAlgorithm: "sha256",
} as const;
