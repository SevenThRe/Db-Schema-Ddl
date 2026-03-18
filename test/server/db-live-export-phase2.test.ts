import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dbLiveExportExecuteRequestSchema,
  dbLiveExportExecuteResponseSchema,
  dbLiveExportPreviewRequestSchema,
  dbLiveExportPreviewResponseSchema,
} from "@shared/schema";
import { storage } from "../../server/storage";
import {
  executeLiveDbWorkbookExport,
  previewLiveDbWorkbookExport,
} from "../../server/lib/extensions/db-management/live-export-service";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

function createUploadStorageStub() {
  const created: Array<{
    id: number;
    filePath: string;
    originalName: string;
    originalModifiedAt: null;
    fileHash: string;
    fileSize: number;
    uploadedAt: string;
  }> = [];

  return {
    created,
    storage: {
      async createUploadedFile(insertFile: {
        filePath: string;
        originalName: string;
        fileHash: string;
        fileSize: number;
      }) {
        const record = {
          id: created.length + 1,
          filePath: insertFile.filePath,
          originalName: insertFile.originalName,
          originalModifiedAt: null,
          fileHash: insertFile.fileHash,
          fileSize: insertFile.fileSize,
          uploadedAt: new Date().toISOString(),
        };
        created.push(record);
        return record;
      },
      async findFileByHash(hash: string) {
        return created.find((item) => item.fileHash === hash);
      },
    },
  };
}

test("live DB export preview artifact captures source, freshness, selection, and trust state", () => {
  const request = dbLiveExportPreviewRequestSchema.parse({
    connectionId: 12,
    databaseName: "sales_core",
    freshnessMode: "latest_snapshot",
    selectedTableNames: ["orders"],
    templateId: "format-b-multi-table-sheet",
  });

  const response = dbLiveExportPreviewResponseSchema.parse({
    artifactVersion: "v1",
    artifactKey: "live-export:12:sales_core:snap-20260318:format-b-multi-table-sheet",
    connectionId: 12,
    databaseName: "sales_core",
    freshnessMode: "latest_snapshot",
    resolvedSnapshotHash: "snap-20260318",
    resolvedSnapshotCapturedAt: "2026-03-18T10:00:00.000Z",
    catalog: {
      dialect: "mysql",
      databaseName: "sales_core",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "id",
              ordinalPosition: 1,
              dataType: "bigint",
              columnType: "bigint",
              nullable: false,
              autoIncrement: true,
            },
          ],
          primaryKey: {
            name: "PRIMARY",
            columns: ["id"],
          },
          foreignKeys: [],
          indexes: [],
        },
      ],
    },
    selectedTableNames: ["orders"],
    selectableTableNames: ["orders", "customers"],
    templateId: "format-b-multi-table-sheet",
    issueSummary: {
      blockingCount: 0,
      confirmCount: 1,
      infoCount: 1,
    },
    issues: [
      {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: "table:sales_core:orders",
        tableName: "orders",
        message: "Secondary indexes are informational only in workbook export.",
      },
      {
        severity: "info",
        kind: "info",
        entityKey: "database:sales_core",
        message: "Engine metadata is surfaced as informational context.",
      },
    ],
    canExport: true,
  });

  assert.equal(request.connectionId, 12);
  assert.equal(request.templateId, "format-b-multi-table-sheet");
  assert.equal(response.resolvedSnapshotHash, "snap-20260318");
  assert.equal(response.catalog.tables[0]?.name, "orders");
  assert.equal(response.issues[0]?.entityKey, "table:sales_core:orders");
  assert.equal(response.canExport, true);
});

test("live DB export execution response carries file metadata and artifact identity", () => {
  const artifact = dbLiveExportPreviewResponseSchema.parse({
    artifactVersion: "v1",
    artifactKey: "live-export:12:sales_core:snap-20260318:format-a-table-sheet",
    connectionId: 12,
    databaseName: "sales_core",
    freshnessMode: "refresh_live",
    resolvedSnapshotHash: "snap-20260318",
    catalog: {
      dialect: "mysql",
      databaseName: "sales_core",
      tables: [],
    },
    selectedTableNames: ["orders"],
    selectableTableNames: ["orders"],
    templateId: "format-a-table-sheet",
    issueSummary: {
      blockingCount: 0,
      confirmCount: 0,
      infoCount: 0,
    },
    issues: [],
    canExport: true,
  });

  const request = dbLiveExportExecuteRequestSchema.parse({
    artifact,
    selectedTableNames: ["orders"],
    templateId: "format-a-table-sheet",
    allowLossyExport: false,
  });

  const response = dbLiveExportExecuteResponseSchema.parse({
    artifact,
    file: {
      id: 101,
      filePath: "C:/tmp/sales_core.xlsx",
      originalName: "sales_core.xlsx",
      originalModifiedAt: null,
      fileHash: "abc1234567890",
      fileSize: 2048,
      uploadedAt: "2026-03-18T10:00:00.000Z",
    },
    template: {
      id: "format-a-table-sheet",
      label: "单表 Sheet 模板",
      description: "Parser-compatible single-table workbook",
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
      checkedSheetName: "orders",
      reasons: [],
    },
    selectedTableNames: ["orders"],
    issueSummary: {
      blockingCount: 0,
      confirmCount: 0,
      infoCount: 0,
    },
    rememberedTemplateId: "format-a-table-sheet",
  });

  assert.equal(request.artifact.artifactKey, artifact.artifactKey);
  assert.equal(response.file.originalName, "sales_core.xlsx");
  assert.equal(response.validation.recognized, true);
  assert.equal(response.rememberedTemplateId, "format-a-table-sheet");
});

