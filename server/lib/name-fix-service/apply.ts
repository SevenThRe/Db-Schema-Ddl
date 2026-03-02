import type {
  NameFixApplyRequest,
  NameFixApplyResponse,
  NameFixJob,
  NameFixJobItem,
  NameFixMode,
} from "@shared/schema";
import { applyExcelNameChanges } from "../excel-writeback";
import { storage } from "../../storage";
import {
  cleanupExpiredDownloadTokens,
  cleanupExpiredPreviewPlans,
  collectChangedItemRecords,
  createDownloadTicket,
  createNameFixBundleArchive,
  fileLocks,
  previewPlanCache,
  randomId,
  validateTargetDirectory,
  writeExecutionReport,
  type StoredFilePreviewPlan,
  type StoredPreviewPlan,
} from "./shared";

type NameFixApplyFileResult = NameFixApplyResponse["files"][number];

interface FilePlanApplyOutcome {
  fileResult: NameFixApplyFileResult;
  success: boolean;
  outputPath?: string;
  backupPath?: string;
  reportJsonPath?: string;
  reportTextPath?: string;
  downloadableFile?: {
    originalName: string;
    outputPath: string;
    reportJsonPath?: string;
    reportTextPath?: string;
  };
}

async function executeFilePlanApply(
  params: {
    filePlan: StoredFilePreviewPlan;
    jobId: string;
    planId: string;
    planHash: string;
    mode: NameFixMode;
    targetDirectory?: string;
    includeReport: boolean;
    backupRetentionDays: number;
  },
): Promise<FilePlanApplyOutcome> {
  const {
    filePlan,
    jobId,
    planId,
    planHash,
    mode,
    targetDirectory,
    includeReport,
    backupRetentionDays,
  } = params;

  if (fileLocks.has(filePlan.sourcePath)) {
    return {
      success: false,
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        success: false,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: filePlan.cellChanges.length,
        error: "File is currently locked by another name-fix operation.",
      },
    };
  }

  if (filePlan.blockingConflictCount > 0 || filePlan.unresolvedSourceRefCount > 0) {
    return {
      success: false,
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        success: false,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: filePlan.cellChanges.length,
        error:
          filePlan.blockingConflictCount > 0
            ? "Blocking naming conflicts detected. Please adjust strategy and preview again."
            : "Missing sourceRef detected. Apply operation is blocked for this file.",
      },
    };
  }

  fileLocks.set(filePlan.sourcePath, jobId);
  try {
    const writeResult = await applyExcelNameChanges(filePlan.sourcePath, filePlan.cellChanges, {
      mode,
      targetDirectory,
    });

    const reportPayload = {
      jobId,
      planId,
      planHash,
      fileId: filePlan.fileId,
      sourcePath: filePlan.sourcePath,
      outputPath: writeResult.outputPath,
      backupPath: writeResult.backupPath,
      changedTableCount: filePlan.changedTableCount,
      changedColumnCount: filePlan.changedColumnCount,
      skippedCount: writeResult.skippedCount,
      issues: writeResult.issues,
      conflicts: filePlan.conflicts,
      decisionTrace: filePlan.decisionTrace,
      tableMappings: filePlan.tableMappings,
    };
    const reportPaths = await writeExecutionReport(
      includeReport,
      writeResult.outputPath,
      reportPayload,
    );

    if (writeResult.backupPath && writeResult.backupHash) {
      const expiresAt = new Date(
        Date.now() + backupRetentionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      await storage.createNameFixBackup({
        jobId,
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        backupPath: writeResult.backupPath,
        backupHash: writeResult.backupHash,
        restorable: true,
        expiresAt,
      });
    }

    const downloadTicket =
      mode === "replace_download"
        ? createDownloadTicket(writeResult.outputPath, filePlan.originalName)
        : undefined;
    return {
      success: true,
      outputPath: writeResult.outputPath,
      backupPath: writeResult.backupPath,
      reportJsonPath: reportPaths.reportJsonPath,
      reportTextPath: reportPaths.reportTextPath,
      downloadableFile: {
        originalName: filePlan.originalName,
        outputPath: writeResult.outputPath,
        reportJsonPath: reportPaths.reportJsonPath,
        reportTextPath: reportPaths.reportTextPath,
      },
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        outputPath: writeResult.outputPath,
        backupPath: writeResult.backupPath,
        reportJsonPath: reportPaths.reportJsonPath,
        reportTextPath: reportPaths.reportTextPath,
        downloadToken: downloadTicket?.token,
        downloadFilename: downloadTicket?.downloadFilename,
        success: true,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: writeResult.skippedCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      fileResult: {
        fileId: filePlan.fileId,
        sourcePath: filePlan.sourcePath,
        success: false,
        changedTableCount: filePlan.changedTableCount,
        changedColumnCount: filePlan.changedColumnCount,
        skippedChanges: filePlan.cellChanges.length,
        error: (error as Error).message,
      },
    };
  } finally {
    fileLocks.delete(filePlan.sourcePath);
  }
}

