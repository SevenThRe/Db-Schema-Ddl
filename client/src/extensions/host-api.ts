// Host API — 拡張がホストと通信するためのインターフェース
//
// V1: builtin 拡張はこのインターフェース経由で宿主能力にアクセスする。
// V2: external 拡張は message passing 経由でアクセスする。

import type {
  DbConnectionConfig,
  DbSchemaSnapshot,
  DbSchemaDiffResult,
  QueryExecutionRequest,
  QueryExecutionResponse,
  ExplainRequest,
  DbExplainPlan,
  DangerousSqlPreview,
  BinaryCommandResult,
  ExportRowsRequest,
  FetchMoreRequest,
  DbQueryBatchResult,
  DbGridPrepareCommitRequest,
  DbGridPrepareCommitResponse,
  DbGridCommitRequest,
  DbGridCommitResponse,
} from "@shared/schema";
import type { StatusBarEntryInput } from "@/status-bar/types";

/** トースト通知オプション */
export interface ToastOptions {
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

/** メインサーフェス — Dashboard の表示切替対象 */
export type MainSurface =
  | { kind: "workspace" }
  | { kind: "ddl-import" }
  | { kind: "extensions" }
  | { kind: "extension"; extensionId: string; panelId: string };

/** データベース接続操作 API */
export interface ConnectionsApi {
  list(): Promise<DbConnectionConfig[]>;
  save(config: DbConnectionConfig): Promise<DbConnectionConfig>;
  remove(id: string): Promise<void>;
  test(config: DbConnectionConfig): Promise<string>;
  introspect(connectionId: string): Promise<DbSchemaSnapshot>;
  listSchemas?(connectionId: string): Promise<string[]>;
  diff(sourceId: string, targetId: string): Promise<DbSchemaDiffResult>;
  // Phase 1 DB 工作台 — クエリ実行・エクスポート・EXPLAIN
  executeQuery(request: QueryExecutionRequest): Promise<QueryExecutionResponse>;
  explainQuery(request: ExplainRequest): Promise<DbExplainPlan>;
  cancelQuery(requestId: string): Promise<void>;
  previewDangerousSql(connectionId: string, sql: string): Promise<DangerousSqlPreview>;
  exportRows(request: ExportRowsRequest): Promise<BinaryCommandResult>;
  fetchMore(request: FetchMoreRequest): Promise<DbQueryBatchResult>;
  prepareGridCommit(request: DbGridPrepareCommitRequest): Promise<DbGridPrepareCommitResponse>;
  commitGridEdits(request: DbGridCommitRequest): Promise<DbGridCommitResponse>;
}

/** 通知 API */
export interface NotificationsApi {
  show(options: ToastOptions): void;
}

/** ステータスバー API */
export interface StatusBarApi {
  set(entry: StatusBarEntryInput): () => void;
  clear(id: string): void;
  clearAll(): void;
}

/** ホストが拡張に提供する API */
export interface HostApi {
  notifications: NotificationsApi;
  connections: ConnectionsApi;
  statusBar: StatusBarApi;
}
