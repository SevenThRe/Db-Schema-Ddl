export const EXCEL_EXECUTOR_DEFAULTS = {
  workerTimeoutMs: 120_000,
  fallbackPoolSize: 2,
  cacheTtlMs: 10 * 60 * 1000,
  electronCacheMaxEntries: 6,
  serverCacheMaxEntries: 20,
  electronCacheMaxTotalMb: 24,
  serverCacheMaxTotalMb: 160,
  electronCacheMaxBundleMb: 8,
  serverCacheMaxBundleMb: 24,
  maxQueueLength: 200,
  minWorkerTimeoutMs: 1_000,
  minCacheTtlMs: 1_000,
  minWorkerPoolSize: 1,
  maxWorkerPoolSize: 4,
  workerDisabledTrueValues: ["1", "true", "yes"],
  workerTaskIdRandomLength: 8,
} as const;

export const EXCEL_EXECUTOR_DISABLED_TRUE_VALUES = new Set<string>(
  EXCEL_EXECUTOR_DEFAULTS.workerDisabledTrueValues,
);
