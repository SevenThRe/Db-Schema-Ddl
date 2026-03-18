import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ddlImportExportRequestSchema, ddlImportExportResponseSchema } from "@shared/schema";
import type { InsertUploadedFile, UploadedFile } from "@shared/schema";
import { exportWorkbookFromDdlCatalog } from "../../server/lib/ddl-import/export-service";

function createStorageStub() {
  const created: UploadedFile[] = [];

  return {
    created,
    storage: {
      async createUploadedFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
        const record: UploadedFile = {
          id: created.length + 1,
          filePath: insertFile.filePath,
          originalName: insertFile.originalName,
          originalModifiedAt: insertFile.originalModifiedAt ?? null,
          fileHash: insertFile.fileHash,
          fileSize: insertFile.fileSize,
          uploadedAt: new Date().toISOString(),
        };
        created.push(record);
        return record;
      },
      async findFileByHash(hash: string): Promise<UploadedFile | undefined> {
        return created.find((item) => item.fileHash === hash);
      },
    },
  };
}

test("DDL export contracts remain MySQL-first and require explicit selected tables", () => {
  const request = ddlImportExportRequestSchema.parse({
    sourceMode: "paste",
    sqlText: "CREATE TABLE users (id BIGINT PRIMARY KEY);",
    templateId: "format-b-multi-table-sheet",
    selectedTableNames: ["users"],
  });

  assert.equal(request.templateId, "format-b-multi-table-sheet");
  assert.deepEqual(request.selectedTableNames, ["users"]);
});

test("DDL export response carries parser-backed workbook validation and remembered template", () => {
  const response = ddlImportExportResponseSchema.parse({
    file: {
      id: 99,
      filePath: "C:/tmp/ddl-import.xlsx",
      originalName: "ddl-import.xlsx",
      originalModifiedAt: null,
      fileHash: "abc123456789",
      fileSize: 1024,
      uploadedAt: new Date().toISOString(),
    },
    template: {
      id: "format-a-table-sheet",
      label: "单表 Sheet 模板",
      description: "desc",
      parserFormat: "A",
      layout: "table_per_sheet",
      seedAssetName: "workbook-template-format-a.xlsx",
      suggestedFileName: "db-template-format-a.xlsx",
      starterSheetName: "テーブル定義",
    },
    validation: {
      parserFormat: "A",
      expectedParserFormat: "A",
      recognized: true,
      workbookSheetCount: 1,
      checkedSheetName: "テーブル定義",
      reasons: [],
    },
    selectedTableNames: ["users"],
    issueSummary: {
      blockingCount: 0,
      confirmCount: 1,
      infoCount: 0,
    },
    rememberedTemplateId: "format-a-table-sheet",
  });

  assert.equal(response.validation.recognized, true);
  assert.equal(response.rememberedTemplateId, "format-a-table-sheet");
});

test("reviewed DDL can export a selected subset into official workbook templates", async () => {
  process.env.EXCEL_WORKER_DISABLED = "1";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ddl-import-export-phase3-"));
  const { storage } = createStorageStub();

  const exported = await exportWorkbookFromDdlCatalog(
    {
      catalog: {
        dialect: "mysql",
        databaseName: "ddl_import",
        tables: [
          {
            name: "users",
            comment: "user master",
            columns: [
              {
                name: "id",
                dataType: "BIGINT",
                columnType: "BIGINT",
                nullable: false,
                primaryKey: true,
                autoIncrement: true,
              },
              {
                name: "name",
                dataType: "VARCHAR",
                dataTypeArgs: "255",
                columnType: "VARCHAR(255)",
                nullable: false,
              },
            ],
            indexes: [],
            foreignKeys: [],
          },
          {
            name: "audit_logs",
            columns: [
              {
                name: "id",
                dataType: "BIGINT",
                columnType: "BIGINT",
                nullable: false,
                primaryKey: true,
              },
            ],
            indexes: [],
            foreignKeys: [],
          },
        ],
      },
      templateId: "format-b-multi-table-sheet",
      selectedTableNames: ["users"],
    },
    {
      storage,
      uploadsDir: tempDir,
      settings: {
        maxConsecutiveEmptyRows: 10,
        pkMarkers: ["〇"],
      },
    },
  );

  assert.equal(exported.template.id, "format-b-multi-table-sheet");
  assert.equal(exported.validation.recognized, true);
  assert.deepEqual(exported.selectedTableNames, ["users"]);
  await assert.doesNotReject(() => fs.access(exported.file.filePath));
});
