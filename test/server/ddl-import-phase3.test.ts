import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ddlImportPreviewRequestSchema, ddlImportPreviewResponseSchema } from "@shared/schema";
import { parseMysqlDdlToRawDatabase } from "../../server/lib/ddl-import/parser-adapter";
import { normalizeImportedDdl } from "../../server/lib/ddl-import/normalize";
import { collectDdlImportIssues } from "../../server/lib/ddl-import/issues";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("DDL import preview contracts support pasted SQL and uploaded file source modes", () => {
  const pasted = ddlImportPreviewRequestSchema.parse({
    sourceMode: "paste",
    sqlText: "CREATE TABLE users (id BIGINT PRIMARY KEY);",
  });

  const uploaded = ddlImportPreviewRequestSchema.parse({
    sourceMode: "upload",
    fileName: "schema.sql",
    sqlText: "CREATE TABLE orgs (id BIGINT PRIMARY KEY);",
  });

  assert.equal(pasted.sourceMode, "paste");
  assert.equal(uploaded.sourceMode, "upload");
  assert.equal(uploaded.fileName, "schema.sql");
});

test("DDL import preview response distinguishes blocking and confirmable lossy issues", () => {
  const preview = ddlImportPreviewResponseSchema.parse({
    sourceMode: "paste",
    sourceSql: "CREATE TABLE users (id BIGINT PRIMARY KEY);",
    catalog: {
      dialect: "mysql",
      databaseName: "ddl_import",
      tables: [
        {
          name: "users",
          columns: [
            {
              name: "id",
              dataType: "BIGINT",
              columnType: "BIGINT",
              nullable: false,
              primaryKey: true,
            },
          ],
        },
      ],
    },
    issues: [
      {
        severity: "blocking",
        kind: "workbook_inexpressible",
        entityKey: "column:users.generated_col",
        tableName: "users",
        columnName: "generated_col",
        message: "Generated columns cannot be exported safely.",
      },
      {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: "index:users.fulltext_idx",
        tableName: "users",
        constraintName: "fulltext_idx",
        message: "FULLTEXT index metadata is lossy.",
      },
    ],
    issueSummary: {
      blockingCount: 1,
      confirmCount: 1,
      infoCount: 0,
    },
    selectableTableNames: ["users"],
    rememberedTemplateId: "format-a-table-sheet",
  });

  assert.equal(preview.issueSummary.blockingCount, 1);
  assert.equal(preview.issueSummary.confirmCount, 1);
  assert.equal(preview.selectableTableNames[0], "users");
});

test("phase 3 shared contracts expose DDL import preview and export routes", async () => {
  const schemaSource = await read("shared/schema.ts");
  const routesSource = await read("shared/routes.ts");
  const hooksSource = await read("client/src/hooks/use-ddl.ts");

  assert.match(schemaSource, /ddlImportPreviewRequestSchema/);
  assert.match(schemaSource, /ddlImportExportRequestSchema/);
  assert.match(schemaSource, /ddlImportIssueSchema/);
  assert.match(schemaSource, /ddlImportTemplatePreference/);

  assert.match(routesSource, /previewImport:/);
  assert.match(routesSource, /exportWorkbook:/);

  assert.match(hooksSource, /usePreviewDdlImport/);
  assert.match(hooksSource, /useExportWorkbookFromDdl/);
});

test("MySQL DDL preview parser normalizes supported CREATE TABLE structures", () => {
  const raw = parseMysqlDdlToRawDatabase(`
    CREATE TABLE users (
      id BIGINT NOT NULL AUTO_INCREMENT,
      org_id BIGINT,
      email VARCHAR(255) NOT NULL DEFAULT 'x',
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_org (org_id),
      CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES orgs(id)
    ) COMMENT='users table';
  `);

  const catalog = normalizeImportedDdl(raw);

  assert.equal(catalog.tables.length, 1);
  assert.equal(catalog.tables[0]?.name, "users");
  assert.equal(catalog.tables[0]?.columns[0]?.autoIncrement, true);
  assert.equal(catalog.tables[0]?.columns[2]?.defaultValue?.value, "x");
  assert.equal(catalog.tables[0]?.indexes.length, 2);
  assert.equal(catalog.tables[0]?.foreignKeys.length, 1);
});

test("issue classification surfaces blocking parser gaps and confirmable workbook loss", () => {
  const raw = parseMysqlDdlToRawDatabase(`
    CREATE TABLE users (
      id BIGINT NOT NULL AUTO_INCREMENT,
      org_id BIGINT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_users_org (org_id),
      CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES orgs(id)
    );
  `);
  const catalog = normalizeImportedDdl(raw);
  const result = collectDdlImportIssues({
    sqlText: "CREATE TABLE users (...); CREATE VIEW user_view AS SELECT 1;",
    catalog,
  });

  assert.ok(result.issues.some((issue) => issue.kind === "parser_unsupported" && issue.severity === "blocking"));
  assert.ok(result.issues.some((issue) => issue.kind === "workbook_lossy" && issue.severity === "confirm"));
  assert.ok(result.summary.blockingCount >= 1);
  assert.ok(result.summary.confirmCount >= 1);
});
