import type {
  DbApplyRequest,
  DbDeployJob,
  DbDeployJobStatementResult,
  DbGraphResponse,
  DbHistoryCompareSource,
  DbHistoryEntry,
  DbSchemaCatalog,
  DbSchemaSnapshot,
} from "@shared/schema";

export const phase5BaseCatalog = {
  dialect: "mysql",
  databaseName: "sales_core",
  tables: [
    {
      name: "customers",
      comment: "Customer master",
      columns: [
        {
          name: "customer_id",
          ordinalPosition: 1,
          dataType: "bigint",
          columnType: "bigint",
          nullable: false,
          autoIncrement: true,
        },
        {
          name: "customer_name",
          ordinalPosition: 2,
          dataType: "varchar",
          columnType: "varchar(120)",
          nullable: false,
          characterMaxLength: 120,
        },
      ],
      primaryKey: {
        columns: ["customer_id"],
      },
      foreignKeys: [],
      indexes: [
        {
          name: "idx_customers_name",
          unique: false,
          primary: false,
          columns: [
            {
              columnName: "customer_name",
              seqInIndex: 1,
            },
          ],
        },
      ],
    },
  ],
} satisfies DbSchemaCatalog;

export const phase5PreviousSnapshot = {
  id: 41,
  connectionId: 7,
  dialect: "mysql",
  databaseName: "sales_core",
  snapshotHash: "snap-prev-0001",
  tableCount: 1,
  schemaJson: JSON.stringify(phase5BaseCatalog),
  capturedAt: "2026-03-17T08:00:00.000Z",
  updatedAt: "2026-03-17T08:00:00.000Z",
} satisfies DbSchemaSnapshot;

export const phase5CurrentSnapshot = {
  id: 42,
  connectionId: 7,
  dialect: "mysql",
  databaseName: "sales_core",
  snapshotHash: "snap-cur-0002",
  tableCount: 2,
  schemaJson: JSON.stringify({
    ...phase5BaseCatalog,
    tables: [
      ...phase5BaseCatalog.tables,
      {
        name: "orders",
        comment: "Order header",
        columns: [
          {
            name: "order_id",
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
          },
        ],
        primaryKey: {
          columns: ["order_id"],
        },
        foreignKeys: [
          {
            name: "fk_orders_customer",
            referencedTableName: "customers",
            columnMappings: [
              {
                columnName: "customer_id",
                referencedColumnName: "customer_id",
              },
            ],
          },
        ],
        indexes: [],
      },
    ],
  }),
  capturedAt: "2026-03-17T09:00:00.000Z",
  updatedAt: "2026-03-17T09:00:00.000Z",
} satisfies DbSchemaSnapshot;

export const phase5FileCompareSource = {
  kind: "file",
  fileId: 99,
  fileName: "sales-core-v3.xlsx",
  sheetName: "受注",
} satisfies DbHistoryCompareSource;

export const phase5SnapshotCompareSource = {
  kind: "snapshot",
  connectionId: 7,
  databaseName: "sales_core",
  snapshotHash: phase5PreviousSnapshot.snapshotHash,
} satisfies DbHistoryCompareSource;

export const phase5LiveCompareSource = {
  kind: "live",
  connectionId: 7,
  databaseName: "sales_core",
  snapshotHash: phase5CurrentSnapshot.snapshotHash,
} satisfies DbHistoryCompareSource;

