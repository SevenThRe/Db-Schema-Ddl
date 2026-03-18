import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type {
  DbConnectionSummary,
  DbConnectionUpsertRequest,
  DbConnectionTestResponse,
  DbComparePolicy,
  DbDatabaseOption,
  DbDiffConfirmRenamesRequest,
  DbDiffPreviewRequest,
  DbDiffPreviewResponse,
  DbDryRunRequest,
  DbDryRunResponse,
  DbHistoryListRequest,
  DbHistoryListResponse,
  DbHistoryDetailResponse,
  DbHistoryCompareRequest,
  DbHistoryCompareResponse,
  DbApplyRequest,
  DbApplyResponse,
  DbDeployJobDetailResponse,
  DbGraphRequest,
  DbGraphResponse,
  DbManagementViewMode,
  DbSchemaIntrospectRequest,
  DbSchemaIntrospectResponse,
  DbSqlPreviewRequest,
  DbSqlPreviewResponse,
  DbVsDbCompareRequest,
  DbVsDbCompareResponse,
  DbVsDbGraphRequest,
  DbVsDbGraphResponse,
  DbVsDbPreviewRequest,
  DbVsDbPreviewResponse,
  DbVsDbRenameReviewRequest,
} from "@shared/schema";
import { parseApiErrorResponse } from "@/lib/api-error";

type RequestFailureFallback = {
  code: "REQUEST_FAILED";
  message: string;
};

async function fetchResponse(
  input: RequestInfo | URL,
  fallback: RequestFailureFallback,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw await parseApiErrorResponse(res, fallback);
  }
  return res;
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  fallback: RequestFailureFallback,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchResponse(input, fallback, init);
  return (await res.json()) as T;
}

const CONNECTIONS_QUERY_KEY = [api.dbManagement.listConnections.path] as const;

function databasesQueryKey(connectionId?: number | null) {
  return [api.dbManagement.listDatabases.path, connectionId] as const;
}

function latestSnapshotQueryKey(connectionId?: number | null) {
  return [api.dbManagement.introspect.path, connectionId] as const;
}

function historyListQueryKey(connectionId?: number | null, input?: DbHistoryListRequest | null) {
  return [api.dbManagement.listHistory.path, connectionId, input ?? null] as const;
}

function historyDetailQueryKey(connectionId?: number | null, eventId?: number | null) {
  return [api.dbManagement.historyDetail.path, connectionId, eventId] as const;
}

function deployJobDetailQueryKey(connectionId?: number | null, jobId?: string | null) {
  return [api.dbManagement.deployJobDetail.path, connectionId, jobId] as const;
}

function graphQueryKey(connectionId?: number | null, input?: DbGraphRequest | null) {
  return [api.dbManagement.graphData.path, connectionId, input ?? null] as const;
}

const DB_COMPARE_POLICY_QUERY_KEY = [api.dbManagement.getComparePolicy.path] as const;

function dbVsDbGraphQueryKey(input?: DbVsDbGraphRequest | null) {
  return [api.dbManagement.databaseGraph.path, input ?? null] as const;
}

export const DB_MANAGEMENT_VIEW_MODES: readonly DbManagementViewMode[] = [
  "diff",
  "db-vs-db",
  "history",
  "apply",
  "graph",
] as const;

export const DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY = "db-management.active-view-mode";

export function useDbConnections() {
  return useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: async () => {
      const data = await fetchJson(api.dbManagement.listConnections.path, {
        code: "REQUEST_FAILED",
        message: "Failed to fetch DB connections",
      });
      return api.dbManagement.listConnections.responses[200].parse(data);
    },
  });
}

export function useDbDatabases(connectionId: number | null) {
  return useQuery({
    queryKey: databasesQueryKey(connectionId),
    queryFn: async () => {
      if (!connectionId) {
        return [] as DbDatabaseOption[];
      }
      const url = buildUrl(api.dbManagement.listDatabases.path, { id: connectionId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to list databases",
      });
      return api.dbManagement.listDatabases.responses[200].parse(data);
    },
    enabled: Boolean(connectionId),
  });
}

