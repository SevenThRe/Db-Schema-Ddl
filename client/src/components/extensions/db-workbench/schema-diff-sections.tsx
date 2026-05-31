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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  DiffTableEntry,
  StructuredDiffEntry,
} from "@/components/diff-viewer";
import { MonacoDdlDiff } from "@/components/diff-viewer/MonacoDdlDiff";
import { StructuredDiffContent } from "@/components/diff-viewer/StructuredDiffContent";
import { cn } from "@/lib/utils";
import type {
  DbConnectionConfig,
  DbSchemaDiffResult,
} from "@shared/schema";

export type SchemaDiffTabMode = "structured" | "ddl";

export function SchemaDiffViewerLayout({
  result,
  entries,
  structuredEntries,
  selectedEntry,
  selectedStructured,
  selectedKey,
  tabMode,
  monacoSideBySide,
  onSelectedKeyChange,
  onTabModeChange,
  onMonacoSideBySideChange,
  onReset,
  resetLabel,
}: {
  result: DbSchemaDiffResult;
  entries: DiffTableEntry[];
  structuredEntries: StructuredDiffEntry[];
  selectedEntry: DiffTableEntry | null;
  selectedStructured: StructuredDiffEntry | null;
  selectedKey: string;
  tabMode: SchemaDiffTabMode;
  monacoSideBySide: boolean;
  onSelectedKeyChange: (key: string) => void;
  onTabModeChange: (mode: SchemaDiffTabMode) => void;
  onMonacoSideBySideChange: (sideBySide: boolean) => void;
  onReset?: () => void;
  resetLabel: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <SchemaDiffViewerHeader
        result={result}
        tabMode={tabMode}
        monacoSideBySide={monacoSideBySide}
        onMonacoSideBySideChange={onMonacoSideBySideChange}
        onReset={onReset}
        resetLabel={resetLabel}
      />
      <SchemaDiffSummaryBar result={result} />

      {entries.length === 0 ? (
        <SchemaDiffEmptyResult />
      ) : (
        <>
          <SchemaDiffEntrySelector
            entries={entries}
            structuredEntries={structuredEntries}
            selectedKey={selectedKey}
            onSelectedKeyChange={onSelectedKeyChange}
          />
          <SchemaDiffModeTabs
            tabMode={tabMode}
            onTabModeChange={onTabModeChange}
          />
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

function SchemaDiffViewerHeader({
  result,
  tabMode,
  monacoSideBySide,
  onMonacoSideBySideChange,
  onReset,
  resetLabel,
}: {
  result: DbSchemaDiffResult;
  tabMode: SchemaDiffTabMode;
  monacoSideBySide: boolean;
  onMonacoSideBySideChange: (sideBySide: boolean) => void;
  onReset?: () => void;
  resetLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
      {onReset ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={onReset}
        >
          ← {resetLabel}
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[10px] text-muted-foreground">
          {result.sourceLabel} → {result.targetLabel}
        </span>
      </div>
      {tabMode === "ddl" ? (
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button
            size="icon"
            variant={!monacoSideBySide ? "secondary" : "ghost"}
            className="h-5 w-5"
            onClick={() => onMonacoSideBySideChange(false)}
            aria-label="Show inline diff"
            title="Inline"
          >
            <List className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant={monacoSideBySide ? "secondary" : "ghost"}
            className="h-5 w-5"
            onClick={() => onMonacoSideBySideChange(true)}
            aria-label="Show side by side diff"
            title="Side by side"
          >
            <Columns2 className="h-3 w-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SchemaDiffSummaryBar({ result }: { result: DbSchemaDiffResult }) {
  return (
    <div className="flex shrink-0 gap-3 border-b border-border px-3 py-1 text-[11px]">
      {result.addedTables > 0 ? (
        <span className="text-emerald-600">+{result.addedTables} 追加</span>
      ) : null}
      {result.removedTables > 0 ? (
        <span className="text-red-600">−{result.removedTables} 削除</span>
      ) : null}
      {result.modifiedTables > 0 ? (
        <span className="text-amber-600">△{result.modifiedTables} 変更</span>
      ) : null}
      {result.unchangedTables > 0 ? (
        <span className="text-muted-foreground">
          {result.unchangedTables} 変更なし
        </span>
      ) : null}
    </div>
  );
}

function SchemaDiffEmptyResult() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
      <CheckCircle2 className="h-7 w-7 text-emerald-500 opacity-60" />
      <p className="text-sm text-muted-foreground">两个 Schema 完全一致</p>
    </div>
  );
}

function SchemaDiffEntrySelector({
  entries,
  structuredEntries,
  selectedKey,
  onSelectedKeyChange,
}: {
  entries: DiffTableEntry[];
  structuredEntries: StructuredDiffEntry[];
  selectedKey: string;
  onSelectedKeyChange: (key: string) => void;
}) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-1.5">
      <select
        value={selectedKey}
        onChange={(event) => onSelectedKeyChange(event.target.value)}
        className="h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        {entries.map((entry, index) => {
          const structuredEntry = structuredEntries[index];
          const columnCount = structuredEntry?.columnChanges.length ?? 0;
          return (
            <option key={entry.key} value={entry.key}>
              {entry.action === "added"
                ? "+"
                : entry.action === "removed"
                  ? "−"
                  : "△"}{" "}
              {entry.tableName}
              {columnCount > 0 ? `  (${columnCount} cols)` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function SchemaDiffModeTabs({
  tabMode,
  onTabModeChange,
}: {
  tabMode: SchemaDiffTabMode;
  onTabModeChange: (mode: SchemaDiffTabMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border/50 bg-muted/20 px-2 py-0.5">
      <SchemaDiffModeTabButton
        active={tabMode === "structured"}
        icon={<Layers className="h-3 w-3" />}
        label="Structured"
        onClick={() => onTabModeChange("structured")}
      />
      <SchemaDiffModeTabButton
        active={tabMode === "ddl"}
        icon={<Code2 className="h-3 w-3" />}
        label="DDL Diff"
        onClick={() => onTabModeChange("ddl")}
      />
    </div>
  );
}

function SchemaDiffModeTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border border-border/50 bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SchemaDiffSetupView({
  sourceConnection,
  targetConnection,
  compareTargets,
  targetConnectionId,
  issue,
  isComparing,
  onTargetConnectionChange,
  onCompare,
}: {
  sourceConnection: DbConnectionConfig;
  targetConnection: DbConnectionConfig | null;
  compareTargets: DbConnectionConfig[];
  targetConnectionId: string;
  issue?: string | null;
  isComparing: boolean;
  onTargetConnectionChange: (id: string) => void;
  onCompare: () => void;
}) {
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
            The active workbench connection is the schema diff source. Select a
            target connection and run compare.
          </p>
        </div>

        <div className="w-full max-w-[420px] space-y-3 rounded-sm border border-border bg-panel-muted/40 p-3 text-left">
          <div className="space-y-1">
            <label
              htmlFor="workbench-schema-diff-target"
              className="text-[11px] font-medium text-muted-foreground"
            >
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
                <option
                  key={`schema-diff-${connection.id}`}
                  value={connection.id}
                >
                  {connection.name || connection.database} / {connection.driver} /{" "}
                  {connection.database}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="h-5 rounded-sm px-1.5 text-[10px]"
            >
              source: {sourceConnection.driver}
            </Badge>
            {targetConnection ? (
              <Badge
                variant="outline"
                className="h-5 rounded-sm px-1.5 text-[10px]"
              >
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
