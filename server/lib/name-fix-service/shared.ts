import crypto from "crypto";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import type {
  NameFixConflict,
  NameFixDecisionTrace,
  NameFixJobItem,
  NameFixPreviewRequest,
  NameFixScope,
  NameFixTableMapping,
} from "@shared/schema";
import type { NameFixCellChange } from "../excel-writeback";

export const PREVIEW_TTL_MS = 30 * 60 * 1000;
export const BACKUP_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const MAX_BACKUP_HISTORY_PER_SOURCE = 20;
export const DOWNLOAD_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface StoredFilePreviewPlan {
  fileId: number;
  originalName: string;
  sourcePath: string;
  selectedSheets: string[];
  changedTableCount: number;
  changedColumnCount: number;
  blockingConflictCount: number;
  unresolvedSourceRefCount: number;
  conflicts: NameFixConflict[];
  decisionTrace: NameFixDecisionTrace[];
  tableMappings: NameFixTableMapping[];
  cellChanges: NameFixCellChange[];
}

export interface StoredPreviewPlan {
  planId: string;
  planHash: string;
  createdAt: number;
  expiresAt: number;
  scope: NameFixScope;
  conflictStrategy: NameFixPreviewRequest["conflictStrategy"];
  reservedWordStrategy: NameFixPreviewRequest["reservedWordStrategy"];
  lengthOverflowStrategy: NameFixPreviewRequest["lengthOverflowStrategy"];
  maxIdentifierLength: number;
  files: StoredFilePreviewPlan[];
}

export interface NameFixDownloadTicket {
  token: string;
  outputPath: string;
  downloadFilename: string;
  createdAt: number;
  expiresAt: number;
  deleteOnExpire?: boolean;
}

export const previewPlanCache = new Map<string, StoredPreviewPlan>();
export const downloadTokenCache = new Map<string, NameFixDownloadTicket>();
export const fileLocks = new Map<string, string>();
let maintenanceStarted = false;

export function isMaintenanceStarted(): boolean {
  return maintenanceStarted;
}

export function markMaintenanceStarted(): void {
  maintenanceStarted = true;
}

