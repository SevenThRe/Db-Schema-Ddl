import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ddlImportExportRequestSchema,
  ddlImportPreviewRequestSchema,
  ddlImportPreviewResponseSchema,
  type InsertUploadedFile,
  type UploadedFile,
} from "@shared/schema";
import {
  parseDdlImportSource,
  parseMysqlBundleToRawDatabase,
  parseOracleDdlToRawDatabase,
} from "../../server/lib/ddl-import/parser-adapter";
import { normalizeImportedDdl } from "../../server/lib/ddl-import/normalize";
import { collectDdlImportIssues } from "../../server/lib/ddl-import/issues";
import { exportWorkbookFromDdlCatalog } from "../../server/lib/ddl-import/export-service";

const ROOT = process.cwd();

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

test("reverse-import contracts encode mysql bundle and oracle subset source modes", () => {
  const bundle = ddlImportPreviewRequestSchema.parse({
    sourceMode: "mysql-bundle",
    fileName: "bundle.sql",
    sqlText: "CREATE TABLE users (id BIGINT PRIMARY KEY);",
  });
  const oracle = ddlImportPreviewRequestSchema.parse({
    sourceMode: "oracle-paste",
    sqlText: "CREATE TABLE users (id NUMBER(19) PRIMARY KEY);",
  });
  const exportRequest = ddlImportExportRequestSchema.parse({
    sourceMode: "oracle-file",
    fileName: "schema-oracle.sql",
    sqlText: "CREATE TABLE users (id NUMBER(19) PRIMARY KEY);",
    templateId: "format-a-table-sheet",
    selectedTableNames: ["users"],
  });

  assert.equal(bundle.sourceMode, "mysql-bundle");
  assert.equal(oracle.sourceMode, "oracle-paste");
  assert.equal(exportRequest.sourceMode, "oracle-file");
});

test("mysql bundle and oracle subset normalize into one stable review artifact", () => {
  const mysqlBundle = parseDdlImportSource(
    "mysql-bundle",
    `
      CREATE TABLE orgs (
        id BIGINT NOT NULL,
        PRIMARY KEY (id)
      );
      CREATE TABLE users (
        id BIGINT NOT NULL AUTO_INCREMENT,
        org_id BIGINT,
        PRIMARY KEY (id),
        KEY idx_users_org (org_id),
        CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES orgs(id)
      );
    `,
  );
  const oracleSubset = parseDdlImportSource(
    "oracle-paste",
    `
      CREATE TABLE users (
        id NUMBER(19) NOT NULL,
        name VARCHAR2(255) NOT NULL,
        CONSTRAINT pk_users PRIMARY KEY (id)
      );
      COMMENT ON TABLE users IS 'user table';
    `,
  );

  const mysqlCatalog = normalizeImportedDdl(mysqlBundle.raw, {
    sourceMode: mysqlBundle.sourceMode,
    dialect: mysqlBundle.dialect,
  });
  const oracleCatalog = normalizeImportedDdl(oracleSubset.raw, {
    sourceMode: oracleSubset.sourceMode,
    dialect: oracleSubset.dialect,
  });

  assert.equal(mysqlCatalog.sourceMode, "mysql-bundle");
  assert.equal(mysqlCatalog.dialect, "mysql");
  assert.equal(mysqlCatalog.tables[1]?.entityKey, "table:users");
  assert.equal(mysqlCatalog.tables[1]?.columns[0]?.entityKey, "column:users.id");

  assert.equal(oracleCatalog.sourceMode, "oracle-paste");
  assert.equal(oracleCatalog.dialect, "oracle");
  assert.equal(oracleCatalog.tables[0]?.comment, "user table");
  assert.equal(oracleCatalog.tables[0]?.entityKey, "table:users");
});