export function useCreateDbConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DbConnectionUpsertRequest) => {
      const data = await fetchJson<DbConnectionSummary>(
        api.dbManagement.createConnection.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to create DB connection",
        },
        {
          method: api.dbManagement.createConnection.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.createConnection.responses[201].parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
    },
  });
}

export function useUpdateDbConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: DbConnectionUpsertRequest }) => {
      const url = buildUrl(api.dbManagement.updateConnection.path, { id });
      const data = await fetchJson<DbConnectionSummary>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to update DB connection",
        },
        {
          method: api.dbManagement.updateConnection.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.updateConnection.responses[200].parse(data);
    },
    onSuccess: (connection) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: databasesQueryKey(connection.id) });
    },
  });
}

export function useDeleteDbConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: number) => {
      const url = buildUrl(api.dbManagement.deleteConnection.path, { id: connectionId });
      const data = await fetchJson(url, {
        code: "REQUEST_FAILED",
        message: "Failed to delete DB connection",
      }, {
        method: api.dbManagement.deleteConnection.method,
      });
      return api.dbManagement.deleteConnection.responses[200].parse(data);
    },
    onSuccess: (_result, connectionId) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      void queryClient.removeQueries({ queryKey: databasesQueryKey(connectionId) });
      void queryClient.removeQueries({ queryKey: latestSnapshotQueryKey(connectionId) });
    },
  });
}

export function useTestDbConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: number) => {
      const url = buildUrl(api.dbManagement.testConnection.path, { id: connectionId });
      const data = await fetchJson<DbConnectionTestResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to test DB connection",
        },
        {
          method: api.dbManagement.testConnection.method,
        },
      );
      return api.dbManagement.testConnection.responses[200].parse(data);
    },
    onSuccess: (_result, connectionId) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: databasesQueryKey(connectionId) });
    },
  });
}

export function useSelectDbDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      connectionId,
      databaseName,
    }: {
      connectionId: number;
      databaseName: string;
    }) => {
      const url = buildUrl(api.dbManagement.selectDatabase.path, { id: connectionId });
      const data = await fetchJson<DbConnectionSummary>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to select database",
        },
        {
          method: api.dbManagement.selectDatabase.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ databaseName }),
        },
      );
      return api.dbManagement.selectDatabase.responses[200].parse(data);
    },
    onSuccess: (connection) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: databasesQueryKey(connection.id) });
    },
  });
}

export function useIntrospectDbSchema() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbSchemaIntrospectRequest;
    }) => {
      const url = buildUrl(api.dbManagement.introspect.path, { id: connectionId });
      const data = await fetchJson<DbSchemaIntrospectResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to introspect database schema",
        },
        {
          method: api.dbManagement.introspect.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.introspect.responses[200].parse(data);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      queryClient.setQueryData(latestSnapshotQueryKey(result.connection.id), result);
    },
  });
}

export function usePreviewDbDiff() {
  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbDiffPreviewRequest;
    }) => {
      const url = buildUrl(api.dbManagement.diffPreview.path, { id: connectionId });
      const data = await fetchJson<DbDiffPreviewResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to compare file and live DB schema",
        },
        {
          method: api.dbManagement.diffPreview.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.diffPreview.responses[200].parse(data);
    },
  });
}

export function useConfirmDbRenames() {
  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbDiffConfirmRenamesRequest;
    }) => {
      const url = buildUrl(api.dbManagement.confirmRenames.path, { id: connectionId });
      const data = await fetchJson<DbDiffPreviewResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to confirm DB rename suggestions",
        },
        {
          method: api.dbManagement.confirmRenames.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.confirmRenames.responses[200].parse(data);
    },
  });
}

export function usePreviewDbSql() {
  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbSqlPreviewRequest;
    }) => {
      const url = buildUrl(api.dbManagement.previewSql.path, { id: connectionId });
      const data = await fetchJson<DbSqlPreviewResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to generate DB SQL preview",
        },
        {
          method: api.dbManagement.previewSql.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.previewSql.responses[200].parse(data);
    },
  });
}

