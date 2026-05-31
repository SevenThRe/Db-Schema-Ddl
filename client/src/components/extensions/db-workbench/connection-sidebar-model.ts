import type {
  DbConnectionConfig,
  DbObjectKind,
  DbSchemaSnapshot,
} from "@shared/schema";
import {
  routineMatchesFilter,
  sequenceMatchesFilter,
  tableMatchesFilter,
  triggerMatchesFilter,
  viewMatchesFilter,
} from "./connection-sidebar-object-filter";

interface BuildConnectionSidebarModelInput {
  connection: DbConnectionConfig;
  activeSchema?: string;
  schemaOptions: string[];
  schemaSnapshot?: DbSchemaSnapshot | null;
  schemaError?: string | null;
  isSchemaLoading: boolean;
  objectFilter: string;
  selectedTableName?: string | null;
  inspectedObjectKind?: DbObjectKind | null;
  inspectedObjectName?: string | null;
}

export function buildConnectionSidebarModel({
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
}: BuildConnectionSidebarModelInput) {
  const isPostgres = connection.driver === "postgres";
  const normalizedObjectFilter = objectFilter.trim().toLowerCase();
  const effectiveSchema = activeSchema?.trim() || "public";
  const schemaSelectOptions = buildSchemaSelectOptions({
    isPostgres,
    defaultSchema: connection.defaultSchema,
    effectiveSchema,
    schemaOptions,
  });
  const tables = schemaError
    ? []
    : [...(schemaSnapshot?.tables ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
  const views = schemaError
    ? []
    : [...(schemaSnapshot?.views ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
  const routines = schemaError
    ? []
    : [...(schemaSnapshot?.routines ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
  const triggers = schemaError
    ? []
    : [...(schemaSnapshot?.triggers ?? [])].sort((left, right) => {
        const tableComparison = left.tableName.localeCompare(right.tableName);
        if (tableComparison !== 0) return tableComparison;
        return left.name.localeCompare(right.name);
      });
  const sequences = schemaError
    ? []
    : [...(schemaSnapshot?.sequences ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
  const visibleTables = normalizedObjectFilter
    ? tables.filter((table) => tableMatchesFilter(table, normalizedObjectFilter))
    : tables;
  const visibleViews = normalizedObjectFilter
    ? views.filter((view) => viewMatchesFilter(view, normalizedObjectFilter))
    : views;
  const visibleRoutines = normalizedObjectFilter
    ? routines.filter((routine) =>
        routineMatchesFilter(routine, normalizedObjectFilter),
      )
    : routines;
  const visibleTriggers = normalizedObjectFilter
    ? triggers.filter((trigger) =>
        triggerMatchesFilter(trigger, normalizedObjectFilter),
      )
    : triggers;
  const visibleSequences = normalizedObjectFilter
    ? sequences.filter((sequence) =>
        sequenceMatchesFilter(sequence, normalizedObjectFilter),
      )
    : sequences;
  const hasExplorerData =
    tables.length > 0 ||
    views.length > 0 ||
    routines.length > 0 ||
    triggers.length > 0 ||
    sequences.length > 0;
  const hasFilteredExplorerData =
    visibleTables.length > 0 ||
    visibleViews.length > 0 ||
    visibleRoutines.length > 0 ||
    visibleTriggers.length > 0 ||
    visibleSequences.length > 0;
  const selectedTable =
    visibleTables.find((table) => table.name === selectedTableName) ??
    visibleTables[0] ??
    null;
  const isSelectedTableInspected =
    inspectedObjectKind === "table" && inspectedObjectName === selectedTable?.name;

  return {
    isPostgres,
    normalizedObjectFilter,
    effectiveSchema,
    schemaSelectOptions,
    visibleTables,
    visibleViews,
    visibleRoutines,
    visibleTriggers,
    visibleSequences,
    hasExplorerData,
    hasFilteredExplorerData,
    selectedTable,
    isSelectedTableInspected,
    filteredSummary: buildFilteredExplorerSummary({
      normalizedObjectFilter,
      tables,
      views,
      routines,
      triggers,
      sequences,
      visibleTables,
      visibleViews,
      visibleRoutines,
      visibleTriggers,
      visibleSequences,
    }),
    ...buildConnectionState({
      schemaError,
      schemaSnapshot,
      isSchemaLoading,
    }),
  };
}

function buildSchemaSelectOptions({
  isPostgres,
  defaultSchema,
  effectiveSchema,
  schemaOptions,
}: {
  isPostgres: boolean;
  defaultSchema?: string | null;
  effectiveSchema: string;
  schemaOptions: string[];
}): string[] {
  if (!isPostgres) return [];

  const merged = new Set<string>(["public"]);
  if (defaultSchema?.trim()) {
    merged.add(defaultSchema.trim());
  }
  if (effectiveSchema) {
    merged.add(effectiveSchema);
  }
  for (const schemaName of schemaOptions) {
    const normalized = schemaName.trim();
    if (normalized) {
      merged.add(normalized);
    }
  }
  return Array.from(merged).sort((left, right) => left.localeCompare(right));
}

function buildFilteredExplorerSummary({
  normalizedObjectFilter,
  tables,
  views,
  routines,
  triggers,
  sequences,
  visibleTables,
  visibleViews,
  visibleRoutines,
  visibleTriggers,
  visibleSequences,
}: {
  normalizedObjectFilter: string;
  tables: unknown[];
  views: unknown[];
  routines: unknown[];
  triggers: unknown[];
  sequences: unknown[];
  visibleTables: unknown[];
  visibleViews: unknown[];
  visibleRoutines: unknown[];
  visibleTriggers: unknown[];
  visibleSequences: unknown[];
}): string {
  if (normalizedObjectFilter) {
    return `${visibleTables.length}/${tables.length} tables · ${visibleViews.length}/${views.length} views · ${visibleRoutines.length}/${routines.length} routines · ${visibleTriggers.length}/${triggers.length} triggers · ${visibleSequences.length}/${sequences.length} sequences`;
  }

  return `${tables.length} tables · ${views.length} views · ${routines.length} routines · ${triggers.length} triggers · ${sequences.length} sequences`;
}

function buildConnectionState({
  schemaError,
  schemaSnapshot,
  isSchemaLoading,
}: {
  schemaError?: string | null;
  schemaSnapshot?: DbSchemaSnapshot | null;
  isSchemaLoading: boolean;
}) {
  if (schemaError) {
    return {
      connectionStateLabel: "Unavailable",
      connectionStateClass: "text-destructive",
    };
  }
  if (schemaSnapshot) {
    return {
      connectionStateLabel: "Connected",
      connectionStateClass: "text-emerald-600",
    };
  }
  if (isSchemaLoading) {
    return {
      connectionStateLabel: "Connecting",
      connectionStateClass: "text-muted-foreground",
    };
  }
  return {
    connectionStateLabel: "Idle",
    connectionStateClass: "text-muted-foreground",
  };
}