async function createJobRecord(
  plan: StoredPreviewPlan,
  mode: NameFixMode,
): Promise<NameFixJob> {
  const jobId = randomId("name_fix_job");
  const sourcePath = plan.files.length === 1 ? plan.files[0].sourcePath : "[multiple]";
  const fileId = plan.files.length === 1 ? plan.files[0].fileId : 0;
  return storage.createNameFixJob({
    id: jobId,
    fileId,
    planId: plan.planId,
    planHash: plan.planHash,
    mode,
    scope: plan.scope,
    status: "pending",
    sourcePath,
    outputPath: undefined,
    backupPath: undefined,
    reportJsonPath: undefined,
    reportTextPath: undefined,
    conflictStrategy: plan.conflictStrategy,
    reservedWordStrategy: plan.reservedWordStrategy,
    lengthOverflowStrategy: plan.lengthOverflowStrategy,
    maxIdentifierLength: plan.maxIdentifierLength,
    changedTableCount: 0,
    changedColumnCount: 0,
    blockingConflictCount: 0,
    unresolvedSourceRefCount: 0,
    error: undefined,
  });
}

export async function applyNameFixPlanById(
  request: NameFixApplyRequest,
): Promise<NameFixApplyResponse> {
  cleanupExpiredPreviewPlans();
  cleanupExpiredDownloadTokens();
  const plan = previewPlanCache.get(request.planId);
  if (!plan) {
    throw new Error("Preview plan expired or not found. Please run preview again.");
  }
  if (plan.expiresAt <= Date.now()) {
    previewPlanCache.delete(plan.planId);
    throw new Error("Preview plan has expired. Please run preview again.");
  }

  const settings = await storage.getSettings();
  const mode = request.mode;
  if (mode === "overwrite" && process.env.ELECTRON_MODE !== "true") {
    throw new Error("Overwrite mode is only available in Electron.");
  }
  if (mode === "overwrite" && !settings.allowOverwriteInElectron) {
    throw new Error("Overwrite mode is disabled by current settings.");
  }
  validateTargetDirectory(request.targetDirectory, settings.allowExternalPathWrite);

  const job = await createJobRecord(plan, mode);
  await storage.updateNameFixJob(job.id, { status: "processing" });

  const fileResults: NameFixApplyResponse["files"] = [];
  const changedItemRecords: Omit<NameFixJobItem, "id" | "createdAt">[] = [];
  let successCount = 0;
  let failedCount = 0;
  let changedTableCount = 0;
  let changedColumnCount = 0;
  let blockingConflictCount = 0;
  let unresolvedSourceRefCount = 0;
  let firstOutputPath: string | undefined;
  let firstBackupPath: string | undefined;
  let firstReportJsonPath: string | undefined;
  let firstReportTextPath: string | undefined;
  const successfulDownloadFiles: Array<{
    originalName: string;
    outputPath: string;
    reportJsonPath?: string;
    reportTextPath?: string;
  }> = [];

  for (const filePlan of plan.files) {
    changedTableCount += filePlan.changedTableCount;
    changedColumnCount += filePlan.changedColumnCount;
    blockingConflictCount += filePlan.blockingConflictCount;
    unresolvedSourceRefCount += filePlan.unresolvedSourceRefCount;
  }

  const fileApplyResults: FilePlanApplyOutcome[] = new Array(plan.files.length);
  const maxBatchConcurrency = Math.max(
    1,
    Math.min(settings.nameFixMaxBatchConcurrency || 1, plan.files.length || 1),
  );
  let nextFileIndex = 0;
  await Promise.all(
    Array.from({ length: maxBatchConcurrency }, async () => {
      while (true) {
        const currentIndex = nextFileIndex;
        nextFileIndex += 1;
        if (currentIndex >= plan.files.length) {
          return;
        }
        const filePlan = plan.files[currentIndex];
        fileApplyResults[currentIndex] = await executeFilePlanApply({
          filePlan,
          jobId: job.id,
          planId: plan.planId,
          planHash: plan.planHash,
          mode,
          targetDirectory: request.targetDirectory,
          includeReport: request.includeReport,
          backupRetentionDays: settings.nameFixBackupRetentionDays,
        });
      }
    }),
  );

  fileApplyResults.forEach((result, index) => {
    fileResults.push(result.fileResult);
    if (!result.success) {
      failedCount += 1;
      return;
    }

    const appliedFilePlan = plan.files[index];
    if (appliedFilePlan) {
      changedItemRecords.push(...collectChangedItemRecords(job.id, appliedFilePlan));
    }

    successCount += 1;
    if (!firstOutputPath && result.outputPath) {
      firstOutputPath = result.outputPath;
    }
    if (!firstBackupPath && result.backupPath) {
      firstBackupPath = result.backupPath;
    }
    if (!firstReportJsonPath && result.reportJsonPath) {
      firstReportJsonPath = result.reportJsonPath;
    }
    if (!firstReportTextPath && result.reportTextPath) {
      firstReportTextPath = result.reportTextPath;
    }
    if (result.downloadableFile) {
      successfulDownloadFiles.push(result.downloadableFile);
    }
  });

  await storage.createNameFixJobItems(changedItemRecords);

  const status: NameFixApplyResponse["status"] = failedCount > 0 ? "failed" : "completed";
  await storage.updateNameFixJob(job.id, {
    status,
    outputPath: firstOutputPath,
    backupPath: firstBackupPath,
    reportJsonPath: firstReportJsonPath,
    reportTextPath: firstReportTextPath,
    changedTableCount,
    changedColumnCount,
    blockingConflictCount,
    unresolvedSourceRefCount,
    error: failedCount > 0 ? `${failedCount} file(s) failed during apply.` : undefined,
  });

  let downloadBundleToken: string | undefined;
  let downloadBundleFilename: string | undefined;
  if (mode === "replace_download" && successfulDownloadFiles.length > 1) {
    const bundle = await createNameFixBundleArchive(job.id, successfulDownloadFiles);
    const bundleTicket = createDownloadTicket(bundle.archivePath, bundle.archiveFilename, {
      deleteOnExpire: true,
      preserveFilename: true,
    });
    downloadBundleToken = bundleTicket.token;
    downloadBundleFilename = bundleTicket.downloadFilename;
  }

  return {
    jobId: job.id,
    planId: plan.planId,
    planHash: plan.planHash,
    status,
    downloadBundleToken,
    downloadBundleFilename,
    summary: {
      fileCount: plan.files.length,
      successCount,
      failedCount,
      changedTableCount,
      changedColumnCount,
    },
    files: fileResults,
  };
}

