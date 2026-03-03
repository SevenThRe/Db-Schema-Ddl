import * as fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execFile } from "child_process";
import * as XLSX from "xlsx";
import type { NameFixMode } from "@shared/schema";

const EXCEL_WRITEBACK_DEFAULTS = {
  timestampMonthOffset: 1,
  timestampPadLength: 2,
  timestampSeparator: "_",
  hashAlgorithm: "sha256",
  hashEncoding: "hex",
  pythonExecutable: "python",
  pythonScriptRelativePath: ["script", "xlsx-overwrite-cells.py"],
  pythonWorkbookArg: "--workbook",
  pythonChangesArg: "--changes",
  pythonTempPrefix: "name-fix-overwrite-",
  pythonPayloadFilename: "changes.json",
  pythonMaxBufferBytes: 10 * 1024 * 1024,
  pythonWriteEncoding: "utf-8",
  defaultExtension: ".xlsx",
  overwriteUnsupportedMessage: "Overwrite mode with style-preserving writeback only supports .xlsx files.",
  backupFilenameSeparator: ".bak.",
  fixedFilenameSuffix: "_fixed_",
  workbookReadType: "buffer",
  workbookWriteType: "buffer",
  xlsxBookType: "xlsx",
  xlsBookType: "xls",
} as const;

export interface NameFixCellChange {
  sheetName: string;
  row: number;
  col: number;
  sourceAddress?: string;
  beforeName: string;
  afterName: string;
  tableIndex: number;
  columnIndex?: number;
  target: "table" | "column";
}

export interface ExcelWritebackOptions {
  mode: NameFixMode;
  targetDirectory?: string;
}

export interface ExcelWritebackIssue {
  sheetName: string;
  sourceAddress: string;
  reason: string;
  tableIndex: number;
  columnIndex?: number;
  target: "table" | "column";
}

export interface ExcelWritebackResult {
  outputPath: string;
  backupPath?: string;
  backupHash?: string;
  appliedCount: number;
  skippedCount: number;
  issues: ExcelWritebackIssue[];
}

interface RawExcelWritebackIssue {
  sheetName?: unknown;
  sourceAddress?: unknown;
  reason?: unknown;
  tableIndex?: unknown;
  columnIndex?: unknown;
  target?: unknown;
}

function toWritebackIssue(item: unknown): ExcelWritebackIssue {
  const raw = (item ?? {}) as RawExcelWritebackIssue;
  return {
    sheetName: String(raw.sheetName ?? ""),
    sourceAddress: String(raw.sourceAddress ?? ""),
    reason: String(raw.reason ?? ""),
    tableIndex: Number(raw.tableIndex ?? -1),
    columnIndex:
      raw.columnIndex == null || raw.columnIndex === ""
        ? undefined
        : Number(raw.columnIndex),
    target: raw.target === "table" ? "table" : "column",
  };
}

function formatTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + EXCEL_WRITEBACK_DEFAULTS.timestampMonthOffset).padStart(
    EXCEL_WRITEBACK_DEFAULTS.timestampPadLength,
    "0",
  );
  const dd = String(date.getDate()).padStart(EXCEL_WRITEBACK_DEFAULTS.timestampPadLength, "0");
  const hh = String(date.getHours()).padStart(EXCEL_WRITEBACK_DEFAULTS.timestampPadLength, "0");
  const mi = String(date.getMinutes()).padStart(EXCEL_WRITEBACK_DEFAULTS.timestampPadLength, "0");
  const ss = String(date.getSeconds()).padStart(EXCEL_WRITEBACK_DEFAULTS.timestampPadLength, "0");
  return `${yyyy}${mm}${dd}${EXCEL_WRITEBACK_DEFAULTS.timestampSeparator}${hh}${mi}${ss}`;
}

async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto
    .createHash(EXCEL_WRITEBACK_DEFAULTS.hashAlgorithm)
    .update(buffer)
    .digest(EXCEL_WRITEBACK_DEFAULTS.hashEncoding);
}

