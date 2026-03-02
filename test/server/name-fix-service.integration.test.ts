import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as XLSX from "xlsx";

const LABEL_TABLE_INFO = "\u30c6\u30fc\u30d6\u30eb\u60c5\u5831"; // テーブル情報
const LABEL_DATABASE_DEFINITION = "\u30c7\u30fc\u30bf\u30d9\u30fc\u30b9\u5b9a\u7fa9\u66f8"; // データベース定義書
const LABEL_LOGICAL_TABLE = "\u8ad6\u7406\u30c6\u30fc\u30d6\u30eb\u540d"; // 論理テーブル名
const LABEL_PHYSICAL_TABLE = "\u7269\u7406\u30c6\u30fc\u30d6\u30eb\u540d"; // 物理テーブル名
const LABEL_LOGICAL = "\u8ad6\u7406\u540d"; // 論理名
const LABEL_PHYSICAL = "\u7269\u7406\u540d"; // 物理名
const LABEL_DATA_TYPE = "\u30c7\u30fc\u30bf\u578b"; // データ型
const execFileAsync = promisify(execFile);

interface NameFixModuleSet {
  initializeDatabase: () => Promise<void>;
  closeDatabase: () => void;
  shutdownExcelExecutor: () => Promise<void>;
  storage: {
    createUploadedFile: (file: {
      filePath: string;
      originalName: string;
      fileHash: string;
      fileSize: number;
    }) => Promise<{ id: number }>;
    deleteUploadedFile: (id: number) => Promise<void>;
  };
  previewNameFixPlan: (request: {
    fileIds: number[];
    scope: "current_sheet" | "selected_sheets" | "all_sheets";
    currentSheetName?: string;
    selectedSheetNames?: string[];
    selectedTableIndexes?: number[];
    conflictStrategy: "suffix_increment" | "hash_suffix" | "abort";
    reservedWordStrategy: "prefix" | "abort";
    lengthOverflowStrategy: "truncate_hash" | "abort";
    maxIdentifierLength: number;
  }) => Promise<any>;
  applyNameFixPlanById: (request: {
    planId: string;
    mode: "copy" | "overwrite" | "replace_download";
    includeReport?: boolean;
  }) => Promise<any>;
  rollbackNameFixJobById: (request: { jobId: string }) => Promise<any>;
  resolveNameFixDownloadTicket: (token: string) => Promise<{ outputPath: string; downloadFilename: string }>;
}

function createFixtureWorkbook(filePath: string): void {
  const rows: Array<Array<string | number>> = [
    [LABEL_TABLE_INFO],
    [LABEL_LOGICAL_TABLE, "User Logical"],
    [LABEL_PHYSICAL_TABLE, "User Table"],
    [],
    ["No", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE],
    [1, "User Id", "User ID", "varchar"],
    [2, "Group", "group", "varchar"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, filePath);
}

function createTwoTableFixtureWorkbook(filePath: string): void {
  const rows: Array<Array<string | number>> = [
    [LABEL_DATABASE_DEFINITION],
    ["No.", LABEL_LOGICAL_TABLE, LABEL_PHYSICAL_TABLE],
    [1, "User Logical", "User Table"],
    [],
    ["No.", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE],
    [1, "User Id", "User ID", "varchar"],
    [2, "Group", "group", "varchar"],
    [],
    ["No.", LABEL_LOGICAL_TABLE, LABEL_PHYSICAL_TABLE],
    [1, "Role Logical", "Role Table"],
    [],
    ["No.", LABEL_LOGICAL, LABEL_PHYSICAL, LABEL_DATA_TYPE],
    [1, "Role Id", "Role ID", "varchar"],
    [2, "Sort", "sort", "varchar"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, filePath);
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function readCell(filePath: string, sheetName: string, address: string): Promise<string> {
  const workbook = XLSX.read(await fs.readFile(filePath), { type: "buffer" });
  return String(workbook.Sheets[sheetName]?.[address]?.v ?? "");
}

async function readZipEntryHashes(filePath: string): Promise<Record<string, string>> {
  const pythonScript = [
    "import hashlib",
    "import json",
    "import sys",
    "import zipfile",
    "path = sys.argv[1]",
    "entries = {}",
    "with zipfile.ZipFile(path, 'r') as zf:",
    "    for name in sorted(zf.namelist()):",
    "        entries[name] = hashlib.sha256(zf.read(name)).hexdigest()",
    "print(json.dumps(entries))",
  ].join("\n");

  const { stdout, stderr } = await execFileAsync("python", ["-c", pythonScript, filePath], {
    windowsHide: true,
  });
  if (stderr && stderr.trim().length > 0) {
    throw new Error(`Failed to read zip entries: ${stderr.trim()}`);
  }
  return JSON.parse(stdout.trim()) as Record<string, string>;
}

const modules = {} as NameFixModuleSet;
let tempRoot = "";
let uploadsRoot = "";

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "name-fix-service-test-"));
  uploadsRoot = path.join(tempRoot, "uploads");
  process.env.ELECTRON_MODE = "true";
  process.env.DB_PATH = path.join(tempRoot, "db");
  process.env.UPLOADS_DIR = uploadsRoot;

  await fs.mkdir(uploadsRoot, { recursive: true });
  ({ initializeDatabase: modules.initializeDatabase } = await import("../../server/init-db"));
  ({ storage: modules.storage } = await import("../../server/storage"));
  ({
    previewNameFixPlan: modules.previewNameFixPlan,
    applyNameFixPlanById: modules.applyNameFixPlanById,
    rollbackNameFixJobById: modules.rollbackNameFixJobById,
    resolveNameFixDownloadTicket: modules.resolveNameFixDownloadTicket,
  } = await import("../../server/lib/name-fix-service"));
  ({ closeDatabase: modules.closeDatabase } = await import("../../server/db"));
  ({ shutdownExcelExecutor: modules.shutdownExcelExecutor } = await import("../../server/lib/excel-executor"));

  await modules.initializeDatabase();
});

