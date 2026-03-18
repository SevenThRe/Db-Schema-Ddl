import type { Express, Request, Response } from "express";
import { api } from "@shared/routes";
import { sendApiError } from "../lib/api-error";
import { API_ERROR_CODES, HTTP_STATUS } from "../constants/api-response";
import { storage } from "../storage";
import {
  createDbConnection,
  deleteDbConnection,
  listDatabasesForConnection,
  listDbConnections,
  selectDatabaseForConnection,
  testDbConnection,
  updateDbConnection,
} from "../lib/extensions/db-management/connection-service";
import {
  confirmDbDiffRenames,
  previewDbDiff,
  previewDbDryRun,
  previewDbSql,
  previewDbVsDbSql,
} from "../lib/extensions/db-management/db-diff-service";
import {
  applyDbChanges,
  getDbDeployJobDetail,
} from "../lib/extensions/db-management/apply-service";
import {
  compareDbHistory,
  compareSnapshotSources,
  compareLiveDatabases,
  exportSnapshotCompareReport,
  getDbHistoryDetail,
  listDbHistory,
  reviewLiveDatabaseRenames,
} from "../lib/extensions/db-management/history-service";
import { buildDbGraph, buildDbVsDbGraph } from "../lib/extensions/db-management/graph-service";
import { introspectMySqlDatabase } from "../lib/extensions/db-management/mysql-introspection";
import { normalizeMySqlSchema } from "../lib/extensions/db-management/schema-normalizer";
import { persistDbSchemaSnapshot } from "../lib/extensions/db-management/snapshot-service";

function requireElectronMode(res: Response): boolean {
  if (process.env.ELECTRON_MODE === "true") {
    return true;
  }

  sendApiError(res, {
    status: HTTP_STATUS.BAD_REQUEST,
    code: API_ERROR_CODES.requestFailed,
    message: "DB management is only available in Electron mode.",
  });
  return false;
}

function parseConnectionId(req: Request, res: Response): number | undefined {
  const connectionId = Number(req.params.id);
  if (!Number.isInteger(connectionId) || connectionId <= 0) {
    sendApiError(res, {
      status: HTTP_STATUS.BAD_REQUEST,
      code: API_ERROR_CODES.invalidRequest,
      message: "Invalid DB connection id.",
    });
    return undefined;
  }
  return connectionId;
}

function parsePositiveIntParam(
  req: Request,
  res: Response,
  value: string | undefined,
  label: string,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    sendApiError(res, {
      status: HTTP_STATUS.BAD_REQUEST,
      code: API_ERROR_CODES.invalidRequest,
      message: `Invalid ${label}.`,
    });
    return undefined;
  }
  return parsed;
}

function handleRouteError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "DB management request failed.";
  const status =
    message.includes("not found") ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.BAD_REQUEST;
  sendApiError(res, {
    status,
    code: status === HTTP_STATUS.NOT_FOUND ? API_ERROR_CODES.fileNotFound : API_ERROR_CODES.requestFailed,
    message,
  });
}

