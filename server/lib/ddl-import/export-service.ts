import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import type {
  DdlImportCatalog,
  DdlImportExportResponse,
  DdlImportTable,
  DdlSettings,
  InsertUploadedFile,
  UploadedFile,
  WorkbookTemplateValidation,
  WorkbookTemplateVariant,
} from "@shared/schema";
import { runParseWorkbookBundle } from "../excel-executor";
import {
  getWorkbookTemplateVariant,
  validateWorkbookTemplateBuffer,
} from "../workbook-templates";

interface ExportWorkbookFromDdlDeps {
  storage: {
    createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
    findFileByHash(hash: string): Promise<UploadedFile | undefined>;
  };
  uploadsDir: string;
  settings: Pick<DdlSettings, "maxConsecutiveEmptyRows" | "pkMarkers">;
}

export class DdlWorkbookExportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "template_not_found"
      | "empty_selection"
      | "missing_selected_tables"
      | "round_trip_failed"
      | "duplicate_hash",
  ) {
    super(message);
    this.name = "DdlWorkbookExportError";
  }
}

const FORMAT_A_HEADERS = ["No", "論理名", "物理名", "データ型", "Size", "Not Null", "PK", "備考"] as const;
const FORMAT_B_HEADERS = ["No.", "論理テーブル名", "物理テーブル名", "説明"] as const;
const MARKER_TRUE = "〇";
const AUTO_INCREMENT_NOTE = "AUTO_INCREMENT";

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function ensureExcelExtension(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed.toLowerCase().endsWith(".xlsx")) {
    return `${trimmed}.xlsx`;
  }
  return trimmed;
}

function sanitizeOriginalName(fileName: string): string {
  const normalized = ensureExcelExtension(fileName);
  const cleaned = normalized.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return cleaned || "ddl-import.xlsx";
}

function createUploadPath(originalName: string, uploadsDir: string): string {
  const ext = path.extname(originalName) || ".xlsx";
  const base = path.basename(originalName, ext).replace(/\s+/g, "_");
  const unique = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  return path.join(uploadsDir, `${base}_${unique}${ext}`);
}

