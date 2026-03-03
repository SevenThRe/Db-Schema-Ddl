import { APP_DEFAULTS } from "@shared/config";

export const BYTES_PER_MB = 1024 * 1024;

export const ROUTE_STRING_MARKERS = {
  boolTrueValues: ["1", "true", "yes", "on"],
  uploadFieldName: "file",
  uploadProcessingHash: "processing",
  parseSheetsTaskPrefix: "parse_sheets",
  parseTableTaskPrefix: "parse_table",
  prewarmLogPrefix: "[parse-prewarm]",
  settingsLogPrefix: "[settings]",
  loopbackIpv4: "127.0.0.1",
  loopbackIpv6: "::1",
  storageSeedFilename:
    "\u0033\u0030.\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9\u5b9a\u7fa9\u66f8-\u7d66\u4e0e_ISI_20260209_1770863427874.xlsx",
} as const;

export const ROUTE_BOOL_TRUE_VALUES = new Set<string>(ROUTE_STRING_MARKERS.boolTrueValues);

export const ROUTE_UPLOAD_FILE_NAMING = {
  hashAlgorithm: "md5",
  hashEncoding: "hex",
  hashLength: 8,
  originalNameEncoding: "latin1",
  decodedNameEncoding: "utf8",
} as const;

export const ROUTE_PATHS = {
  apiPrefix: "/api",
} as const;

export const ROUTE_UPLOAD_RULES = {
  maxFileSizeBytes: APP_DEFAULTS.excel.maxFileSizeMb * BYTES_PER_MB,
  allowedMimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ],
  allowedExtensions: [".xlsx", ".xls"],
} as const;

export const ROUTE_RUNTIME_DEFAULTS = {
  pkMarkers: [...APP_DEFAULTS.excel.pkMarkers],
  maxConsecutiveEmptyRows: APP_DEFAULTS.excel.maxConsecutiveEmptyRows,
  uploadRateLimitWindowMs: APP_DEFAULTS.rateLimit.uploadWindowMs,
  uploadRateLimitMaxRequests: APP_DEFAULTS.rateLimit.uploadMaxRequests,
  parseRateLimitWindowMs: APP_DEFAULTS.rateLimit.parseWindowMs,
  parseRateLimitMaxRequests: APP_DEFAULTS.rateLimit.parseMaxRequests,
  globalProtectRateLimitWindowMs: APP_DEFAULTS.rateLimit.globalProtectWindowMs,
  globalProtectRateLimitMaxRequests: APP_DEFAULTS.rateLimit.globalProtectMaxRequests,
  globalProtectMaxInFlight: APP_DEFAULTS.rateLimit.globalProtectMaxInFlight,
  prewarmEnabled: APP_DEFAULTS.prewarm.enabled,
  prewarmMaxConcurrency: APP_DEFAULTS.prewarm.maxConcurrency,
  prewarmQueueMax: APP_DEFAULTS.prewarm.queueMax,
  prewarmMaxFileMb: APP_DEFAULTS.prewarm.maxFileMb,
} as const;

export const ROUTE_RUNTIME_HARD_CAPS = {
  uploadRateLimitWindowMs: 300_000,
  uploadRateLimitMaxRequests: 500,
  parseRateLimitWindowMs: 300_000,
  parseRateLimitMaxRequests: 1_000,
  globalProtectRateLimitWindowMs: 300_000,
  globalProtectRateLimitMaxRequests: 5_000,
  globalProtectMaxInFlight: 500,
  prewarmMaxConcurrency: 8,
  prewarmQueueMax: 100,
  prewarmMaxFileMb: 100,
  taskManagerMaxQueueLength: 1_000,
  taskManagerStalePendingMs: 3_600_000,
} as const;

export const ROUTE_RUNTIME_CLAMP_MIN = {
  rateLimitWindowMs: 1_000,
  uploadRateLimitMaxRequests: 1,
  parseRateLimitMaxRequests: 1,
  globalProtectRateLimitMaxRequests: 10,
  globalProtectMaxInFlight: 1,
  prewarmMaxConcurrency: 1,
  prewarmQueueMax: 1,
  prewarmMaxFileMb: 1,
  taskManagerMaxQueueLength: 10,
  taskManagerStalePendingMs: 60_000,
} as const;

export const ROUTE_RATE_COUNTER_SWEEP = {
  staleWindowMultiplier: 2,
  minSweepIntervalMs: 10_000,
} as const;