after(async () => {
  await modules.shutdownExcelExecutor();
  modules.closeDatabase();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("name-fix integration: preview -> apply(copy) updates exported copy and keeps original", async () => {
  let uploadedFileId: number | null = null;
  try {
    const sourcePath = path.join(uploadsRoot, "copy-source.xlsx");
    createFixtureWorkbook(sourcePath);
    const fileHash = await hashFile(sourcePath);
    const fileSize = (await fs.stat(sourcePath)).size;
    const uploaded = await modules.storage.createUploadedFile({
      filePath: sourcePath,
      originalName: "copy-source.xlsx",
      fileHash,
      fileSize,
    });
    uploadedFileId = uploaded.id;

    const preview = await modules.previewNameFixPlan({
      fileIds: [uploaded.id],
      scope: "all_sheets",
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 64,
    });

    assert.equal(preview.summary.fileCount, 1);
    assert.ok(preview.summary.changedTableCount >= 1);
    assert.ok(preview.summary.changedColumnCount >= 1);
    assert.equal(preview.summary.blockingConflictCount, 0);

    const apply = await modules.applyNameFixPlanById({
      planId: preview.planId,
      mode: "copy",
      includeReport: true,
    });

    assert.equal(apply.status, "completed");
    assert.equal(apply.summary.successCount, 1);
    assert.equal(apply.summary.failedCount, 0);
    assert.ok(apply.files[0].outputPath);
    assert.ok(apply.files[0].reportJsonPath);
    assert.ok(apply.files[0].reportTextPath);

    const outputPath = apply.files[0].outputPath as string;
    assert.notEqual(outputPath, sourcePath);
    assert.equal(await readCell(sourcePath, "Sheet1", "B3"), "User Table");
    assert.equal(await readCell(outputPath, "Sheet1", "B3"), "user_table");
    assert.equal(await readCell(outputPath, "Sheet1", "C6"), "user_id");
    assert.equal(await readCell(outputPath, "Sheet1", "C7"), "n_group");
  } finally {
    if (uploadedFileId !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId);
    }
  }
});

test("name-fix integration: current_sheet selectedTableIndexes limits rename scope", async () => {
  let uploadedFileId: number | null = null;

  try {
    const sourcePath = path.join(uploadsRoot, "current-sheet-filter-source.xlsx");
    createTwoTableFixtureWorkbook(sourcePath);
    const uploaded = await modules.storage.createUploadedFile({
      filePath: sourcePath,
      originalName: "current-sheet-filter-source.xlsx",
      fileHash: await hashFile(sourcePath),
      fileSize: (await fs.stat(sourcePath)).size,
    });
    uploadedFileId = uploaded.id;

    const preview = await modules.previewNameFixPlan({
      fileIds: [uploaded.id],
      scope: "current_sheet",
      currentSheetName: "Sheet1",
      selectedTableIndexes: [1],
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 64,
    });

    assert.equal(preview.summary.fileCount, 1);
    assert.equal(preview.summary.tableCount, 1);
    assert.equal(preview.files[0].tableMappings.length, 1);
    assert.equal(preview.files[0].tableMappings[0].tableIndex, 1);

    const apply = await modules.applyNameFixPlanById({
      planId: preview.planId,
      mode: "copy",
      includeReport: false,
    });

    assert.equal(apply.status, "completed");
    assert.equal(apply.summary.successCount, 1);
    const outputPath = String(apply.files[0].outputPath ?? "");
    assert.ok(outputPath.length > 0);

    assert.equal(await readCell(outputPath, "Sheet1", "C3"), "User Table");
    assert.equal(await readCell(outputPath, "Sheet1", "C6"), "User ID");
    assert.equal(await readCell(outputPath, "Sheet1", "C7"), "group");
    assert.equal(await readCell(outputPath, "Sheet1", "C10"), "role_table");
    assert.equal(await readCell(outputPath, "Sheet1", "C13"), "role_id");
    assert.equal(await readCell(outputPath, "Sheet1", "C14"), "sort");
  } finally {
    if (uploadedFileId !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId);
    }
  }
});

