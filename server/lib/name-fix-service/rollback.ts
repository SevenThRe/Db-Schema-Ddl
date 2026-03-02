import * as fs from "fs/promises";
import type {
  NameFixJob,
  NameFixJobItem,
  NameFixRollbackRequest,
  NameFixRollbackResponse,
} from "@shared/schema";
import { storage } from "../../storage";
import { computeBufferHash } from "./shared";

export async function rollbackNameFixJobById(
  request: NameFixRollbackRequest,
): Promise<NameFixRollbackResponse> {
  const job = await storage.getNameFixJob(request.jobId);
  if (!job) {
    throw new Error("Name-fix job not found.");
  }
  const backups = await storage.getNameFixBackupsByJob(request.jobId);
  if (backups.length === 0) {
    throw new Error("No backup found for this job.");
  }

  let restoredPath: string | undefined;
  let restoredHash: string | undefined;
  for (const backup of backups) {
    if (!backup.restorable) {
      continue;
    }
    await fs.copyFile(backup.backupPath, backup.sourcePath);
    restoredPath = backup.sourcePath;
    restoredHash = computeBufferHash(await fs.readFile(backup.sourcePath));
    await storage.updateNameFixBackup(backup.id, { restorable: false });
  }

  await storage.updateNameFixJob(job.id, {
    status: "rolled_back",
  });

  return {
    jobId: job.id,
    success: Boolean(restoredPath),
    restoredPath,
    backupPath: backups[0]?.backupPath,
    restoredHash,
    message: restoredPath ? "Rollback completed." : "No restorable backup found.",
  };
}

export async function getNameFixJobDetail(
  jobId: string,
): Promise<{ job: NameFixJob; items: NameFixJobItem[] }> {
  const job = await storage.getNameFixJob(jobId);
  if (!job) {
    throw new Error("Name-fix job not found.");
  }
  const items = await storage.listNameFixJobItems(jobId);
  return { job, items };
}

