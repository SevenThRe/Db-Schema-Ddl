import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExplorerBadge } from "./connection-sidebar-explorer-badge";
import { ConnectionSidebarObjectFamilyLists } from "./connection-sidebar-object-family-lists";
import { ConnectionSidebarTableTree } from "./connection-sidebar-table-tree";
import type {
  DbObjectKind,
  DbRoutineSchema,
  DbSchemaSnapshot,
  DbSequenceSchema,
  DbTableSchema,
  DbTriggerSchema,
  DbViewSchema,
} from "@shared/schema";

export interface ConnectionSidebarObjectExplorerProps {
  schemaError?: string | null;
  isSchemaLoading: boolean;
  isPostgres: boolean;
  effectiveSchema: string;
  schemaSnapshot?: DbSchemaSnapshot | null;
  normalizedObjectFilter: string;
  hasExplorerData: boolean;
  hasFilteredExplorerData: boolean;
  visibleTables: DbTableSchema[];
  visibleViews: DbViewSchema[];
  visibleRoutines: DbRoutineSchema[];
  visibleTriggers: DbTriggerSchema[];
  visibleSequences: DbSequenceSchema[];
  selectedTable: DbTableSchema | null;
  expandedTables: Record<string, boolean>;
  inspectedObjectKind?: DbObjectKind | null;
  inspectedObjectName?: string | null;
  inspectedObjectSignature?: string | null;
  inspectedParentObjectName?: string | null;
  onToggleTable: (tableName: string) => void;
  onExpandTable: (tableName: string) => void;
  onSelectTable?: (tableName: string) => void;
  onOpenTable?: (tableName: string) => void;
  onInspectObject?: (
    objectKind: DbObjectKind,
    objectName: string,
    options?: {
      signature?: string | null;
      parentObjectName?: string | null;
    },
  ) => void;
}

export function ConnectionSidebarObjectExplorer({
  schemaError,
  isSchemaLoading,
  isPostgres,
  effectiveSchema,
  schemaSnapshot,
  normalizedObjectFilter,
  hasExplorerData,
  hasFilteredExplorerData,
  visibleTables,
  visibleViews,
  visibleRoutines,
  visibleTriggers,
  visibleSequences,
  selectedTable,
  expandedTables,
  inspectedObjectKind,
  inspectedObjectName,
  inspectedObjectSignature,
  inspectedParentObjectName,
  onToggleTable,
  onExpandTable,
  onSelectTable,
  onOpenTable,
  onInspectObject,
}: ConnectionSidebarObjectExplorerProps) {
  return (
    <ScrollArea className="min-h-0 flex-1 rounded-md border border-border bg-background/70">
      <div className="flex flex-col py-1">
        {schemaError ? (
          <div className="px-2 py-2">
            <Alert variant="destructive" className="rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs">数据库当前不可连接</AlertTitle>
              <AlertDescription className="text-xs break-all">
                {schemaError}
              </AlertDescription>
            </Alert>
          </div>
        ) : !hasExplorerData ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            {isSchemaLoading ? "Loading schema..." : "No objects loaded"}
          </div>
        ) : !hasFilteredExplorerData ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No objects match the current filter.
          </div>
        ) : (
          <div className="py-1">
            <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Schemas
            </div>
            <div className="px-1">
              <div className="flex items-center justify-between rounded-sm px-2.5 py-2 text-xs hover:bg-muted/50">
                <span className="truncate font-mono text-foreground">
                  {schemaSnapshot?.schema ?? effectiveSchema}
                </span>
                {isPostgres ? (
                  <ExplorerBadge tone="neutral" className="shrink-0">
                    active
                  </ExplorerBadge>
                ) : null}
              </div>
            </div>

            <ConnectionSidebarTableTree
              visibleTables={visibleTables}
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

            <ConnectionSidebarObjectFamilyLists
              normalizedObjectFilter={normalizedObjectFilter}
              visibleViews={visibleViews}
              visibleRoutines={visibleRoutines}
              visibleTriggers={visibleTriggers}
              visibleSequences={visibleSequences}
              inspectedObjectKind={inspectedObjectKind}
              inspectedObjectName={inspectedObjectName}
              inspectedObjectSignature={inspectedObjectSignature}
              inspectedParentObjectName={inspectedParentObjectName}
              onInspectObject={onInspectObject}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
