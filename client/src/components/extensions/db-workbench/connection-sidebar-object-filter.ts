import type {
  DbColumnSchema,
  DbForeignKeySchema,
  DbIndexSchema,
  DbRoutineSchema,
  DbSequenceSchema,
  DbTableSchema,
  DbTriggerSchema,
  DbViewSchema,
} from "@shared/schema";

export function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function includesFilter(haystack: string, filterText: string): boolean {
  return haystack.toLowerCase().includes(filterText);
}

function getColumnSearchText(column: DbColumnSchema): string {
  return [column.name, column.dataType, column.comment ?? ""].join(" ");
}

function getIndexSearchText(index: DbIndexSchema): string {
  return [index.name, index.columns.join(" ")].join(" ");
}

function getForeignKeySearchText(foreignKey: DbForeignKeySchema): string {
  return [
    foreignKey.name,
    foreignKey.columns.join(" "),
    foreignKey.referencedTable,
    foreignKey.referencedColumns.join(" "),
  ].join(" ");
}

export function tableMatchesFilter(table: DbTableSchema, filterText: string): boolean {
  if (!filterText) return true;

  const tableText = [table.name, table.comment ?? ""].join(" ");
  if (includesFilter(tableText, filterText)) return true;

  return (
    table.columns.some((column) => includesFilter(getColumnSearchText(column), filterText)) ||
    (table.indexes ?? []).some((index) => includesFilter(getIndexSearchText(index), filterText)) ||
    (table.foreignKeys ?? []).some((foreignKey) =>
      includesFilter(getForeignKeySearchText(foreignKey), filterText),
    )
  );
}

export function viewMatchesFilter(view: DbViewSchema, filterText: string): boolean {
  if (!filterText) return true;

  const viewText = [view.name, view.comment ?? ""].join(" ");
  if (includesFilter(viewText, filterText)) return true;

  return view.columns.some((column) => includesFilter(getColumnSearchText(column), filterText));
}

export function routineMatchesFilter(routine: DbRoutineSchema, filterText: string): boolean {
  if (!filterText) return true;
  return includesFilter(
    [routine.name, routine.kind, routine.signature ?? "", routine.returnType ?? "", routine.comment ?? ""].join(" "),
    filterText,
  );
}

export function triggerMatchesFilter(trigger: DbTriggerSchema, filterText: string): boolean {
  if (!filterText) return true;
  return includesFilter(
    [trigger.name, trigger.tableName, trigger.timing ?? "", trigger.event].join(" "),
    filterText,
  );
}

export function sequenceMatchesFilter(sequence: DbSequenceSchema, filterText: string): boolean {
  if (!filterText) return true;
  return includesFilter([sequence.name, sequence.comment ?? ""].join(" "), filterText);
}

export function filterTableContents(table: DbTableSchema, filterText: string) {
  if (!filterText) {
    return {
      visibleColumns: table.columns,
      visibleIndexes: table.indexes ?? [],
      visibleForeignKeys: table.foreignKeys ?? [],
      matchedByTableName: true,
    };
  }

  const matchedByTableName = includesFilter([table.name, table.comment ?? ""].join(" "), filterText);
  const visibleColumns = matchedByTableName
    ? table.columns
    : table.columns.filter((column) => includesFilter(getColumnSearchText(column), filterText));
  const visibleIndexes = matchedByTableName
    ? (table.indexes ?? [])
    : (table.indexes ?? []).filter((index) => includesFilter(getIndexSearchText(index), filterText));
  const visibleForeignKeys = matchedByTableName
    ? (table.foreignKeys ?? [])
    : (table.foreignKeys ?? []).filter((foreignKey) =>
        includesFilter(getForeignKeySearchText(foreignKey), filterText),
      );

  return {
    visibleColumns,
    visibleIndexes,
    visibleForeignKeys,
    matchedByTableName,
  };
}