test("name-fix integration: apply(copy) keeps non-worksheet zip entries unchanged", async () => {
  let uploadedFileId: number | null = null;

  try {
    const sourcePath = path.join(uploadsRoot, "copy-preserve-entries-source.xlsx");
    createFixtureWorkbook(sourcePath);
    const sourceHashes = await readZipEntryHashes(sourcePath);
    const uploaded = await modules.storage.createUploadedFile({
      filePath: sourcePath,
      originalName: "copy-preserve-entries-source.xlsx",
      fileHash: await hashFile(sourcePath),
      fileSize: (await fs.stat(sourcePath)).size,
    });
    uploadedFileId = uploaded.id;

    const preview = await modules.previewNameFixPlan({
      fileIds: [uploaded.id],
      scope: "all_sheets",
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 64,
    });

    const apply = await modules.applyNameFixPlanById({
      planId: preview.planId,
      mode: "copy",
      includeReport: false,
    });
    assert.equal(apply.status, "completed");
    assert.equal(apply.summary.successCount, 1);

    const outputPath = String(apply.files[0].outputPath ?? "");
    assert.ok(outputPath.length > 0);

    const outputHashes = await readZipEntryHashes(outputPath);
    assert.deepEqual(Object.keys(outputHashes), Object.keys(sourceHashes));

    const changedNonWorksheetEntries = Object.keys(sourceHashes).filter((entryName) => {
      if (entryName.startsWith("xl/worksheets/")) {
        return false;
      }
      return sourceHashes[entryName] !== outputHashes[entryName];
    });
    assert.deepEqual(
      changedNonWorksheetEntries,
      [],
      `Unexpected non-worksheet entry changes: ${changedNonWorksheetEntries.join(", ")}`,
    );

    const changedWorksheetEntries = Object.keys(sourceHashes).filter((entryName) => {
      if (!entryName.startsWith("xl/worksheets/")) {
        return false;
      }
      return sourceHashes[entryName] !== outputHashes[entryName];
    });
    assert.ok(
      changedWorksheetEntries.length >= 1,
      "Expected at least one worksheet entry to change after name-fix copy apply",
    );
  } finally {
    if (uploadedFileId !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId);
    }
  }
});

test("name-fix integration: apply(overwrite) + rollback restores original hash", async () => {
  let uploadedFileId: number | null = null;

  try {
    const sourcePath = path.join(uploadsRoot, "overwrite-source.xlsx");
    createFixtureWorkbook(sourcePath);
    const beforeHash = await hashFile(sourcePath);
    const fileSize = (await fs.stat(sourcePath)).size;
    const uploaded = await modules.storage.createUploadedFile({
      filePath: sourcePath,
      originalName: "overwrite-source.xlsx",
      fileHash: beforeHash,
      fileSize,
    });
    uploadedFileId = uploaded.id;

    const preview = await modules.previewNameFixPlan({
      fileIds: [uploaded.id],
      scope: "all_sheets",
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 64,
    });

    const apply = await modules.applyNameFixPlanById({
      planId: preview.planId,
      mode: "overwrite",
      includeReport: true,
    });

    assert.equal(apply.status, "completed");
    assert.equal(apply.summary.successCount, 1);
    assert.ok(apply.files[0].backupPath);
    assert.equal(await readCell(sourcePath, "Sheet1", "B3"), "user_table");
    const afterApplyHash = await hashFile(sourcePath);
    assert.notEqual(afterApplyHash, beforeHash);

    const rollback = await modules.rollbackNameFixJobById({ jobId: apply.jobId });
    assert.equal(rollback.success, true);
    assert.equal(rollback.restoredPath, sourcePath);

    const afterRollbackHash = await hashFile(sourcePath);
    assert.equal(afterRollbackHash, beforeHash);
  } finally {
    if (uploadedFileId !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId);
    }
  }
});

