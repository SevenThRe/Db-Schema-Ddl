import { GitCompare } from "lucide-react";
import type {
  DbConnectionConfig,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatDataSyncCounts,
  type SyncTableConfigDraft,
  type SyncTableMetadataIndex,
} from "./data-sync-utils";
import { formatColumnPreview } from "./workbench-collection-utils";

export function DataSyncRouteSummary({
  activeSyncSourceConnection,
  activeSyncTargetConnection,
  diffPreview,
}: {
  activeSyncSourceConnection: DbConnectionConfig;
  activeSyncTargetConnection: DbConnectionConfig;
  diffPreview: DbDataDiffPreviewResponse | null;
}) {
  return (
    <div className="shrink-0 border-b border-border bg-background px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
          source -&gt; target
        </span>
        <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
          {activeSyncSourceConnection.name} -&gt;{" "}
          {activeSyncTargetConnection.name}
        </span>
        {diffPreview ? (
          <>
            <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
              compareId: {diffPreview.compareId}
            </span>
            <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
              {formatDataSyncCounts(diffPreview.statusCounts)}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DataSyncConnectionSelectorBar({
  syncConnectionOptions,
  connectionCount,
  activeConnectionId,
  syncSourceConnectionId,
  syncTargetConnectionId,
  onSourceConnectionChange,
  onTargetConnectionChange,
  onPreviewDataDiff,
  isDiffPreviewing,
  isSyncSchemaLoading,
  syncSchemaIssueMessage,
  syncSelectedTableCount,
}: {
  syncConnectionOptions: DbConnectionConfig[];
  connectionCount: number;
  activeConnectionId: string;
  syncSourceConnectionId: string;
  syncTargetConnectionId: string;
  onSourceConnectionChange: (connectionId: string) => void;
  onTargetConnectionChange: (connectionId: string) => void;
  onPreviewDataDiff: () => void;
  isDiffPreviewing: boolean;
  isSyncSchemaLoading: boolean;
  syncSchemaIssueMessage: string | null;
  syncSelectedTableCount: number;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <DataSyncConnectionSelect
        id="sync-source-connection"
        label="Source connection"
        value={syncSourceConnectionId}
        options={syncConnectionOptions}
        onChange={onSourceConnectionChange}
      />

      <DataSyncConnectionSelect
        id="sync-target-connection"
        label="Target connection"
        value={syncTargetConnectionId}
        options={syncConnectionOptions}
        onChange={onTargetConnectionChange}
        emptyOption={
          connectionCount > 1 ? null : (
            <option value={activeConnectionId}>
              Add another connection to choose a distinct target
            </option>
          )
        }
      />

      <Button
        type="button"
        size="sm"
        className="h-8 text-xs"
        onClick={onPreviewDataDiff}
        disabled={
          isDiffPreviewing ||
          isSyncSchemaLoading ||
          !!syncSchemaIssueMessage ||
          syncSelectedTableCount === 0
        }
      >
        {isDiffPreviewing
          ? "Comparing..."
          : isSyncSchemaLoading
            ? "Loading sync metadata..."
            : "Compare source -> target"}
      </Button>
    </div>
  );
}

function DataSyncConnectionSelect({
  id,
  label,
  value,
  options,
  emptyOption,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: DbConnectionConfig[];
  emptyOption?: React.ReactNode;
  onChange: (connectionId: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="text-[11px] font-medium text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={id}
        className="h-8 w-full rounded-sm border border-border bg-background px-2 text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {emptyOption}
        {options.map((item) => (
          <option key={`${id}-${item.id}`} value={item.id}>
            {item.name} ({item.environment ?? "dev"}) / {item.database}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DataSyncTablePicker({
  syncAvailableTableNames,
  syncSelectedTables,
  onToggleSyncTable,
}: {
  syncAvailableTableNames: string[];
  syncSelectedTables: string[];
  onToggleSyncTable: (tableName: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {syncAvailableTableNames.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">
          No tables detected for sync compare.
        </span>
      ) : (
        syncAvailableTableNames.map((tableName) => {
          const selected = syncSelectedTables.includes(tableName);
          return (
            <label
              key={`sync-table-${tableName}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px]",
                selected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSyncTable(tableName)}
              />
              <span className="font-mono">{tableName}</span>
            </label>
          );
        })
      )}
    </div>
  );
}

export function DataSyncSelectedTableConfigs({
  syncSchemaIssueMessage,
  isSyncSchemaLoading,
  syncSelectedTables,
  syncTableMetadataByName,
  syncTableConfigs,
  onSyncTableConfigChange,
}: {
  syncSchemaIssueMessage: string | null;
  isSyncSchemaLoading: boolean;
  syncSelectedTables: string[];
  syncTableMetadataByName: SyncTableMetadataIndex;
  syncTableConfigs: Record<string, SyncTableConfigDraft>;
  onSyncTableConfigChange: (
    tableName: string,
    field: keyof SyncTableConfigDraft,
    value: string,
  ) => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      {syncSchemaIssueMessage ? (
        <p className="text-[11px] text-destructive">
          {syncSchemaIssueMessage}
        </p>
      ) : null}
      {!syncSchemaIssueMessage && isSyncSchemaLoading ? (
        <p className="text-[11px] text-muted-foreground">
          Loading source/target schema metadata for sync compare.
        </p>
      ) : null}
      {syncSelectedTables.length > 0 ? (
        <div className="grid gap-2">
          {syncSelectedTables.map((tableName) => (
            <DataSyncTableConfigCard
              key={`sync-config-${tableName}`}
              tableName={tableName}
              metadata={syncTableMetadataByName.metadataByName[tableName]}
              config={syncTableConfigs[tableName]}
              onSyncTableConfigChange={onSyncTableConfigChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DataSyncTableConfigCard({
  tableName,
  metadata,
  config,
  onSyncTableConfigChange,
}: {
  tableName: string;
  metadata: SyncTableMetadataIndex["metadataByName"][string] | undefined;
  config: SyncTableConfigDraft | undefined;
  onSyncTableConfigChange: (
    tableName: string,
    field: keyof SyncTableConfigDraft,
    value: string,
  ) => void;
}) {
  const effectiveConfig = config ?? {
    keyColumnsText: "",
    compareColumnsText: "",
    whereClause: "",
  };
  const runtimeKeyPreview = formatColumnPreview(
    metadata?.defaultKeyColumns ?? [],
    "none detected",
  );
  const runtimeComparePreview = formatColumnPreview(
    metadata?.defaultCompareColumns ?? [],
    "all non-key columns will be empty",
  );
  const availableColumnPreview = formatColumnPreview(
    metadata?.availableColumns ?? [],
    "no shared columns",
    8,
  );

  return (
    <div className="rounded-sm border border-border bg-background px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-foreground">
          {tableName}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {metadata?.sourceExists ? "source" : "source missing"} /{" "}
          {metadata?.targetExists ? "target" : "target missing"}
        </span>
      </div>
      <div className="mt-1 grid gap-2 md:grid-cols-[1fr_1fr]">
        <DataSyncColumnOverrideInput
          label="Key columns override"
          value={effectiveConfig.keyColumnsText}
          placeholder={runtimeKeyPreview}
          runtimeDefault={runtimeKeyPreview}
          onChange={(value) =>
            onSyncTableConfigChange(tableName, "keyColumnsText", value)
          }
        />
        <DataSyncColumnOverrideInput
          label="Compare columns override"
          value={effectiveConfig.compareColumnsText}
          placeholder={runtimeComparePreview}
          runtimeDefault={runtimeComparePreview}
          onChange={(value) =>
            onSyncTableConfigChange(tableName, "compareColumnsText", value)
          }
        />
      </div>
      <div className="mt-2 space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Row filter
        </label>
        <input
          className="h-8 w-full rounded-sm border border-border bg-panel-muted/30 px-2 font-mono text-[11px]"
          value={effectiveConfig.whereClause}
          onChange={(event) =>
            onSyncTableConfigChange(tableName, "whereClause", event.target.value)
          }
          placeholder="Optional SQL expression, e.g. updated_at >= CURRENT_DATE - INTERVAL '7 days'"
        />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Available columns: {availableColumnPreview}
      </p>
      {(metadata?.defaultKeyColumns.length ?? 0) === 0 ? (
        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
          No stable key was detected from schema metadata. Enter a business key
          override before compare if this table should sync.
        </p>
      ) : null}
    </div>
  );
}

function DataSyncColumnOverrideInput({
  label,
  value,
  placeholder,
  runtimeDefault,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  runtimeDefault: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </label>
      <input
        className="h-8 w-full rounded-sm border border-border bg-panel-muted/30 px-2 font-mono text-[11px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <p className="text-[10px] text-muted-foreground">
        Runtime default: {runtimeDefault}
      </p>
    </div>
  );
}
