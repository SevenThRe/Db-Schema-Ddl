import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Code2,
  Columns2,
  GitCompare,
  Layers,
  List,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dbSnapshotDiffToDiffEntries } from "@/components/diff-viewer";
import { dbSnapshotDiffToStructuredEntries } from "@/components/diff-viewer/structured-adapter";
import { StructuredDiffContent } from "@/components/diff-viewer/StructuredDiffContent";
import { MonacoDdlDiff } from "@/components/diff-viewer/MonacoDdlDiff";
import type { DbConnectionConfig, DbSchemaDiffResult, DbSchemaSnapshot } from "@shared/schema";

export interface DbSchemaDiffViewerProps {
  source: DbSchemaSnapshot;
  target: DbSchemaSnapshot;
  result: DbSchemaDiffResult;
  onReset?: () => void;
  resetLabel?: string;
}

export function DbSchemaDiffViewer({
  source,
  target,
  result,
  onReset,
  resetLabel = "重新配置",
}: DbSchemaDiffViewerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tabMode, setTabMode] = useState<"structured" | "ddl">("structured");
  const [monacoSideBySide, setMonacoSideBySide] = useState(true);

  const entries = useMemo(
    () => dbSnapshotDiffToDiffEntries(source, target, result),
    [source, target, result],
  );
  const structuredEntries = useMemo(
    () => dbSnapshotDiffToStructuredEntries(source, target, result),
    [source, target, result],
  );

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? entries[0] ?? null;
  const selectedStructured =
    structuredEntries.find((entry) => entry.key === selectedKey) ?? structuredEntries[0] ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-1.5">
        {onReset ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onReset}>
            ← {resetLabel}
          </Button>
        ) : null}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-muted-foreground truncate block">
            {result.sourceLabel} → {result.targetLabel}
          </span>
        </div>
        {tabMode === "ddl" ? (
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <Button
              size="icon"
              variant={!monacoSideBySide ? "secondary" : "ghost"}
              className="h-5 w-5"
              onClick={() => setMonacoSideBySide(false)}
              aria-label="Show inline diff"
              title="Inline"
            >
              <List className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant={monacoSideBySide ? "secondary" : "ghost"}
              className="h-5 w-5"
              onClick={() => setMonacoSideBySide(true)}
              aria-label="Show side by side diff"
              title="Side by side"
            >
              <Columns2 className="h-3 w-3" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 flex gap-3 border-b border-border px-3 py-1 text-[11px]">
        {result.addedTables > 0 ? <span className="text-emerald-600">+{result.addedTables} 追加</span> : null}
        {result.removedTables > 0 ? <span className="text-red-600">−{result.removedTables} 削除</span> : null}
        {result.modifiedTables > 0 ? <span className="text-amber-600">△{result.modifiedTables} 変更</span> : null}
        {result.unchangedTables > 0 ? (
          <span className="text-muted-foreground">{result.unchangedTables} 変更なし</span>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 opacity-60" />
          <p className="text-sm text-muted-foreground">两个 Schema 完全一致</p>
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-border px-3 py-1.5">
            <select
              value={selectedEntry?.key ?? ""}
              onChange={(event) => setSelectedKey(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs h-7"
            >
              {entries.map((entry, index) => {
                const structuredEntry = structuredEntries[index];
                const columnCount = structuredEntry?.columnChanges.length ?? 0;
                return (
                  <option key={entry.key} value={entry.key}>
                    {entry.action === "added" ? "+" : entry.action === "removed" ? "−" : "△"}
                    {" "}{entry.tableName}
                    {columnCount > 0 ? `  (${columnCount} cols)` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="shrink-0 flex items-center gap-0.5 border-b border-border/50 bg-muted/20 px-2 py-0.5">
            <button
              type="button"
              onClick={() => setTabMode("structured")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                tabMode === "structured"
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Layers className="h-3 w-3" />
              Structured
            </button>
            <button
              type="button"
              onClick={() => setTabMode("ddl")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                tabMode === "ddl"
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Code2 className="h-3 w-3" />
              DDL Diff
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {tabMode === "structured" && selectedStructured ? (
              <StructuredDiffContent entry={selectedStructured} />
            ) : selectedEntry ? (
              <MonacoDdlDiff
                oldValue={selectedEntry.oldDdl}
                newValue={selectedEntry.newDdl}
                sideBySide={monacoSideBySide}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export interface WorkbenchSchemaDiffPaneProps {
  sourceConnection: DbConnectionConfig;
  connections: DbConnectionConfig[];
  targetConnectionId: string;
  onTargetConnectionChange: (id: string) => void;
  onCompare: () => void;
  isComparing: boolean;
  issue?: string | null;
  sourceSnapshot: DbSchemaSnapshot | null;
  targetSnapshot: DbSchemaSnapshot | null;
  result: DbSchemaDiffResult | null;
  onReset: () => void;
}

export function WorkbenchSchemaDiffPane({
  sourceConnection,
  connections,
  targetConnectionId,
  onTargetConnectionChange,
  onCompare,
  isComparing,
  issue,
  sourceSnapshot,
  targetSnapshot,
  result,
  onReset,
}: WorkbenchSchemaDiffPaneProps) {
  const targetConnection =
    connections.find((connection) => connection.id === targetConnectionId) ?? null;
  const compareTargets = connections.filter((connection) => connection.id !== sourceConnection.id);

  if (result && sourceSnapshot && targetSnapshot) {
    return (
      <DbSchemaDiffViewer
        source={sourceSnapshot}
        target={targetSnapshot}
        result={result}
        onReset={onReset}
        resetLabel="更换目标"
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {issue ? (
        <div className="shrink-0 border-b border-border bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Schema compare failed: {issue}
        </div>
      ) : null}

      <div className="shrink-0 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
            schema source → target
          </span>
          <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
            {sourceConnection.name || sourceConnection.database}
          </span>
          {targetConnection ? (
            <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
              {targetConnection.name || targetConnection.database}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-full border border-border bg-muted/30 p-3">
          <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Compare active schema against another saved connection
          </p>
          <p className="text-xs text-muted-foreground">
            The active workbench connection is the schema diff source. Select a target connection and run compare.
          </p>
        </div>

        <div className="w-full max-w-[420px] space-y-3 rounded-sm border border-border bg-panel-muted/40 p-3 text-left">
          <div className="space-y-1">
            <label htmlFor="workbench-schema-diff-target" className="text-[11px] font-medium text-muted-foreground">
              Target connection
            </label>
            <select
              id="workbench-schema-diff-target"
              value={targetConnectionId}
              onChange={(event) => onTargetConnectionChange(event.target.value)}
              className="h-8 w-full rounded-sm border border-border bg-background px-2 text-xs"
            >
              {compareTargets.length === 0 ? (
                <option value="">No alternate saved connections</option>
              ) : null}
              {compareTargets.map((connection) => (
                <option key={`schema-diff-${connection.id}`} value={connection.id}>
                  {connection.name || connection.database} / {connection.driver} / {connection.database}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
              source: {sourceConnection.driver}
            </Badge>
            {targetConnection ? (
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                target: {targetConnection.driver}
              </Badge>
            ) : null}
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8 w-full text-xs"
            disabled={!targetConnectionId || isComparing || compareTargets.length === 0}
            onClick={onCompare}
          >
            {isComparing ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Comparing schema...
              </>
            ) : (
              <>
                <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                Compare active → target
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
