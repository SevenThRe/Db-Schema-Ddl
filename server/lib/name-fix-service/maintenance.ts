import * as fs from "fs/promises";
import type { NameFixBackup } from "@shared/schema";
import { storage } from "../../storage";
import {
  BACKUP_CLEANUP_INTERVAL_MS,
  MAX_BACKUP_HISTORY_PER_SOURCE,
  cleanupExpiredDownloadTokens,
  cleanupExpiredPreviewPlans,
  isMaintenanceStarted,
  markMaintenanceStarted,
} from "./shared";

async function cleanupExpiredBackups(): Promise<void> {
  const backups = await storage.listNameFixBackups();
  const now = Date.now();

  const groupedBySource = new Map<string, NameFixBackup[]>();
  backups.forEach((backup) => {
    const list = groupedBySource.get(backup.sourcePath) ?? [];
    list.push(backup);
    groupedBySource.set(backup.sourcePath, list);
  });

  for (const backup of backups) {
    if (!backup.restorable) {
      continue;
    }
    const expiresAt = Date.parse(backup.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      await fs.rm(backup.backupPath, { force: true });
      await storage.updateNameFixBackup(backup.id, { restorable: false });
    }
  }

  for (const sourceBackups of Array.from(groupedBySource.values())) {
    const sorted = [...sourceBackups].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const overflow = sorted.slice(MAX_BACKUP_HISTORY_PER_SOURCE);
    for (const backup of overflow) {
      if (!backup.restorable) {
        continue;
      }
      await fs.rm(backup.backupPath, { force: true });
      await storage.updateNameFixBackup(backup.id, { restorable: false });
    }
  }
}

export function startNameFixMaintenance(): void {
  if (isMaintenanceStarted()) {
    return;
  }
  markMaintenanceStarted();
  setInterval(() => {
    cleanupExpiredPreviewPlans();
    cleanupExpiredDownloadTokens();
    void cleanupExpiredBackups().catch((error) => {
      console.warn("[name-fix] backup cleanup failed:", (error as Error).message);
    });
  }, BACKUP_CLEANUP_INTERVAL_MS);
}

