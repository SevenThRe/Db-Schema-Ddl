import crypto from "crypto";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { isSqliteStorageEnabled } from "../app-config";
import { storage } from "../storage";

const SUPPORTED_EXCEL_EXTENSIONS = new Set([".xlsx", ".xls"]);
const BACKFILL_MARKER_FILENAME = ".uploads-backfill.done.json";

export interface UploadsBackfillSummary {
  mode: "executed" | "skipped_by_marker";
  uploadsDir: string;
  markerPath: string;
  scanned: number;
  inserted: number;
  skippedExisting: number;
  skippedUnsupported: number;
  errors: number;
  durationMs: number;
}

interface UploadsBackfillOptions {
  force?: boolean;
  logger?: (message: string) => void;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function usesPersistentStorage(): boolean {
  return Boolean(process.env.DATABASE_URL) || isSqliteStorageEnabled();
}

function buildStoredFilePath(configuredUploadsDir: string, fileName: string): string {
  if (path.isAbsolute(configuredUploadsDir)) {
    return path.join(configuredUploadsDir, fileName);
  }
  return path.join(configuredUploadsDir || "uploads", fileName);
}

function recoverOriginalName(fileName: string): string {
  const matched = fileName.match(/^[a-f0-9]{8}_\d+_(.+)$/i);
  return matched?.[1] || fileName;
}

async function hashFileSha256(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function writeBackfillMarker(
  markerPath: string,
  summary: Omit<UploadsBackfillSummary, "mode">,
): Promise<void> {
  const markerPayload = {
    version: 1,
    completedAt: new Date().toISOString(),
    ...summary,
  };
  await fsPromises.writeFile(markerPath, JSON.stringify(markerPayload, null, 2), "utf-8");
}

export async function runUploadsBackfill(options: UploadsBackfillOptions = {}): Promise<UploadsBackfillSummary> {
  const log = options.logger ?? ((message: string) => console.log(message));
  const configuredUploadsDir = process.env.UPLOADS_DIR || "uploads";
  const uploadsDir = path.resolve(process.cwd(), configuredUploadsDir);
  const markerPath = path.join(uploadsDir, BACKFILL_MARKER_FILENAME);
  const markerEnabled = usesPersistentStorage();
  const force = options.force ?? isEnabled(process.env.UPLOAD_BACKFILL_FORCE);

  if (isEnabled(process.env.UPLOAD_BACKFILL_DISABLED)) {
    const summary: UploadsBackfillSummary = {
      mode: "skipped_by_marker",
      uploadsDir,
      markerPath,
      scanned: 0,
      inserted: 0,
      skippedExisting: 0,
      skippedUnsupported: 0,
      errors: 0,
      durationMs: 0,
    };
    log("[uploads-backfill] disabled by UPLOAD_BACKFILL_DISABLED");
    return summary;
  }

  await fsPromises.mkdir(uploadsDir, { recursive: true });

  if (markerEnabled && !force) {
    try {
      await fsPromises.access(markerPath, fs.constants.F_OK);
      const summary: UploadsBackfillSummary = {
        mode: "skipped_by_marker",
        uploadsDir,
        markerPath,
        scanned: 0,
        inserted: 0,
        skippedExisting: 0,
        skippedUnsupported: 0,
        errors: 0,
        durationMs: 0,
      };
      log(`[uploads-backfill] marker exists, skip scanning (${markerPath})`);
      return summary;
    } catch {
      // marker missing, continue
    }
  }

  const startedAt = Date.now();
  let scanned = 0;
  let inserted = 0;
  let skippedExisting = 0;
  let skippedUnsupported = 0;
  let errors = 0;

  const entries = await fsPromises.readdir(uploadsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === BACKFILL_MARKER_FILENAME) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXCEL_EXTENSIONS.has(extension)) {
      skippedUnsupported += 1;
      continue;
    }

    scanned += 1;
    const absoluteFilePath = path.join(uploadsDir, entry.name);
    const storedFilePath = buildStoredFilePath(configuredUploadsDir, entry.name);

    try {
      const fileStat = await fsPromises.stat(absoluteFilePath);
      const fileHash = await hashFileSha256(absoluteFilePath);
      const existing = await storage.findFileByHash(fileHash);

      if (existing) {
        skippedExisting += 1;
        continue;
      }

      await storage.createUploadedFile({
        filePath: storedFilePath,
        originalName: recoverOriginalName(entry.name),
        fileHash,
        fileSize: fileStat.size,
      });
      inserted += 1;
    } catch (error) {
      errors += 1;
      log(`[uploads-backfill] failed for "${entry.name}": ${(error as Error).message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  const summaryBase = {
    uploadsDir,
    markerPath,
    scanned,
    inserted,
    skippedExisting,
    skippedUnsupported,
    errors,
    durationMs,
  };

  if (markerEnabled) {
    try {
      await writeBackfillMarker(markerPath, summaryBase);
    } catch (error) {
      log(`[uploads-backfill] failed to write marker: ${(error as Error).message}`);
    }
  }

  log(
    `[uploads-backfill] scanned=${scanned}, inserted=${inserted}, skippedExisting=${skippedExisting}, skippedUnsupported=${skippedUnsupported}, errors=${errors}, durationMs=${durationMs}`,
  );

  return {
    mode: "executed",
    ...summaryBase,
  };
}
