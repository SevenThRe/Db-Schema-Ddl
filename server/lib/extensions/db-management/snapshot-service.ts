import crypto from "crypto";
import type {
  DbSchemaCatalog,
  DbSchemaIntrospectResponse,
  DbSchemaScanEvent,
  DbSchemaSnapshot,
} from "@shared/schema";
import { storage } from "../../../storage";

export interface PlannedDbSchemaSnapshotPersistence {
  stableJson: string;
  snapshotHash: string;
  eventType: DbSchemaScanEvent["eventType"];
  previousSnapshotHash?: string;
  createdNewSnapshot: boolean;
  cacheHit: boolean;
  changeSummaryJson?: string;
}

export interface PersistDbSchemaSnapshotResult
  extends Pick<DbSchemaIntrospectResponse, "snapshot" | "cacheHit"> {
  previousSnapshot?: DbSchemaSnapshot;
  scanEvent: DbSchemaScanEvent;
  createdNewSnapshot: boolean;
}

export function buildStableJson(value: unknown): string {
  return JSON.stringify(value, (_key, data) => {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === "object") {
      return Object.fromEntries(
        Object.entries(data as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }
    return data;
  });
}

export function buildSnapshotHash(schema: DbSchemaCatalog): string {
  return crypto.createHash("sha256").update(buildStableJson(schema)).digest("hex");
}

export function planDbSchemaSnapshotPersistence(args: {
  schema: DbSchemaCatalog;
  latestSnapshot?: DbSchemaSnapshot;
  existingSnapshot?: DbSchemaSnapshot;
}): PlannedDbSchemaSnapshotPersistence {
  const { schema, latestSnapshot, existingSnapshot } = args;
  const stableJson = buildStableJson(schema);
  const snapshotHash = buildSnapshotHash(schema);
  const unchangedAgainstLatest = latestSnapshot?.snapshotHash === snapshotHash;
  const createdNewSnapshot = !existingSnapshot;
  const eventType: DbSchemaScanEvent["eventType"] = unchangedAgainstLatest
    ? "unchanged_scan"
    : "new_snapshot";

  return {
    stableJson,
    snapshotHash,
    eventType,
    previousSnapshotHash: latestSnapshot?.snapshotHash,
    createdNewSnapshot,
    cacheHit: Boolean(existingSnapshot),
    changeSummaryJson: buildStableJson({
      currentSnapshotHash: snapshotHash,
      previousSnapshotHash: latestSnapshot?.snapshotHash,
      previousTableCount: latestSnapshot?.tableCount ?? 0,
      tableCount: schema.tables.length,
      changed: !unchangedAgainstLatest,
      createdNewSnapshot,
    }),
  };
}

export async function persistDbSchemaSnapshot(
  connectionId: number,
  schema: DbSchemaCatalog,
): Promise<PersistDbSchemaSnapshotResult> {
  const latestSnapshot = await storage.getLatestDbSchemaSnapshot(connectionId, schema.databaseName);
  const snapshotHash = buildSnapshotHash(schema);
  const existingSnapshot = await storage.getDbSchemaSnapshotByHash(
    connectionId,
    schema.databaseName,
    snapshotHash,
  );
  const plan = planDbSchemaSnapshotPersistence({
    schema,
    latestSnapshot,
    existingSnapshot,
  });

  const snapshot =
    existingSnapshot ??
    (await storage.createDbSchemaSnapshot({
      connectionId,
      dialect: schema.dialect,
      databaseName: schema.databaseName,
      snapshotHash: plan.snapshotHash,
      tableCount: schema.tables.length,
      schemaJson: plan.stableJson,
    }));

  const scanEvent = await storage.createDbSchemaScanEvent({
    connectionId,
    dialect: schema.dialect,
    databaseName: schema.databaseName,
    snapshotHash: plan.snapshotHash,
    eventType: plan.eventType,
    previousSnapshotHash: plan.previousSnapshotHash,
    changeSummaryJson: plan.changeSummaryJson,
  });

  return {
    snapshot,
    cacheHit: plan.cacheHit,
    previousSnapshot: latestSnapshot,
    scanEvent,
    createdNewSnapshot: plan.createdNewSnapshot,
  };
}