function runPythonCellOverwrite(
  workbookPath: string,
  changes: NameFixCellChange[],
): Promise<{ appliedCount: number; issues: ExcelWritebackIssue[] }> {
  return new Promise((resolve, reject) => {
    const bootstrap = async () => {
      const scriptPath = path.resolve(process.cwd(), ...EXCEL_WRITEBACK_DEFAULTS.pythonScriptRelativePath);
      const payload = {
        changes: changes.map((change) => ({
          sheetName: change.sheetName,
          sourceAddress: change.sourceAddress ?? XLSX.utils.encode_cell({ r: change.row, c: change.col }),
          beforeName: change.beforeName,
          afterName: change.afterName,
          tableIndex: change.tableIndex,
          columnIndex: change.columnIndex,
          target: change.target,
        })),
      };

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), EXCEL_WRITEBACK_DEFAULTS.pythonTempPrefix));
      const payloadPath = path.join(tempDir, EXCEL_WRITEBACK_DEFAULTS.pythonPayloadFilename);
      await fs.writeFile(payloadPath, JSON.stringify(payload), EXCEL_WRITEBACK_DEFAULTS.pythonWriteEncoding);

      execFile(
        EXCEL_WRITEBACK_DEFAULTS.pythonExecutable,
        [
          scriptPath,
          EXCEL_WRITEBACK_DEFAULTS.pythonWorkbookArg,
          workbookPath,
          EXCEL_WRITEBACK_DEFAULTS.pythonChangesArg,
          payloadPath,
        ],
        { windowsHide: true, maxBuffer: EXCEL_WRITEBACK_DEFAULTS.pythonMaxBufferBytes },
        async (error, stdout, stderr) => {
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch {
            // best effort temp cleanup
          }

          if (error) {
            const message = stderr?.trim() || stdout?.trim() || error.message;
            reject(new Error(`Python overwrite failed: ${message}`));
            return;
          }

          try {
            const parsed = JSON.parse(stdout.trim());
            resolve({
              appliedCount: Number(parsed.appliedCount ?? 0),
              issues: Array.isArray(parsed.issues)
                ? parsed.issues.map((item: unknown) => toWritebackIssue(item))
                : [],
            });
          } catch (parseError) {
            reject(
              new Error(
                `Python overwrite returned invalid JSON: ${(parseError as Error).message}. raw=${stdout}`,
              ),
            );
          }
        },
      );
    };

    void bootstrap().catch((error) => {
      reject(error);
    });
  });
}

async function ensureWorkbookReadable(workbookPath: string): Promise<void> {
  const buffer = await fs.readFile(workbookPath);
  XLSX.read(buffer, { type: EXCEL_WRITEBACK_DEFAULTS.workbookReadType });
}

function resolveOutputPath(
  sourcePath: string,
  mode: NameFixMode,
  targetDirectory?: string,
): { outputPath: string; backupPath?: string; extension: string } {
  const sourceDir = path.dirname(sourcePath);
  const extension = path.extname(sourcePath).toLowerCase() || EXCEL_WRITEBACK_DEFAULTS.defaultExtension;
  const outputDir = targetDirectory?.trim() || sourceDir;
  const baseName = path.basename(sourcePath, extension);
  const timestamp = formatTimestamp(new Date());

  if (mode === "overwrite") {
    return {
      outputPath: sourcePath,
      backupPath: path.join(
        sourceDir,
        `${baseName}${EXCEL_WRITEBACK_DEFAULTS.backupFilenameSeparator}${timestamp}${extension}`,
      ),
      extension,
    };
  }

  return {
    outputPath: path.join(
      outputDir,
      `${baseName}${EXCEL_WRITEBACK_DEFAULTS.fixedFilenameSuffix}${timestamp}${extension}`,
    ),
    extension,
  };
}

