import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHostApiFor } from "@/extensions/host-context";
import type { ExtensionSidebarViewProps } from "@/extensions/sidebar-view-registry";
import {
  readStoredDbConnectorConnectionId,
  subscribeDbConnectorConnectionSelection,
} from "./db-connector-sidebar-events";
import { Database, Loader2, Table2 } from "lucide-react";

export function DbExplorerSidebarView({
  extensionId,
  workbenchViewId,
  onOpenWorkbenchView,
}: ExtensionSidebarViewProps) {
  const host = useHostApiFor(extensionId);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(() =>
    readStoredDbConnectorConnectionId(),
  );

  useEffect(
    () => subscribeDbConnectorConnectionSelection((connectionId) => setSelectedConnectionId(connectionId)),
    [],
  );

  const { data: connections = [] } = useQuery({
    queryKey: ["db-connector", "sidebar", "connections"],
    queryFn: () => host.connections.list(),
    staleTime: 15_000,
  });

  const activeConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["db-connector", "sidebar", "explorer", selectedConnectionId],
    queryFn: () => host.connections.introspect(selectedConnectionId as string),
    enabled: !!selectedConnectionId,
    staleTime: 15_000,
  });

  const previewTables = useMemo(
    () => [...(snapshot?.tables ?? [])].slice(0, 12),
    [snapshot],
  );

  if (!selectedConnectionId || !activeConnection) {
    return (
      <div className="rounded-md border border-dashed border-slate-200/80 bg-white/70 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
        Select a saved connection from the Connections tab to load explorer context.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-950 dark:text-slate-50">
              {activeConnection.name || activeConnection.database}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {activeConnection.driver}://{activeConnection.host}:{activeConnection.port}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {(snapshot?.tables ?? []).length} tables
          </Badge>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {(snapshot?.views ?? []).length} views
          </Badge>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {(snapshot?.routines ?? []).length} routines
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[180px] items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading schema snapshot...
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 rounded-md border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="space-y-1.5 p-2">
            {previewTables.length === 0 ? (
              <div className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400">
                No tables available in the current snapshot.
              </div>
            ) : (
              previewTables.map((table) => (
                <div
                  key={table.name}
                  className="rounded-md border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex items-center gap-2">
                    <Table2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    <p className="truncate font-mono text-[11px] font-semibold text-slate-950 dark:text-slate-100">
                      {table.name}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {table.columns.length} columns
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full text-xs"
        onClick={() => onOpenWorkbenchView(workbenchViewId)}
      >
        Open Database Workspace
      </Button>
    </div>
  );
}
