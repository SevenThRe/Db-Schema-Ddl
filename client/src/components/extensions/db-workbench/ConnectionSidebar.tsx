// DB Workbench left sidebar.
//
// Shows the active connection context, schema controls, and shipped explorer surfaces that
// anchor the canonical workbench route. This file now reflects current runtime behavior, not a
// future phase placeholder.

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { ConnectionSidebarConnectionControl } from "./connection-sidebar-connection-control";
import { buildConnectionSidebarModel } from "./connection-sidebar-model";
import { ConnectionSidebarObjectExplorer } from "./connection-sidebar-object-explorer";
import {
  ConnectionSidebarObjectExplorerHeader,
  ConnectionSidebarObjectFilter,
} from "./connection-sidebar-sections";
import { ConnectionSidebarTableStructure } from "./connection-sidebar-table-structure";
import type {
  DbConnectionConfig,
  DbObjectKind,
  DbSchemaSnapshot,
} from "@shared/schema";

// ──────────────────────────────────────────────
// プロップ型
// ──────────────────────────────────────────────

export interface ConnectionSidebarProps {
  /** 現在アクティブな接続設定 */
  connection: DbConnectionConfig;
  /** 切替先として表示する全接続リスト */
  connections: DbConnectionConfig[];
  /** 接続切替コールバック */
  onSwitchConnection: (id: string) => void;
  /** PostgreSQL の実行スキーマ */
  activeSchema?: string;
  /** PostgreSQL スキーマ候補 */
  schemaOptions?: string[];
  /** PostgreSQL スキーマ候補取得中 */
  isSchemaListLoading?: boolean;
  /** PostgreSQL スキーマ変更コールバック */
  onSchemaChange?: (schema: string) => void;
  /** 当前连接的 Schema 快照 */
  schemaSnapshot?: DbSchemaSnapshot | null;
  /** 当前连接的 Schema 加载错误 */
  schemaError?: string | null;
  /** Schema 是否正在刷新 */
  isSchemaLoading?: boolean;
  /** 刷新 Schema */
  onRefreshSchema?: () => void;
  /** 当前选中的表 */
  selectedTableName?: string | null;
  /** 当前 inspection 目标类型 */
  inspectedObjectKind?: DbObjectKind | null;
  /** 当前 inspection 目标名称 */
  inspectedObjectName?: string | null;
  /** 当前 inspection 目标签名（函数/过程重载识别） */
  inspectedObjectSignature?: string | null;
  /** 当前 inspection 的父对象名称（例如 trigger 所属表） */
  inspectedParentObjectName?: string | null;
  /** 从对象树选中表 */
  onSelectTable?: (tableName: string) => void;
  /** 从对象树打开表 */
  onOpenTable?: (tableName: string) => void;
  /** 从对象树打开对象 inspection */
  onInspectObject?: (
    objectKind: DbObjectKind,
    objectName: string,
    options?: {
      signature?: string | null;
      parentObjectName?: string | null;
    },
  ) => void;
  /** 从对象树快速插入/执行查询模板 */
  onRunStarterQuery?: (
    tableName: string,
    mode: "select" | "count" | "columns",
  ) => void;
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * DB 工作台 左サイドバー
 *
 * アクティブ接続の名前・環境色ドット・読み取り専用アイコン・ドライバーバッジを表示し、
 * 接続切替ドロップダウンを提供する。
 * Phase 2 では下部に object tree が追加される（スペース確保済み）。
 */
export function ConnectionSidebar({
  connection,
  connections,
  onSwitchConnection,
  activeSchema,
  schemaOptions = [],
  isSchemaListLoading = false,
  onSchemaChange,
  schemaSnapshot,
  schemaError,
  isSchemaLoading = false,
  onRefreshSchema,
  selectedTableName,
  inspectedObjectKind,
  inspectedObjectName,
  inspectedObjectSignature,
  inspectedParentObjectName,
  onSelectTable,
  onOpenTable,
  onInspectObject,
  onRunStarterQuery,
}: ConnectionSidebarProps) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [objectFilter, setObjectFilter] = useState("");

  const model = buildConnectionSidebarModel({
    connection,
    activeSchema,
    schemaOptions,
    schemaSnapshot,
    schemaError,
    isSchemaLoading,
    objectFilter,
    selectedTableName,
    inspectedObjectKind,
    inspectedObjectName,
  });

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !(prev[tableName] ?? tableName === model.selectedTable?.name),
    }));
  };

  return (
    <div className="flex h-full w-[256px] min-w-[256px] flex-col gap-2.5 border-r border-border bg-sidebar p-2.5">
      <ConnectionSidebarConnectionControl
        connection={connection}
        connections={connections}
        onSwitchConnection={onSwitchConnection}
        switchOpen={switchOpen}
        onSwitchOpenChange={setSwitchOpen}
        isPostgres={model.isPostgres}
        activeSchema={model.effectiveSchema}
        schemaSelectOptions={model.schemaSelectOptions}
        isSchemaListLoading={isSchemaListLoading}
        onSchemaChange={onSchemaChange}
        hasExplorerData={model.hasExplorerData}
        filteredSummary={model.filteredSummary}
        connectionStateLabel={model.connectionStateLabel}
        connectionStateClass={model.connectionStateClass}
      />

      <ConnectionSidebarObjectExplorerHeader
        isSchemaLoading={isSchemaLoading}
        onRefreshSchema={onRefreshSchema}
      />

      <ConnectionSidebarObjectFilter
        objectFilter={objectFilter}
        onObjectFilterChange={setObjectFilter}
        onClearObjectFilter={() => setObjectFilter("")}
      />

      <ConnectionSidebarObjectExplorer
        schemaError={schemaError}
        isSchemaLoading={isSchemaLoading}
        isPostgres={model.isPostgres}
        effectiveSchema={model.effectiveSchema}
        schemaSnapshot={schemaSnapshot}
        normalizedObjectFilter={model.normalizedObjectFilter}
        hasExplorerData={model.hasExplorerData}
        hasFilteredExplorerData={model.hasFilteredExplorerData}
        visibleTables={model.visibleTables}
        visibleViews={model.visibleViews}
        visibleRoutines={model.visibleRoutines}
        visibleTriggers={model.visibleTriggers}
        visibleSequences={model.visibleSequences}
        selectedTable={model.selectedTable}
        expandedTables={expandedTables}
        inspectedObjectKind={inspectedObjectKind}
        inspectedObjectName={inspectedObjectName}
        inspectedObjectSignature={inspectedObjectSignature}
        inspectedParentObjectName={inspectedParentObjectName}
        onToggleTable={toggleTable}
        onExpandTable={(tableName) =>
          setExpandedTables((prev) => ({ ...prev, [tableName]: true }))
        }
        onSelectTable={onSelectTable}
        onOpenTable={onOpenTable}
        onInspectObject={onInspectObject}
      />
      <Separator />

      <ConnectionSidebarTableStructure
        selectedTable={model.selectedTable}
        isSelectedTableInspected={model.isSelectedTableInspected}
        onInspectTable={(tableName) => onInspectObject?.("table", tableName)}
        onOpenTable={onOpenTable}
        onRunStarterQuery={onRunStarterQuery}
      />
    </div>
  );
}
