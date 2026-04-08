import type {
  FieldChange,
  StructuredColumnChange,
  StructuredDiffEntry,
} from "@/components/diff-viewer";

export type DataSyncRowStatus =
  | "source_only"
  | "target_only"
  | "value_changed"
  | "unchanged";

export type DataSyncSuggestedAction = "insert" | "update" | "delete" | "ignore";

export interface DataSyncFieldDiff {
  columnName: string;
  sourceValue?: unknown;
  targetValue?: unknown;
  changed: boolean;
}

export interface DataSyncRowDiffEntry {
  tableName: string;
  rowKey: Record<string, string | number | null>;
  status: DataSyncRowStatus;
  suggestedAction?: DataSyncSuggestedAction;
  sourceRow?: Record<string, unknown>;
  targetRow?: Record<string, unknown>;
  fieldDiffs?: DataSyncFieldDiff[];
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function semanticEqual(left: unknown, right: unknown): boolean {
  return stringifyValue(left) === stringifyValue(right);
}

function toStructuredAction(status: DataSyncRowStatus): StructuredDiffEntry["action"] {
  if (status === "source_only") return "added";
  if (status === "target_only") return "removed";
  if (status === "value_changed") return "modified";
  return "changed";
}

function toColumnAction(status: DataSyncRowStatus): StructuredColumnChange["action"] {
  if (status === "source_only") return "added";
  if (status === "target_only") return "removed";
  return "modified";
}

function formatRowKey(rowKey: Record<string, string | number | null>): string {
  return Object.entries(rowKey)
    .map(([key, value]) => `${key}=${stringifyValue(value)}`)
    .join(", ");
}

function formatActionLabel(action: DataSyncSuggestedAction | undefined): string {
  if (action === "insert") return "insert";
  if (action === "update") return "update";
  if (action === "delete") return "delete";
  return "ignore";
}

function buildChangedFieldChange(columnName: string, sourceValue: unknown, targetValue: unknown): FieldChange {
  return {
    field: columnName,
    label: columnName,
    oldValue: stringifyValue(targetValue),
    newValue: stringifyValue(sourceValue),
    semanticEqual: semanticEqual(sourceValue, targetValue),
  };
}

function collectFieldDiffs(entry: DataSyncRowDiffEntry): DataSyncFieldDiff[] {
  if (entry.fieldDiffs && entry.fieldDiffs.length > 0) {
    return entry.fieldDiffs;
  }

  const source = entry.sourceRow ?? {};
  const target = entry.targetRow ?? {};
  const keys = new Set<string>([...Object.keys(source), ...Object.keys(target)]);

  return Array.from(keys)
    .sort((left, right) => left.localeCompare(right))
    .map((columnName) => {
      const sourceValue = source[columnName];
      const targetValue = target[columnName];
      return {
        columnName,
        sourceValue,
        targetValue,
        changed: !semanticEqual(sourceValue, targetValue),
      };
    });
}

export function toRowJson(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function dataSyncRowDiffToStructuredEntry(entry: DataSyncRowDiffEntry): StructuredDiffEntry {
  const diffs = collectFieldDiffs(entry);
  const structuredAction = toStructuredAction(entry.status);
  const columnAction = toColumnAction(entry.status);
  const keyLabel = formatRowKey(entry.rowKey);

  const tableFieldChanges: FieldChange[] = [
    {
      field: "row.key",
      label: "Row Key",
      oldValue: keyLabel,
      newValue: keyLabel,
      semanticEqual: true,
    },
    {
      field: "row.status",
      label: "Status",
      oldValue: entry.status,
      newValue: entry.status,
      semanticEqual: true,
    },
    {
      field: "row.action",
      label: "Suggested Action",
      oldValue: formatActionLabel(entry.suggestedAction),
      newValue: formatActionLabel(entry.suggestedAction),
      semanticEqual: true,
    },
  ];

  const visibleDiffs = entry.status === "value_changed"
    ? diffs.filter((item) => item.changed)
    : diffs;

  const columnChanges: StructuredColumnChange[] = visibleDiffs.map((item, index) => ({
    action: columnAction,
    requiresConfirmation: false,
    changedFields: item.changed ? [item.columnName] : [],
    fieldChanges: [
      buildChangedFieldChange(item.columnName, item.sourceValue, item.targetValue),
    ],
    displayName: item.columnName,
    entityKey: `${entry.tableName}:${keyLabel}:${item.columnName}:${index}`,
  }));

  return {
    key: `${entry.tableName}:${keyLabel}`,
    tableName: entry.tableName,
    logicalName: `row/${keyLabel}`,
    action: structuredAction,
    requiresConfirmation: false,
    tableFieldChanges,
    columnChanges,
    oldDdl: toRowJson(entry.targetRow),
    newDdl: toRowJson(entry.sourceRow),
  };
}