test("live DB export preview supports explicit freshness, whole-catalog loading, and generated blockers", async () => {
  const originalGetDbConnection = storage.getDbConnection.bind(storage);
  storage.getDbConnection = async (id: number) =>
    id === 12
      ? {
          id,
          name: "local",
          dialect: "mysql",
          host: "127.0.0.1",
          port: 3306,
          username: "root",
          passwordStorage: "electron-safe-storage",
          rememberPassword: true,
          sslMode: "preferred",
          lastTestStatus: "success",
        }
      : undefined;

  try {
    const preview = await previewLiveDbWorkbookExport(
      {
        connectionId: 12,
        databaseName: "sales_core",
        freshnessMode: "refresh_live",
        templateId: "format-b-multi-table-sheet",
        selectedTableNames: ["orders"],
      },
      {
        resolveCatalogSource: async () => ({
          connectionId: 12,
          connectionName: "local",
          databaseName: "sales_core",
          freshnessMode: "refresh_live",
          resolvedSnapshotHash: "snap-fresh-0001",
          resolvedSnapshotCapturedAt: "2026-03-18T11:00:00.000Z",
          snapshot: {
            id: 1,
            connectionId: 12,
            dialect: "mysql",
            databaseName: "sales_core",
            snapshotHash: "snap-fresh-0001",
            tableCount: 2,
            schemaJson: "{}",
            capturedAt: "2026-03-18T11:00:00.000Z",
          },
          catalog: {
            dialect: "mysql",
            databaseName: "sales_core",
            tables: [
              {
                name: "orders",
                comment: "order records",
                engine: "InnoDB",
                columns: [
                  {
                    name: "id",
                    ordinalPosition: 1,
                    dataType: "bigint",
                    columnType: "bigint",
                    nullable: false,
                    autoIncrement: true,
                  },
                  {
                    name: "total",
                    ordinalPosition: 2,
                    dataType: "decimal",
                    columnType: "decimal(10,2)",
                    nullable: false,
                    defaultValue: "0.00",
                    extra: "GENERATED STORED",
                    autoIncrement: false,
                  },
                ],
                primaryKey: {
                  name: "PRIMARY",
                  columns: ["id"],
                },
                foreignKeys: [
                  {
                    name: "fk_orders_customer",
                    referencedTableName: "customers",
                    columnMappings: [
                      {
                        columnName: "customer_id",
                        referencedColumnName: "id",
                      },
                    ],
                  },
                ],
                indexes: [
                  {
                    name: "uniq_orders_code",
                    unique: true,
                    primary: false,
                    columns: [{ columnName: "code", seqInIndex: 1 }],
                  },
                ],
              },
              {
                name: "customers",
                columns: [
                  {
                    name: "id",
                    ordinalPosition: 1,
                    dataType: "bigint",
                    columnType: "bigint",
                    nullable: false,
                    autoIncrement: false,
                  },
                ],
                foreignKeys: [],
                indexes: [],
              },
            ],
          },
          cacheHit: false,
          usedFreshLiveScan: true,
        }),
      },
    );

    assert.equal(preview.freshnessMode, "refresh_live");
    assert.equal(preview.resolvedSnapshotHash, "snap-fresh-0001");
    assert.deepEqual(preview.selectableTableNames, ["orders", "customers"]);
    assert.deepEqual(preview.selectedTableNames, ["orders"]);
    assert.equal(preview.catalog.tables.length, 2);
    assert.equal(preview.canExport, false);
    assert.ok(preview.issues.some((issue) => issue.entityKey.includes("generated")));
    assert.ok(preview.issues.some((issue) => issue.severity === "confirm"));
    assert.ok(preview.issues.some((issue) => issue.severity === "info"));
  } finally {
    storage.getDbConnection = originalGetDbConnection;
  }
});