test("name-fix integration: replace_download returns token and download target", async () => {
  let uploadedFileId: number | null = null;

  try {
    const sourcePath = path.join(uploadsRoot, "replace-download-source.xlsx");
    createFixtureWorkbook(sourcePath);
    const sourceHash = await hashFile(sourcePath);
    const fileSize = (await fs.stat(sourcePath)).size;
    const uploaded = await modules.storage.createUploadedFile({
      filePath: sourcePath,
      originalName: "replace-download-source.xlsx",
      fileHash: sourceHash,
      fileSize,
    });
    uploadedFileId = uploaded.id;

    const preview = await modules.previewNameFixPlan({
      fileIds: [uploaded.id],
      scope: "all_sheets",
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 64,
    });

    const apply = await modules.applyNameFixPlanById({
      planId: preview.planId,
      mode: "replace_download",
      includeReport: true,
    });

    assert.equal(apply.status, "completed");
    assert.equal(apply.summary.successCount, 1);
    const token = apply.files[0].downloadToken as string;
    assert.ok(token);

    const ticket = await modules.resolveNameFixDownloadTicket(token);
    assert.ok(ticket.outputPath.endsWith(".xlsx"));
    assert.ok(ticket.downloadFilename.includes("_fixed"));
    assert.equal(await readCell(ticket.outputPath, "Sheet1", "B3"), "user_table");
    assert.equal(await readCell(sourcePath, "Sheet1", "B3"), "User Table");
  } finally {
    if (uploadedFileId !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId);
    }
  }
});

test("name-fix integration: replace_download multi-file returns bundle token", async () => {
  let uploadedFileId1: number | null = null;
  let uploadedFileId2: number | null = null;

  try {
    const sourcePath1 = path.join(uploadsRoot, "replace-download-bundle-1.xlsx");
    const sourcePath2 = path.join(uploadsRoot, "replace-download-bundle-2.xlsx");
    createFixtureWorkbook(sourcePath1);
    createFixtureWorkbook(sourcePath2);

    const uploaded1 = await modules.storage.createUploadedFile({
      filePath: sourcePath1,
      originalName: "replace-download-bundle-1.xlsx",
      fileHash: await hashFile(sourcePath1),
      fileSize: (await fs.stat(sourcePath1)).size,
    });
    const uploaded2 = await modules.storage.createUploadedFile({
      filePath: sourcePath2,
      originalName: "replace-download-bundle-2.xlsx",
      fileHash: await hashFile(sourcePath2),
      fileSize: (await fs.stat(sourcePath2)).size,
    });
    uploadedFileId1 = uploaded1.id;
    uploadedFileId2 = uploaded2.id;

    const preview = await modules.previewNameFixPlan({
      fileIds: [uploaded1.id, uploaded2.id],
      scope: "all_sheets",
      conflictStrategy: "suffix_increment",
      reservedWordStrategy: "prefix",
      lengthOverflowStrategy: "truncate_hash",
      maxIdentifierLength: 64,
    });

    const apply = await modules.applyNameFixPlanById({
      planId: preview.planId,
      mode: "replace_download",
      includeReport: true,
    });

    assert.equal(apply.status, "completed");
    assert.equal(apply.summary.successCount, 2);
    assert.ok(apply.downloadBundleToken);

    const bundle = await modules.resolveNameFixDownloadTicket(apply.downloadBundleToken as string);
    assert.ok(bundle.outputPath.endsWith(".zip"));
    assert.ok(bundle.downloadFilename.endsWith(".zip"));
  } finally {
    if (uploadedFileId1 !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId1);
    }
    if (uploadedFileId2 !== null) {
      await modules.storage.deleteUploadedFile(uploadedFileId2);
    }
  }
});
