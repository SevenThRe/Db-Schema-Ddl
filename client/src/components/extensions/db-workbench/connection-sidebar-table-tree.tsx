import { ChevronDown, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  filterTableContents,
  tableMatchesFilter,
} from "./connection-sidebar-object-filter";
import { ExplorerBadge } from "./connection-sidebar-explorer-badge";
import type { DbObjectKind, DbTableSchema } from "@shared/schema";

type InspectObjectHandler = (
  objectKind: DbObjectKind,
  objectName: string,
  options?: {
    signature?: string | null;
    parentObjectName?: string | null;
  },
) => void;

export interface ConnectionSidebarTableTreeProps {
  visibleTables: DbTableSchema[];
  selectedTable: DbTableSchema | null;
  normalizedObjectFilter: string;
  expandedTables: Record<string, boolean>;
  inspectedObjectKind?: DbObjectKind | null;
  inspectedObjectName?: string | null;
  inspectedParentObjectName?: string | null;
  onToggleTable: (tableName: string) => void;
  onExpandTable: (tableName: string) => void;
  onSelectTable?: (tableName: string) => void;
  onOpenTable?: (tableName: string) => void;
  onInspectObject?: InspectObjectHandler;
}

export function ConnectionSidebarTableTree({
  visibleTables,
  selectedTable,
  normalizedObjectFilter,
  expandedTables,
  inspectedObjectKind,
  inspectedObjectName,
  inspectedParentObjectName,
  onToggleTable,
  onExpandTable,
  onSelectTable,
  onOpenTable,
  onInspectObject,
}: ConnectionSidebarTableTreeProps) {
  return (
    <>
      <div className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Tables
      </div>
      {visibleTables.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {normalizedObjectFilter ? "No tables match the filter" : "No tables"}
        </div>
      ) : (
        visibleTables.map((table) => (
          <ConnectionSidebarTableTreeItem
            key={table.name}
            table={table}
            selectedTable={selectedTable}
            normalizedObjectFilter={normalizedObjectFilter}
            expandedTables={expandedTables}
            inspectedObjectKind={inspectedObjectKind}
            inspectedObjectName={inspectedObjectName}
            inspectedParentObjectName={inspectedParentObjectName}
            onToggleTable={onToggleTable}
            onExpandTable={onExpandTable}
            onSelectTable={onSelectTable}
            onOpenTable={onOpenTable}
            onInspectObject={onInspectObject}
          />
        ))
      )}
    </>
  );
}

type ConnectionSidebarTableTreeItemProps = Omit<
  ConnectionSidebarTableTreeProps,
  "visibleTables"
> & {
  table: DbTableSchema;
};

function ConnectionSidebarTableTreeItem({
  table,
  selectedTable,
  normalizedObjectFilter,
  expandedTables,
  inspectedObjectKind,
  inspectedObjectName,
  inspectedParentObjectName,
  onToggleTable,
  onExpandTable,
  onSelectTable,
  onOpenTable,
  onInspectObject,
}: ConnectionSidebarTableTreeItemProps) {
  const isSelected = table.name === selectedTable?.name;
  const isInspected = inspectedObjectKind === "table" && inspectedObjectName === table.name;
  const tableFilterState = filterTableContents(table, normalizedObjectFilter);
  const shouldAutoExpand =
    isSelected ||
    (normalizedObjectFilter.length > 0 && tableMatchesFilter(table, normalizedObjectFilter));
  const isExpanded = expandedTables[table.name] ?? shouldAutoExpand;
  const secondaryIndexes = tableFilterState.visibleIndexes.filter((index) => !index.primary);

  return (
    <div className="px-1 py-0.5">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted",
          (isSelected || isInspected) && "bg-muted font-medium",
        )}
        onClick={() => {
          onSelectTable?.(table.name);
          onExpandTable(table.name);
        }}
        onDoubleClick={() => onOpenTable?.(table.name)}
        title={table.name}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            !isExpanded && "-rotate-90",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTable(table.name);
          }}
        />
        <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono">{table.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {table.columns.length}
        </span>
        {isInspected ? (
          <ExplorerBadge tone="success" className="shrink-0">
            DDL
          </ExplorerBadge>
        ) : null}
      </button>

      {isExpanded ? (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
          <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>Columns</span>
            <span>{tableFilterState.visibleColumns.length}</span>
          </div>
          {tableFilterState.visibleColumns.map((column) => (
            <div
              key={`${table.name}:column:${column.name}`}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[11px] hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                {column.name}
              </span>
              {column.primaryKey ? <ExplorerBadge tone="warning">PK</ExplorerBadge> : null}
              {!column.nullable ? <ExplorerBadge tone="neutral">NN</ExplorerBadge> : null}
            </div>
          ))}

          <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>Foreign Keys</span>
            <span>{tableFilterState.visibleForeignKeys.length}</span>
          </div>
          {tableFilterState.visibleForeignKeys.map((foreignKey) => {
            const isForeignKeyInspected =
              inspectedObjectKind === "foreign_key" &&
              inspectedObjectName === foreignKey.name &&
              (inspectedParentObjectName ?? "") === table.name;
            const isReferencedTableInspected =
              inspectedObjectKind === "table" &&
              inspectedObjectName === foreignKey.referencedTable;
            return (
              <div
                key={`${table.name}:fk:${foreignKey.name}`}
                className={cn(
                  "rounded-sm border border-transparent px-2 py-1.5",
                  (isForeignKeyInspected || isReferencedTableInspected) &&
                    "border-border bg-muted/40",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-sm text-left text-[11px] hover:bg-muted/50",
                    isForeignKeyInspected && "font-medium",
                  )}
                  onClick={() =>
                    onInspectObject?.("foreign_key", foreignKey.name, {
                      parentObjectName: table.name,
                    })
                  }
                  title={`Inspect foreign key ${foreignKey.name}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                      {foreignKey.name}
                    </div>
                    {isForeignKeyInspected ? (
                      <ExplorerBadge tone="success" className="shrink-0">
                        DDL
                      </ExplorerBadge>
                    ) : null}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {foreignKey.columns.join(", ")}
                    {" -> "}
                    {foreignKey.referencedTable}
                  </div>
                </button>
                <div className="mt-1 flex items-center gap-1.5 pl-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => onInspectObject?.("table", foreignKey.referencedTable)}
                  >
                    Inspect ref
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => onOpenTable?.(foreignKey.referencedTable)}
                  >
                    Open ref
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>Indexes</span>
            <span>{secondaryIndexes.length}</span>
          </div>
          {secondaryIndexes.map((index) => {
            const isIndexInspected =
              inspectedObjectKind === "index" &&
              inspectedObjectName === index.name &&
              (inspectedParentObjectName ?? "") === table.name;
            return (
              <button
                key={`${table.name}:index:${index.name}`}
                type="button"
                className={cn(
                  "w-full rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-muted/50",
                  isIndexInspected && "bg-muted font-medium",
                )}
                onClick={() =>
                  onInspectObject?.("index", index.name, {
                    parentObjectName: table.name,
                  })
                }
                title={`Inspect index ${index.name}`}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate font-mono text-foreground">
                    {index.name}
                  </div>
                  {isIndexInspected ? (
                    <ExplorerBadge tone="success" className="shrink-0">
                      DDL
                    </ExplorerBadge>
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {index.columns.join(", ")}
                  {index.unique ? " · UNIQUE" : ""}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