test("live DB export executes through official workbook templates and blocks unsafe requests", async () => {
  process.env.EXCEL_WORKER_DISABLED = "1";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "db-live-export-phase2-"));
  const { storage: uploadStorage } = createUploadStorageStub();

  const artifact = dbLiveExportPreviewResponseSchema.parse({
    artifactVersion: "v1",
    artifactKey: "live-export:12:sales_core:snap-exec-0001:format-b-multi-table-sheet:orders",
    connectionId: 12,
    databaseName: "sales_core",
    freshnessMode: "latest_snapshot",
    resolvedSnapshotHash: "snap-exec-0001",
    catalog: {
      dialect: "mysql",
      databaseName: "sales_core",
      tables: [
        {
          name: "orders",
          comment: "orders",
          columns: [
            {
              name: "id",
              ordinalPosition: 1,
              dataType: "bigint",
              columnType: "bigint",
              nullable: false,
              autoIncrement: true,
            },
            {
              name: "customer_id",
              ordinalPosition: 2,
              dataType: "bigint",
              columnType: "bigint",
              nullable: false,
              autoIncrement: false,
            },
          ],
          primaryKey: {
            name: "PRIMARY",
            columns: ["id"],
          },
          foreignKeys: [
            {
              name: "fk_orders_customer",
              referencedTableName: "customers",
              columnMappings: [
                {
                  columnName: "customer_id",
                  referencedColumnName: "id",
                },
              ],
            },
          ],
          indexes: [],
        },
        {
          name: "customers",
          columns: [
            {
              name: "id",
              ordinalPosition: 1,
              dataType: "bigint",
              columnType: "bigint",
              nullable: false,
              autoIncrement: false,
            },
          ],
          foreignKeys: [],
          indexes: [],
        },
      ],
    },
    selectedTableNames: ["orders"],
    selectableTableNames: ["orders", "customers"],
    templateId: "format-b-multi-table-sheet",
    issueSummary: {
      blockingCount: 0,
      confirmCount: 1,
      infoCount: 0,
    },
    issues: [
      {
        severity: "confirm",
        kind: "workbook_lossy",
        entityKey: "fk:orders.fk_orders_customer",
        tableName: "orders",
        constraintName: "fk_orders_customer",
        message: "Foreign keys are not preserved structurally in workbook export.",
      },
    ],
    canExport: true,
  });

  await assert.rejects(
    () =>
      executeLiveDbWorkbookExport(
        {
          artifact,
          selectedTableNames: ["orders"],
          templateId: "format-b-multi-table-sheet",
          allowLossyExport: false,
        },
        {
          storage: uploadStorage,
          uploadsDir: tempDir,
          settings: {
            maxConsecutiveEmptyRows: 10,
            pkMarkers: ["〇"],
          },
        },
      ),
    /lossy export confirmation/,
  );

  const tablePerSheetExport = await executeLiveDbWorkbookExport(
    {
      artifact,
      selectedTableNames: ["orders"],
      templateId: "format-a-table-sheet",
      allowLossyExport: true,
      originalName: "sales_core-live-export-a.xlsx",
    },
    {
      storage: uploadStorage,
      uploadsDir: tempDir,
      settings: {
        maxConsecutiveEmptyRows: 10,
        pkMarkers: ["〇"],
      },
    },
  );

  const exported = await executeLiveDbWorkbookExport(
    {
      artifact,
      selectedTableNames: ["orders"],
      templateId: "format-b-multi-table-sheet",
      allowLossyExport: true,
      originalName: "sales_core-live-export.xlsx",
    },
    {
      storage: uploadStorage,
      uploadsDir: tempDir,
      settings: {
        maxConsecutiveEmptyRows: 10,
        pkMarkers: ["〇"],
      },
    },
  );

  assert.equal(tablePerSheetExport.template.id, "format-a-table-sheet");
  await assert.doesNotReject(() => fs.access(tablePerSheetExport.file.filePath));
  assert.equal(exported.template.id, "format-b-multi-table-sheet");
  assert.deepEqual(exported.selectedTableNames, ["orders"]);
  await assert.doesNotReject(() => fs.access(exported.file.filePath));
});

test("phase 2 live export seams exist in shared contracts and routes", async () => {
  const schemaSource = await read("shared/schema.ts");
  const routesSource = await read("shared/routes.ts");
  const serviceSource = await read("server/lib/extensions/db-management/live-export-service.ts");
  const issuesSource = await read("server/lib/ddl-import/issues.ts");

  assert.match(schemaSource, /dbLiveExportPreviewRequestSchema/);
  assert.match(schemaSource, /dbLiveExportPreviewResponseSchema/);
  assert.match(schemaSource, /dbLiveExportExecuteRequestSchema/);
  assert.match(schemaSource, /dbLiveExportExecuteResponseSchema/);
  assert.match(schemaSource, /artifactKey/);
  assert.match(schemaSource, /"live-export"/);

  assert.match(routesSource, /previewLiveExport:/);
  assert.match(routesSource, /executeLiveExport:/);

  assert.match(serviceSource, /previewLiveDbWorkbookExport/);
  assert.match(serviceSource, /resolvedSnapshotHash/);
  assert.match(issuesSource, /blocking/);
  assert.match(issuesSource, /confirm/);
  assert.match(issuesSource, /info/);
});