export function useDbDryRun() {
  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbDryRunRequest;
    }) => {
      const url = buildUrl(api.dbManagement.dryRun.path, { id: connectionId });
      const data = await fetchJson<DbDryRunResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to generate DB dry-run summary",
        },
        {
          method: api.dbManagement.dryRun.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.dryRun.responses[200].parse(data);
    },
  });
}


export function useDbHistory(connectionId: number | null, input: DbHistoryListRequest | null) {
  return useQuery({
    queryKey: historyListQueryKey(connectionId, input),
    queryFn: async () => {
      if (!connectionId || !input) {
        return api.dbManagement.listHistory.responses[200].parse({
          connectionId: connectionId ?? 0,
          databaseName: input?.databaseName ?? "",
          entries: [],
        });
      }
      const url = buildUrl(api.dbManagement.listHistory.path, { id: connectionId });
      const data = await fetchJson<DbHistoryListResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to load DB history",
        },
        {
          method: api.dbManagement.listHistory.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.listHistory.responses[200].parse(data);
    },
    enabled: Boolean(connectionId && input?.databaseName),
  });
}

export function useDbHistoryDetail(connectionId: number | null, eventId: number | null) {
  return useQuery({
    queryKey: historyDetailQueryKey(connectionId, eventId),
    queryFn: async () => {
      if (!connectionId || !eventId) {
        throw new Error("connectionId and eventId are required");
      }
      const url = buildUrl(api.dbManagement.historyDetail.path, { id: connectionId, eventId });
      const data = await fetchJson<DbHistoryDetailResponse>(url, {
        code: "REQUEST_FAILED",
        message: "Failed to load DB history entry",
      });
      return api.dbManagement.historyDetail.responses[200].parse(data);
    },
    enabled: Boolean(connectionId && eventId),
  });
}

export function useCompareDbHistory() {
  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbHistoryCompareRequest;
    }) => {
      const url = buildUrl(api.dbManagement.compareHistory.path, { id: connectionId });
      const data = await fetchJson<DbHistoryCompareResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to compare DB history sources",
        },
        {
          method: api.dbManagement.compareHistory.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.compareHistory.responses[200].parse(data);
    },
  });
}

export function useApplyDbChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      connectionId,
      input,
    }: {
      connectionId: number;
      input: DbApplyRequest;
    }) => {
      const url = buildUrl(api.dbManagement.applyChanges.path, { id: connectionId });
      const data = await fetchJson<DbApplyResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to submit DB apply job",
        },
        {
          method: api.dbManagement.applyChanges.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.applyChanges.responses[202].parse(data);
    },
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: historyListQueryKey(variables.connectionId, null) });
      void queryClient.invalidateQueries({ queryKey: latestSnapshotQueryKey(variables.connectionId) });
      void queryClient.setQueryData(
        deployJobDetailQueryKey(variables.connectionId, result.job.id),
        api.dbManagement.deployJobDetail.responses[200].parse(result),
      );
    },
  });
}

export function useDbDeployJobDetail(connectionId: number | null, jobId: string | null) {
  return useQuery({
    queryKey: deployJobDetailQueryKey(connectionId, jobId),
    queryFn: async () => {
      if (!connectionId || !jobId) {
        throw new Error("connectionId and jobId are required");
      }
      const url = buildUrl(api.dbManagement.deployJobDetail.path, { id: connectionId, jobId });
      const data = await fetchJson<DbDeployJobDetailResponse>(url, {
        code: "REQUEST_FAILED",
        message: "Failed to load DB deploy job detail",
      });
      return api.dbManagement.deployJobDetail.responses[200].parse(data);
    },
    enabled: Boolean(connectionId && jobId),
  });
}