test("issue classification keeps bundle and oracle exclusions explicit", () => {
  const bundleCatalog = normalizeImportedDdl(
    parseMysqlBundleToRawDatabase("CREATE TABLE users (id BIGINT PRIMARY KEY);"),
    { sourceMode: "mysql-bundle", dialect: "mysql" },
  );
  const bundleIssues = collectDdlImportIssues({
    sqlText: "CREATE TABLE users (id BIGINT PRIMARY KEY); ALTER TABLE users ADD COLUMN email VARCHAR(255); CREATE VIEW user_view AS SELECT 1;",
    sourceMode: "mysql-bundle",
    dialect: "mysql",
    catalog: bundleCatalog,
  });

  assert.ok(bundleIssues.issues.some((issue) => issue.entityKey === "source:bundle-unsupported"));
  assert.ok(bundleIssues.issues.some((issue) => issue.entityKey === "source:non-table-ddl"));

  const oracleCatalog = normalizeImportedDdl(
    parseOracleDdlToRawDatabase("CREATE TABLE users (id NUMBER(19) PRIMARY KEY);"),
    { sourceMode: "oracle-file", dialect: "oracle" },
  );
  const oracleIssues = collectDdlImportIssues({
    sqlText: "CREATE TABLE users (id NUMBER(19) GENERATED ALWAYS AS IDENTITY, calc NUMBER GENERATED ALWAYS AS (1) VIRTUAL) TABLESPACE users_ts PARTITION BY HASH (id) PARTITIONS 2;",
    sourceMode: "oracle-file",
    dialect: "oracle",
    catalog: oracleCatalog,
  });

  assert.ok(oracleIssues.issues.some((issue) => issue.entityKey === "source:oracle-storage"));
  assert.ok(oracleIssues.issues.some((issue) => issue.entityKey === "source:partition"));
  assert.ok(oracleIssues.issues.some((issue) => issue.entityKey === "source:oracle-virtual-column"));
  assert.ok(oracleIssues.issues.some((issue) => issue.entityKey === "source:oracle-identity"));
});

test("official template export still round-trips bundle and oracle-origin artifacts", async () => {
  process.env.EXCEL_WORKER_DISABLED = "1";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reverse-import-phase3-"));
  const { storage } = createStorageStub();

  const oracleCatalog = normalizeImportedDdl(
    parseOracleDdlToRawDatabase(`
      CREATE TABLE users (
        id NUMBER(19) NOT NULL,
        name VARCHAR2(255) NOT NULL,
        CONSTRAINT pk_users PRIMARY KEY (id)
      );
      COMMENT ON COLUMN users.name IS 'display name';
    `),
    { sourceMode: "oracle-paste", dialect: "oracle" },
  );

  const exported = await exportWorkbookFromDdlCatalog(
    {
      catalog: oracleCatalog,
      templateId: "format-a-table-sheet",
      selectedTableNames: ["users"],
      originalName: "oracle-official-template.xlsx",
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

  assert.equal(exported.template.id, "format-a-table-sheet");
  assert.equal(exported.validation.recognized, true);
  await assert.doesNotReject(() => fs.access(exported.file.filePath));
});

test("preview and export routes stay converged on one reverse-import family", async () => {
  const routeSource = await fs.readFile(path.join(ROOT, "server/routes/ddl-routes.ts"), "utf8");
  const exportSource = await fs.readFile(path.join(ROOT, "server/lib/ddl-import/export-service.ts"), "utf8");
  const adapterSource = await fs.readFile(path.join(ROOT, "server/lib/ddl-import/parser-adapter.ts"), "utf8");

  assert.match(routeSource, /previewImport/);
  assert.match(routeSource, /exportWorkbook/);
  assert.match(routeSource, /parseDdlImportSource/);
  assert.match(routeSource, /DdlWorkbookExportError/);
  assert.match(adapterSource, /oracle/);
  assert.match(adapterSource, /bundle/);
  assert.match(exportSource, /round_trip_failed/);
  assert.match(exportSource, /duplicate_hash/);
});

test("preview artifact carries machine-usable source mode, dialect, and stable ids", () => {
  const preview = ddlImportPreviewResponseSchema.parse({
    sourceMode: "oracle-paste",
    dialect: "oracle",
    sourceSql: "CREATE TABLE users (id NUMBER(19) PRIMARY KEY);",
    catalog: {
      sourceMode: "oracle-paste",
      dialect: "oracle",
      databaseName: "ddl_import",
      tables: [
        {
          entityKey: "table:users",
          name: "users",
          columns: [
            {
              entityKey: "column:users.id",
              name: "id",
              dataType: "NUMBER",
              dataTypeArgs: "19",
              columnType: "NUMBER(19)",
              nullable: false,
            },
          ],
          indexes: [],
          foreignKeys: [],
        },
      ],
    },
    issues: [],
    issueSummary: {
      blockingCount: 0,
      confirmCount: 0,
      infoCount: 0,
    },
    selectableTableNames: ["users"],
    rememberedTemplateId: "format-a-table-sheet",
  });

  assert.equal(preview.dialect, "oracle");
  assert.equal(preview.catalog.tables[0]?.entityKey, "table:users");
  assert.equal(preview.catalog.tables[0]?.columns[0]?.entityKey, "column:users.id");
});
