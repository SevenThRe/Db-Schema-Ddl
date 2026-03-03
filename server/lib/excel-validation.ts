import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { APP_DEFAULTS } from "@shared/config";

export type ExcelValidationCode =
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "INVALID_EXTENSION"
  | "INVALID_WORKBOOK"
  | "EMPTY_WORKBOOK"
  | "SHEET_TOO_LARGE";

export interface ExcelValidationIssue {
  code: ExcelValidationCode;
  message: string;
  params?: Record<string, string | number>;
}

export interface ExcelValidationOptions {
  maxFileSizeMb: number;
  maxRowsPerSheet: number;
  allowedExtensions: string[];
}

export interface ExcelValidationResult {
  valid: boolean;
  fileSizeBytes: number;
  sheetCount: number;
  issues: ExcelValidationIssue[];
}

const DEFAULT_VALIDATION_OPTIONS: ExcelValidationOptions = {
  maxFileSizeMb: APP_DEFAULTS.excel.maxFileSizeMb,
  maxRowsPerSheet: APP_DEFAULTS.excel.maxRowsPerSheet,
  allowedExtensions: [".xlsx", ".xls"],
};

export class ExcelValidationError extends Error {
  readonly issues: ExcelValidationIssue[];

  constructor(message: string, issues: ExcelValidationIssue[]) {
    super(message);
    this.name = "ExcelValidationError";
    this.issues = issues;
  }
}

function resolveOptions(options?: Partial<ExcelValidationOptions>): ExcelValidationOptions {
  return {
    ...DEFAULT_VALIDATION_OPTIONS,
    ...options,
  };
}

export function validateExcelFile(
  filePath: string,
  options?: Partial<ExcelValidationOptions>,
): ExcelValidationResult {
  const resolved = resolveOptions(options);
  const issues: ExcelValidationIssue[] = [];

  if (!fs.existsSync(filePath)) {
    issues.push({
      code: "FILE_NOT_FOUND",
      message: "File does not exist",
      params: { filePath },
    });
    return {
      valid: false,
      fileSizeBytes: 0,
      sheetCount: 0,
      issues,
    };
  }

  const stat = fs.statSync(filePath);
  const maxFileSizeBytes = resolved.maxFileSizeMb * 1024 * 1024;
  if (stat.size > maxFileSizeBytes) {
    issues.push({
      code: "FILE_TOO_LARGE",
      message: `Excel file exceeds ${resolved.maxFileSizeMb}MB`,
      params: {
        fileSizeBytes: stat.size,
        maxFileSizeBytes,
      },
    });
  }

  const extension = path.extname(filePath).toLowerCase();
  if (!resolved.allowedExtensions.includes(extension)) {
    issues.push({
      code: "INVALID_EXTENSION",
      message: "File extension must be .xlsx or .xls",
      params: { extension },
    });
  }

  let workbook: XLSX.WorkBook | null = null;
  try {
    const buffer = fs.readFileSync(filePath);
    workbook = XLSX.read(buffer, {
      type: "buffer",
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false,
    });
  } catch (error) {
    issues.push({
      code: "INVALID_WORKBOOK",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (workbook && workbook.SheetNames.length === 0) {
    issues.push({
      code: "EMPTY_WORKBOOK",
      message: "Workbook has no sheets",
    });
  }

  if (workbook) {
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        continue;
      }
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      if (data.length > resolved.maxRowsPerSheet) {
        issues.push({
          code: "SHEET_TOO_LARGE",
          message: `Sheet "${sheetName}" exceeds row limit (${resolved.maxRowsPerSheet})`,
          params: {
            sheetName,
            rows: data.length,
            maxRows: resolved.maxRowsPerSheet,
          },
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    fileSizeBytes: stat.size,
    sheetCount: workbook?.SheetNames.length ?? 0,
    issues,
  };
}

export function assertValidExcelFile(
  filePath: string,
  options?: Partial<ExcelValidationOptions>,
): ExcelValidationResult {
  const result = validateExcelFile(filePath, options);
  if (!result.valid) {
    const summary = result.issues.map((issue) => `${issue.code}:${issue.message}`).join("; ");
    throw new ExcelValidationError(`Excel validation failed: ${summary}`, result.issues);
  }
  return result;
}

