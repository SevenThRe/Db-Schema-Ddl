import type {
  DdlImportCatalog,
  DdlImportColumn,
  DdlImportDialect,
  DdlImportForeignKey,
  DdlImportIndex,
  DdlImportSourceMode,
  DdlImportTable,
} from "@shared/schema";
import type { RawDdlImportDatabase } from "./parser-adapter";

function parseColumnType(typeName: string): { dataType: string; dataTypeArgs?: string } {
  const normalized = typeName.trim();
  const match = normalized.match(/^([^(]+)\((.+)\)$/);
  if (!match) {
    return { dataType: normalized.toUpperCase() };
  }

  return {
    dataType: match[1]!.trim().toUpperCase(),
    dataTypeArgs: match[2]!.trim(),
  };
}

function tableEntityKey(tableName: string): string {
  return `table:${tableName}`;
}

function columnEntityKey(tableName: string, columnName: string): string {
  return `column:${tableName}.${columnName}`;
}

function indexEntityKey(tableName: string, indexName: string): string {
  return `index:${tableName}.${indexName}`;
}

function foreignKeyEntityKey(tableName: string, fkName: string): string {
  return `fk:${tableName}.${fkName}`;
}

function normalizeColumn(
  tableName: string,
  raw: RawDdlImportDatabase["tables"][number]["fields"][number],
): DdlImportColumn {
  const { dataType, dataTypeArgs } = parseColumnType(raw.type.type_name);

  return {
    entityKey: columnEntityKey(tableName, raw.name),
    name: raw.name,
    dataType,
    dataTypeArgs,
    columnType: raw.type.type_name,
    nullable: !raw.not_null,
    defaultValue: raw.dbdefault
      ? {
          type:
            raw.dbdefault.type === "number" ||
            raw.dbdefault.type === "string" ||
            raw.dbdefault.type === "boolean"
              ? raw.dbdefault.type
              : "expression",
          value: String(raw.dbdefault.value),
        }
      : undefined,
    autoIncrement: Boolean(raw.increment),
    primaryKey: Boolean(raw.pk),
    unique: Boolean(raw.unique),
    comment: raw.note?.value,
  };
}

function normalizeIndex(
  tableName: string,
  raw: RawDdlImportDatabase["tables"][number]["indexes"][number],
): DdlImportIndex {
  const name = raw.name ?? "unnamed_index";
  return {
    entityKey: indexEntityKey(tableName, name),
    name,
    unique: Boolean(raw.unique),
    primary: Boolean(raw.pk),
    indexType: raw.type ?? undefined,
    comment: raw.note?.value,
    columns: raw.columns.map((column) => ({
      columnName: column.value,
    })),
  };
}

function normalizeForeignKeys(
  tableName: string,
  refs: RawDdlImportDatabase["refs"],
): DdlImportForeignKey[] {
  return refs.reduce<DdlImportForeignKey[]>((acc, ref) => {
    const referencing = ref.endpoints.find((endpoint) => endpoint.tableName === tableName && endpoint.relation === "*")
      ?? ref.endpoints.find((endpoint) => endpoint.tableName === tableName);
    const referenced = ref.endpoints.find((endpoint) => endpoint !== referencing);

    if (!referencing || !referenced) {
      return acc;
    }

    const name = ref.name ?? `${tableName}_${referencing.fieldNames.join("_")}_fk`;
    acc.push({
      entityKey: foreignKeyEntityKey(tableName, name),
      name,
      referencedTableName: referenced.tableName,
      referencedTableSchema: referenced.schemaName ?? undefined,
      onDelete: ref.onDelete ?? undefined,
      onUpdate: ref.onUpdate ?? undefined,
      columns: referencing.fieldNames.map((columnName, index) => ({
        columnName,
        referencedColumnName: referenced.fieldNames[index] ?? referenced.fieldNames[0] ?? columnName,
      })),
    });

    return acc;
  }, []);
}

function normalizeTable(
  raw: RawDdlImportDatabase["tables"][number],
  refs: RawDdlImportDatabase["refs"],
): DdlImportTable {
  return {
    entityKey: tableEntityKey(raw.name),
    name: raw.name,
    comment: raw.note?.value,
    columns: raw.fields.map((column) => normalizeColumn(raw.name, column)),
    indexes: raw.indexes.map((index) => normalizeIndex(raw.name, index)),
    foreignKeys: normalizeForeignKeys(raw.name, refs),
  };
}

export function normalizeImportedDdl(
  raw: RawDdlImportDatabase,
  options: {
    sourceMode: DdlImportSourceMode;
    dialect: DdlImportDialect;
  },
): DdlImportCatalog {
  return {
    sourceMode: options.sourceMode,
    dialect: options.dialect,
    databaseName: "ddl_import",
    tables: raw.tables.map((table) => normalizeTable(table, raw.refs)),
  };
}
