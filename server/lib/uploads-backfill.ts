import crypto from "crypto";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { isSqliteStorageEnabled } from "../app-config";
import { storage } from "../storage";

const UPLOADS_BACKFILL_DEFAULTS = {
  supportedExtensions: [".xlsx", ".xls"],
  markerFilename: ".uploads-backfill.done.json",
  uploadsDir: "uploads",
  markerVersion: 1,
  forceTrueValues: ["1", "true"],
  hashAlgorithm: "sha256",
  hashEncoding: "hex",
  recoveredNamePattern: /^[a-f0-9]{8}_\d+_(.+)$/i,
  disabledLogMessage: "[uploads-backfill] disabled by UPLOAD_BACKFILL_DISABLED",
  skipByMarkerLogPrefix: "[uploads-backfill] marker exists, skip scanning",
  fileFailedLogPrefix: "[uploads-backfill] failed for",
  markerWriteFailedLogPrefix: "[uploads-backfill] failed to write marker",
  summaryLogPrefix: "[uploads-backfill]",
  markerFileEncoding: "utf-8",
} as const;

const SUPPORTED_EXCEL_EXTENSIONS = new Set<string>(UPLOADS_BACKFILL_DEFAULTS.supportedExtensions);
const BACKFILL_MARKER_FILENAME = UPLOADS_BACKFILL_DEFAULTS.markerFilename;
const BACKFILL_TRUE_VALUES = new Set<string>(UPLOADS_BACKFILL_DEFAULTS.forceTrueValues);

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
  return BACKFILL_TRUE_VALUES.has(String(value ?? ""));
}

function usesPersistentStorage(): boolean {
  return Boolean(process.env.DATABASE_URL) || isSqliteStorageEnabled();
}

function buildStoredFilePath(configuredUploadsDir: string, fileName: string): string {
  if (path.isAbsolute(configuredUploadsDir)) {
    return path.join(configuredUploadsDir, fileName);
  }
  return path.join(configuredUploadsDir || UPLOADS_BACKFILL_DEFAULTS.uploadsDir, fileName);
}

function recoverOriginalName(fileName: string): string {
  const matched = fileName.match(UPLOADS_BACKFILL_DEFAULTS.recoveredNamePattern);
  return matched?.[1] || fileName;
}

async function hashFileSha256(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash(UPLOADS_BACKFILL_DEFAULTS.hashAlgorithm);
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest(UPLOADS_BACKFILL_DEFAULTS.hashEncoding)));
    stream.on("error", reject);
  });
}

async function writeBackfillMarker(
  markerPath: string,
  summary: Omit<UploadsBackfillSummary, "mode">,
): Promise<void> {
  const markerPayload = {
    version: UPLOADS_BACKFILL_DEFAULTS.markerVersion,
    completedAt: new Date().toISOString(),
    ...summary,
  };
  await fsPromises.writeFile(
    markerPath,
    JSON.stringify(markerPayload, null, 2),
    UPLOADS_BACKFILL_DEFAULTS.markerFileEncoding,
  );
}

export async function runUploadsBackfill(options: UploadsBackfillOptions = {}): Promise<UploadsBackfillSummary> {
  const log = options.logger ?? ((message: string) => console.log(message));
  const configuredUploadsDir = process.env.UPLOADS_DIR || UPLOADS_BACKFILL_DEFAULTS.uploadsDir;
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
    log(UPLOADS_BACKFILL_DEFAULTS.disabledLogMessage);
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
      log(`${UPLOADS_BACKFILL_DEFAULTS.skipByMarkerLogPrefix} (${markerPath})`);
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
      log(`${UPLOADS_BACKFILL_DEFAULTS.fileFailedLogPrefix} "${entry.name}": ${(error as Error).message}`);
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
      log(`${UPLOADS_BACKFILL_DEFAULTS.markerWriteFailedLogPrefix}: ${(error as Error).message}`);
    }
  }

  log(
    `${UPLOADS_BACKFILL_DEFAULTS.summaryLogPrefix} scanned=${scanned}, inserted=${inserted}, skippedExisting=${skippedExisting}, skippedUnsupported=${skippedUnsupported}, errors=${errors}, durationMs=${durationMs}`,
  );

  return {
    mode: "executed",
    ...summaryBase,
  };
}