export function useDbGraphData(connectionId: number | null, input: DbGraphRequest | null) {
  return useQuery({
    queryKey: graphQueryKey(connectionId, input),
    queryFn: async () => {
      if (!connectionId || !input) {
        return api.dbManagement.graphData.responses[200].parse({
          source: {
            kind: "live",
            connectionId: connectionId ?? 0,
            databaseName: input?.source.kind === "live" ? input.source.databaseName : "",
          },
          mode: input?.mode ?? "full",
          nodes: [],
          edges: [],
          changedTableNames: [],
          availableTableNames: [],
        });
      }
      const url = buildUrl(api.dbManagement.graphData.path, { id: connectionId });
      const data = await fetchJson<DbGraphResponse>(
        url,
        {
          code: "REQUEST_FAILED",
          message: "Failed to load DB graph data",
        },
        {
          method: api.dbManagement.graphData.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.graphData.responses[200].parse(data);
    },
    enabled: Boolean(connectionId && input),
  });
}

export function usePreviewDbVsDbCompare() {
  return useMutation({
    mutationFn: async (input: DbVsDbCompareRequest) => {
      const data = await fetchJson<DbVsDbCompareResponse>(
        api.dbManagement.compareDatabases.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to compare two live databases",
        },
        {
          method: api.dbManagement.compareDatabases.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.compareDatabases.responses[200].parse(data);
    },
  });
}

export function useReviewDbVsDbRenames() {
  return useMutation({
    mutationFn: async (input: DbVsDbRenameReviewRequest) => {
      const data = await fetchJson<DbVsDbCompareResponse>(
        api.dbManagement.reviewDatabaseRenames.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to review DB-vs-DB rename suggestions",
        },
        {
          method: api.dbManagement.reviewDatabaseRenames.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.reviewDatabaseRenames.responses[200].parse(data);
    },
  });
}

export function usePreviewDbVsDbSql() {
  return useMutation({
    mutationFn: async (input: DbVsDbPreviewRequest) => {
      const data = await fetchJson<DbVsDbPreviewResponse>(
        api.dbManagement.previewDatabaseSql.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to generate DB-vs-DB directional preview",
        },
        {
          method: api.dbManagement.previewDatabaseSql.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.previewDatabaseSql.responses[200].parse(data);
    },
  });
}

export function useDbVsDbGraphData(input: DbVsDbGraphRequest | null) {
  return useQuery({
    queryKey: dbVsDbGraphQueryKey(input),
    queryFn: async () => {
      if (!input) {
        return api.dbManagement.databaseGraph.responses[200].parse({
          compareResult: {
            context: {
              sourceConnectionId: 0,
              sourceConnectionName: "",
              sourceDatabaseName: "",
              sourceSnapshotHash: "snapshot0",
              targetConnectionId: 0,
              targetConnectionName: "",
              targetDatabaseName: "",
              targetSnapshotHash: "snapshot1",
              scope: "database",
            },
            summary: {
              addedTables: 0,
              removedTables: 0,
              changedTables: 0,
              renameSuggestions: 0,
              pendingRenameConfirmations: 0,
              addedColumns: 0,
              removedColumns: 0,
              changedColumns: 0,
              blockingCount: 0,
            },
            tableChanges: [],
            renameSuggestions: [],
            blockers: [],
            canPreview: false,
            policy: {},
          },
          mode: "full",
          nodes: [],
          edges: [],
          changedTableNames: [],
          availableTableNames: [],
        });
      }
      const data = await fetchJson<DbVsDbGraphResponse>(
        api.dbManagement.databaseGraph.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to load DB-vs-DB graph data",
        },
        {
          method: api.dbManagement.databaseGraph.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.databaseGraph.responses[200].parse(data);
    },
    enabled: Boolean(input),
  });
}

export function useDbComparePolicy() {
  return useQuery({
    queryKey: DB_COMPARE_POLICY_QUERY_KEY,
    queryFn: async () => {
      const data = await fetchJson<DbComparePolicy>(
        api.dbManagement.getComparePolicy.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to load DB compare policy",
        },
      );
      return api.dbManagement.getComparePolicy.responses[200].parse(data);
    },
  });
}

export function useUpdateDbComparePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DbComparePolicy) => {
      const data = await fetchJson<DbComparePolicy>(
        api.dbManagement.updateComparePolicy.path,
        {
          code: "REQUEST_FAILED",
          message: "Failed to update DB compare policy",
        },
        {
          method: api.dbManagement.updateComparePolicy.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return api.dbManagement.updateComparePolicy.responses[200].parse(data);
    },
    onSuccess: (policy) => {
      queryClient.setQueryData(DB_COMPARE_POLICY_QUERY_KEY, policy);
    },
  });
}
