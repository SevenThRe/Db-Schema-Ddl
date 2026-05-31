import type { DbObjectKind } from "@shared/schema";
import type {
  SqlMemoryQueryPatternInput,
  SqlMemoryValueProfileInput,
  SqlWorkbenchMemoryState,
} from "./sql-memory";

export type WorkbenchResultTab =
  | "results"
  | "explain"
  | "schema-diff"
  | "sync"
  | "inspect"
  | "jobs";

export interface WorkbenchInspectionTarget {
  objectKind: DbObjectKind;
  objectName: string;
  signature: string | null;
  parentObjectName: string | null;
}

export interface SessionQueryTab {
  id: string;
  label: string;
  sql: string;
  connectionId: string | null;
}

export interface SavedSqlSnippet {
  id: string;
  name: string;
  sql: string;
  updatedAt: string;
}

export type QueryRunMode = "statement" | "script";

export type QueryRunStatus = "success" | "partial" | "failed";

export interface QueryRunHistoryEntry {
  id: string;
  sql: string;
  executedAt: string;
  mode: QueryRunMode;
  status: QueryRunStatus;
  statementCount: number;
  returnedRows: number;
  affectedRows: number;
  elapsedMs: number;
  failedStatementIndex: number | null;
  errorMessage: string | null;
}

export interface WorkbenchSessionState {
  tabs: SessionQueryTab[];
  activeTabId: string | null;
  recentQueries: string[];
  queryHistory: QueryRunHistoryEntry[];
  sqlMemory: SqlWorkbenchMemoryState;
  snippets: SavedSqlSnippet[];
  selectedTableName: string | null;
  activeSchema: string | null;
  lastResultTab: WorkbenchResultTab;
  inspectionTarget: WorkbenchInspectionTarget | null;
  schemaDiffTargetConnectionId: string | null;
  syncSourceConnectionId: string | null;
  syncTargetConnectionId: string | null;
  selectedJobId: string | null;
}

export interface RecordQueryRunInput {
  sql: string;
  mode: QueryRunMode;
  status: QueryRunStatus;
  statementCount: number;
  returnedRows?: number;
  affectedRows?: number;
  elapsedMs?: number;
  failedStatementIndex?: number | null;
  errorMessage?: string | null;
  executedAt?: string;
  memoryPattern?: SqlMemoryQueryPatternInput | null;
  valueProfiles?: SqlMemoryValueProfileInput[];
}
