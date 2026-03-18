import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InsertUploadedFile, UploadedFile } from "@shared/schema";
import { createWorkbookFromTemplate, listWorkbookTemplates } from "../../server/lib/workbook-templates";

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

test("built-in workbook templates list both parser-backed variants", () => {
  const templates = listWorkbookTemplates();

  assert.equal(templates.length, 2);
  assert.deepEqual(
    templates.map((template) => template.id),
    ["format-a-table-sheet", "format-b-multi-table-sheet"],
  );
});

test("creating a workbook from the format-a template round-trips through parser detection", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "db-schema-template-a-"));
  const { storage } = createStorageStub();

  const created = await createWorkbookFromTemplate(
    {
      templateId: "format-a-table-sheet",
    },
    {
      storage,
      uploadsDir: tempDir,
    },
  );

  assert.equal(created.template.parserFormat, "A");
  assert.equal(created.validation.parserFormat, "A");
  assert.equal(created.validation.recognized, true);
  await assert.doesNotReject(() => fs.access(created.file.filePath));
});

test("creating the same built-in template twice yields distinct workbook hashes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "db-schema-template-b-"));
  const { storage } = createStorageStub();

  const first = await createWorkbookFromTemplate(
    {
      templateId: "format-b-multi-table-sheet",
      originalName: "blank-template.xlsx",
    },
    {
      storage,
      uploadsDir: tempDir,
    },
  );

  const second = await createWorkbookFromTemplate(
    {
      templateId: "format-b-multi-table-sheet",
      originalName: "blank-template.xlsx",
    },
    {
      storage,
      uploadsDir: tempDir,
    },
  );

  assert.equal(first.validation.recognized, true);
  assert.equal(second.validation.recognized, true);
  assert.notEqual(first.file.fileHash, second.file.fileHash);
});
