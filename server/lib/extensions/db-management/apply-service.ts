import crypto from "node:crypto";
import type {
  DbApplyRequest,
  DbApplyResponse,
  DbDeployJob,
  DbDeployJobDetailResponse,
  DbDeployJobStatementResult,
  DbDeployJobSummary,
  DbSqlPreviewStatement,
} from "@shared/schema";
import { storage } from "../../../storage";
import { getDbConnectionRecordOrThrow, withMySqlConnection } from "./connection-service";
import { previewDbSql } from "./db-diff-service";
import { introspectMySqlDatabase } from "./mysql-introspection";
import { normalizeMySqlSchema } from "./schema-normalizer";
import { persistDbSchemaSnapshot } from "./snapshot-service";

function buildSummary(results: DbDeployJobStatementResult[], selectedTableCount: number): DbDeployJobSummary {
  return {
    selectedTableCount,
    appliedTableCount: new Set(results.filter((result) => result.status === "succeeded").map((result) => result.tableName).filter(Boolean)).size,
    statementCount: results.length,
    executedStatementCount: results.filter((result) => result.status === "succeeded").length,
    blockedStatementCount: results.filter((result) => result.status === "blocked" || result.status === "skipped").length,
    failedStatementCount: results.filter((result) => result.status === "failed").length,
  };
}

function toPendingResult(jobId: string, statement: DbSqlPreviewStatement): Omit<DbDeployJobStatementResult, "id" | "createdAt"> {
  return {
    jobId,
    statementId: statement.id,
    tableName: statement.tableName,
    statementKind: statement.kind,
    relatedEntityKeys: statement.relatedEntityKeys,
    blockerCodes: statement.blockerCodes,
    blocked: statement.blocked,
    status: statement.blocked ? "blocked" : "pending",
    sql: statement.sql,
    errorCode: undefined,
    errorMessage: undefined,
    executedAt: undefined,
  };
}

async function refreshSnapshot(connectionId: number, databaseName: string): Promise<string> {
  const rawSchema = await introspectMySqlDatabase(connectionId, databaseName);
  const schema = normalizeMySqlSchema(rawSchema);
  const persisted = await persistDbSchemaSnapshot(connectionId, schema);
  return persisted.snapshot.snapshotHash;
}

export async function getDbDeployJobDetail(connectionId: number, jobId: string): Promise<DbDeployJobDetailResponse> {
  const job = await storage.getDbDeployJob(jobId);
  if (!job || job.connectionId !== connectionId) {
    throw new Error("DB deploy job not found.");
  }
  const results = await storage.listDbDeployJobStatementResults(jobId);
  return { job, results };
}

export async function applyDbChanges(connectionId: number, input: DbApplyRequest): Promise<DbApplyResponse> {
  if (input.compareSource.kind !== "file") {
    throw new Error("Phase 5 apply currently supports file-driven compares only.");
  }

  const latestSnapshot = await storage.getLatestDbSchemaSnapshot(connectionId, input.databaseName);
  if (!latestSnapshot || latestSnapshot.snapshotHash !== input.currentTargetSnapshotHash) {
    throw new Error("Apply request is stale. Refresh the compare result before applying.");
  }

  const selectedTables = Array.from(new Set(input.selections.map((selection) => selection.tableName)));
  const preview = await previewDbSql(connectionId, {
    compare: {
      fileId: input.compareSource.fileId,
      sheetName: input.compareSource.sheetName,
      scope: "sheet",
      databaseName: input.databaseName,
      refreshLiveSchema: false,
    },
    decisions: [],
    dialect: input.dialect,
  });

  const statements = preview.artifacts
    .filter((artifact) => artifact.tableName && selectedTables.includes(artifact.tableName))
    .flatMap((artifact) => artifact.statements);

  const jobId = `job-${crypto.randomUUID()}`;
  const baseJob: Omit<DbDeployJob, "createdAt" | "updatedAt"> = {
    id: jobId,
    connectionId,
    dialect: input.dialect,
    databaseName: input.databaseName,
    compareHash: input.compareHash,
    compareSource: input.compareSource,
    baselineSource: input.baselineSource,
    targetSnapshotHash: input.currentTargetSnapshotHash,
    selectedTables,
    summary: buildSummary([], selectedTables.length),
    status: "pending",
    errorMessage: undefined,
  };
  const createdJob = await storage.createDbDeployJob(baseJob);

  const initialResults = statements.map((statement) => toPendingResult(jobId, statement));
  await storage.replaceDbDeployJobStatementResults(jobId, initialResults);

  if (preview.blocked || preview.compareResult.blockers.length > 0 || statements.length === 0) {
    const blockedResults = initialResults.map((result) => ({
      ...result,
      blocked: true,
      status: "blocked" as const,
      errorMessage: preview.blocked ? "Apply blocked by preview blockers." : "No executable SQL statements were generated.",
    }));
    await storage.replaceDbDeployJobStatementResults(jobId, blockedResults);
    const blockedJob = await storage.updateDbDeployJob(jobId, {
      status: "blocked",
      summary: buildSummary(blockedResults as DbDeployJobStatementResult[], selectedTables.length),
      errorMessage: preview.blocked ? "Apply blocked by preview blockers." : "No executable SQL statements were generated.",
    });
    if (!blockedJob) {
      throw new Error("DB deploy job not found.");
    }
    return { job: blockedJob, results: await storage.listDbDeployJobStatementResults(jobId) };
  }

  const runningJob = await storage.updateDbDeployJob(jobId, { status: "running" });
  if (!runningJob) {
    throw new Error("DB deploy job not found.");
  }

  const connection = await getDbConnectionRecordOrThrow(connectionId);
  const executedResults: Omit<DbDeployJobStatementResult, "id" | "createdAt">[] = [];
  let executionError: string | undefined;

  await withMySqlConnection(connection, input.databaseName, async (client) => {
    for (const statement of statements) {
      try {
        await client.query(statement.sql);
        executedResults.push({
          ...toPendingResult(jobId, statement),
          status: "succeeded",
          executedAt: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Statement execution failed.";
        executionError = message;
        executedResults.push({
          ...toPendingResult(jobId, statement),
          status: "failed",
          errorCode: "statement_failed",
          errorMessage: message,
          executedAt: new Date().toISOString(),
        });
        break;
      }
    }
  });

  const failed = Boolean(executionError);
  const succeededIds = new Set(executedResults.map((result) => result.statementId));
  const finalResults = [
    ...executedResults,
    ...statements
      .filter((statement) => !succeededIds.has(statement.id))
      .map((statement) => ({
        ...toPendingResult(jobId, statement),
        status: failed ? ("skipped" as const) : ("pending" as const),
        errorMessage: failed ? "Skipped because a previous statement failed." : undefined,
      })),
  ];

  await storage.replaceDbDeployJobStatementResults(jobId, finalResults);

  const refreshedSnapshotHash = await refreshSnapshot(connectionId, input.databaseName);
  const finalSummary = buildSummary(finalResults as DbDeployJobStatementResult[], selectedTables.length);
  const status: DbDeployJob["status"] =
    finalSummary.failedStatementCount > 0
      ? finalSummary.executedStatementCount > 0
        ? "partial"
        : "failed"
      : "succeeded";

  const finalJob = await storage.updateDbDeployJob(jobId, {
    status,
    targetSnapshotHash: refreshedSnapshotHash,
    summary: finalSummary,
    errorMessage: executionError,
  });
  if (!finalJob) {
    throw new Error("DB deploy job not found.");
  }

  return {
    job: finalJob,
    results: await storage.listDbDeployJobStatementResults(jobId),
  };
}
