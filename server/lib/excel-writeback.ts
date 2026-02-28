import * as fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execFile } from "child_process";
import * as XLSX from "xlsx";
import type { NameFixMode } from "@shared/schema";

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

function formatTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function runPythonCellOverwrite(
  workbookPath: string,
  changes: NameFixCellChange[],
): Promise<{ appliedCount: number; issues: ExcelWritebackIssue[] }> {
  return new Promise((resolve, reject) => {
    const bootstrap = async () => {
      const scriptPath = path.resolve(process.cwd(), "script", "xlsx-overwrite-cells.py");
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

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "name-fix-overwrite-"));
      const payloadPath = path.join(tempDir, "changes.json");
      await fs.writeFile(payloadPath, JSON.stringify(payload), "utf-8");

      execFile(
        "python",
        [scriptPath, "--workbook", workbookPath, "--changes", payloadPath],
        { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
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
                ? parsed.issues.map((item: any) => ({
                    sheetName: String(item.sheetName ?? ""),
                    sourceAddress: String(item.sourceAddress ?? ""),
                    reason: String(item.reason ?? ""),
                    tableIndex: Number(item.tableIndex ?? -1),
                    columnIndex:
                      item.columnIndex == null || item.columnIndex === ""
                        ? undefined
                        : Number(item.columnIndex),
                    target: item.target === "table" ? "table" : "column",
                  }))
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
  XLSX.read(buffer, { type: "buffer" });
}

function resolveOutputPath(
  sourcePath: string,
  mode: NameFixMode,
  targetDirectory?: string,
): { outputPath: string; backupPath?: string; extension: string } {
  const sourceDir = path.dirname(sourcePath);
  const extension = path.extname(sourcePath).toLowerCase() || ".xlsx";
  const outputDir = targetDirectory?.trim() || sourceDir;
  const baseName = path.basename(sourcePath, extension);
  const timestamp = formatTimestamp(new Date());

  if (mode === "overwrite") {
    return {
      outputPath: sourcePath,
      backupPath: path.join(sourceDir, `${baseName}.bak.${timestamp}${extension}`),
      extension,
    };
  }

  return {
    outputPath: path.join(outputDir, `${baseName}_fixed_${timestamp}${extension}`),
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

  if (options.mode === "overwrite" && extension !== ".xlsx") {
    throw new Error("Overwrite mode with style-preserving writeback only supports .xlsx files.");
  }

  let backupHash: string | undefined;
  if (backupPath) {
    await fs.copyFile(sourcePath, backupPath);
    backupHash = await computeFileHash(backupPath);
  }

  if (extension === ".xlsx") {
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
  const workbook = XLSX.read(sourceBuffer, { type: "buffer" });
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

  const bookType = extension === ".xls" ? "xls" : "xlsx";
  const outputBuffer = XLSX.write(workbook, {
    type: "buffer",
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