export function computePlanHash(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function computeBufferHash(payload: Buffer): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

export function cleanupExpiredPreviewPlans(): void {
  const now = Date.now();
  for (const [planId, plan] of Array.from(previewPlanCache.entries())) {
    if (plan.expiresAt <= now) {
      previewPlanCache.delete(planId);
    }
  }
}

export function cleanupExpiredDownloadTokens(): void {
  const now = Date.now();
  for (const [token, ticket] of Array.from(downloadTokenCache.entries())) {
    if (ticket.expiresAt <= now) {
      downloadTokenCache.delete(token);
      if (ticket.deleteOnExpire) {
        void fs.rm(ticket.outputPath, { force: true }).catch(() => {
          // best effort cleanup for ephemeral bundle files
        });
      }
    }
  }
}

export function createDownloadTicket(
  outputPath: string,
  preferredName: string,
  options?: { deleteOnExpire?: boolean; preserveFilename?: boolean },
): NameFixDownloadTicket {
  const token = randomId("name_fix_download");
  const now = Date.now();
  const ext = path.extname(outputPath) || ".xlsx";
  const safeName = path.basename(preferredName || path.basename(outputPath));
  const filenameBase = safeName.replace(/\.[^.]+$/, "");
  const downloadFilename = options?.preserveFilename
    ? safeName
    : `${filenameBase}_fixed${ext}`;
  const ticket: NameFixDownloadTicket = {
    token,
    outputPath,
    downloadFilename,
    createdAt: now,
    expiresAt: now + DOWNLOAD_TOKEN_TTL_MS,
    deleteOnExpire: options?.deleteOnExpire,
  };
  downloadTokenCache.set(token, ticket);
  return ticket;
}

export async function createNameFixBundleArchive(
  jobId: string,
  successfulFiles: Array<{
    originalName: string;
    outputPath: string;
    reportJsonPath?: string;
    reportTextPath?: string;
  }>,
): Promise<{ archivePath: string; archiveFilename: string }> {
  const bundleDir = path.join(os.tmpdir(), "name-fix-download-bundles");
  await fs.mkdir(bundleDir, { recursive: true });

  const archiveFilename = `name_fix_bundle_${jobId}.zip`;
  const archivePath = path.join(bundleDir, archiveFilename);

  await new Promise<void>((resolve, reject) => {
    const output = fsSync.createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", (error) => reject(error));
    archive.on("error", (error) => reject(error));

    archive.pipe(output);
    for (const file of successfulFiles) {
      const ext = path.extname(file.outputPath) || ".xlsx";
      const safeBaseName = path.basename(file.originalName).replace(/\.[^.]+$/, "");
      archive.file(file.outputPath, { name: `${safeBaseName}${ext}` });
      if (file.reportJsonPath) {
        archive.file(file.reportJsonPath, { name: `${safeBaseName}__name_fix_report.json` });
      }
      if (file.reportTextPath) {
        archive.file(file.reportTextPath, { name: `${safeBaseName}__name_fix_report.txt` });
      }
    }

    void archive.finalize();
  });

  return { archivePath, archiveFilename };
}

function makePlainTextReport(payload: {
  jobId: string;
  planId: string;
  sourcePath: string;
  outputPath?: string;
  backupPath?: string;
  changedTableCount: number;
  changedColumnCount: number;
  skippedCount: number;
  issues: Array<{ sheetName: string; sourceAddress: string; reason: string }>;
}): string {
  const lines: string[] = [];
  lines.push("Name fix execution report");
  lines.push(`jobId: ${payload.jobId}`);
  lines.push(`planId: ${payload.planId}`);
  lines.push(`sourcePath: ${payload.sourcePath}`);
  lines.push(`outputPath: ${payload.outputPath ?? ""}`);
  lines.push(`backupPath: ${payload.backupPath ?? ""}`);
  lines.push(`changedTableCount: ${payload.changedTableCount}`);
  lines.push(`changedColumnCount: ${payload.changedColumnCount}`);
  lines.push(`skippedCount: ${payload.skippedCount}`);
  lines.push("");
  if (payload.issues.length > 0) {
    lines.push("issues:");
    payload.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${issue.sheetName} ${issue.sourceAddress}] ${issue.reason}`);
    });
  }
  return lines.join("\n");
}

export async function writeExecutionReport(
  includeReport: boolean,
  outputPath: string,
  payload: Record<string, unknown>,
): Promise<{ reportJsonPath?: string; reportTextPath?: string }> {
  if (!includeReport) {
    return {};
  }
  const ext = path.extname(outputPath);
  const baseName = path.basename(outputPath, ext);
  const reportDir = path.join(path.dirname(outputPath), "name-fix-reports");
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportJsonPath = path.join(reportDir, `${baseName}_${stamp}.json`);
  const reportTextPath = path.join(reportDir, `${baseName}_${stamp}.txt`);
  await fs.writeFile(reportJsonPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.writeFile(
    reportTextPath,
    makePlainTextReport({
      jobId: String(payload.jobId ?? ""),
      planId: String(payload.planId ?? ""),
      sourcePath: String(payload.sourcePath ?? ""),
      outputPath: payload.outputPath ? String(payload.outputPath) : undefined,
      backupPath: payload.backupPath ? String(payload.backupPath) : undefined,
      changedTableCount: Number(payload.changedTableCount ?? 0),
      changedColumnCount: Number(payload.changedColumnCount ?? 0),
      skippedCount: Number(payload.skippedCount ?? 0),
      issues: Array.isArray(payload.issues)
        ? payload.issues.map((item) => ({
            sheetName: String((item as any).sheetName ?? ""),
            sourceAddress: String((item as any).sourceAddress ?? ""),
            reason: String((item as any).reason ?? ""),
          }))
        : [],
    }),
    "utf-8",
  );
  return { reportJsonPath, reportTextPath };
}

export function collectChangedItemRecords(
  jobId: string,
  filePlan: StoredFilePreviewPlan,
): Omit<NameFixJobItem, "id" | "createdAt">[] {
  const records: Omit<NameFixJobItem, "id" | "createdAt">[] = [];
  filePlan.tableMappings.forEach((mapping) => {
    if (mapping.physicalTableNameBefore !== mapping.physicalTableNameAfter) {
      records.push({
        jobId,
        fileId: filePlan.fileId,
        sheetName: mapping.sheetName,
        tableIndex: mapping.tableIndex,
        target: "table",
        beforeName: mapping.physicalTableNameBefore,
        afterName: mapping.physicalTableNameAfter,
        action: "rename",
        sourceAddress: mapping.sourceRef?.physicalName?.address,
        blocking: !mapping.sourceRefExists,
        reason: !mapping.sourceRefExists ? "Missing sourceRef for table physical name." : undefined,
      });
    }

    mapping.columns.forEach((column) => {
      if (column.physicalNameBefore === column.physicalNameAfter) {
        return;
      }
      records.push({
        jobId,
        fileId: filePlan.fileId,
        sheetName: mapping.sheetName,
        tableIndex: mapping.tableIndex,
        columnIndex: column.columnIndex,
        target: "column",
        beforeName: column.physicalNameBefore,
        afterName: column.physicalNameAfter,
        action: "rename",
        sourceAddress: column.sourceRef?.address,
        blocking: !column.sourceRefExists,
        reason: !column.sourceRefExists ? "Missing sourceRef for column physical name." : undefined,
      });
    });
  });
  return records;
}

function isPathWithin(basePath: string, candidatePath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedCandidate = path.resolve(candidatePath);
  const compareBase = process.platform === "win32" ? normalizedBase.toLowerCase() : normalizedBase;
  const compareCandidate = process.platform === "win32" ? normalizedCandidate.toLowerCase() : normalizedCandidate;
  const relative = path.relative(compareBase, compareCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateTargetDirectory(
  targetDirectory: string | undefined,
  allowExternalPathWrite: boolean,
): void {
  const allowExternalWriteForCurrentRuntime = allowExternalPathWrite && process.env.ELECTRON_MODE === "true";
  if (!targetDirectory || allowExternalWriteForCurrentRuntime) {
    return;
  }
  const uploadsRoot = path.resolve(process.env.UPLOADS_DIR || "uploads");
  if (!isPathWithin(uploadsRoot, targetDirectory)) {
    throw new Error("targetDirectory is outside allowed uploads directory.");
  }
}