export const phase5HistoryEntries = [
  {
    scanEvent: {
      id: 501,
      connectionId: 7,
      dialect: "mysql",
      databaseName: "sales_core",
      snapshotHash: phase5PreviousSnapshot.snapshotHash,
      eventType: "new_snapshot",
      createdAt: "2026-03-17T08:00:00.000Z",
    },
    snapshot: phase5PreviousSnapshot,
    createdNewSnapshot: true,
  },
  {
    scanEvent: {
      id: 502,
      connectionId: 7,
      dialect: "mysql",
      databaseName: "sales_core",
      snapshotHash: phase5PreviousSnapshot.snapshotHash,
      eventType: "unchanged_scan",
      previousSnapshotHash: phase5PreviousSnapshot.snapshotHash,
      createdAt: "2026-03-17T08:15:00.000Z",
    },
    snapshot: phase5PreviousSnapshot,
    previousSnapshot: phase5PreviousSnapshot,
    createdNewSnapshot: false,
  },
  {
    scanEvent: {
      id: 503,
      connectionId: 7,
      dialect: "mysql",
      databaseName: "sales_core",
      snapshotHash: phase5CurrentSnapshot.snapshotHash,
      eventType: "new_snapshot",
      previousSnapshotHash: phase5PreviousSnapshot.snapshotHash,
      createdAt: "2026-03-17T09:00:00.000Z",
    },
    snapshot: phase5CurrentSnapshot,
    previousSnapshot: phase5PreviousSnapshot,
    createdNewSnapshot: true,
  },
] satisfies DbHistoryEntry[];

export const phase5SafeApplyRequest = {
  databaseName: "sales_core",
  compareSource: phase5FileCompareSource,
  baselineSource: phase5SnapshotCompareSource,
  compareHash: "cmp-safe-0001",
  comparedTargetSnapshotHash: phase5CurrentSnapshot.snapshotHash,
  currentTargetSnapshotHash: phase5CurrentSnapshot.snapshotHash,
  dialect: "mysql",
  selections: [
    {
      tableName: "orders",
      relatedEntityKeys: ["table:orders"],
      blocked: false,
      blockerCodes: [],
    },
  ],
} satisfies DbApplyRequest;

export const phase5DeployJob = {
  id: "job-phase5-001",
  connectionId: 7,
  dialect: "mysql",
  databaseName: "sales_core",
  compareHash: phase5SafeApplyRequest.compareHash,
  compareSource: phase5SafeApplyRequest.compareSource,
  baselineSource: phase5SafeApplyRequest.baselineSource,
  targetSnapshotHash: phase5CurrentSnapshot.snapshotHash,
  selectedTables: ["orders"],
  status: "pending",
  summary: {
    selectedTableCount: 1,
    appliedTableCount: 0,
    statementCount: 1,
    executedStatementCount: 0,
    blockedStatementCount: 0,
    failedStatementCount: 0,
  },
  createdAt: "2026-03-17T09:30:00.000Z",
  updatedAt: "2026-03-17T09:30:00.000Z",
} satisfies DbDeployJob;

export const phase5DeployResults = [
  {
    id: 9001,
    jobId: phase5DeployJob.id,
    statementId: "stmt-orders-create",
    tableName: "orders",
    statementKind: "create_table",
    relatedEntityKeys: ["table:orders"],
    blockerCodes: [],
    blocked: false,
    status: "pending",
    sql: "CREATE TABLE orders (...);",
    createdAt: "2026-03-17T09:30:00.000Z",
  },
] satisfies DbDeployJobStatementResult[];

export const phase5GraphResponse = {
  source: phase5LiveCompareSource,
  compareTo: phase5SnapshotCompareSource,
  mode: "full",
  nodes: [
    {
      id: "customers",
      tableName: "customers",
      label: "customers",
      columnCount: 2,
      foreignKeyCount: 0,
      changed: false,
      highlighted: false,
      position: { x: 0, y: 0 },
      width: 240,
      height: 160,
    },
    {
      id: "orders",
      tableName: "orders",
      label: "orders",
      columnCount: 2,
      foreignKeyCount: 1,
      changed: true,
      highlighted: true,
      position: { x: 320, y: 0 },
      width: 240,
      height: 180,
    },
  ],
  edges: [
    {
      id: "orders->customers",
      sourceId: "orders",
      targetId: "customers",
      relationshipName: "fk_orders_customer",
      changed: true,
    },
  ],
  changedTableNames: ["orders"],
  availableTableNames: ["customers", "orders"],
} satisfies DbGraphResponse;
