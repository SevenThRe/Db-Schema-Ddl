import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  type CreateWorkbookFromTemplateRequest,
  type CreateWorkbookFromTemplateResponse,
  type UploadedFile,
  type WorkbookTemplateValidation,
  type WorkbookTemplateVariant,
  workbookTemplateVariantSchema,
  workbookTemplateValidationSchema,
} from "@shared/schema";
import { detectExcelFormat } from "./excel";
import type { IStorage } from "../storage";

interface WorkbookTemplateServiceDeps {
  storage: Pick<IStorage, "createUploadedFile" | "findFileByHash">;
  uploadsDir: string;
}

export class WorkbookTemplateError extends Error {
  constructor(
    message: string,
    readonly code:
      | "template_not_found"
      | "template_asset_missing"
      | "template_round_trip_failed"
      | "template_duplicate_hash",
  ) {
    super(message);
    this.name = "WorkbookTemplateError";
  }
}

const TEMPLATE_VARIANTS = workbookTemplateVariantSchema.array().parse([
  {
    id: "format-a-table-sheet",
    label: "单表 Sheet 模板",
    description: "适合 1 张表对应 1 个 Sheet 的定义书结构，采用 Format A 标记布局。",
    parserFormat: "A",
    layout: "table_per_sheet",
    seedAssetName: "workbook-template-format-a.xlsx",
    suggestedFileName: "db-template-format-a.xlsx",
    starterSheetName: "テーブル定義",
  },
  {
    id: "format-b-multi-table-sheet",
    label: "多表 Sheet 模板",
    description: "适合同一 Sheet 内管理多张表的定义书结构，采用 Format B 标记布局。",
    parserFormat: "B",
    layout: "multi_table_per_sheet",
    seedAssetName: "workbook-template-format-b.xlsx",
    suggestedFileName: "db-template-format-b.xlsx",
    starterSheetName: "データベース定義書",
  },
]);

function resolveTemplateAssetPath(assetName: string): string {
  return process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, assetName)
    : path.resolve(process.cwd(), "attached_assets", assetName);
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
  return cleaned || "template.xlsx";
}

function createUploadPath(originalName: string, uploadsDir: string): string {
  const ext = path.extname(originalName) || ".xlsx";
  const base = path.basename(originalName, ext).replace(/\s+/g, "_");
  const unique = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  return path.join(uploadsDir, `${base}_${unique}${ext}`);
}

function stampWorkbookInstance(seedBuffer: Buffer, template: WorkbookTemplateVariant): Buffer {
  const workbook = XLSX.read(seedBuffer, { type: "buffer" });
  const token = `${template.id}:${Date.now()}:${crypto.randomUUID()}`;

  workbook.Props = {
    ...(workbook.Props ?? {}),
    Title: workbook.Props?.Title ?? template.label,
    Subject: token,
    Keywords: [workbook.Props?.Keywords, token].filter(Boolean).join(";"),
  };
  workbook.Custprops = {
    ...(workbook.Custprops ?? {}),
    TemplateInstanceId: token,
    TemplateVariantId: template.id,
  };

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}

function validateTemplateWorkbookBuffer(buffer: Buffer, template: WorkbookTemplateVariant): WorkbookTemplateValidation {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const checkedSheetName = workbook.SheetNames[0] ?? template.starterSheetName;
  const worksheet = workbook.Sheets[checkedSheetName];
  const data = worksheet ? (XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]) : [];
  const detected = detectExcelFormat(data);

  return workbookTemplateValidationSchema.parse({
    parserFormat: detected.format,
    expectedParserFormat: template.parserFormat,
    recognized: detected.format === template.parserFormat,
    workbookSheetCount: workbook.SheetNames.length,
    checkedSheetName,
    reasons: detected.reasons,
  });
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function listWorkbookTemplates(): WorkbookTemplateVariant[] {
  return TEMPLATE_VARIANTS.map((template) => ({ ...template }));
}

export function getWorkbookTemplateVariant(
  templateId: WorkbookTemplateVariant["id"],
): WorkbookTemplateVariant | undefined {
  const template = TEMPLATE_VARIANTS.find((item) => item.id === templateId);
  return template ? { ...template } : undefined;
}

export function validateWorkbookTemplateBuffer(
  buffer: Buffer,
  template: WorkbookTemplateVariant,
): WorkbookTemplateValidation {
  return validateTemplateWorkbookBuffer(buffer, template);
}

export async function createWorkbookFromTemplate(
  request: CreateWorkbookFromTemplateRequest,
  deps: WorkbookTemplateServiceDeps,
): Promise<CreateWorkbookFromTemplateResponse> {
  const template = getWorkbookTemplateVariant(request.templateId);
  if (!template) {
    throw new WorkbookTemplateError(`Unknown template: ${request.templateId}`, "template_not_found");
  }

  const assetPath = resolveTemplateAssetPath(template.seedAssetName);
  if (!fs.existsSync(assetPath)) {
    throw new WorkbookTemplateError(`Template asset is missing: ${template.seedAssetName}`, "template_asset_missing");
  }

  const originalName = sanitizeOriginalName(request.originalName || template.suggestedFileName);
  const seedBuffer = await fs.promises.readFile(assetPath);
  const outputBuffer = stampWorkbookInstance(seedBuffer, template);
  const validation = validateTemplateWorkbookBuffer(outputBuffer, template);

  if (!validation.recognized) {
    throw new WorkbookTemplateError(
      `Template round-trip validation failed for ${template.id}`,
      "template_round_trip_failed",
    );
  }

  const fileHash = sha256(outputBuffer);
  const duplicate = await deps.storage.findFileByHash(fileHash);
  if (duplicate) {
    throw new WorkbookTemplateError(
      `Template instance hash already exists for file ${duplicate.id}`,
      "template_duplicate_hash",
    );
  }

  await fs.promises.mkdir(deps.uploadsDir, { recursive: true });
  const filePath = createUploadPath(originalName, deps.uploadsDir);

  try {
    await fs.promises.writeFile(filePath, outputBuffer);
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
    };
  } catch (error) {
    await fs.promises.rm(filePath, { force: true });
    throw error;
  }
}

function normalizeUploadedFile(file: UploadedFile): UploadedFile {
  return {
    ...file,
    originalModifiedAt: file.originalModifiedAt ?? null,
    uploadedAt: file.uploadedAt ?? null,
  };
}