export function registerDbManagementRoutes(app: Express): void {
  app.get(api.dbManagement.listConnections.path, async (_req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    try {
      res.json(api.dbManagement.listConnections.responses[200].parse(await listDbConnections()));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.createConnection.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.createConnection.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB connection payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const created = await createDbConnection(payload.data);
      res.status(201).json(api.dbManagement.createConnection.responses[201].parse(created));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.put(api.dbManagement.updateConnection.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.updateConnection.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB connection payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const updated = await updateDbConnection(connectionId, payload.data);
      res.json(api.dbManagement.updateConnection.responses[200].parse(updated));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.delete(api.dbManagement.deleteConnection.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    try {
      await deleteDbConnection(connectionId);
      res.json(api.dbManagement.deleteConnection.responses[200].parse({ success: true }));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.testConnection.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    try {
      res.json(api.dbManagement.testConnection.responses[200].parse(await testDbConnection(connectionId)));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get(api.dbManagement.listDatabases.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    try {
      res.json(api.dbManagement.listDatabases.responses[200].parse(await listDatabasesForConnection(connectionId)));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.selectDatabase.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.selectDatabase.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid database selection payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const updated = await selectDatabaseForConnection(connectionId, payload.data.databaseName);
      res.json(api.dbManagement.selectDatabase.responses[200].parse(updated));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.introspect.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.introspect.input.safeParse(req.body ?? {});
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid introspection payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const connection = await storage.getDbConnection(connectionId);
      if (!connection) {
        throw new Error("DB connection not found.");
      }

      const selectedDatabase = payload.data.databaseName ?? connection.lastSelectedDatabase;
      if (!selectedDatabase) {
        throw new Error("Select a database before introspection.");
      }

      if (payload.data.forceRefresh === false) {
        const latest = await storage.getLatestDbSchemaSnapshot(connectionId, selectedDatabase);
        if (latest) {
          res.json(
            api.dbManagement.introspect.responses[200].parse({
              connection: {
                ...connection,
                passwordStored: Boolean(connection.encryptedPassword),
              },
              selectedDatabase,
              cacheHit: true,
              snapshot: latest,
              schema: JSON.parse(latest.schemaJson),
            }),
          );
          return;
        }
      }

      const rawSchema = await introspectMySqlDatabase(connectionId, selectedDatabase);
      const schema = normalizeMySqlSchema(rawSchema);
      const persisted = await persistDbSchemaSnapshot(connectionId, schema);
      const connectionSummary = await selectDatabaseForConnection(connectionId, selectedDatabase);

      res.json(
        api.dbManagement.introspect.responses[200].parse({
          connection: connectionSummary,
          selectedDatabase,
          cacheHit: persisted.cacheHit,
          snapshot: persisted.snapshot,
          schema,
        }),
      );
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.diffPreview.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.diffPreview.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB diff payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await previewDbDiff(connectionId, payload.data);
      res.json(api.dbManagement.diffPreview.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.confirmRenames.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.confirmRenames.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB rename review payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await confirmDbDiffRenames(connectionId, payload.data);
      res.json(api.dbManagement.confirmRenames.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.previewSql.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.previewSql.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB SQL preview payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await previewDbSql(connectionId, payload.data);
      res.json(api.dbManagement.previewSql.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.dryRun.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.dryRun.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB dry-run payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await previewDbDryRun(connectionId, payload.data);
      res.json(api.dbManagement.dryRun.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.listHistory.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.listHistory.input.safeParse(req.body ?? {});
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB history payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await listDbHistory(connectionId, payload.data);
      res.json(api.dbManagement.listHistory.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get(api.dbManagement.historyDetail.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }
    const eventId = parsePositiveIntParam(req, res, req.params.eventId, "history event id");
    if (!eventId) {
      return;
    }

    try {
      const result = await getDbHistoryDetail(connectionId, eventId);
      res.json(api.dbManagement.historyDetail.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.compareHistory.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.compareHistory.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB history compare payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await compareDbHistory(connectionId, payload.data);
      res.json(api.dbManagement.compareHistory.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.snapshotCompare.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.snapshotCompare.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid snapshot compare payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await compareSnapshotSources(payload.data);
      res.json(api.dbManagement.snapshotCompare.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.exportSnapshotCompareReport.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.exportSnapshotCompareReport.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid snapshot compare report payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = exportSnapshotCompareReport(payload.data.artifact, payload.data.format);
      res.json(api.dbManagement.exportSnapshotCompareReport.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.applyChanges.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.applyChanges.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB apply payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await applyDbChanges(connectionId, payload.data);
      res.status(202).json(api.dbManagement.applyChanges.responses[202].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get(api.dbManagement.deployJobDetail.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }
    const jobId = String(req.params.jobId ?? "").trim();
    if (!jobId) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid deploy job id.",
      });
      return;
    }

    try {
      const result = await getDbDeployJobDetail(connectionId, jobId);
      res.json(api.dbManagement.deployJobDetail.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.graphData.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }
    const connectionId = parseConnectionId(req, res);
    if (!connectionId) {
      return;
    }

    const payload = api.dbManagement.graphData.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB graph payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await buildDbGraph(connectionId, payload.data);
      res.json(api.dbManagement.graphData.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.compareDatabases.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.compareDatabases.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB-vs-DB compare payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await compareLiveDatabases(payload.data);
      res.json(api.dbManagement.compareDatabases.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.reviewDatabaseRenames.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.reviewDatabaseRenames.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB-vs-DB rename review payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await reviewLiveDatabaseRenames(payload.data);
      res.json(api.dbManagement.reviewDatabaseRenames.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.previewDatabaseSql.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.previewDatabaseSql.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB-vs-DB SQL preview payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const compareResult = await compareLiveDatabases(payload.data.compare);
      const result = await previewDbVsDbSql(compareResult, payload.data);
      res.json(api.dbManagement.previewDatabaseSql.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post(api.dbManagement.databaseGraph.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.databaseGraph.input.safeParse(req.body);
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB-vs-DB graph payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const result = await buildDbVsDbGraph(payload.data);
      res.json(api.dbManagement.databaseGraph.responses[200].parse(result));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get(api.dbManagement.getComparePolicy.path, async (_req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    try {
      const policy = await storage.getDbComparePolicy();
      res.json(api.dbManagement.getComparePolicy.responses[200].parse(policy));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.put(api.dbManagement.updateComparePolicy.path, async (req, res) => {
    if (!requireElectronMode(res)) {
      return;
    }

    const payload = api.dbManagement.updateComparePolicy.input.safeParse(req.body ?? {});
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid DB compare policy payload.",
        issues: payload.error.issues,
      });
      return;
    }

    try {
      const policy = await storage.updateDbComparePolicy(payload.data);
      res.json(api.dbManagement.updateComparePolicy.responses[200].parse(policy));
    } catch (error) {
      handleRouteError(res, error);
    }
  });
}
