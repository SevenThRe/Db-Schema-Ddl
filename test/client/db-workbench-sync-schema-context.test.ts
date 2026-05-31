import test from "node:test";
import assert from "node:assert/strict";
import type { DbSchemaSnapshot } from "../../shared/schema";
import { buildWorkbenchSyncSchemaContext } from "../../client/src/components/extensions/db-workbench/workbench-sync-schema-context";

function snapshot(connectionId: string, tableName: string): DbSchemaSnapshot {
  return {
    connectionId,
    connectionName: connectionId,
    database: "app",
    schema: "public",
    tables: [
      {
        name: tableName,
        columns: [
          {
            name: "id",
            dataType: "integer",
            nullable: false,
            primaryKey: true,
          },
          {
            name: "name",
            dataType: "text",
            nullable: true,
            primaryKey: false,
          },
        ],
      },
    ],
    views: [],
    routines: [],
    triggers: [],
    sequences: [],
  };
}

test("sync schema context uses active snapshot for active source and remote snapshot for target", () => {
  const context = buildWorkbenchSyncSchemaContext({
    activeConnectionId: "source",
    connectionCount: 2,
    activeSchemaSnapshot: snapshot("source", "users"),
    activeSchemaError: null,
    sourceConnectionId: "source",
    targetConnectionId: "target",
    sourceSnapshotData: null,
    targetSnapshotData: snapshot("target", "accounts"),
    sourceSnapshotError: null,
    targetSnapshotError: null,
    isSourceSnapshotLoading: true,
    isTargetSnapshotLoading: false,
  });

  assert.equal(context.sourceSnapshot?.connectionId, "source");
  assert.equal(context.targetSnapshot?.connectionId, "target");
  assert.deepEqual(context.availableTableNames, ["accounts", "users"]);
  assert.equal(context.tableMetadataIndex.metadataByName.users.sourceExists, true);
  assert.equal(context.tableMetadataIndex.metadataByName.users.targetExists, false);
  assert.equal(context.issueMessage, null);
  assert.equal(context.isLoading, false);
});

test("sync schema context keeps source target safety issue and remote loading state explicit", () => {
  const context = buildWorkbenchSyncSchemaContext({
    activeConnectionId: "source",
    connectionCount: 2,
    activeSchemaSnapshot: snapshot("source", "users"),
    activeSchemaError: null,
    sourceConnectionId: "source",
    targetConnectionId: "source",
    sourceSnapshotData: null,
    targetSnapshotData: null,
    sourceSnapshotError: null,
    targetSnapshotError: null,
    isSourceSnapshotLoading: false,
    isTargetSnapshotLoading: true,
  });

  assert.equal(
    context.issueMessage,
    "Source and target connections must be different for sync compare.",
  );
  assert.equal(context.isLoading, false);

  const remoteContext = buildWorkbenchSyncSchemaContext({
    activeConnectionId: "source",
    connectionCount: 2,
    activeSchemaSnapshot: snapshot("source", "users"),
    activeSchemaError: null,
    sourceConnectionId: "target-a",
    targetConnectionId: "target-b",
    sourceSnapshotData: null,
    targetSnapshotData: null,
    sourceSnapshotError: null,
    targetSnapshotError: null,
    isSourceSnapshotLoading: true,
    isTargetSnapshotLoading: false,
  });

  assert.equal(remoteContext.isLoading, true);
});