function toSheetName(tableName: string, usedNames: Set<string>): string {
  const base = tableName
    .trim()
    .replace(/[:\\/?*\[\]]/g, "_")
    .slice(0, 31) || "table";
  let candidate = base;
  let index = 2;
  while (usedNames.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function normalizeWorkbookDataType(table: DdlImportTable, column: DdlImportTable["columns"][number]): {
  dataType: string;
  size?: string;
} {
  const normalized = column.dataType.trim().toLowerCase();
  if (column.dataTypeArgs) {
    return {
      dataType: normalized,
      size: column.dataTypeArgs,
    };
  }
  return {
    dataType: normalized,
  };
}

function buildCommentCell(table: DdlImportTable, column: DdlImportTable["columns"][number]): string {
  const segments: string[] = [];
  if (column.comment) {
    segments.push(column.comment);
  }
  if (column.autoIncrement) {
    segments.push(AUTO_INCREMENT_NOTE);
  }
  const relatedForeignKeys = table.foreignKeys.filter((foreignKey) =>
    foreignKey.columns.some((item) => item.columnName === column.name),
  );
  if (relatedForeignKeys.length > 0) {
    segments.push(...relatedForeignKeys.map((foreignKey) =>
      `FK ${foreignKey.name}: ${column.name} -> ${foreignKey.referencedTableName}`,
    ));
  }
  return segments.join("\n");
}

function buildFormatAWorksheet(table: DdlImportTable): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ["テーブル情報"],
    [],
    ["論理テーブル名", table.name],
    ["物理テーブル名", table.name],
    [],
    ["カラム情報"],
    [...FORMAT_A_HEADERS],
    ...table.columns.map((column, index) => {
      const normalizedType = normalizeWorkbookDataType(table, column);
      return [
        index + 1,
        column.name,
        column.name,
        normalizedType.dataType,
        normalizedType.size ?? "",
        column.nullable ? "" : MARKER_TRUE,
        column.primaryKey ? MARKER_TRUE : "",
        buildCommentCell(table, column),
      ];
    }),
  ];

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildFormatBWorksheet(tables: DdlImportTable[]): XLSX.WorkSheet {
  const rows: unknown[][] = [["データベース定義書"], []];

  tables.forEach((table, tableIndex) => {
    if (tableIndex > 0) {
      rows.push([]);
    }

    rows.push([...FORMAT_B_HEADERS]);
    rows.push([tableIndex + 1, table.name, table.name, table.comment ?? ""]);
    rows.push([]);
    rows.push([...FORMAT_A_HEADERS]);
    rows.push(
      ...table.columns.map((column, columnIndex) => {
        const normalizedType = normalizeWorkbookDataType(table, column);
        return [
          columnIndex + 1,
          column.name,
          column.name,
          normalizedType.dataType,
          normalizedType.size ?? "",
          column.nullable ? "" : MARKER_TRUE,
          column.primaryKey ? MARKER_TRUE : "",
          buildCommentCell(table, column),
        ];
      }),
    );
  });

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildWorkbookBuffer(
  template: WorkbookTemplateVariant,
  tables: DdlImportTable[],
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (template.id === "format-a-table-sheet") {
    const usedNames = new Set<string>();
    tables.forEach((table) => {
      XLSX.utils.book_append_sheet(
        workbook,
        buildFormatAWorksheet(table),
        toSheetName(table.name, usedNames),
      );
    });
  } else {
    XLSX.utils.book_append_sheet(
      workbook,
      buildFormatBWorksheet(tables),
      template.starterSheetName,
    );
  }

  workbook.Props = {
    Title: `DDL Import - ${template.label}`,
    Subject: template.id,
    Author: "Db-Schema-Ddl",
  };

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}

function collectParsedTableNames(bundle: Awaited<ReturnType<typeof runParseWorkbookBundle>>): Set<string> {
  return new Set(
    Object.values(bundle.tablesBySheet)
      .flat()
      .map((table) => table.physicalTableName)
      .filter((name): name is string => Boolean(name && name.trim())),
  );
}

async function validateExportedWorkbookBuffer(args: {
  buffer: Buffer;
  template: WorkbookTemplateVariant;
  selectedTables: DdlImportTable[];
  settings: Pick<DdlSettings, "maxConsecutiveEmptyRows" | "pkMarkers">;
}): Promise<WorkbookTemplateValidation> {
  const validation = validateWorkbookTemplateBuffer(args.buffer, args.template);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ddl-import-export-"));
  const workbookPath = path.join(tempDir, "round-trip.xlsx");

  try {
    await fs.writeFile(workbookPath, args.buffer);
    const bundle = await runParseWorkbookBundle(
      workbookPath,
      {
        maxConsecutiveEmptyRows: args.settings.maxConsecutiveEmptyRows,
        pkMarkers: args.settings.pkMarkers,
      },
      sha256(args.buffer),
    );
    const parsedTableNames = collectParsedTableNames(bundle);
    const missingTableNames = args.selectedTables
      .map((table) => table.name)
      .filter((tableName) => !parsedTableNames.has(tableName));

    if (missingTableNames.length > 0) {
      return {
        ...validation,
        recognized: false,
        reasons: [...validation.reasons, `round_trip_missing_tables:${missingTableNames.join(",")}`],
      };
    }

    return validation;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeUploadedFile(file: UploadedFile): UploadedFile {
  return {
    ...file,
    originalModifiedAt: file.originalModifiedAt ?? null,
    uploadedAt: file.uploadedAt ?? null,
  };
}

export async function exportWorkbookFromDdlCatalog(
  args: {
    catalog: DdlImportCatalog;
    templateId: WorkbookTemplateVariant["id"];
    selectedTableNames: string[];
    originalName?: string;
  },
  deps: ExportWorkbookFromDdlDeps,
): Promise<Pick<DdlImportExportResponse, "file" | "template" | "validation" | "selectedTableNames">> {
  const template = getWorkbookTemplateVariant(args.templateId);
  if (!template) {
    throw new DdlWorkbookExportError(`Unknown template: ${args.templateId}`, "template_not_found");
  }

  const selectedTables = args.catalog.tables.filter((table) => args.selectedTableNames.includes(table.name));
  if (selectedTables.length === 0) {
    throw new DdlWorkbookExportError("Select at least one parsed table to export.", "empty_selection");
  }

  if (selectedTables.length !== args.selectedTableNames.length) {
    const missing = args.selectedTableNames.filter(
      (tableName) => !selectedTables.some((table) => table.name === tableName),
    );
    throw new DdlWorkbookExportError(
      `Some selected tables are not available in the parsed catalog: ${missing.join(", ")}`,
      "missing_selected_tables",
    );
  }

  const outputBuffer = buildWorkbookBuffer(template, selectedTables);
  const validation = await validateExportedWorkbookBuffer({
    buffer: outputBuffer,
    template,
    selectedTables,
    settings: deps.settings,
  });

  if (!validation.recognized) {
    throw new DdlWorkbookExportError(
      `Round-trip validation failed for ${template.id}: ${validation.reasons.join(", ")}`,
      "round_trip_failed",
    );
  }

  const fileHash = sha256(outputBuffer);
  const duplicate = await deps.storage.findFileByHash(fileHash);
  if (duplicate) {
    throw new DdlWorkbookExportError(
      `Exported workbook hash already exists for file ${duplicate.id}`,
      "duplicate_hash",
    );
  }

  await fs.mkdir(deps.uploadsDir, { recursive: true });
  const originalName = sanitizeOriginalName(args.originalName || template.suggestedFileName);
  const filePath = createUploadPath(originalName, deps.uploadsDir);

  try {
    await fs.writeFile(filePath, outputBuffer);
    const file = await deps.storage.createUploadedFile({
      filePath,
      originalName,
      fileHash,
      fileSize: outputBuffer.length,
    });

    return {
      file: normalizeUploadedFile(file),
      template,
      validation,
      selectedTableNames: selectedTables.map((table) => table.name),
    };
  } catch (error) {
    await fs.rm(filePath, { force: true });
    throw error;
  }
}