export async function applyExcelNameChanges(
  sourcePath: string,
  changes: NameFixCellChange[],
  options: ExcelWritebackOptions,
): Promise<ExcelWritebackResult> {
  const { outputPath, backupPath, extension } = resolveOutputPath(
    sourcePath,
    options.mode,
    options.targetDirectory,
  );

  if (options.mode !== "overwrite") {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
  }

  if (options.mode === "overwrite" && extension !== EXCEL_WRITEBACK_DEFAULTS.defaultExtension) {
    throw new Error(EXCEL_WRITEBACK_DEFAULTS.overwriteUnsupportedMessage);
  }

  let backupHash: string | undefined;
  if (backupPath) {
    await fs.copyFile(sourcePath, backupPath);
    backupHash = await computeFileHash(backupPath);
  }

  if (extension === EXCEL_WRITEBACK_DEFAULTS.defaultExtension) {
    const patchTargetPath = options.mode === "overwrite" ? sourcePath : outputPath;

    if (options.mode !== "overwrite") {
      await fs.copyFile(sourcePath, outputPath);
    }

    try {
      const pythonResult = await runPythonCellOverwrite(patchTargetPath, changes);
      await ensureWorkbookReadable(patchTargetPath);
      return {
        outputPath: patchTargetPath,
        backupPath,
        backupHash,
        appliedCount: pythonResult.appliedCount,
        skippedCount: pythonResult.issues.length,
        issues: pythonResult.issues,
      };
    } catch (error) {
      if (options.mode !== "overwrite") {
        await fs.rm(outputPath, { force: true });
      } else if (backupPath) {
        await fs.copyFile(backupPath, sourcePath);
      }
      throw error;
    }
  }

  const sourceBuffer = await fs.readFile(sourcePath);
  const workbook = XLSX.read(sourceBuffer, { type: EXCEL_WRITEBACK_DEFAULTS.workbookReadType });
  const issues: ExcelWritebackIssue[] = [];
  let appliedCount = 0;

  for (const change of changes) {
    const worksheet = workbook.Sheets[change.sheetName];
    const address = change.sourceAddress || XLSX.utils.encode_cell({ r: change.row, c: change.col });
    if (!worksheet) {
      issues.push({
        sheetName: change.sheetName,
        sourceAddress: address,
        reason: "Worksheet not found in workbook",
        tableIndex: change.tableIndex,
        columnIndex: change.columnIndex,
        target: change.target,
      });
      continue;
    }

    const currentValue = worksheet[address] ? String(worksheet[address].v ?? "") : "";
    if (currentValue.trim() !== change.beforeName.trim() && currentValue.trim() !== change.afterName.trim()) {
      issues.push({
        sheetName: change.sheetName,
        sourceAddress: address,
        reason: `Cell value mismatch. expected="${change.beforeName}" actual="${currentValue}"`,
        tableIndex: change.tableIndex,
        columnIndex: change.columnIndex,
        target: change.target,
      });
      continue;
    }

    worksheet[address] = {
      ...(worksheet[address] ?? {}),
      t: "s",
      v: change.afterName,
      w: change.afterName,
    };
    appliedCount += 1;
  }

  const bookType =
    extension === `.${EXCEL_WRITEBACK_DEFAULTS.xlsBookType}`
      ? EXCEL_WRITEBACK_DEFAULTS.xlsBookType
      : EXCEL_WRITEBACK_DEFAULTS.xlsxBookType;
  const outputBuffer = XLSX.write(workbook, {
    type: EXCEL_WRITEBACK_DEFAULTS.workbookWriteType,
    bookType,
  }) as Buffer;

  try {
    await fs.writeFile(outputPath, outputBuffer);
  } catch (error) {
    if (backupPath) {
      await fs.copyFile(backupPath, sourcePath);
    }
    throw error;
  }

  return {
    outputPath,
    backupPath,
    backupHash,
    appliedCount,
    skippedCount: issues.length,
    issues,
  };
}
