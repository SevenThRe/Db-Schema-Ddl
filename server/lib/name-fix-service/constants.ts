export const NAME_FIX_RUNTIME_MARKERS = {
  notFoundText: "not found",
  fileNotFoundText: "file not found",
  expiredText: "expired",
} as const;

export const NAME_FIX_RUNTIME_LIMITS = {
  previewTtlMs: 30 * 60 * 1000,
  backupCleanupIntervalMs: 60 * 60 * 1000,
  maxBackupHistoryPerSource: 20,
  downloadTokenTtlMs: 30 * 60 * 1000,
  archiveCompressionLevel: 9,
  randomIdByteLength: 5,
  msPerHour: 60 * 60 * 1000,
  msPerDay: 24 * 60 * 60 * 1000,
  minBatchConcurrency: 1,
  multipleFilePlaceholderId: 0,
} as const;

export const NAME_FIX_RUNTIME_MESSAGES = {
  logPrefix: "[name-fix]",
  fileNotFoundByIdPrefix: "File not found",
  jobNotFound: "Name-fix job not found.",
  backupNotFound: "No backup found for this job.",
  rollbackCompleted: "Rollback completed.",
  rollbackNoRestorableBackup: "No restorable backup found.",
  downloadTokenNotFound: "Download token not found or expired.",
  downloadTokenExpired: "Download token has expired.",
  fileLockedByAnotherOperation: "File is currently locked by another name-fix operation.",
  blockingConflictsDetected: "Blocking naming conflicts detected. Please adjust strategy and preview again.",
  missingSourceRefBlocked: "Missing sourceRef detected. Apply operation is blocked for this file.",
  previewPlanExpiredOrMissing: "Preview plan expired or not found. Please run preview again.",
  previewPlanExpired: "Preview plan has expired. Please run preview again.",
  noTablesMatchedCurrentSheet: "No tables matched selectedTableIndexes in current sheet.",
  overwriteModeElectronOnly: "Overwrite mode is only available in Electron.",
  overwriteModeDisabledBySettings: "Overwrite mode is disabled by current settings.",
  targetDirectoryOutsideUploads: "targetDirectory is outside allowed uploads directory.",
  multipleSourcePathPlaceholder: "[multiple]",
} as const;

export const NAME_FIX_RUNTIME_ID_PREFIX = {
  plan: "name_fix_plan",
  job: "name_fix_job",
  download: "name_fix_download",
} as const;
