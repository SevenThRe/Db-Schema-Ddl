import { useMemo, useState } from "react";
import { ArrowLeftRight, Database, GitCompare, Rows3 } from "lucide-react";
import { StructuredDiffContent, MonacoDdlDiff } from "@/components/diff-viewer";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  dataSyncRowDiffToStructuredEntry,
  type DataSyncRowDiffEntry,
} from "./data-sync-row-diff";

export interface DataSyncRowDiffPaneProps {
  entry: DataSyncRowDiffEntry | null;
  className?: string;
}

function actionTone(action: DataSyncRowDiffEntry["suggestedAction"]) {
  if (action === "insert") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300";
  if (action === "update") return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
  if (action === "delete") return "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300";
  return "bg-muted/60 text-muted-foreground border-border";
}

function statusTone(status: DataSyncRowDiffEntry["status"]) {
  if (status === "source_only") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300";
  if (status === "target_only") return "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300";
  if (status === "value_changed") return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
  return "bg-muted/60 text-muted-foreground border-border";
}

function formatRowKey(rowKey: Record<string, string | number | null>): string {
  return Object.entries(rowKey)
    .map(([key, value]) => `${key}=${value ?? "null"}`)
    .join(", ");
}

export function DataSyncRowDiffPane({ entry, className }: DataSyncRowDiffPaneProps) {
  const [mode, setMode] = useState<"structured" | "json">("structured");

  const structuredEntry = useMemo(
    () => (entry ? dataSyncRowDiffToStructuredEntry(entry) : null),
    [entry],
  );

  if (!entry || !structuredEntry) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-3 text-center", className)}>
        <div className="rounded-full border border-border bg-muted/30 p-3">
          <GitCompare className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">选择一条差异记录</p>
          <p className="text-xs text-muted-foreground">
            这里会复用现有 diff-viewer 显示行级字段变化和 JSON 差异。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Rows3 className="h-4 w-4 text-muted-foreground" />
            <span className="truncate font-mono text-sm font-semibold">{entry.tableName}</span>
            <Badge variant="outline" className={cn("text-[10px]", statusTone(entry.status))}>
              {entry.status}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", actionTone(entry.suggestedAction))}>
              {entry.suggestedAction ?? "ignore"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Database className="h-3 w-3" />
            <span className="truncate">{formatRowKey(entry.rowKey)}</span>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(value) => setMode(value as "structured" | "json")}>
          <TabsList className="h-7 border border-border bg-muted/20 p-0.5">
            <TabsTrigger value="structured" className="h-6 px-2 text-[11px]">
              结构化
            </TabsTrigger>
            <TabsTrigger value="json" className="h-6 px-2 text-[11px]">
              JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === "structured" ? (
          <StructuredDiffContent entry={structuredEntry} />
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Source / Target JSON diff
            </div>
            <div className="flex-1 overflow-hidden">
              <MonacoDdlDiff
                oldValue={structuredEntry.oldDdl}
                newValue={structuredEntry.newDdl}
                language="json"
                sideBySide
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
